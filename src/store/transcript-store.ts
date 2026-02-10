import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { transcribeWithScribe } from '../lib/elevenlabs-service';
import { useProjectStore } from './project-store';
import { useTimelineStore } from './timeline-store';
import { useUIStore } from './ui-store';
import { buildCompactedClips, invertToSpeech, mergeRegions } from '../lib/timeline-utils';

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

const FILLER_WORDS = new Set([
  'um', 'uh', 'uh-huh', 'hmm', 'ah', 'er', 'eh',
  'like', 'so', 'well', 'right', 'basically', 'actually',
  'literally', 'honestly', 'anyway', 'whatever', 'okay',
  'mhm', 'hm', 'mm', 'mmm', 'uhm',
]);

const FILLER_PHRASES: [string, string][] = [
  ['you', 'know'],
  ['i', 'mean'],
  ['sort', 'of'],
  ['kind', 'of'],
  ['i', 'guess'],
];

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

  transcribe: () => Promise<void>;
  toggleWord: (wordId: string) => void;
  crossOutFillerWords: () => number;
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

  crossOutFillerWords: () => {
    const { words } = get();
    let count = 0;
    const updated = words.map((w, i) => {
      if (w.isCrossed) return w;

      const lower = w.text.toLowerCase().replace(/[.,!?;:'"]/g, '');
      if (FILLER_WORDS.has(lower)) {
        count++;
        return { ...w, isCrossed: true };
      }

      if (i < words.length - 1) {
        const nextLower = words[i + 1].text.toLowerCase().replace(/[.,!?;:'"]/g, '');
        for (const [first, second] of FILLER_PHRASES) {
          if (lower === first && nextLower === second) {
            count++;
            return { ...w, isCrossed: true };
          }
        }
      }

      if (i > 0) {
        const prevLower = words[i - 1].text.toLowerCase().replace(/[.,!?;:'"]/g, '');
        for (const [first, second] of FILLER_PHRASES) {
          if (prevLower === first && lower === second) {
            const prevAlreadyCrossed = words[i - 1].isCrossed || FILLER_WORDS.has(prevLower);
            if (!prevAlreadyCrossed) count++;
            return { ...w, isCrossed: true };
          }
        }
      }

      return w;
    });

    const crossedPhraseFirstWords = new Set<number>();
    for (let i = 0; i < updated.length - 1; i++) {
      if (!updated[i].isCrossed) continue;
      const lower = updated[i].text.toLowerCase().replace(/[.,!?;:'"]/g, '');
      const nextLower = updated[i + 1].text.toLowerCase().replace(/[.,!?;:'"]/g, '');
      for (const [first, second] of FILLER_PHRASES) {
        if (lower === first && nextLower === second) {
          crossedPhraseFirstWords.add(i);
          if (!updated[i + 1].isCrossed) {
            updated[i + 1] = { ...updated[i + 1], isCrossed: true };
          }
        }
      }
    }

    set({ words: updated, skipRegions: computeSkipRegions(updated), hasApplied: false });

    if (count > 0) {
      useUIStore.getState().addToast(`Crossed out ${count} filler word${count !== 1 ? 's' : ''}`, 'success');
    } else {
      useUIStore.getState().addToast('No filler words found', 'info');
    }

    return count;
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

    const retimed: TranscriptWord[] = [];
    let cursor = 0;

    for (const word of words) {
      if (word.isCrossed) {
        retimed.push({ ...word });
      } else {
        const dur = word.endTime - word.startTime;
        retimed.push({
          ...word,
          startTime: cursor,
          endTime: cursor + dur,
        });
        cursor += dur;
      }
    }

    set({ words: retimed, skipRegions: [], hasApplied: true });

    useUIStore.getState().addToast(
      `Removed ${crossedCount} word${crossedCount !== 1 ? 's' : ''}, saved ${totalSaved.toFixed(1)}s`,
      'success',
    );
  },

  clear: () => {
    set({
      words: [],
      isTranscribing: false,
      transcribeProgress: '',
      error: null,
      skipRegions: [],
      hasApplied: false,
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
