import { detectSilences } from './elevenlabs-service';
import { useTimelineStore } from '../store/timeline-store';
import { useProjectStore } from '../store/project-store';
import { useUIStore } from '../store/ui-store';
import { mergeRegions, invertToSpeech, buildCompactedClips, type Region } from './timeline-utils';

export interface SilenceRemovalResult {
  silencesFound: number;
  silencesRemoved: number;
  savedSeconds: number;
  newDuration: number;
}

export async function removeSilences(
  minDuration = 0.3,
): Promise<SilenceRemovalResult> {
  const { addToast } = useUIStore.getState();
  const timeline = useTimelineStore.getState();
  const project = useProjectStore.getState();

  const mainTrack = timeline.tracks.find((t) => t.role === 'main');
  if (!mainTrack || mainTrack.clips.length === 0) {
    throw new Error('No video on the main track');
  }

  const videoClips = mainTrack.clips
    .filter((c) => c.mediaId)
    .sort((a, b) => a.startTime - b.startTime);

  if (videoClips.length === 0) {
    throw new Error('No media found on the main track');
  }

  const firstClip = videoClips[0];
  const media = project.getMediaById(firstClip.mediaId!);
  if (!media?.file) {
    throw new Error('Cannot access the video file');
  }

  addToast('Transcribing audio to detect silences...', 'info');

  const rawSilences = await detectSilences(media.file, minDuration);

  if (rawSilences.length === 0) {
    addToast('No silences detected in the video', 'info');
    return { silencesFound: 0, silencesRemoved: 0, savedSeconds: 0, newDuration: timeline.duration };
  }

  const merged = mergeRegions(rawSilences);

  const trackStart = Math.min(...videoClips.map((c) => c.startTime));
  const trackEnd = Math.max(...videoClips.map((c) => c.startTime + c.duration));

  const clipped: Region[] = merged
    .map((s) => ({
      start: Math.max(s.start, trackStart),
      end: Math.min(s.end, trackEnd),
    }))
    .filter((s) => s.end - s.start >= minDuration);

  if (clipped.length === 0) {
    addToast('No removable silences found within the video clips', 'info');
    return { silencesFound: merged.length, silencesRemoved: 0, savedSeconds: 0, newDuration: timeline.duration };
  }

  const speechSegments = invertToSpeech(clipped, trackStart, trackEnd);
  const newClips = buildCompactedClips(speechSegments, videoClips, mainTrack.id);

  const totalSaved = clipped.reduce((sum, s) => sum + (s.end - s.start), 0);
  const newDuration = newClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);

  timeline.pushUndo();

  useTimelineStore.setState((state) => ({
    tracks: state.tracks.map((t) => {
      if (t.id !== mainTrack.id) return t;
      return { ...t, clips: newClips };
    }),
  }));

  useTimelineStore.getState().recalcDuration();

  addToast(
    `Removed ${clipped.length} silence${clipped.length !== 1 ? 's' : ''}, saved ${totalSaved.toFixed(1)}s`,
    'success',
  );

  return {
    silencesFound: merged.length,
    silencesRemoved: clipped.length,
    savedSeconds: totalSaved,
    newDuration,
  };
}
