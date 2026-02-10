import { interpolate, spring, Easing } from '../lib/animation-engine';
import type { TextAnimation } from '../types/editor';

interface AnimationParams {
  frame: number;
  fps: number;
  durationInFrames: number;
  enterFrames: number;
}

interface AnimationResult {
  opacity: number;
  transform: string;
  filter: string;
  clipText?: boolean;
  visibleChars?: number;
  totalChars?: number;
}

export function computeAnimation(
  animation: TextAnimation,
  params: AnimationParams
): AnimationResult {
  const { frame, fps, durationInFrames, enterFrames } = params;
  const exitStart = durationInFrames - enterFrames;

  const enterProgress = interpolate(frame, [0, enterFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const exitProgress = interpolate(
    frame,
    [exitStart, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) }
  );

  const progress = Math.min(enterProgress, exitProgress);

  switch (animation) {
    case 'none':
      return { opacity: 1, transform: '', filter: '' };

    case 'fadeIn':
      return { opacity: progress, transform: '', filter: '' };

    case 'slideUp': {
      const y = interpolate(progress, [0, 1], [40, 0]);
      return { opacity: progress, transform: `translateY(${y}px)`, filter: '' };
    }

    case 'slideDown': {
      const y = interpolate(progress, [0, 1], [-40, 0]);
      return { opacity: progress, transform: `translateY(${y}px)`, filter: '' };
    }

    case 'slideLeft': {
      const x = interpolate(progress, [0, 1], [60, 0]);
      return { opacity: progress, transform: `translateX(${x}px)`, filter: '' };
    }

    case 'slideRight': {
      const x = interpolate(progress, [0, 1], [-60, 0]);
      return { opacity: progress, transform: `translateX(${x}px)`, filter: '' };
    }

    case 'scaleUp': {
      const enterSpring = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
      const exitScale = interpolate(frame, [exitStart, durationInFrames], [1, 0.3], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const scale = frame < exitStart
        ? interpolate(enterSpring, [0, 1], [0.3, 1])
        : exitScale;
      const opacity = frame < exitStart ? enterSpring : exitProgress;
      return { opacity, transform: `scale(${scale})`, filter: '' };
    }

    case 'pop': {
      const enterSpring = spring({ frame, fps, config: { damping: 8, stiffness: 200, mass: 0.8 } });
      const exitScale = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const scale = frame < exitStart
        ? interpolate(enterSpring, [0, 1], [0, 1])
        : exitScale;
      const opacity = frame < exitStart ? Math.min(enterSpring * 2, 1) : exitProgress;
      return { opacity, transform: `scale(${scale})`, filter: '' };
    }

    case 'blurReveal': {
      const blur = interpolate(progress, [0, 1], [16, 0]);
      return { opacity: progress, transform: '', filter: `blur(${blur}px)` };
    }

    case 'typewriter':
      return {
        opacity: 1,
        transform: '',
        filter: '',
        clipText: true,
        visibleChars: 0,
        totalChars: 0,
      };

    case 'wordByWord':
      return {
        opacity: 1,
        transform: '',
        filter: '',
        clipText: true,
        visibleChars: 0,
        totalChars: 0,
      };

    case 'karaoke':
      return {
        opacity: 1,
        transform: '',
        filter: '',
        clipText: true,
        visibleChars: 0,
        totalChars: 0,
      };

    default:
      return { opacity: 1, transform: '', filter: '' };
  }
}
