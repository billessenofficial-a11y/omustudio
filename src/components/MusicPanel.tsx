import { useEffect } from 'react';
import { Play, Pause, Plus, Music, Volume2 } from 'lucide-react';
import { MUSIC_LIBRARY, useMusicStore } from '../store/music-store';
import { useProjectStore } from '../store/project-store';
import { useTimelineStore } from '../store/timeline-store';
import { useUIStore } from '../store/ui-store';

export default function MusicTab() {
  const { previewingId, previewTrack, stopPreview, loadDuration, durations } = useMusicStore();
  const { addMediaFromUrl } = useProjectStore();
  const { ensureTrack, addClip, duration: timelineDuration } = useTimelineStore();
  const { addToast } = useUIStore();

  useEffect(() => {
    return () => stopPreview();
  }, [stopPreview]);

  const handleAdd = async (trackId: string) => {
    const track = MUSIC_LIBRARY.find((t) => t.id === trackId);
    if (!track) return;

    stopPreview();

    const audioDuration = await loadDuration(track.id, track.url);
    const clipDuration = timelineDuration > 0 ? Math.min(audioDuration, timelineDuration) : audioDuration;

    const media = addMediaFromUrl(`${track.name} (Music)`, track.url, audioDuration);
    const audioTrackId = ensureTrack('audio');

    addClip(audioTrackId, {
      mediaId: media.id,
      type: 'audio',
      name: `${track.name} (Music)`,
      startTime: 0,
      duration: clipDuration,
      trimStart: 0,
      trimEnd: audioDuration - clipDuration,
      properties: { opacity: 1, volume: 0.3 },
    });

    addToast(`Added "${track.name}" music to timeline`, 'success');
  };

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      <div className="px-1 pb-2">
        <p className="text-[10px] uppercase tracking-wider text-editor-text-dim font-semibold mb-1">
          Music Library
        </p>
        <p className="text-[10px] text-editor-text-dim leading-relaxed">
          Click + to add to timeline. Music auto-trims to video length.
        </p>
      </div>

      {MUSIC_LIBRARY.map((track) => {
        const isPreviewing = previewingId === track.id;
        const dur = durations[track.id];

        return (
          <div
            key={track.id}
            className="group flex items-center gap-2 p-2 rounded-lg hover:bg-editor-hover transition-colors"
          >
            <button
              onClick={() => previewTrack(track.id)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                isPreviewing
                  ? 'bg-editor-accent/20 text-editor-accent'
                  : 'bg-editor-hover text-editor-text-dim hover:text-editor-text'
              }`}
            >
              {isPreviewing ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5 ml-0.5" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Music className="w-3 h-3 text-editor-accent shrink-0" />
                <span className="text-xs text-editor-text truncate font-medium">
                  {track.name}
                </span>
              </div>
              {dur ? (
                <span className="text-[10px] text-editor-text-dim">
                  {Math.floor(dur / 60)}:{String(Math.floor(dur % 60)).padStart(2, '0')}
                </span>
              ) : (
                <span className="text-[10px] text-editor-text-dim">
                  <Volume2 className="w-2.5 h-2.5 inline" /> Background
                </span>
              )}
            </div>

            <button
              onClick={() => handleAdd(track.id)}
              className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-md bg-editor-accent/10 text-editor-accent hover:bg-editor-accent/20 flex items-center justify-center transition-all"
              title="Add to timeline"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
