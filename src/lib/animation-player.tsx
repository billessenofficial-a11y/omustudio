import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';

interface FrameContext {
  frame: number;
  fps: number;
  durationInFrames: number;
  width: number;
  height: number;
}

const AnimationFrameContext = createContext<FrameContext>({
  frame: 0,
  fps: 30,
  durationInFrames: 1,
  width: 1920,
  height: 1080,
});

export function useCurrentFrame(): number {
  return useContext(AnimationFrameContext).frame;
}

export function useVideoConfig() {
  const ctx = useContext(AnimationFrameContext);
  return {
    fps: ctx.fps,
    durationInFrames: ctx.durationInFrames,
    width: ctx.width,
    height: ctx.height,
  };
}

export interface PlayerRef {
  seekTo: (frame: number) => void;
  play: () => void;
  pause: () => void;
}

interface PlayerProps {
  component: React.ComponentType<Record<string, unknown>>;
  inputProps: Record<string, unknown>;
  durationInFrames: number;
  fps: number;
  compositionWidth: number;
  compositionHeight: number;
  loop?: boolean;
  autoPlay?: boolean;
  controls?: boolean;
  style?: React.CSSProperties;
}

export const Player = forwardRef<PlayerRef, PlayerProps>(function Player(
  {
    component: Component,
    inputProps,
    durationInFrames,
    fps,
    compositionWidth,
    compositionHeight,
    loop = false,
    autoPlay = false,
    style,
  },
  ref
) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const frameRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const seekTo = useCallback((f: number) => {
    const clamped = Math.max(0, Math.min(f, durationInFrames - 1));
    frameRef.current = clamped;
    setFrame(clamped);
  }, [durationInFrames]);

  useImperativeHandle(ref, () => ({
    seekTo,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
  }), [seekTo]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      frameRef.current += delta * fps;

      if (frameRef.current >= durationInFrames) {
        if (loop) {
          frameRef.current = frameRef.current % durationInFrames;
        } else {
          frameRef.current = durationInFrames - 1;
          setPlaying(false);
          setFrame(durationInFrames - 1);
          return;
        }
      }

      setFrame(Math.floor(frameRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, fps, durationInFrames, loop]);

  useEffect(() => {
    if (autoPlay) setPlaying(true);
  }, [autoPlay]);

  const scale = containerSize
    ? Math.min(containerSize.w / compositionWidth, containerSize.h / compositionHeight)
    : 0;

  const ctx: FrameContext = {
    frame,
    fps,
    durationInFrames,
    width: compositionWidth,
    height: compositionHeight,
  };

  return (
    <div
      ref={containerRef}
      style={{
        ...style,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {scale > 0 && (
        <div
          style={{
            width: compositionWidth,
            height: compositionHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <AnimationFrameContext.Provider value={ctx}>
            <Component {...inputProps} />
          </AnimationFrameContext.Provider>
        </div>
      )}
    </div>
  );
});
