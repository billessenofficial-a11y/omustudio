import type { TimelineClip } from '../types/editor';
import { v4 as uuid } from 'uuid';

export interface Region {
  start: number;
  end: number;
}

export function mergeRegions(regions: Region[]): Region[] {
  if (regions.length === 0) return [];
  const sorted = [...regions].sort((a, b) => a.start - b.start);
  const merged: Region[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end + 0.05) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

export function invertToSpeech(
  silences: Region[],
  timelineStart: number,
  timelineEnd: number,
): Region[] {
  const speech: Region[] = [];
  let cursor = timelineStart;

  for (const s of silences) {
    const silStart = Math.max(s.start, timelineStart);
    const silEnd = Math.min(s.end, timelineEnd);
    if (silStart > cursor) {
      speech.push({ start: cursor, end: silStart });
    }
    cursor = Math.max(cursor, silEnd);
  }

  if (cursor < timelineEnd) {
    speech.push({ start: cursor, end: timelineEnd });
  }

  return speech.filter((s) => s.end - s.start > 0.05);
}

export function buildCompactedClips(
  speechSegments: Region[],
  originalClips: TimelineClip[],
  trackId: string,
): TimelineClip[] {
  const sorted = [...originalClips].sort((a, b) => a.startTime - b.startTime);
  const newClips: TimelineClip[] = [];
  let timelineCursor = 0;

  for (const speech of speechSegments) {
    for (const clip of sorted) {
      const clipEnd = clip.startTime + clip.duration;
      const overlapStart = Math.max(speech.start, clip.startTime);
      const overlapEnd = Math.min(speech.end, clipEnd);

      if (overlapEnd <= overlapStart) continue;

      const offsetInClip = overlapStart - clip.startTime;
      const subDuration = overlapEnd - overlapStart;

      newClips.push({
        id: uuid(),
        trackId,
        mediaId: clip.mediaId,
        type: clip.type,
        name: clip.name,
        startTime: timelineCursor,
        duration: subDuration,
        trimStart: clip.trimStart + offsetInClip,
        trimEnd: clip.trimEnd + (clip.duration - offsetInClip - subDuration),
        properties: { ...clip.properties },
      });

      timelineCursor += subDuration;
    }
  }

  return newClips;
}
