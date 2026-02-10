import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import {
  MousePointer2,
  Scissors,
  Type,
  Plus,
  Volume2,
  VolumeX,
  Trash2,
  ZoomIn,
  ZoomOut,
  Magnet,
  Blend,
  Film,
  Layers,
  Music,
  Undo2,
  Redo2,
  Sparkles,
} from 'lucide-react';
import { useTimelineStore } from '../store/timeline-store';
import { useProjectStore } from '../store/project-store';
import { useUIStore } from '../store/ui-store';
import { useTranscriptStore } from '../store/transcript-store';
import { formatTimeShort } from '../lib/format';
import { getSnapPoints, snapClipMove, snapTime } from '../lib/timeline-snap';
import { TEXT_TEMPLATES } from '../lib/text-templates';
import type { TimelineClip, TimelineTrack as TrackType, ClipTransition } from '../types/editor';

const TRACK_HEIGHT = 56;
const RULER_HEIGHT = 28;
const TRACK_HEADER_WIDTH = 140;

export default function Timeline({ height }: { height: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const trackRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [dragging, setDragging] = useState<{
    clipId: string;
    trackId: string;
    clipType: string;
    type: 'move' | 'trim-left' | 'trim-right';
    startX: number;
    startY: number;
    originalStart: number;
    originalDuration: number;
    originalTrimStart: number;
    originalTrimEnd: number;
  } | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [activeSnapLine, setActiveSnapLine] = useState<number | null>(null);
  const [dropHighlightTrackId, setDropHighlightTrackId] = useState<string | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<{ x: number; y: number } | null>(null);
  const {
    tracks,
    transitions,
    currentTime,
    duration,
    zoom,
    scrollX,
    activeTool,
    selectedClipId,
    selectedClipIds,
    selectedTransitionId,
    _past,
    _future,
    pushUndo,
    undo,
    redo,
    addTrack,
    removeClip,
    updateClip,
    splitClip,
    selectClip,
    selectClips,
    selectTransition,
    setCurrentTime,
    setIsPlaying,
    setZoom,
    setScrollX,
    setActiveTool,
    toggleTrackMute,
    removeTrack,
    addTransition,
    ensureTrack,
    moveClipToTrack,
  } = useTimelineStore();

  const { mediaFiles } = useProjectStore();
  const { addToast } = useUIStore();
  const skipRegions = useTranscriptStore((s) => s.skipRegions);

  const pixelsPerSecond = (zoom / 100) * 60;
  const totalWidth = Math.max(duration * pixelsPerSecond + 200, 800);
  const mainTrackIdx = tracks.findIndex((t) => t.role === 'main');
  const hasOverlayTrack = tracks.some((t) => t.role === 'overlay');
  const showOverlayDropZone = mainTrackIdx >= 0 && !hasOverlayTrack;

  const xToTime = useCallback(
    (x: number) => x / pixelsPerSecond,
    [pixelsPerSecond]
  );

  const timeToX = useCallback(
    (time: number) => time * pixelsPerSecond,
    [pixelsPerSecond]
  );

  const handleRulerClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = xToTime(x);
    setCurrentTime(Math.max(0, time));
    setIsPlaying(false);
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      selectClips([]);
      selectTransition(null);
      const scrollContainer = timelineRef.current;
      if (scrollContainer) {
        const rect = scrollContainer.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollContainer.scrollLeft;
        const time = xToTime(x);
        setCurrentTime(Math.max(0, time));
        setIsPlaying(false);
      }
    }
  };

  const handleContentMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (dragging) return;
    const el = e.target as HTMLElement;
    if (!el.closest('[data-area="track-bg"]')) return;

    e.preventDefault();
    const cd = contentRef.current;
    if (!cd) return;
    const rect = cd.getBoundingClientRect();
    setMarqueeStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setMarqueeCurrent({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const ppsRef = useRef(pixelsPerSecond);
  ppsRef.current = pixelsPerSecond;
  const mainTrackIdxRef = useRef(mainTrackIdx);
  mainTrackIdxRef.current = mainTrackIdx;
  const showOverlayDropZoneRef = useRef(showOverlayDropZone);
  showOverlayDropZoneRef.current = showOverlayDropZone;

  useEffect(() => {
    if (!marqueeStart) return;

    let hasDragged = false;

    const handleMouseMove = (e: MouseEvent) => {
      const cd = contentRef.current;
      if (!cd) return;
      const rect = cd.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMarqueeCurrent({ x, y });

      const dx = Math.abs(x - marqueeStart.x);
      const dy = Math.abs(y - marqueeStart.y);
      if (dx >= 5 || dy >= 5) {
        hasDragged = true;
        const ids = computeMarqueeClipIds(
          marqueeStart, { x, y },
          tracksRef.current, ppsRef.current,
          mainTrackIdxRef.current, showOverlayDropZoneRef.current
        );
        selectClips(ids);
      }
    };

    const handleMouseUp = () => {
      if (!hasDragged) {
        selectClips([]);
        selectTransition(null);
        const time = xToTime(marqueeStart.x);
        setCurrentTime(Math.max(0, time));
        setIsPlaying(false);
      }
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [marqueeStart, selectClips, selectTransition, xToTime, setCurrentTime, setIsPlaying]);

  const isMarqueeDragging = marqueeStart !== null && marqueeCurrent !== null &&
    (Math.abs(marqueeCurrent.x - marqueeStart.x) >= 5 || Math.abs(marqueeCurrent.y - marqueeStart.y) >= 5);

  const selectedIdSet = useMemo(() => new Set(selectedClipIds), [selectedClipIds]);

  const handleTimelineMouseMove = useCallback((e: React.MouseEvent) => {
    const scrollContainer = timelineRef.current;
    if (!scrollContainer) return;
    const rect = scrollContainer.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollContainer.scrollLeft;
    setHoverX(x);
  }, []);

  const handleTimelineMouseLeave = useCallback(() => {
    setHoverX(null);
  }, []);

  const handleClipMouseDown = (e: React.MouseEvent, clip: TimelineClip, trackId: string) => {
    e.stopPropagation();
    selectClip(clip.id);

    if (activeTool === 'split') {
      const rect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = xToTime(x);
      splitClip(clip.id, time);
      addToast('Clip split', 'info');
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const clipWidth = rect.width;

    let type: 'move' | 'trim-left' | 'trim-right' = 'move';
    if (mouseX < 8) type = 'trim-left';
    else if (mouseX > clipWidth - 8) type = 'trim-right';

    pushUndo();
    setDragging({
      clipId: clip.id,
      trackId,
      clipType: clip.type,
      type,
      startX: e.clientX,
      startY: e.clientY,
      originalStart: clip.startTime,
      originalDuration: clip.duration,
      originalTrimStart: clip.trimStart,
      originalTrimEnd: clip.trimEnd,
    });
  };

  const getTrackAtY = useCallback((mouseY: number): string | null => {
    for (const [trackId, el] of trackRowRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (mouseY >= rect.top && mouseY <= rect.bottom) {
        return trackId;
      }
    }
    return null;
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragging.startX;
      const dt = dx / pixelsPerSecond;

      if (dragging.type === 'move') {
        const rawStart = Math.max(0, dragging.originalStart + dt);
        if (snapEnabled) {
          const points = getSnapPoints(tracks, dragging.clipId, currentTime);
          const result = snapClipMove(rawStart, dragging.originalDuration, points, pixelsPerSecond);
          updateClip(dragging.clipId, { startTime: result.time });
          setActiveSnapLine(result.snapped ? result.snapTime! : null);
        } else {
          updateClip(dragging.clipId, { startTime: rawStart });
          setActiveSnapLine(null);
        }

        const hoveredTrackId = getTrackAtY(e.clientY);
        if (hoveredTrackId && hoveredTrackId !== dragging.trackId) {
          const sourceTrack = tracks.find((t) => t.id === dragging.trackId);
          const targetTrack = tracks.find((t) => t.id === hoveredTrackId);
          if (sourceTrack && targetTrack) {
            const canMove =
              (sourceTrack.role === 'main' && targetTrack.role === 'overlay') ||
              (sourceTrack.role === 'overlay' && targetTrack.role === 'main') ||
              (sourceTrack.type === targetTrack.type);
            setDropHighlightTrackId(canMove ? hoveredTrackId : null);
          }
        } else {
          setDropHighlightTrackId(null);
        }
      } else if (dragging.type === 'trim-left') {
        const isTextClip = dragging.clipType === 'text';
        const maxTrim = dragging.originalDuration - 0.1;
        const minDelta = isTextClip ? -dragging.originalStart : -dragging.originalTrimStart;
        let trimDelta = Math.max(minDelta, Math.min(maxTrim, dt));
        if (snapEnabled) {
          const rawStart = dragging.originalStart + trimDelta;
          const points = getSnapPoints(tracks, dragging.clipId, currentTime);
          const result = snapTime(rawStart, points, pixelsPerSecond);
          if (result.snapped) {
            trimDelta = result.time - dragging.originalStart;
            trimDelta = Math.max(minDelta, Math.min(maxTrim, trimDelta));
          }
          setActiveSnapLine(result.snapped ? result.snapTime! : null);
        } else {
          setActiveSnapLine(null);
        }
        updateClip(dragging.clipId, {
          startTime: dragging.originalStart + trimDelta,
          duration: dragging.originalDuration - trimDelta,
          ...(isTextClip ? {} : { trimStart: dragging.originalTrimStart + trimDelta }),
        });
      } else if (dragging.type === 'trim-right') {
        const isTextClip = dragging.clipType === 'text';
        const totalAvailable = isTextClip ? Infinity : dragging.originalDuration + dragging.originalTrimEnd;
        let newDuration = Math.max(0.1, Math.min(totalAvailable, dragging.originalDuration + dt));
        if (snapEnabled) {
          const rawEnd = dragging.originalStart + newDuration;
          const points = getSnapPoints(tracks, dragging.clipId, currentTime);
          const result = snapTime(rawEnd, points, pixelsPerSecond);
          if (result.snapped) {
            newDuration = Math.max(0.1, Math.min(totalAvailable, result.time - dragging.originalStart));
          }
          setActiveSnapLine(result.snapped ? result.snapTime! : null);
        } else {
          setActiveSnapLine(null);
        }
        updateClip(dragging.clipId, {
          duration: newDuration,
          ...(isTextClip ? {} : { trimEnd: dragging.originalTrimEnd - (newDuration - dragging.originalDuration) }),
        });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (dragging.type === 'move') {
        const hoveredTrackId = getTrackAtY(e.clientY);
        if (hoveredTrackId && hoveredTrackId !== dragging.trackId) {
          const sourceTrack = tracks.find((t) => t.id === dragging.trackId);
          const targetTrack = tracks.find((t) => t.id === hoveredTrackId);
          if (sourceTrack && targetTrack) {
            const canMove =
              (sourceTrack.role === 'main' && targetTrack.role === 'overlay') ||
              (sourceTrack.role === 'overlay' && targetTrack.role === 'main') ||
              (sourceTrack.type === targetTrack.type);
            if (canMove) {
              moveClipToTrack(dragging.clipId, hoveredTrackId);
            }
          }
        }
      }
      setDragging(null);
      setActiveSnapLine(null);
      setDropHighlightTrackId(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, pixelsPerSecond, updateClip, snapEnabled, tracks, currentTime, getTrackAtY, moveClipToTrack]);

  const handleDropOnEmpty = (e: React.DragEvent) => {
    e.preventDefault();

    const templateId = e.dataTransfer.getData('application/text-template-id');
    if (templateId) {
      handleTextTemplateDrop(e, null);
      return;
    }

    const mediaId = e.dataTransfer.getData('application/media-id');
    if (!mediaId) return;

    const media = mediaFiles.find((m) => m.id === mediaId);
    if (!media) return;

    const role = media.type === 'audio' ? 'audio' as const : 'main' as const;
    const trackId = ensureTrack(role);

    useTimelineStore.getState().addClip(trackId, {
      mediaId: media.id,
      type: media.type === 'audio' ? 'audio' : 'video',
      name: media.name,
      startTime: 0,
      duration: media.duration,
      trimStart: 0,
      trimEnd: 0,
      properties: { opacity: 1, volume: 1 },
    });

    addToast(`Added ${media.name}`, 'success');
  };

  const handleTextTemplateDrop = (e: React.DragEvent, targetTrack: TrackType | null) => {
    const templateId = e.dataTransfer.getData('application/text-template-id');
    if (!templateId) return;

    const template = TEXT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    const textTrackId = ensureTrack('text');

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let dropTime = Math.max(0, xToTime(x));

    if (snapEnabled) {
      const points = getSnapPoints(tracks, null, currentTime);
      const result = snapClipMove(dropTime, template.duration, points, pixelsPerSecond);
      dropTime = result.time;
    }

    const clipId = useTimelineStore.getState().addClip(textTrackId, {
      type: 'text',
      name: template.label,
      startTime: dropTime,
      duration: template.duration,
      trimStart: 0,
      trimEnd: 0,
      properties: { ...template.properties },
    });

    selectClip(clipId);
    addToast(`Added "${template.label}" text`, 'success');
  };

  const resolveDropTrack = (_e: React.DragEvent, track: TrackType, media: { type: string }) => {
    if (media.type === 'audio') return track;

    const mainTrack = tracks.find((t) => t.role === 'main');
    if (!mainTrack || track.id === mainTrack.id) return track;

    const mainIdx = tracks.indexOf(mainTrack);
    const dropIdx = tracks.indexOf(track);

    if (dropIdx < mainIdx) {
      const overlayId = ensureTrack('overlay');
      return useTimelineStore.getState().tracks.find((t) => t.id === overlayId) || track;
    }

    return track;
  };

  const handleDrop = (e: React.DragEvent, track: TrackType) => {
    e.preventDefault();

    const templateId = e.dataTransfer.getData('application/text-template-id');
    if (templateId) {
      handleTextTemplateDrop(e, track);
      return;
    }

    const mediaId = e.dataTransfer.getData('application/media-id');
    if (!mediaId) return;

    const media = mediaFiles.find((m) => m.id === mediaId);
    if (!media) return;

    const isTextTrack = track.type === 'text';
    if (isTextTrack) return;

    const targetTrack = resolveDropTrack(e, track, media);

    const isAudioTrack = targetTrack.type === 'audio';
    if (isAudioTrack && media.type !== 'audio') return;
    if (!isAudioTrack && media.type === 'audio') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let dropTime = Math.max(0, xToTime(x));

    if (snapEnabled) {
      const points = getSnapPoints(tracks, null, currentTime);
      const result = snapClipMove(dropTime, media.duration, points, pixelsPerSecond);
      dropTime = result.time;
    }

    useTimelineStore.getState().addClip(targetTrack.id, {
      mediaId: media.id,
      type: media.type === 'audio' ? 'audio' : 'video',
      name: media.name,
      startTime: dropTime,
      duration: media.duration,
      trimStart: 0,
      trimEnd: 0,
      properties: { opacity: 1, volume: 1 },
    });

    addToast(`Added ${media.name}`, 'success');
  };

  const handleDropAboveMain = (e: React.DragEvent) => {
    e.preventDefault();

    const templateId = e.dataTransfer.getData('application/text-template-id');
    if (templateId) {
      handleTextTemplateDrop(e, null);
      return;
    }

    const mediaId = e.dataTransfer.getData('application/media-id');
    if (!mediaId) return;

    const media = mediaFiles.find((m) => m.id === mediaId);
    if (!media || media.type === 'audio') return;

    const overlayId = ensureTrack('overlay');

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let dropTime = Math.max(0, xToTime(x));

    if (snapEnabled) {
      const points = getSnapPoints(tracks, null, currentTime);
      const result = snapClipMove(dropTime, media.duration, points, pixelsPerSecond);
      dropTime = result.time;
    }

    useTimelineStore.getState().addClip(overlayId, {
      mediaId: media.id,
      type: 'video',
      name: media.name,
      startTime: dropTime,
      duration: media.duration,
      trimStart: 0,
      trimEnd: 0,
      properties: { opacity: 1, volume: 1 },
    });

    addToast(`Added ${media.name} as overlay`, 'success');
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const step = zoom <= 10 ? 2 : zoom <= 50 ? 5 : 10;
      const delta = e.deltaY > 0 ? -step : step;
      setZoom(zoom + delta);
    } else {
      setScrollX(scrollX + e.deltaX + e.deltaY);
    }
  };

  useEffect(() => {
    if (dragging && (dragging.type === 'trim-left' || dragging.type === 'trim-right')) {
      document.body.style.cursor = 'col-resize';
      return () => { document.body.style.cursor = ''; };
    }
  }, [dragging]);

  const playheadX = timeToX(currentTime);

  return (
    <div className="bg-editor-surface border-t border-editor-border flex flex-col shrink-0" style={{ height }}>
      <TimelineToolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        zoom={zoom}
        setZoom={setZoom}
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled(!snapEnabled)}
        onUndo={undo}
        onRedo={redo}
        canUndo={_past.length > 0}
        canRedo={_future.length > 0}
        onAddTrack={() => addTrack('video')}
        onAddAudioTrack={() => addTrack('audio')}
        onAddTextTrack={() => addTrack('text')}
        onAddText={() => {
          const textTrackId = ensureTrack('text');
          const clipId = useTimelineStore.getState().addClip(textTrackId, {
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
        }}
        onDeleteClip={() => {
          const ids = selectedClipIds.length > 0 ? [...selectedClipIds] : [];
          if (ids.length > 0) {
            ids.forEach((id) => removeClip(id));
            addToast(ids.length > 1 ? `${ids.length} clips removed` : 'Clip removed', 'info');
          }
        }}
        hasSelection={selectedClipIds.length > 0}
      />

      <div
        ref={containerRef}
        className="flex-1 flex overflow-hidden"
        onWheel={handleWheel}
      >
        <div className="shrink-0" style={{ width: TRACK_HEADER_WIDTH }}>
          <div
            className="border-b border-r border-editor-border bg-editor-panel"
            style={{ height: RULER_HEIGHT }}
          />
          {tracks.map((track, idx) => {
            const trackIcon = track.type === 'text'
              ? <Type className="w-3 h-3" />
              : track.type === 'overlay'
                ? <Layers className="w-3 h-3" />
                : track.type === 'audio'
                  ? <Music className="w-3 h-3" />
                  : <Film className="w-3 h-3" />;

            const isHighlighted = dropHighlightTrackId === track.id;

            return (
              <div key={track.id}>
                {showOverlayDropZone && idx === mainTrackIdx && (
                  <div
                    className="flex items-center justify-center border-b border-r border-dashed border-editor-border bg-editor-panel/50"
                    style={{ height: TRACK_HEIGHT / 2 }}
                  >
                    <span className="text-[10px] text-editor-text-dim">
                      Drop here for overlay
                    </span>
                  </div>
                )}
                <div
                  className={`group flex items-center gap-1 px-2 border-b border-r border-editor-border bg-editor-panel transition-colors ${
                    isHighlighted ? 'bg-editor-accent/10' : ''
                  }`}
                  style={{ height: TRACK_HEIGHT }}
                >
                  <span className="text-editor-text-dim shrink-0">{trackIcon}</span>
                  <button
                    onClick={() => toggleTrackMute(track.id)}
                    className="btn-icon shrink-0"
                    title={track.isMuted ? 'Unmute' : 'Mute'}
                  >
                    {track.isMuted ? (
                      <VolumeX className="w-3 h-3" />
                    ) : (
                      <Volume2 className="w-3 h-3" />
                    )}
                  </button>
                  <span className="text-[11px] text-editor-text-muted truncate flex-1">
                    {track.name}
                  </span>
                  {!track.isDefault && (
                    <button
                      onClick={() => removeTrack(track.id)}
                      className="btn-icon opacity-0 group-hover:opacity-100 shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onClick={handleTimelineClick}
          onMouseMove={handleTimelineMouseMove}
          onMouseLeave={handleTimelineMouseLeave}
          onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}
        >
          <div ref={contentRef} style={{ width: totalWidth, position: 'relative', minHeight: '100%' }} onMouseDown={handleContentMouseDown}>
            <div
              className="sticky top-0 z-10 border-b border-editor-border bg-editor-panel cursor-pointer"
              style={{ height: RULER_HEIGHT }}
              onClick={handleRulerClick}
            >
              <TimeRuler
                totalWidth={totalWidth}
                pixelsPerSecond={pixelsPerSecond}
                scrollX={scrollX}
              />
            </div>

            {tracks.map((track, idx) => {
              const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);
              const adjacentPairs = getAdjacentPairs(sortedClips);
              const isHighlighted = dropHighlightTrackId === track.id;

              return (
                <div key={track.id}>
                  {showOverlayDropZone && idx === mainTrackIdx && (
                    <div
                      className="relative border-b border-dashed border-editor-border/50 bg-rose-500/5 hover:bg-rose-500/10 transition-colors"
                      style={{ height: TRACK_HEIGHT / 2 }}
                      onDrop={handleDropAboveMain}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-[10px] text-editor-text-dim">
                          Drop here for overlay
                        </span>
                      </div>
                    </div>
                  )}
                  <div
                    ref={(el) => {
                      if (el) trackRowRefs.current.set(track.id, el);
                      else trackRowRefs.current.delete(track.id);
                    }}
                    className={`relative border-b border-editor-border transition-colors ${
                      isHighlighted ? 'bg-editor-accent/10' : ''
                    }`}
                    style={{ height: TRACK_HEIGHT }}
                    data-area="track-bg"
                    onDrop={(e) => handleDrop(e, track)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                  >
                    {track.clips.map((clip) => (
                      <TimelineClipComponent
                        key={clip.id}
                        clip={clip}
                        track={track}
                        pixelsPerSecond={pixelsPerSecond}
                        isSelected={selectedIdSet.has(clip.id)}
                        onMouseDown={(e) => handleClipMouseDown(e, clip, track.id)}
                        mediaFiles={mediaFiles}
                      />
                    ))}

                    {track.role === 'main' && skipRegions.length > 0 && skipRegions.map((region, i) => {
                      const left = region.start * pixelsPerSecond;
                      const w = (region.end - region.start) * pixelsPerSecond;
                      if (w < 1) return null;
                      return (
                        <div
                          key={`skip-${i}`}
                          className="absolute top-1 bottom-1 rounded-md pointer-events-none z-10"
                          style={{
                            left,
                            width: w,
                            background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(239,68,68,0.15) 3px, rgba(239,68,68,0.15) 4px)',
                            backgroundColor: 'rgba(239,68,68,0.12)',
                            border: '1px solid rgba(239,68,68,0.3)',
                          }}
                        />
                      );
                    })}

                    {track.type !== 'text' && adjacentPairs.map(([clipA, clipB]) => {
                      const existing = transitions.find(
                        (t) => t.fromClipId === clipA.id && t.toClipId === clipB.id
                      );
                      const junctionTime = clipA.startTime + clipA.duration;
                      const junctionX = junctionTime * pixelsPerSecond;
                      const pairKey = `${clipA.id}-${clipB.id}`;

                      return (
                        <TransitionMarker
                          key={pairKey}
                          junctionX={junctionX}
                          transition={existing}
                          isSelected={existing?.id === selectedTransitionId}
                          onClick={() => {
                            if (!existing) {
                              const id = addTransition(track.id, clipA.id, clipB.id, 'crossfade');
                              selectTransition(id);
                            } else {
                              selectTransition(existing.id);
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {tracks.length === 0 && (
              <div
                className="absolute inset-0 flex items-center justify-center z-0"
                style={{ top: RULER_HEIGHT }}
                onDrop={handleDropOnEmpty}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
              >
                <span className="text-editor-text-dim text-sm">
                  Drop media here or add a track to get started
                </span>
              </div>
            )}

            {tracks.length > 0 && (
              <div
                className="absolute left-0 right-0 bottom-0"
                style={{
                  top: RULER_HEIGHT + tracks.length * TRACK_HEIGHT + (showOverlayDropZone ? TRACK_HEIGHT / 2 : 0),
                }}
                onDrop={handleDropOnEmpty}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
              />
            )}

            <div
              className="absolute top-0 bottom-0 w-px bg-editor-accent z-20 pointer-events-none"
              style={{ left: playheadX, display: playheadX >= 0 ? 'block' : 'none' }}
            >
              <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-editor-accent"
                style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}
              />
            </div>

            {activeSnapLine !== null && (
              <div
                className="absolute top-0 bottom-0 w-px z-30 pointer-events-none"
                style={{
                  left: timeToX(activeSnapLine),
                  backgroundColor: '#22d3ee',
                  boxShadow: '0 0 6px #22d3ee',
                }}
              />
            )}

            {hoverX !== null && !marqueeStart && (
              <div
                className="absolute top-0 bottom-0 w-px z-10 pointer-events-none"
                style={{
                  left: hoverX,
                  backgroundColor: 'rgba(250, 204, 21, 0.7)',
                }}
              />
            )}

            {isMarqueeDragging && marqueeStart && marqueeCurrent && (
              <div
                className="absolute z-30 pointer-events-none border border-sky-400/60 bg-sky-400/10"
                style={{
                  left: Math.min(marqueeStart.x, marqueeCurrent.x),
                  top: Math.min(marqueeStart.y, marqueeCurrent.y),
                  width: Math.abs(marqueeCurrent.x - marqueeStart.x),
                  height: Math.abs(marqueeCurrent.y - marqueeStart.y),
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineToolbar({
  activeTool,
  setActiveTool,
  zoom,
  setZoom,
  snapEnabled,
  onToggleSnap,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddTrack,
  onAddAudioTrack,
  onAddTextTrack,
  onAddText,
  onDeleteClip,
  hasSelection,
}: {
  activeTool: string;
  setActiveTool: (tool: 'select' | 'trim' | 'split' | 'text') => void;
  zoom: number;
  setZoom: (z: number) => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAddTrack: () => void;
  onAddAudioTrack: () => void;
  onAddTextTrack: () => void;
  onAddText: () => void;
  onDeleteClip: () => void;
  hasSelection: boolean;
}) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  return (
    <div className="h-9 flex items-center justify-between px-3 border-b border-editor-border bg-editor-panel shrink-0">
      <div className="flex items-center gap-0.5">
        <ToolButton
          active={activeTool === 'select'}
          onClick={() => setActiveTool('select')}
          icon={<MousePointer2 className="w-3.5 h-3.5" />}
          label="Select (V)"
        />
        <ToolButton
          active={activeTool === 'split'}
          onClick={() => setActiveTool('split')}
          icon={<Scissors className="w-3.5 h-3.5" />}
          label="Split (S)"
        />
        <ToolButton
          active={false}
          onClick={onAddText}
          icon={<Type className="w-3.5 h-3.5" />}
          label="Add Text (T)"
        />

        <div className="w-px h-4 bg-editor-border mx-1.5" />

        <ToolButton
          active={snapEnabled}
          onClick={onToggleSnap}
          icon={<Magnet className="w-3.5 h-3.5" />}
          label="Snap (N)"
        />

        <div className="w-px h-4 bg-editor-border mx-1.5" />

        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 rounded transition-colors text-editor-text-muted hover:bg-editor-hover hover:text-editor-text disabled:opacity-30 disabled:pointer-events-none"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 rounded transition-colors text-editor-text-muted hover:bg-editor-hover hover:text-editor-text disabled:opacity-30 disabled:pointer-events-none"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-editor-border mx-1.5" />

        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="btn-icon flex items-center gap-1 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {showAddMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowAddMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-editor-panel border border-editor-border rounded-lg shadow-xl z-40 py-1 w-36">
                <button
                  onClick={() => { onAddTrack(); setShowAddMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-editor-hover text-editor-text-muted hover:text-editor-text transition-colors"
                >
                  Video Track
                </button>
                <button
                  onClick={() => { onAddAudioTrack(); setShowAddMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-editor-hover text-editor-text-muted hover:text-editor-text transition-colors"
                >
                  Audio Track
                </button>
                <button
                  onClick={() => { onAddTextTrack(); setShowAddMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-editor-hover text-editor-text-muted hover:text-editor-text transition-colors"
                >
                  Text Track
                </button>
              </div>
            </>
          )}
        </div>

        {hasSelection && (
          <button onClick={onDeleteClip} className="btn-icon text-editor-error">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button onClick={() => setZoom(Math.max(2, zoom - (zoom <= 10 ? 2 : zoom <= 50 ? 10 : 20)))} className="btn-icon">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <input
          type="range"
          min={2}
          max={400}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-24 accent-editor-accent"
          style={{ height: 4 }}
        />
        <button onClick={() => setZoom(Math.min(400, zoom + (zoom < 10 ? 2 : zoom < 50 ? 10 : 20)))} className="btn-icon">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-editor-accent/20 text-editor-accent'
          : 'text-editor-text-muted hover:bg-editor-hover hover:text-editor-text'
      }`}
    >
      {icon}
    </button>
  );
}

function TimeRuler({
  totalWidth,
  pixelsPerSecond,
}: {
  totalWidth: number;
  pixelsPerSecond: number;
  scrollX: number;
}) {
  const marks: React.ReactNode[] = [];
  let interval = 1;
  if (pixelsPerSecond < 0.5) interval = 600;
  else if (pixelsPerSecond < 1) interval = 300;
  else if (pixelsPerSecond < 2) interval = 120;
  else if (pixelsPerSecond < 5) interval = 60;
  else if (pixelsPerSecond < 10) interval = 15;
  else if (pixelsPerSecond < 20) interval = 5;
  if (pixelsPerSecond > 100) interval = 0.5;

  const totalSeconds = totalWidth / pixelsPerSecond;
  for (let t = 0; t <= totalSeconds; t += interval) {
    const x = t * pixelsPerSecond;
    const isMajor = t % (interval * 2) === 0 || interval >= 5;
    marks.push(
      <div
        key={t}
        className="absolute top-0 flex flex-col items-center"
        style={{ left: x }}
      >
        <div
          className={`w-px ${isMajor ? 'h-3 bg-editor-text-dim' : 'h-2 bg-editor-border-light'}`}
          style={{ marginTop: isMajor ? 0 : 4 }}
        />
        {isMajor && (
          <span className="text-[9px] text-editor-text-dim mt-0.5 font-mono">
            {formatTimeShort(t)}
          </span>
        )}
      </div>
    );
  }

  return <div className="relative h-full">{marks}</div>;
}

function TimelineClipComponent({
  clip,
  track,
  pixelsPerSecond,
  isSelected,
  onMouseDown,
  mediaFiles,
}: {
  clip: TimelineClip;
  track: TrackType;
  pixelsPerSecond: number;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  mediaFiles: ReturnType<typeof useProjectStore.getState>['mediaFiles'];
}) {
  const left = clip.startTime * pixelsPerSecond;
  const width = Math.max(clip.duration * pixelsPerSecond, 4);

  const media = clip.mediaId ? mediaFiles.find((m) => m.id === clip.mediaId) : undefined;
  const isAiPlaceholder = !clip.mediaId && clip.name.startsWith('AI:');

  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    video: { bg: 'bg-sky-500/25', border: 'border-sky-500/50', text: 'text-sky-300' },
    overlay: { bg: 'bg-rose-500/25', border: 'border-rose-500/50', text: 'text-rose-300' },
    audio: { bg: 'bg-emerald-500/25', border: 'border-emerald-500/50', text: 'text-emerald-300' },
    text: { bg: 'bg-amber-500/25', border: 'border-amber-500/50', text: 'text-amber-300' },
  };

  const colors = isAiPlaceholder
    ? { bg: 'bg-teal-500/15', border: 'border-teal-500/40', text: 'text-teal-300' }
    : colorMap[track.type] || colorMap.video;

  return (
    <div
      className={`absolute top-1 bottom-1 rounded-md cursor-pointer transition-shadow overflow-hidden
        ${colors.bg} ${isSelected ? 'border-editor-accent shadow-lg shadow-editor-accent/20' : colors.border}
        ${isAiPlaceholder ? 'border-dashed border' : 'border'}
      `}
      style={{ left, width }}
      onMouseDown={onMouseDown}
    >
      {isAiPlaceholder && (
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, currentColor 4px, currentColor 5px)',
          }}
        />
      )}

      <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize group/trim-left z-10">
        <div className="absolute inset-0 rounded-l-md transition-colors duration-150 group-hover/trim-left:bg-white/20" />
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize group/trim-right z-10">
        <div className="absolute inset-0 rounded-r-md transition-colors duration-150 group-hover/trim-right:bg-white/20" />
      </div>

      <div className="px-2 py-1 h-full flex items-center gap-1.5 overflow-hidden relative">
        {isAiPlaceholder && (
          <Sparkles className="w-3 h-3 text-teal-400 shrink-0" />
        )}
        {media?.thumbnailUrl && (
          <img
            src={media.thumbnailUrl}
            className="h-full w-8 object-cover rounded-sm shrink-0 opacity-60"
            alt=""
          />
        )}
        <span className={`text-[10px] font-medium truncate ${colors.text}`}>
          {clip.name}
        </span>
      </div>
    </div>
  );
}

function getAdjacentPairs(sortedClips: TimelineClip[]): [TimelineClip, TimelineClip][] {
  const pairs: [TimelineClip, TimelineClip][] = [];
  for (let i = 0; i < sortedClips.length - 1; i++) {
    const a = sortedClips[i];
    const b = sortedClips[i + 1];
    const aEnd = a.startTime + a.duration;
    if (Math.abs(aEnd - b.startTime) < 0.15) {
      pairs.push([a, b]);
    }
  }
  return pairs;
}

function computeMarqueeClipIds(
  start: { x: number; y: number },
  end: { x: number; y: number },
  allTracks: TrackType[],
  pps: number,
  mTrackIdx: number,
  overlayDrop: boolean,
): string[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  const ids: string[] = [];
  let yOffset = RULER_HEIGHT;

  for (let i = 0; i < allTracks.length; i++) {
    if (overlayDrop && i === mTrackIdx) {
      yOffset += TRACK_HEIGHT / 2;
    }
    const trackTop = yOffset;
    const trackBottom = yOffset + TRACK_HEIGHT;
    yOffset += TRACK_HEIGHT;

    for (const clip of allTracks[i].clips) {
      const clipLeft = clip.startTime * pps;
      const clipRight = (clip.startTime + clip.duration) * pps;

      if (clipRight > minX && clipLeft < maxX && trackBottom > minY && trackTop < maxY) {
        ids.push(clip.id);
      }
    }
  }

  return ids;
}

function TransitionMarker({
  junctionX,
  transition,
  isSelected,
  onClick,
}: {
  junctionX: number;
  transition: ClipTransition | undefined;
  isSelected: boolean;
  onClick: () => void;
}) {
  const hasTransition = transition && transition.type !== 'none';

  return (
    <div
      className="absolute z-10"
      style={{
        left: junctionX - 14,
        top: '50%',
        transform: 'translateY(-50%)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-md ${
          isSelected
            ? 'bg-teal-400 text-white ring-2 ring-teal-400/50 shadow-teal-400/40'
            : hasTransition
              ? 'bg-teal-500/90 text-white hover:bg-teal-400 shadow-teal-500/30'
              : 'bg-editor-panel/90 border border-editor-border-light text-editor-text-dim hover:text-editor-text hover:border-editor-text-muted hover:bg-editor-hover'
        }`}
        title={hasTransition ? `${transition!.type} transition` : 'Add transition'}
      >
        <Blend className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
