import type { CaptionSegment } from './gemini-service';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface SilenceSegment {
  start: number;
  end: number;
}

export async function transcribeWithScribe(
  file: File,
): Promise<CaptionSegment[]> {
  const endpoint = `${SUPABASE_URL}/functions/v1/transcribe-audio`;

  const formData = new FormData();
  formData.append('file', file);

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
  return data.segments as CaptionSegment[];
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
