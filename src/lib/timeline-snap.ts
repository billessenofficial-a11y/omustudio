import type { TimelineTrack } from '../types/editor';

const SNAP_THRESHOLD_PX = 8;

export interface SnapPoint {
  time: number;
  source: 'clip-start' | 'clip-end' | 'playhead' | 'origin';
}

export interface SnapResult {
  time: number;
  snapped: boolean;
  snapTime?: number;
}

export function getSnapPoints(
  tracks: TimelineTrack[],
  excludeClipId: string | null,
  playheadTime: number
): SnapPoint[] {
  const points: SnapPoint[] = [
    { time: 0, source: 'origin' },
    { time: playheadTime, source: 'playhead' },
  ];

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) continue;
      points.push({ time: clip.startTime, source: 'clip-start' });
      points.push({ time: clip.startTime + clip.duration, source: 'clip-end' });
    }
  }

  return points;
}

export function snapTime(
  time: number,
  snapPoints: SnapPoint[],
  pixelsPerSecond: number
): SnapResult {
  const thresholdTime = SNAP_THRESHOLD_PX / pixelsPerSecond;
  let closest: SnapPoint | undefined;
  let closestDist = Infinity;

  for (const point of snapPoints) {
    const dist = Math.abs(time - point.time);
    if (dist < closestDist && dist <= thresholdTime) {
      closest = point;
      closestDist = dist;
    }
  }

  if (closest) {
    return { time: closest.time, snapped: true, snapTime: closest.time };
  }
  return { time, snapped: false };
}

export function snapClipMove(
  newStart: number,
  clipDuration: number,
  snapPoints: SnapPoint[],
  pixelsPerSecond: number
): SnapResult {
  const thresholdTime = SNAP_THRESHOLD_PX / pixelsPerSecond;
  const newEnd = newStart + clipDuration;

  let bestSnap: { offset: number; snapTime: number } | null = null;
  let bestDist = Infinity;

  for (const point of snapPoints) {
    const startDist = Math.abs(newStart - point.time);
    if (startDist < bestDist && startDist <= thresholdTime) {
      bestDist = startDist;
      bestSnap = { offset: point.time - newStart, snapTime: point.time };
    }

    const endDist = Math.abs(newEnd - point.time);
    if (endDist < bestDist && endDist <= thresholdTime) {
      bestDist = endDist;
      bestSnap = { offset: point.time - newEnd, snapTime: point.time };
    }
  }

  if (bestSnap) {
    return {
      time: Math.max(0, newStart + bestSnap.offset),
      snapped: true,
      snapTime: bestSnap.snapTime,
    };
  }
  return { time: newStart, snapped: false };
}
