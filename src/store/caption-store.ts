import { create } from 'zustand';
import type { CaptionSegment } from '../lib/gemini-service';
import { transcribeWithScribe } from '../lib/elevenlabs-service';
import { useProjectStore } from './project-store';
import { useTimelineStore } from './timeline-store';
import { useUIStore } from './ui-store';
import type { TextAnimation } from '../types/editor';

export type CaptionStyle = 'karaoke' | 'pop' | 'fade' | 'typewriter' | 'word-by-word' | 'slide';

const STYLE_CONFIG: Record<CaptionStyle, { animation: TextAnimation; animationDuration: number; fontSize: number }> = {
  karaoke: { animation: 'karaoke', animationDuration: 0.15, fontSize: 36 },
  pop: { animation: 'pop', animationDuration: 0.15, fontSize: 28 },
  fade: { animation: 'fadeIn', animationDuration: 0.2, fontSize: 26 },
  typewriter: { animation: 'typewriter', animationDuration: 0.4, fontSize: 26 },
  'word-by-word': { animation: 'wordByWord', animationDuration: 0.3, fontSize: 28 },
  slide: { animation: 'slideUp', animationDuration: 0.2, fontSize: 26 },
};

const EMOJI_KEYWORDS: Record<string, string> = {
  love: '\u2764\uFE0F', heart: '\u2764\uFE0F',
  happy: '\uD83D\uDE0A', smile: '\uD83D\uDE0A', joy: '\uD83D\uDE0A',
  laugh: '\uD83D\uDE02', funny: '\uD83D\uDE02',
  cry: '\uD83D\uDE22', sad: '\uD83D\uDE22', tears: '\uD83D\uDE22',
  fire: '\uD83D\uDD25', hot: '\uD83D\uDD25', lit: '\uD83D\uDD25',
  money: '\uD83D\uDCB0', rich: '\uD83D\uDCB0', dollar: '\uD83D\uDCB0',
  music: '\uD83C\uDFB5', sing: '\uD83C\uDFB5', song: '\uD83C\uDFB5',
  star: '\u2B50', amazing: '\u2B50', awesome: '\u2B50',
  think: '\uD83E\uDD14', wonder: '\uD83E\uDD14',
  idea: '\uD83D\uDCA1', light: '\uD83D\uDCA1',
  strong: '\uD83D\uDCAA', power: '\uD83D\uDCAA', work: '\uD83D\uDCAA',
  world: '\uD83C\uDF0D', earth: '\uD83C\uDF0D',
  time: '\u23F0', clock: '\u23F0',
  god: '\uD83D\uDE4F', pray: '\uD83D\uDE4F', bless: '\uD83D\uDE4F', thank: '\uD83D\uDE4F',
  family: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66',
  friend: '\uD83E\uDD1D', together: '\uD83E\uDD1D',
  win: '\uD83C\uDFC6', success: '\uD83C\uDFC6', champion: '\uD83C\uDFC6',
  celebrate: '\uD83C\uDF89', party: '\uD83C\uDF89',
  beautiful: '\u2728', magic: '\u2728', dream: '\u2728',
  food: '\uD83C\uDF55', eat: '\uD83C\uDF55', hungry: '\uD83C\uDF55',
  run: '\uD83C\uDFC3', fast: '\uD83C\uDFC3',
  sleep: '\uD83D\uDE34', tired: '\uD83D\uDE34',
  cool: '\uD83D\uDE0E', sun: '\u2600\uFE0F',
  rain: '\uD83C\uDF27\uFE0F', storm: '\u26A1',
  king: '\uD83D\uDC51', queen: '\uD83D\uDC51', crown: '\uD83D\uDC51',
  brain: '\uD83E\uDDE0', smart: '\uD83E\uDDE0', learn: '\uD83E\uDDE0',
  danger: '\u26A0\uFE0F', warning: '\u26A0\uFE0F',
  stop: '\uD83D\uDED1', wait: '\u270B',
  grow: '\uD83C\uDF31', life: '\uD83C\uDF31',
  fear: '\uD83D\uDE28', scared: '\uD83D\uDE28',
  fight: '\uD83E\uDD4A', battle: '\u2694\uFE0F',
};

const FALLBACK_EMOJIS = [
  '\uD83D\uDD25', '\u2728', '\uD83D\uDCAF', '\uD83C\uDFB6', '\u26A1',
  '\uD83D\uDC80', '\uD83D\uDE4C', '\uD83D\uDCA5', '\uD83C\uDF1F', '\uD83D\uDC4F',
  '\uD83E\uDD29', '\uD83D\uDE0E', '\uD83D\uDCAA', '\uD83C\uDF89', '\u2B50',
];

function pickEmojiForText(text: string, index: number): string {
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/);
  for (const word of words) {
    if (EMOJI_KEYWORDS[word]) return EMOJI_KEYWORDS[word];
  }
  return FALLBACK_EMOJIS[index % FALLBACK_EMOJIS.length];
}

export interface CaptionPhrase {
  text: string;
  startTime: number;
  endTime: number;
  words: CaptionSegment[];
}

const MAX_WORDS_PER_CAPTION = 5;
const PAUSE_THRESHOLD = 0.4;
const SENTENCE_END_RE = /[.!?]$/;

function groupWordsIntoChunks(
  segments: CaptionSegment[],
): { words: CaptionSegment[] }[] {
  const groups: { words: CaptionSegment[] }[] = [];
  let current: CaptionSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = current[current.length - 1];
    const pauseGap = prev ? seg.startTime - prev.endTime : 0;
    const sentenceEnd = prev ? SENTENCE_END_RE.test(prev.text) : false;

    if (
      current.length >= MAX_WORDS_PER_CAPTION ||
      (prev && pauseGap > PAUSE_THRESHOLD) ||
      sentenceEnd
    ) {
      if (current.length > 0) groups.push({ words: current });
      current = [seg];
    } else {
      current.push(seg);
    }
  }

  if (current.length > 0) groups.push({ words: current });
  return groups;
}

export function groupWordsIntoPhrases(segments: CaptionSegment[]): CaptionPhrase[] {
  if (segments.length === 0) return [];

  const chunks = groupWordsIntoChunks(segments);
  return chunks.map((chunk) => ({
    text: chunk.words.map((w) => w.text).join(' '),
    startTime: chunk.words[0].startTime,
    endTime: chunk.words[chunk.words.length - 1].endTime,
    words: chunk.words,
  }));
}

interface CaptionState {
  segments: CaptionSegment[];
  isTranscribing: boolean;
  transcribeProgress: string;
  error: string | null;
  captionStyle: CaptionStyle;
  highlightColor: string;
  clipIds: string[];

  transcribeTimeline: () => Promise<void>;
  setCaptionStyle: (style: CaptionStyle) => void;
  setHighlightColor: (color: string) => void;
  applyCaptions: () => void;
  clearCaptions: () => void;
  updateSegmentText: (index: number, text: string) => void;
  updateSegmentTiming: (index: number, startTime: number, endTime: number) => void;
  deleteSegment: (index: number) => void;
  getPhrases: () => CaptionPhrase[];
}

export const useCaptionStore = create<CaptionState>((set, get) => ({
  segments: [],
  isTranscribing: false,
  transcribeProgress: '',
  error: null,
  captionStyle: 'karaoke',
  highlightColor: '#d78241',
  clipIds: [],

  transcribeTimeline: async () => {
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

    set({ isTranscribing: true, error: null, transcribeProgress: '' });

    try {
      const allSegments: CaptionSegment[] = [];

      for (let ci = 0; ci < videoClips.length; ci++) {
        const clip = videoClips[ci];
        const media = projectState.getMediaById(clip.mediaId!);
        if (!media || !media.file) continue;

        if (videoClips.length > 1) {
          set({ transcribeProgress: `Transcribing clip ${ci + 1} of ${videoClips.length}...` });
        }

        const clipSegments = await transcribeWithScribe(media.file);

        const timeOffset = clip.startTime - clip.trimStart;
        for (const seg of clipSegments) {
          const adjustedStart = seg.startTime + timeOffset;
          const adjustedEnd = seg.endTime + timeOffset;

          if (adjustedStart >= clip.startTime && adjustedStart < clip.startTime + clip.duration) {
            allSegments.push({
              startTime: adjustedStart,
              endTime: Math.min(adjustedEnd, clip.startTime + clip.duration),
              text: seg.text,
            });
          }
        }
      }

      allSegments.sort((a, b) => a.startTime - b.startTime);

      if (allSegments.length === 0) {
        set({ isTranscribing: false, error: 'No speech detected in the video', transcribeProgress: '' });
        addToast('No speech detected in the video', 'warning');
        return;
      }

      set({ segments: allSegments, isTranscribing: false, transcribeProgress: '' });
      addToast(`Transcribed ${allSegments.length} words across ${videoClips.length} clip${videoClips.length > 1 ? 's' : ''}`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transcription failed';
      set({ isTranscribing: false, error: message, transcribeProgress: '' });
      addToast(`Transcription failed: ${message}`, 'error');
    }
  },

  setCaptionStyle: (style) => set({ captionStyle: style }),
  setHighlightColor: (color) => set({ highlightColor: color }),

  applyCaptions: () => {
    const { segments, captionStyle, highlightColor, clipIds } = get();
    if (segments.length === 0) return;

    for (const clipId of clipIds) {
      useTimelineStore.getState().removeClip(clipId);
    }

    const textTrackId = useTimelineStore.getState().ensureTrack('text');
    const config = STYLE_CONFIG[captionStyle];
    const isKaraoke = captionStyle === 'karaoke';
    const phrases = groupWordsIntoPhrases(segments);
    const newClipIds: string[] = [];
    let lastEmojiGroup = -2;

    for (let gi = 0; gi < phrases.length; gi++) {
      const phrase = phrases[gi];
      const clipStart = phrase.startTime;
      const duration = phrase.endTime - phrase.startTime;
      if (duration < 0.05) continue;

      const wordTimings = phrase.words.map((w) => ({
        word: w.text,
        start: w.startTime - clipStart,
        end: w.endTime - clipStart,
      }));

      let emoji: string | undefined;
      if (isKaraoke && gi - lastEmojiGroup >= 2) {
        emoji = pickEmojiForText(phrase.text, gi);
        lastEmojiGroup = gi;
      }

      const clipId = useTimelineStore.getState().addClip(textTrackId, {
        type: 'text',
        name: phrase.text,
        startTime: clipStart,
        duration,
        trimStart: 0,
        trimEnd: 0,
        properties: {
          text: phrase.text,
          fontSize: config.fontSize,
          fontFamily: 'Montserrat',
          fontColor: '#ffffff',
          textAlign: 'center',
          opacity: 1,
          y: 82,
          textAnimation: config.animation,
          animationDuration: Math.min(config.animationDuration, duration * 0.4),
          wordTimings,
          ...(isKaraoke ? { highlightColor } : {}),
          ...(emoji ? { emoji } : {}),
        },
      });
      newClipIds.push(clipId);
    }

    set({ clipIds: newClipIds });
    useUIStore.getState().addToast(`Added ${newClipIds.length} captions to timeline`, 'success');
  },

  clearCaptions: () => {
    const { clipIds } = get();

    for (const clipId of clipIds) {
      useTimelineStore.getState().removeClip(clipId);
    }

    set({ segments: [], clipIds: [], error: null });
  },

  updateSegmentText: (index, text) => {
    const { segments } = get();
    if (index < 0 || index >= segments.length) return;
    const updated = [...segments];
    updated[index] = { ...updated[index], text };
    set({ segments: updated });
  },

  updateSegmentTiming: (index, startTime, endTime) => {
    const { segments } = get();
    if (index < 0 || index >= segments.length) return;
    if (startTime >= endTime) return;

    const updated = [...segments];
    updated[index] = { ...updated[index], startTime, endTime };
    set({ segments: updated });
  },

  deleteSegment: (index) => {
    const { segments } = get();
    if (index < 0 || index >= segments.length) return;
    set({ segments: segments.filter((_, i) => i !== index) });
  },

  getPhrases: () => {
    return groupWordsIntoPhrases(get().segments);
  },
}));
