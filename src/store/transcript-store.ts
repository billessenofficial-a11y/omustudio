import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { transcribeWithScribe } from '../lib/elevenlabs-service';
import { useProjectStore } from './project-store';
import { useTimelineStore } from './timeline-store';
import { useUIStore } from './ui-store';
import { buildCompactedClips, invertToSpeech, mapTimeToCompacted, mergeRegions } from '../lib/timeline-utils';

export interface TranscriptWord {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  isCrossed: boolean;
}

export interface SkipRegion {
  start: number;
  end: number;
}

const AI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const AI_BASE_URL = 'https://generativelanguage.googleapis.com';
const AI_MODEL = 'gemini-3-flash-preview';

type AnalysisMode = 'fillers' | 'outtakes' | 'concise';

const ANALYSIS_TIMEOUT_MS = 60_000;
let activeAnalysisController: AbortController | null = null;
let userCancelledAnalysis = false;

const ANALYSIS_PROMPTS: Record<AnalysisMode, string> = {
  fillers: `You are analyzing a video transcript to find FILLER WORDS -- words used as verbal crutches that add no meaning. This includes:
- Hesitation sounds: um, uh, hmm, ah, er, mhm
- Discourse markers used as fillers (NOT when used meaningfully): like, so, well, right, basically, actually, literally, honestly, anyway, okay
- Filler phrases: "you know", "I mean", "sort of", "kind of", "I guess" (only when used as fillers)

CRITICAL: You must analyze CONTEXT. "like" in "I like this" is NOT a filler. "like" in "it was, like, really good" IS a filler. "so" starting a new thought as a conjunction is NOT a filler. "so" as a pause word IS a filler. "right" as agreement/confirmation IS a filler. "right" as in "the right way" is NOT.

Return ONLY the numeric indices (0-based) of words that are genuine fillers based on their context.`,

  outtakes: `You are analyzing a video transcript to find OUTTAKES -- sections where the speaker made mistakes and restarted. This includes:
- False starts where the speaker began a sentence then restarted it (e.g., "I was going to-- I decided to go")
- Repeated phrases where the speaker said the same thing twice (the first attempt should be removed)
- Stumbles and incomplete thoughts that were immediately corrected
- Self-corrections where the speaker said something wrong then fixed it (remove the wrong part)

Return ONLY the numeric indices (0-based) of words that are part of outtakes/false starts that should be removed. Keep the final/corrected version, remove the initial failed attempts.`,

  concise: `You are analyzing a video transcript to make it MORE CONCISE without losing the core message. Identify words/phrases that can be removed to tighten the delivery. This includes:
- Redundant repetitions where the speaker makes the same point twice (keep the better version)
- Unnecessary qualifiers and hedging ("just", "really", "very", "quite", "a little bit")
- Verbose phrases that could be shorter (remove filler sentences, not individual words from key sentences)
- Tangential asides that don't serve the main message
- Over-explanations where the point was already made clearly

CRITICAL: Do NOT remove words that would break grammar or change meaning. Only remove complete phrases or words that are truly unnecessary. Preserve the speaker's voice and key points.

Return ONLY the numeric indices (0-based) of words to remove.`,
};

function cancelAnalysis() {
  userCancelledAnalysis = true;
  if (activeAnalysisController) {
    activeAnalysisController.abort();
    activeAnalysisController = null;
  }
}

async function analyzeTranscriptWithAI(
  words: TranscriptWord[],
  mode: AnalysisMode,
): Promise<Set<string>> {
  if (!AI_API_KEY) throw new Error('Gemini API key not configured');

  cancelAnalysis();
  userCancelledAnalysis = false;

  const controller = new AbortController();
  activeAnalysisController = controller;

  const timeoutId = setTimeout(() => {
    if (!userCancelledAnalysis && activeAnalysisController === controller) {
      controller.abort();
    }
  }, ANALYSIS_TIMEOUT_MS);

  const nonCrossed = words
    .map((w, i) => ({ idx: i, id: w.id, text: w.text, crossed: w.isCrossed }))
    .filter((w) => !w.crossed);

  const indexed = nonCrossed.map((w) => `[${w.idx}] ${w.text}`).join(' ');

  try {
    const res = await fetch(
      `${AI_BASE_URL}/v1beta/models/${AI_MODEL}:generateContent?key=${AI_API_KEY}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ANALYSIS_PROMPTS[mode] }] },
          contents: [{
            role: 'user',
            parts: [{ text: `Analyze this transcript and return a JSON array of numeric indices to remove.\n\nTranscript:\n${indexed}\n\nReturn ONLY a JSON array of numbers, e.g. [0, 3, 5, 6]. No markdown, no explanation.` }],
          }],
          generationConfig: { temperature: 0.1 },
        }),
      },
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const errMsg = errBody?.error?.message || `API error ${res.status}`;
      throw new Error(errMsg);
    }

    const data = await res.json();

    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new Error('Response blocked by safety filter');
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) throw new Error('Empty response from AI');

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let indices: number[];
    try {
      indices = JSON.parse(cleaned);
    } catch {
      throw new Error('Failed to parse AI response');
    }

    if (!Array.isArray(indices)) throw new Error('AI response is not an array');

    const idSet = new Set<string>();
    for (const idx of indices) {
      if (typeof idx === 'number' && idx >= 0 && idx < words.length) {
        idSet.add(words[idx].id);
      }
    }
    return idSet;
  } catch (err) {
    if (userCancelledAnalysis) {
      throw new Error('Analysis cancelled');
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Analysis timed out. Try with a shorter transcript.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    activeAnalysisController = null;
  }
}

function computeSkipRegions(words: TranscriptWord[]): SkipRegion[] {
  const crossed = words
    .filter((w) => w.isCrossed)
    .map((w) => ({ start: w.startTime, end: w.endTime }));
  return mergeRegions(crossed);
}

interface TranscriptState {
  words: TranscriptWord[];
  isTranscribing: boolean;
  transcribeProgress: string;
  error: string | null;
  skipRegions: SkipRegion[];
  hasApplied: boolean;

  isAnalyzing: boolean;
  analysisLabel: string;

  transcribe: () => Promise<void>;
  toggleWord: (wordId: string) => void;
  crossOutRange: (startIdx: number, endIdx: number) => void;
  crossOutFillerWords: () => Promise<number>;
  crossOutOuttakes: () => Promise<number>;
  makeConcise: () => Promise<number>;
  cancelAnalysis: () => void;
  uncrossAll: () => void;
  applyToTimeline: () => void;
  clear: () => void;
  getSkipRegionAtTime: (time: number) => SkipRegion | null;
}

export const useTranscriptStore = create<TranscriptState>((set, get) => ({
  words: [],
  isTranscribing: false,
  transcribeProgress: '',
  error: null,
  skipRegions: [],
  hasApplied: false,
  isAnalyzing: false,
  analysisLabel: '',

  transcribe: async () => {
    const { addToast } = useUIStore.getState();
    const timelineState = useTimelineStore.getState();
    const projectState = useProjectStore.getState();

    const mainTrack = timelineState.tracks.find((t) => t.role === 'main');
    if (!mainTrack || mainTrack.clips.length === 0) {
      addToast('No video on the main track to transcribe', 'warning');
      return;
    }

    const videoClips = mainTrack.clips
      .filter((c) => c.mediaId)
      .sort((a, b) => a.startTime - b.startTime);

    if (videoClips.length === 0) {
      addToast('No media found on the main track', 'warning');
      return;
    }

    set({ isTranscribing: true, error: null, transcribeProgress: '', hasApplied: false });

    try {
      const allWords: TranscriptWord[] = [];

      for (let ci = 0; ci < videoClips.length; ci++) {
        const clip = videoClips[ci];
        const media = projectState.getMediaById(clip.mediaId!);
        if (!media || !media.file) continue;

        if (videoClips.length > 1) {
          set({ transcribeProgress: `Transcribing clip ${ci + 1} of ${videoClips.length}...` });
        }

        const segments = await transcribeWithScribe(media.file);
        const timeOffset = clip.startTime - clip.trimStart;

        for (const seg of segments) {
          const adjustedStart = seg.startTime + timeOffset;
          const adjustedEnd = seg.endTime + timeOffset;

          if (adjustedStart >= clip.startTime && adjustedStart < clip.startTime + clip.duration) {
            allWords.push({
              id: uuid(),
              text: seg.text,
              startTime: adjustedStart,
              endTime: Math.min(adjustedEnd, clip.startTime + clip.duration),
              isCrossed: false,
            });
          }
        }
      }

      allWords.sort((a, b) => a.startTime - b.startTime);

      if (allWords.length === 0) {
        set({ isTranscribing: false, error: 'No speech detected in the video', transcribeProgress: '' });
        addToast('No speech detected in the video', 'warning');
        return;
      }

      set({ words: allWords, isTranscribing: false, transcribeProgress: '', skipRegions: [] });
      addToast(`Transcribed ${allWords.length} words`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transcription failed';
      set({ isTranscribing: false, error: message, transcribeProgress: '' });
      addToast(`Transcription failed: ${message}`, 'error');
    }
  },

  toggleWord: (wordId) => {
    const { words, hasApplied } = get();
    const updated = words.map((w) =>
      w.id === wordId ? { ...w, isCrossed: !w.isCrossed } : w
    );
    if (hasApplied) {
      set({ words: updated });
    } else {
      set({ words: updated, skipRegions: computeSkipRegions(updated) });
    }
  },

  crossOutRange: (startIdx, endIdx) => {
    const { words, hasApplied } = get();
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const updated = words.map((w, i) =>
      i >= lo && i <= hi ? { ...w, isCrossed: true } : w
    );
    if (hasApplied) {
      set({ words: updated });
    } else {
      set({ words: updated, skipRegions: computeSkipRegions(updated) });
    }
    const count = hi - lo + 1;
    useUIStore.getState().addToast(`Crossed out ${count} word${count !== 1 ? 's' : ''}`, 'success');
  },

  crossOutFillerWords: async () => {
    const { words } = get();
    const { addToast } = useUIStore.getState();
    if (words.length === 0) { addToast('No transcript to analyze', 'warning'); return 0; }

    set({ isAnalyzing: true, analysisLabel: 'Finding filler words...' });
    try {
      const ids = await analyzeTranscriptWithAI(words, 'fillers');
      if (ids.size === 0) { addToast('No filler words found', 'info'); set({ isAnalyzing: false, analysisLabel: '' }); return 0; }

      const updated = get().words.map((w) => ids.has(w.id) ? { ...w, isCrossed: true } : w);
      set({ words: updated, skipRegions: computeSkipRegions(updated), hasApplied: false, isAnalyzing: false, analysisLabel: '' });
      addToast(`Crossed out ${ids.size} filler word${ids.size !== 1 ? 's' : ''}`, 'success');
      return ids.size;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      set({ isAnalyzing: false, analysisLabel: '' });
      if (msg !== 'Analysis cancelled') addToast(`Filler analysis failed: ${msg}`, 'error');
      return 0;
    }
  },

  crossOutOuttakes: async () => {
    const { words } = get();
    const { addToast } = useUIStore.getState();
    if (words.length === 0) { addToast('No transcript to analyze', 'warning'); return 0; }

    set({ isAnalyzing: true, analysisLabel: 'Detecting outtakes...' });
    try {
      const ids = await analyzeTranscriptWithAI(words, 'outtakes');
      if (ids.size === 0) { addToast('No outtakes found', 'info'); set({ isAnalyzing: false, analysisLabel: '' }); return 0; }

      const updated = get().words.map((w) => ids.has(w.id) ? { ...w, isCrossed: true } : w);
      set({ words: updated, skipRegions: computeSkipRegions(updated), hasApplied: false, isAnalyzing: false, analysisLabel: '' });
      addToast(`Crossed out ${ids.size} words from outtakes`, 'success');
      return ids.size;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      set({ isAnalyzing: false, analysisLabel: '' });
      if (msg !== 'Analysis cancelled') addToast(`Outtake analysis failed: ${msg}`, 'error');
      return 0;
    }
  },

  makeConcise: async () => {
    const { words } = get();
    const { addToast } = useUIStore.getState();
    if (words.length === 0) { addToast('No transcript to analyze', 'warning'); return 0; }

    set({ isAnalyzing: true, analysisLabel: 'Making it concise...' });
    try {
      const ids = await analyzeTranscriptWithAI(words, 'concise');
      if (ids.size === 0) { addToast('Transcript is already concise', 'info'); set({ isAnalyzing: false, analysisLabel: '' }); return 0; }

      const updated = get().words.map((w) => ids.has(w.id) ? { ...w, isCrossed: true } : w);
      set({ words: updated, skipRegions: computeSkipRegions(updated), hasApplied: false, isAnalyzing: false, analysisLabel: '' });
      addToast(`Crossed out ${ids.size} words to make it concise`, 'success');
      return ids.size;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      set({ isAnalyzing: false, analysisLabel: '' });
      if (msg !== 'Analysis cancelled') addToast(`Concise analysis failed: ${msg}`, 'error');
      return 0;
    }
  },

  cancelAnalysis: () => {
    cancelAnalysis();
    set({ isAnalyzing: false, analysisLabel: '' });
  },

  uncrossAll: () => {
    const { words } = get();
    const updated = words.map((w) => (w.isCrossed ? { ...w, isCrossed: false } : w));
    set({ words: updated, skipRegions: [], hasApplied: false });
  },

  applyToTimeline: () => {
    const { words, skipRegions } = get();
    if (words.length === 0 || skipRegions.length === 0) return;

    const timeline = useTimelineStore.getState();
    const mainTrack = timeline.tracks.find((t) => t.role === 'main');
    if (!mainTrack || mainTrack.clips.length === 0) return;

    const videoClips = mainTrack.clips
      .filter((c) => c.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    if (videoClips.length === 0) return;

    const trackStart = Math.min(...videoClips.map((c) => c.startTime));
    const trackEnd = Math.max(...videoClips.map((c) => c.startTime + c.duration));

    const speechSegments = invertToSpeech(skipRegions, trackStart, trackEnd);
    const newClips = buildCompactedClips(speechSegments, videoClips, mainTrack.id);

    const totalSaved = skipRegions.reduce((sum, r) => sum + (r.end - r.start), 0);

    timeline.pushUndo();

    useTimelineStore.setState((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id !== mainTrack.id) return t;
        return { ...t, clips: newClips };
      }),
    }));

    useTimelineStore.getState().recalcDuration();

    const crossedCount = words.filter((w) => w.isCrossed).length;

    const sorted = [...skipRegions].sort((a, b) => a.start - b.start);
    const retimed: TranscriptWord[] = words.map((word) => {
      if (word.isCrossed) return { ...word };
      return {
        ...word,
        startTime: mapTimeToCompacted(word.startTime, sorted),
        endTime: mapTimeToCompacted(word.endTime, sorted),
      };
    });

    set({ words: retimed, skipRegions: [], hasApplied: true });

    useUIStore.getState().addToast(
      `Removed ${crossedCount} word${crossedCount !== 1 ? 's' : ''}, saved ${totalSaved.toFixed(1)}s`,
      'success',
    );
  },

  clear: () => {
    cancelAnalysis();
    set({
      words: [],
      isTranscribing: false,
      transcribeProgress: '',
      error: null,
      skipRegions: [],
      hasApplied: false,
      isAnalyzing: false,
      analysisLabel: '',
    });
  },

  getSkipRegionAtTime: (time) => {
    const { skipRegions } = get();
    for (const region of skipRegions) {
      if (time >= region.start && time < region.end) {
        return region;
      }
    }
    return null;
  },
}));
