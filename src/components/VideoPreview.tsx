import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronFirst,
  ChevronLast,
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react';
import { Player, type PlayerRef } from '../lib/animation-player';
import { useTimelineStore } from '../store/timeline-store';
import { useProjectStore } from '../store/project-store';
import { formatTime } from '../lib/format';
import { AnimatedText } from '../remotion/AnimatedText';
import { computeTransitionPair, getTransitionProgress, type TransitionStyle, type TransitionOverlay } from '../lib/transition-effects';
import { useTranscriptStore } from '../store/transcript-store';
import type { TextAnimation, TimelineClip, MediaFile } from '../types/editor';

function transitionStyleToCss(s: TransitionStyle): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (s.opacity < 1) css.opacity = s.opacity;
  if (s.transform !== 'none') css.transform = s.transform;
  if (s.clipPath) css.clipPath = s.clipPath;
  if (s.filter) css.filter = s.filter;
  return css;
}

export default function VideoPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const outgoingVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const playbackActiveRef = useRef(false);

  const { currentTime, isPlaying, duration, tracks, transitions, selectedClipId, setCurrentTime, setIsPlaying } =
    useTimelineStore();
  const { mediaFiles, project } = useProjectStore();

  const activeClip = findActiveVideoClip(tracks, currentTime);
  const activeMedia = activeClip?.mediaId
    ? mediaFiles.find((m) => m.id === activeClip.mediaId)
    : undefined;

  const activeTextClips = findActiveTextClips(tracks, currentTime);
  const activeOverlayClips = findActiveOverlayClips(tracks, currentTime);

  const activeTransition = useMemo(() => {
    if (!activeClip) return null;
    const t = transitions.find((tr) => tr.toClipId === activeClip.id);
    if (!t || t.type === 'none') return null;
    const progress = getTransitionProgress(currentTime, activeClip.startTime, t.duration);
    if (progress >= 1) return null;

    let fromClip: TimelineClip | undefined;
    for (const track of tracks) {
      fromClip = track.clips.find((c) => c.id === t.fromClipId);
      if (fromClip) break;
    }
    const fromMedia = fromClip?.mediaId
      ? mediaFiles.find((m) => m.id === fromClip!.mediaId)
      : undefined;
    if (!fromClip || !fromMedia) return null;

    return { transition: t, fromClip, fromMedia, progress };
  }, [activeClip, transitions, currentTime, tracks, mediaFiles]);

  const transitionStyles = useMemo<{
    outgoing: React.CSSProperties;
    incoming: React.CSSProperties;
    overlay?: TransitionOverlay;
  }>(() => {
    if (!activeTransition) return { outgoing: {} as React.CSSProperties, incoming: {} as React.CSSProperties };
    const pair = computeTransitionPair(activeTransition.transition.type, activeTransition.progress);
    return {
      outgoing: transitionStyleToCss(pair.outgoing),
      incoming: transitionStyleToCss(pair.incoming),
      overlay: pair.overlay,
    };
  }, [activeTransition]);

  const syncVideoToTime = useCallback(() => {
    if (playbackActiveRef.current) return;

    const video = videoRef.current;
    if (!video || !activeClip || !activeMedia) return;

    const clipLocalTime = currentTime - activeClip.startTime + activeClip.trimStart;

    if (video.src !== activeMedia.blobUrl) {
      video.src = activeMedia.blobUrl;
      video.load();
    }

    if (!video.seeking && Math.abs(video.currentTime - clipLocalTime) > 0.1) {
      video.currentTime = clipLocalTime;
    }
  }, [currentTime, activeClip, activeMedia]);

  useEffect(() => {
    syncVideoToTime();
  }, [syncVideoToTime]);

  useEffect(() => {
    const video = outgoingVideoRef.current;
    if (!video) return;

    if (activeTransition) {
      const { fromClip, fromMedia, progress, transition } = activeTransition;
      if (video.src !== fromMedia.blobUrl) {
        video.src = fromMedia.blobUrl;
        video.load();
      }
      const outgoingMediaTime = fromClip.trimStart + fromClip.duration + progress * transition.duration;
      if (Math.abs(video.currentTime - outgoingMediaTime) > 0.15) {
        video.currentTime = Math.max(0, outgoingMediaTime);
      }
      if (isPlaying && video.paused) video.play().catch(() => {});
      else if (!isPlaying && !video.paused) video.pause();
      return;
    }

    if (activeClip && activeMedia) {
      const t = transitions.find((tr) => tr.fromClipId === activeClip.id);
      if (t && t.type !== 'none') {
        const clipEnd = activeClip.startTime + activeClip.duration;
        const timeUntilEnd = clipEnd - currentTime;
        if (timeUntilEnd > 0 && timeUntilEnd <= 0.5) {
          if (video.src !== activeMedia.blobUrl) {
            video.src = activeMedia.blobUrl;
            video.load();
          }
          const clipLocalTime = currentTime - activeClip.startTime + activeClip.trimStart;
          if (Math.abs(video.currentTime - clipLocalTime) > 0.15) {
            video.currentTime = clipLocalTime;
          }
          if (isPlaying && video.paused) {
            video.muted = true;
            video.play().catch(() => {});
          }
          return;
        }
      }
    }

    if (video.src) {
      video.pause();
      video.removeAttribute('src');
    }
  }, [activeTransition, activeClip, activeMedia, transitions, currentTime, isPlaying]);

  useEffect(() => {
    const mainVideo = videoRef.current;
    const outVideo = outgoingVideoRef.current;
    if (activeTransition) {
      const p = activeTransition.progress;
      if (mainVideo) mainVideo.volume = p;
      if (outVideo) {
        outVideo.muted = false;
        outVideo.volume = 1 - p;
      }
    } else {
      if (mainVideo) mainVideo.volume = 1;
      if (outVideo) {
        outVideo.muted = true;
        outVideo.volume = 0;
      }
    }
  }, [activeTransition]);

  useEffect(() => {
    if (!isPlaying) {
      playbackActiveRef.current = false;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.playbackRate = 1.0;
      }
      if (outgoingVideoRef.current) outgoingVideoRef.current.pause();
      cancelAnimationFrame(animFrameRef.current);
      return;
    }

    playbackActiveRef.current = true;

    const timelineState = useTimelineStore.getState();
    const projectState = useProjectStore.getState();
    const initClip = findActiveVideoClip(timelineState.tracks, timelineState.currentTime);
    const initMedia = initClip?.mediaId
      ? projectState.mediaFiles.find((m) => m.id === initClip.mediaId)
      : undefined;

    const video = videoRef.current;
    if (video && initClip && initMedia) {
      if (video.src !== initMedia.blobUrl) {
        video.src = initMedia.blobUrl;
        video.load();
      }
      const initTime = timelineState.currentTime - initClip.startTime + initClip.trimStart;
      if (Math.abs(video.currentTime - initTime) > 0.05) {
        video.currentTime = initTime;
      }
      video.playbackRate = 1.0;
      video.play().catch(() => {});
    }

    let lastTs = performance.now();
    let prevClipId = initClip?.id ?? null;

    const tick = () => {
      const now = performance.now();
      const delta = (now - lastTs) / 1000;
      lastTs = now;

      const state = useTimelineStore.getState();
      let newTime = state.currentTime + delta;

      const { skipRegions } = useTranscriptStore.getState();
      let jumps = 0;
      while (jumps < 10) {
        const region = skipRegions.find((r) => newTime >= r.start && newTime < r.end);
        if (!region) break;
        newTime = region.end;
        jumps++;
      }

      if (newTime >= state.duration) {
        setIsPlaying(false);
        setCurrentTime(state.duration);
        return;
      }

      setCurrentTime(newTime);

      const vid = videoRef.current;
      if (vid) {
        const clip = findActiveVideoClip(state.tracks, newTime);
        if (clip) {
          const media = clip.mediaId
            ? useProjectStore.getState().mediaFiles.find((m) => m.id === clip.mediaId)
            : undefined;

          if (media) {
            if (vid.src !== media.blobUrl) {
              vid.src = media.blobUrl;
              vid.load();
            }

            const clipLocalTime = newTime - clip.startTime + clip.trimStart;
            const clipChanged = clip.id !== prevClipId;
            prevClipId = clip.id;

            if (!vid.seeking) {
              const drift = clipLocalTime - vid.currentTime;
              const absDrift = Math.abs(drift);

              if (clipChanged || absDrift > 0.5) {
                vid.playbackRate = 1.0;
                vid.currentTime = clipLocalTime;
              } else if (absDrift > 0.05) {
                vid.playbackRate = 1.0 + Math.min(Math.max(drift * 3, -0.5), 0.5);
              } else {
                if (vid.playbackRate !== 1.0) vid.playbackRate = 1.0;
              }
            }

            if (vid.paused && !vid.seeking) {
              vid.play().catch(() => {});
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      playbackActiveRef.current = false;
    };
  }, [isPlaying, setCurrentTime, setIsPlaying]);

  const togglePlay = () => {
    if (tracks.every((t) => t.clips.length === 0)) return;
    setIsPlaying(!isPlaying);
  };

  const skipBack = () => {
    setIsPlaying(false);
    setCurrentTime(Math.max(0, currentTime - 5));
  };

  const skipForward = () => {
    setIsPlaying(false);
    setCurrentTime(Math.min(duration, currentTime + 5));
  };

  const goToStart = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const goToEnd = () => {
    setIsPlaying(false);
    setCurrentTime(duration);
  };

  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    const wrapper = containerRef.current?.parentElement;
    if (!wrapper) return;

    if (!document.fullscreenElement) {
      wrapper.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const aspectRatio = project.width / project.height;

  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const padW = 32;
      const padH = 32;
      const cw = rect.width - padW;
      const ch = rect.height - padH;
      let w = cw;
      let h = w / aspectRatio;
      if (h > ch) {
        h = ch;
        w = h * aspectRatio;
      }
      setPreviewSize({ width: Math.max(0, w), height: Math.max(0, h) });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspectRatio]);

  return (
    <div className="flex-1 flex flex-col bg-editor-bg min-h-0">
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-hidden"
      >
        <div
          ref={previewRef}
          className="relative bg-black rounded-lg shadow-2xl overflow-hidden"
          style={{
            width: previewSize.width,
            height: previewSize.height,
          }}
        >
          <video
            ref={outgoingVideoRef}
            className="absolute inset-0 w-full h-full object-contain"
            style={activeTransition ? transitionStyles.outgoing : { display: 'none' }}
            playsInline
            muted
          />
          {activeMedia?.type === 'image' ? (
            <img
              src={activeMedia.blobUrl}
              className="w-full h-full object-contain"
              style={activeTransition ? transitionStyles.incoming : {}}
              alt=""
            />
          ) : (
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              style={activeTransition ? transitionStyles.incoming : {}}
              playsInline
              muted={false}
            />
          )}

          {activeTransition && transitionStyles.overlay && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: transitionStyles.overlay.background,
                opacity: transitionStyles.overlay.opacity,
                mixBlendMode: transitionStyles.overlay.mixBlendMode as React.CSSProperties['mixBlendMode'],
              }}
            />
          )}

          {activeOverlayClips.map((clip) => {
            const overlayMedia = clip.mediaId ? mediaFiles.find((m) => m.id === clip.mediaId) : undefined;
            if (!overlayMedia) return null;
            return (
              <OverlayClipOverlay
                key={clip.id}
                clip={clip}
                media={overlayMedia}
                currentTime={currentTime}
                isPlaying={isPlaying}
                isSelected={clip.id === selectedClipId}
                previewRef={previewRef}
              />
            );
          })}

          {activeTextClips.map((clip) => (
            <TextClipOverlay
              key={clip.id}
              clip={clip}
              currentTime={currentTime}
              projectFps={project.fps}
              projectWidth={project.width}
              projectHeight={project.height}
              isSelected={clip.id === selectedClipId}
              previewRef={previewRef}
            />
          ))}

          <AudioTrackPlayer
            tracks={tracks}
            mediaFiles={mediaFiles}
            currentTime={currentTime}
            isPlaying={isPlaying}
          />

          {!activeMedia && activeTextClips.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-editor-surface/80 flex items-center justify-center mx-auto mb-3">
                  <Play className="w-7 h-7 text-editor-text-dim ml-0.5" />
                </div>
                <p className="text-sm text-editor-text-dim">
                  Import media and add it to the timeline
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="h-14 bg-editor-surface border-t border-editor-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={goToStart} className="btn-icon">
            <ChevronFirst className="w-4 h-4" />
          </button>
          <button onClick={skipBack} className="btn-icon">
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-editor-text flex items-center justify-center hover:bg-white transition-colors mx-1"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 text-editor-bg" />
            ) : (
              <Play className="w-4 h-4 text-editor-bg ml-0.5" />
            )}
          </button>
          <button onClick={skipForward} className="btn-icon">
            <SkipForward className="w-4 h-4" />
          </button>
          <button onClick={goToEnd} className="btn-icon">
            <ChevronLast className="w-4 h-4" />
          </button>
        </div>

        <div className="font-mono text-xs text-editor-text-muted tracking-wider">
          <span className="text-editor-text">{formatTime(currentTime)}</span>
          <span className="mx-1.5">/</span>
          <span>{formatTime(duration)}</span>
        </div>

        <button onClick={toggleFullscreen} className="btn-icon" title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function findActiveVideoClip(tracks: ReturnType<typeof useTimelineStore.getState>['tracks'], time: number) {
  for (const track of tracks) {
    if (track.type !== 'video') continue;
    for (const clip of track.clips) {
      if (time >= clip.startTime && time < clip.startTime + clip.duration) {
        return clip;
      }
    }
  }
  return undefined;
}

function findActiveTextClips(tracks: ReturnType<typeof useTimelineStore.getState>['tracks'], time: number) {
  const results: ReturnType<typeof useTimelineStore.getState>['tracks'][0]['clips'] = [];
  for (const track of tracks) {
    if (track.type !== 'text' || track.isMuted) continue;
    for (const clip of track.clips) {
      if (time >= clip.startTime && time < clip.startTime + clip.duration) {
        results.push(clip);
      }
    }
  }
  return results;
}

function findActiveOverlayClips(tracks: ReturnType<typeof useTimelineStore.getState>['tracks'], time: number) {
  const results: ReturnType<typeof useTimelineStore.getState>['tracks'][0]['clips'] = [];
  for (const track of tracks) {
    if (track.type !== 'overlay' || track.isMuted) continue;
    for (const clip of track.clips) {
      if (time >= clip.startTime && time < clip.startTime + clip.duration) {
        results.push(clip);
      }
    }
  }
  return results;
}

function TextClipOverlay({
  clip,
  currentTime,
  projectFps,
  projectWidth,
  projectHeight,
  isSelected,
  previewRef,
}: {
  clip: TimelineClip;
  currentTime: number;
  projectFps: number;
  projectWidth: number;
  projectHeight: number;
  isSelected: boolean;
  previewRef: React.RefObject<HTMLDivElement>;
}) {
  const playerRef = useRef<PlayerRef>(null);
  const { updateClip, selectClip } = useTimelineStore();

  const animation = (clip.properties.textAnimation as TextAnimation) ?? 'fadeIn';
  const animDuration = clip.properties.animationDuration ?? 0.5;
  const x = clip.properties.x ?? 50;
  const y = clip.properties.y ?? 50;
  const textScale = clip.properties.scale ?? 1;
  const textRotation = clip.properties.rotation ?? 0;

  const fps = projectFps;
  const durationInFrames = Math.max(Math.round(clip.duration * fps), 2);
  const localTime = currentTime - clip.startTime;
  const localFrame = Math.max(0, Math.min(Math.round(localTime * fps), durationInFrames - 1));

  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startMouseX: 0, startMouseY: 0, startX: 0, startY: 0 });

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    selectClip(clip.id);
    setDragging(true);
    dragRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: x,
      startY: y,
    };
  }, [x, y, clip.id, selectClip]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const rect = previewRef.current?.getBoundingClientRect();
      if (!rect) return;

      const dx = ((e.clientX - dragRef.current.startMouseX) / rect.width) * 100;
      const dy = ((e.clientY - dragRef.current.startMouseY) / rect.height) * 100;

      const newX = dragRef.current.startX + dx;
      const newY = dragRef.current.startY + dy;

      updateClip(clip.id, {
        properties: { ...clip.properties, x: newX, y: newY },
      });
    };

    const onUp = () => setDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, clip.id, clip.properties, previewRef, updateClip]);

  const handleScaleStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + rect.width * (x / 100);
    const centerY = rect.top + rect.height * (y / 100);
    const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    const startScale = textScale;
    const onMove = (me: MouseEvent) => {
      const dist = Math.hypot(me.clientX - centerX, me.clientY - centerY);
      const newScale = Math.max(0.1, Math.min(10, startScale * (dist / startDist)));
      const props = useTimelineStore.getState().getClipById(clip.id)?.properties ?? {};
      updateClip(clip.id, { properties: { ...props, scale: newScale } });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [x, y, textScale, clip.id, previewRef, updateClip]);

  const handleRotateStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + rect.width * (x / 100);
    const centerY = rect.top + rect.height * (y / 100);
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    const startRotation = textRotation;
    const onMove = (me: MouseEvent) => {
      const angle = Math.atan2(me.clientY - centerY, me.clientX - centerX) * (180 / Math.PI);
      const props = useTimelineStore.getState().getClipById(clip.id)?.properties ?? {};
      updateClip(clip.id, { properties: { ...props, rotation: startRotation + (angle - startAngle) } });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [x, y, textRotation, clip.id, previewRef, updateClip]);

  const fontSize = clip.properties.fontSize ?? 48;
  const fontFamily = clip.properties.fontFamily ?? "'Inter', sans-serif";
  const text = clip.properties.text || 'Text';

  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setPreviewScale(rect.width / projectWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewRef, projectWidth]);

  const scaledFontSize = fontSize * previewScale * textScale;
  const maxTextWidth = previewScale * projectWidth * 0.85 * textScale;

  const emoji = clip.properties.emoji;
  const wordTimings = clip.properties.wordTimings;
  const hlColor = clip.properties.highlightColor;

  const inputProps = useMemo(
    () => ({
      text,
      fontSize,
      fontColor: clip.properties.fontColor ?? '#ffffff',
      fontFamily,
      textAlign: (clip.properties.textAlign ?? 'center') as 'left' | 'center' | 'right',
      animation,
      animationDuration: animDuration,
      x,
      y,
      scale: textScale,
      rotation: textRotation,
      emoji,
      wordTimings,
      highlightColor: hlColor,
    }),
    [text, fontSize, clip.properties.fontColor, fontFamily, clip.properties.textAlign, animation, animDuration, x, y, textScale, textRotation, emoji, wordTimings, hlColor]
  );

  useEffect(() => {
    playerRef.current?.seekTo(localFrame);
  }, [localFrame]);

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 pointer-events-none">
        <Player
          ref={playerRef}
          component={AnimatedText}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          fps={fps}
          compositionWidth={projectWidth}
          compositionHeight={projectHeight}
          autoPlay={false}
          controls={false}
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {isSelected && (
        <div
          className="absolute z-10"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            transform: `translate(-50%, -50%) rotate(${textRotation}deg)`,
          }}
        >
          <div
            style={{
              padding: '8px 16px',
              fontSize: scaledFontSize,
              fontFamily,
              lineHeight: 1.2,
              whiteSpace: 'pre-wrap',
              visibility: 'hidden',
              maxWidth: maxTextWidth,
              wordBreak: 'break-word',
            }}
          >
            {text}
          </div>
          <div className="absolute inset-0 cursor-move" onMouseDown={handleDragStart} />
          <div className="absolute inset-0 border border-white/80 pointer-events-none" />
          <div
            className="absolute -top-[5px] -left-[5px] w-[10px] h-[10px] bg-white rounded-full shadow-md cursor-nwse-resize z-10"
            onMouseDown={handleScaleStart}
          />
          <div
            className="absolute -top-[5px] -right-[5px] w-[10px] h-[10px] bg-white rounded-full shadow-md cursor-nesw-resize z-10"
            onMouseDown={handleScaleStart}
          />
          <div
            className="absolute -bottom-[5px] -left-[5px] w-[10px] h-[10px] bg-white rounded-full shadow-md cursor-nesw-resize z-10"
            onMouseDown={handleScaleStart}
          />
          <div
            className="absolute -bottom-[5px] -right-[5px] w-[10px] h-[10px] bg-white rounded-full shadow-md cursor-nwse-resize z-10"
            onMouseDown={handleScaleStart}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center z-10"
            style={{ top: 'calc(100% + 4px)' }}
          >
            <div className="w-px h-3 bg-white/50" />
            <div
              className="w-5 h-5 rounded-full bg-white/80 flex items-center justify-center shadow-md cursor-grab active:cursor-grabbing"
              onMouseDown={handleRotateStart}
            >
              <RotateCcw className="w-2.5 h-2.5 text-gray-700" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverlayClipOverlay({
  clip,
  media,
  currentTime,
  isPlaying,
  isSelected,
  previewRef,
}: {
  clip: TimelineClip;
  media: MediaFile;
  currentTime: number;
  isPlaying: boolean;
  isSelected: boolean;
  previewRef: React.RefObject<HTMLDivElement>;
}) {
  const { updateClip, selectClip } = useTimelineStore();

  const x = clip.properties.x ?? 50;
  const y = clip.properties.y ?? 50;
  const baseScale = clip.properties.scale ?? 1;
  const overlayRotation = clip.properties.rotation ?? 0;
  const baseOpacity = clip.properties.opacity ?? 1;

  const localTime = currentTime - clip.startTime;
  const clipDuration = clip.duration;
  const clipProgress = clipDuration > 0 ? Math.max(0, Math.min(1, localTime / clipDuration)) : 0;

  const anim = clip.properties.overlayAnimation ?? 'none';
  const overlayScale = anim === 'zoomIn' ? baseScale * (1 + clipProgress * 0.15) : baseScale;

  const fadeIn = clip.properties.fadeInDuration ?? 0;
  const fadeOut = clip.properties.fadeOutDuration ?? 0;
  let opacity = baseOpacity;
  if (fadeIn > 0 && localTime < fadeIn) {
    opacity *= Math.max(0, localTime / fadeIn);
  }
  if (fadeOut > 0 && localTime > clipDuration - fadeOut) {
    opacity *= Math.max(0, (clipDuration - localTime) / fadeOut);
  }

  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startMouseX: 0, startMouseY: 0, startX: 0, startY: 0 });

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    selectClip(clip.id);
    setDragging(true);
    dragRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: x,
      startY: y,
    };
  }, [x, y, clip.id, selectClip]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const rect = previewRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = ((e.clientX - dragRef.current.startMouseX) / rect.width) * 100;
      const dy = ((e.clientY - dragRef.current.startMouseY) / rect.height) * 100;
      updateClip(clip.id, {
        properties: { ...clip.properties, x: dragRef.current.startX + dx, y: dragRef.current.startY + dy },
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, clip.id, clip.properties, previewRef, updateClip]);

  const handleScaleStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + rect.width * (x / 100);
    const centerY = rect.top + rect.height * (y / 100);
    const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    const startScale = overlayScale;
    const onMove = (me: MouseEvent) => {
      const dist = Math.hypot(me.clientX - centerX, me.clientY - centerY);
      const newScale = Math.max(0.1, Math.min(10, startScale * (dist / startDist)));
      const props = useTimelineStore.getState().getClipById(clip.id)?.properties ?? {};
      updateClip(clip.id, { properties: { ...props, scale: newScale } });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [x, y, overlayScale, clip.id, previewRef, updateClip]);

  const handleRotateStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + rect.width * (x / 100);
    const centerY = rect.top + rect.height * (y / 100);
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    const startRotation = overlayRotation;
    const onMove = (me: MouseEvent) => {
      const angle = Math.atan2(me.clientY - centerY, me.clientX - centerX) * (180 / Math.PI);
      const props = useTimelineStore.getState().getClipById(clip.id)?.properties ?? {};
      updateClip(clip.id, { properties: { ...props, rotation: startRotation + (angle - startAngle) } });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [x, y, overlayRotation, clip.id, previewRef, updateClip]);

  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const mw = media.width || rect.width;
      const mh = media.height || rect.height;
      const fitScale = Math.min(rect.width / mw, rect.height / mh);
      setBoxSize({ width: mw * fitScale, height: mh * fitScale });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewRef, media.width, media.height]);

  return (
    <div className="absolute inset-0">
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          width: '100%',
          height: '100%',
          transform: `translate(-50%, -50%) rotate(${overlayRotation}deg) scale(${overlayScale})`,
          opacity,
        }}
      >
        {media.type === 'image' ? (
          <img src={media.blobUrl} className="w-full h-full object-contain" alt="" />
        ) : (
          <OverlayVideo clip={clip} media={media} currentTime={currentTime} isPlaying={isPlaying} />
        )}
      </div>

      <div
        className="absolute z-10"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          width: boxSize.width * overlayScale,
          height: boxSize.height * overlayScale,
          transform: `translate(-50%, -50%) rotate(${overlayRotation}deg)`,
        }}
      >
        <div
          className={`absolute inset-0 ${isSelected ? 'cursor-move' : 'cursor-pointer'}`}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (isSelected) {
              handleDragStart(e);
            } else {
              selectClip(clip.id);
            }
          }}
        />
        {isSelected && (
          <>
            <div className="absolute inset-0 border border-sky-400/80 pointer-events-none" />
            <div
              className="absolute -top-[5px] -left-[5px] w-[10px] h-[10px] bg-white rounded-full shadow-md cursor-nwse-resize z-10"
              onMouseDown={handleScaleStart}
            />
            <div
              className="absolute -top-[5px] -right-[5px] w-[10px] h-[10px] bg-white rounded-full shadow-md cursor-nesw-resize z-10"
              onMouseDown={handleScaleStart}
            />
            <div
              className="absolute -bottom-[5px] -left-[5px] w-[10px] h-[10px] bg-white rounded-full shadow-md cursor-nesw-resize z-10"
              onMouseDown={handleScaleStart}
            />
            <div
              className="absolute -bottom-[5px] -right-[5px] w-[10px] h-[10px] bg-white rounded-full shadow-md cursor-nwse-resize z-10"
              onMouseDown={handleScaleStart}
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center z-10"
              style={{ top: 'calc(100% + 4px)' }}
            >
              <div className="w-px h-3 bg-sky-400/50" />
              <div
                className="w-5 h-5 rounded-full bg-white/80 flex items-center justify-center shadow-md cursor-grab active:cursor-grabbing"
                onMouseDown={handleRotateStart}
              >
                <RotateCcw className="w-2.5 h-2.5 text-gray-700" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OverlayVideo({
  clip,
  media,
  currentTime,
  isPlaying,
}: {
  clip: TimelineClip;
  media: MediaFile;
  currentTime: number;
  isPlaying: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    if (video.src !== media.blobUrl) {
      video.src = media.blobUrl;
      video.load();
    }

    const localTime = currentTime - clip.startTime + clip.trimStart;
    if (Math.abs(video.currentTime - localTime) > 0.1) {
      video.currentTime = localTime;
    }
  }, [currentTime, clip.startTime, clip.trimStart, media.blobUrl]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (isPlaying && video.paused) video.play().catch(() => {});
    else if (!isPlaying && !video.paused) video.pause();
  }, [isPlaying]);

  return (
    <video
      ref={ref}
      className="w-full h-full object-contain"
      playsInline
      muted
    />
  );
}

function AudioTrackPlayer({
  tracks,
  mediaFiles,
  currentTime,
  isPlaying,
}: {
  tracks: ReturnType<typeof useTimelineStore.getState>['tracks'];
  mediaFiles: MediaFile[];
  currentTime: number;
  isPlaying: boolean;
}) {
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const activeClipIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const activeClips: { clip: typeof tracks[0]['clips'][0]; media: MediaFile }[] = [];
    for (const track of tracks) {
      if (track.type !== 'audio' || track.isMuted) continue;
      for (const clip of track.clips) {
        if (currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration) {
          const media = clip.mediaId ? mediaFiles.find((m) => m.id === clip.mediaId) : undefined;
          if (media) activeClips.push({ clip, media });
        }
      }
    }

    const currentIds = new Set(activeClips.map((ac) => ac.clip.id));

    for (const [id, audio] of audioRefs.current.entries()) {
      if (!currentIds.has(id)) {
        audio.pause();
        audioRefs.current.delete(id);
      }
    }

    for (const { clip, media } of activeClips) {
      let audio = audioRefs.current.get(clip.id);
      if (!audio) {
        audio = new Audio(media.blobUrl);
        audio.crossOrigin = 'anonymous';
        audioRefs.current.set(clip.id, audio);
      } else if (audio.src !== media.blobUrl) {
        audio.src = media.blobUrl;
      }

      const vol = clip.properties.volume ?? 1;
      audio.volume = Math.max(0, Math.min(1, vol));

      const localTime = currentTime - clip.startTime + clip.trimStart;
      if (Math.abs(audio.currentTime - localTime) > 0.3) {
        audio.currentTime = localTime;
      }

      if (isPlaying && audio.paused) {
        audio.play().catch(() => {});
      } else if (!isPlaying && !audio.paused) {
        audio.pause();
      }
    }

    activeClipIdsRef.current = currentIds;
  }, [tracks, mediaFiles, currentTime, isPlaying]);

  useEffect(() => {
    return () => {
      for (const audio of audioRefs.current.values()) {
        audio.pause();
        audio.src = '';
      }
      audioRefs.current.clear();
    };
  }, []);

  return null;
}
