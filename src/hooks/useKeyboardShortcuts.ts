import { useEffect } from 'react';
import { useTimelineStore } from '../store/timeline-store';
import { useUIStore } from '../store/ui-store';

export function useKeyboardShortcuts() {
  const {
    isPlaying,
    currentTime,
    duration,
    selectedClipId,
    selectedClipIds,
    setIsPlaying,
    setCurrentTime,
    setActiveTool,
    removeClip,
    splitClip,
    addTrack,
    addClip,
    selectClip,
    undo,
    redo,
    tracks,
  } = useTimelineStore();
  const { addToast } = useUIStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      switch (e.key) {
        case 'z':
        case 'Z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
          }
          break;

        case 'y':
        case 'Y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            redo();
          }
          break;

        case ' ':
          e.preventDefault();
          if (tracks.some((t) => t.clips.length > 0)) {
            setIsPlaying(!isPlaying);
          }
          break;

        case 'v':
        case 'V':
          setActiveTool('select');
          break;

        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('split');
            if (selectedClipId) {
              splitClip(selectedClipId, currentTime);
              addToast('Clip split', 'info');
            }
          }
          break;

        case 't':
        case 'T': {
          let textTrack = tracks.find((t) => t.type === 'text');
          let trackId: string;
          if (!textTrack) {
            trackId = addTrack('text');
          } else {
            trackId = textTrack.id;
          }
          const clipId = useTimelineStore.getState().addClip(trackId, {
            type: 'text',
            name: 'Text',
            startTime: currentTime,
            duration: 5,
            trimStart: 0,
            trimEnd: 0,
            properties: {
              text: 'Your text here',
              fontSize: 48,
              fontColor: '#ffffff',
              fontFamily: 'sans-serif',
              opacity: 1,
              textAnimation: 'fadeIn',
              animationDuration: 0.5,
            },
          });
          selectClip(clipId);
          addToast('Text clip added', 'success');
          break;
        }

        case 'Delete':
        case 'Backspace': {
          const ids = selectedClipIds.length > 0 ? [...selectedClipIds] : [];
          if (ids.length > 0) {
            ids.forEach((id) => removeClip(id));
            addToast(ids.length > 1 ? `${ids.length} clips removed` : 'Clip removed', 'info');
          }
          break;
        }

        case 'ArrowLeft':
          e.preventDefault();
          setCurrentTime(Math.max(0, currentTime - (e.shiftKey ? 1 : 1 / 30)));
          break;

        case 'ArrowRight':
          e.preventDefault();
          setCurrentTime(Math.min(duration, currentTime + (e.shiftKey ? 1 : 1 / 30)));
          break;

        case 'Home':
          setCurrentTime(0);
          break;

        case 'End':
          setCurrentTime(duration);
          break;

        case 'j':
          setCurrentTime(Math.max(0, currentTime - 5));
          break;

        case 'k':
          if (tracks.some((t) => t.clips.length > 0)) {
            setIsPlaying(!isPlaying);
          }
          break;

        case 'l':
          setCurrentTime(Math.min(duration, currentTime + 5));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isPlaying,
    currentTime,
    duration,
    selectedClipId,
    selectedClipIds,
    tracks,
    setIsPlaying,
    setCurrentTime,
    setActiveTool,
    removeClip,
    splitClip,
    addTrack,
    addClip,
    selectClip,
    undo,
    redo,
    addToast,
  ]);
}
