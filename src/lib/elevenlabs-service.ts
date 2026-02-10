import type { CaptionSegment } from './gemini-service';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface SilenceSegment {
  start: number;
  end: number;
}

const transcriptionCache = new Map<string, CaptionSegment[]>();

function cacheKey(file: File): string {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

export function clearTranscriptionCache() {
  transcriptionCache.clear();
}

export function getCachedTranscription(file: File): CaptionSegment[] | null {
  return transcriptionCache.get(cacheKey(file)) ?? null;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function encodeWav(audioBuffer: AudioBuffer): Blob {
  const targetRate = Math.min(audioBuffer.sampleRate, 16000);
  const channelData = audioBuffer.getChannelData(0);
  const ratio = audioBuffer.sampleRate / targetRate;
  const length = Math.floor(channelData.length / ratio);
  const bytesPerSample = 2;
  const dataLength = length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, channelData[Math.floor(i * ratio)]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

async function extractAudioAsWav(file: File): Promise<File> {
  if (file.type.startsWith('audio/')) return file;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const ctx = new AudioContext();
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const wavBlob = encodeWav(audioBuffer);
      return new File(
        [wavBlob],
        file.name.replace(/\.[^.]+$/, '.wav'),
        { type: 'audio/wav' },
      );
    } finally {
      ctx.close();
    }
  } catch {
    return file;
  }
}

export async function transcribeWithScribe(
  file: File,
): Promise<CaptionSegment[]> {
  const key = cacheKey(file);
  const cached = transcriptionCache.get(key);
  if (cached) return cached;

  const audioFile = await extractAudioAsWav(file);

  const endpoint = `${SUPABASE_URL}/functions/v1/transcribe-audio`;
  const formData = new FormData();
  formData.append('file', audioFile);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Transcription request failed' }));
    throw new Error(body.error || `Transcription failed (${res.status})`);
  }

  const data = await res.json();
  const segments = data.segments as CaptionSegment[];

  transcriptionCache.set(key, segments);

  return segments;
}

export async function detectSilences(
  file: File,
  minDuration = 0.3,
): Promise<SilenceSegment[]> {
  const words = await transcribeWithScribe(file);

  if (words.length === 0) return [];

  const sorted = [...words].sort((a, b) => a.startTime - b.startTime);
  const silences: SilenceSegment[] = [];

  if (sorted[0].startTime >= minDuration) {
    silences.push({ start: 0, end: sorted[0].startTime });
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].startTime - sorted[i].endTime;
    if (gap >= minDuration) {
      silences.push({ start: sorted[i].endTime, end: sorted[i + 1].startTime });
    }
  }

  return silences;
}
