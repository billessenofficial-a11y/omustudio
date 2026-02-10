import { interpolate, spring, Easing } from '../lib/animation-engine';
import type { TextAnimation } from '../types/editor';

export interface AnimationParams {
  frame: number;
  fps: number;
  durationInFrames: number;
  animationDuration: number;
}

export interface TextStyleResult {
  opacity: number;
  transform: string;
  filter?: string;
}

export function computeAnimationStyle(
  animation: TextAnimation,
  params: AnimationParams
): TextStyleResult {
  const { frame, fps, durationInFrames, animationDuration } = params;
  const enterFrames = Math.round(animationDuration * fps);
  const exitStart = durationInFrames - enterFrames;

  const enterProgress = interpolate(frame, [0, enterFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const exitProgress = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });

  const progress = Math.min(enterProgress, exitProgress);

  switch (animation) {
    case 'none':
      return { opacity: 1, transform: 'none' };

    case 'fadeIn':
      return { opacity: progress, transform: 'none' };

    case 'slideUp': {
      const y = interpolate(progress, [0, 1], [40, 0]);
      return { opacity: progress, transform: `translateY(${y}px)` };
    }

    case 'slideDown': {
      const y = interpolate(progress, [0, 1], [-40, 0]);
      return { opacity: progress, transform: `translateY(${y}px)` };
    }

    case 'slideLeft': {
      const x = interpolate(progress, [0, 1], [60, 0]);
      return { opacity: progress, transform: `translateX(${x}px)` };
    }

    case 'slideRight': {
      const x = interpolate(progress, [0, 1], [-60, 0]);
      return { opacity: progress, transform: `translateX(${x}px)` };
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
      return { opacity, transform: `scale(${scale})` };
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
      return { opacity, transform: `scale(${scale})` };
    }

    case 'blurReveal': {
      const blur = interpolate(progress, [0, 1], [16, 0]);
      return { opacity: progress, transform: 'none', filter: `blur(${blur}px)` };
    }

    default:
      return { opacity: 1, transform: 'none' };
  }
}

export function computeTypewriterChars(
  frame: number,
  textLength: number,
  enterFrames: number,
  durationInFrames: number,
  fps?: number,
  text?: string,
  wordTimings?: Array<{ start: number; end: number; word: string }>,
): { chars: number; showCursor: boolean } {
  const exitStart = durationInFrames - enterFrames;

  if (fps && text && wordTimings && wordTimings.length > 0) {
    const currentTime = frame / fps;
    const words = text.split(/\s+/).filter(Boolean);
    let visibleChars = 0;
    let charIdx = 0;

    for (let i = 0; i < words.length; i++) {
      const timing = wordTimings[i];
      if (!timing) break;

      const wordLen = words[i].length;
      if (currentTime >= timing.end) {
        charIdx += wordLen + (i < words.length - 1 ? 1 : 0);
        visibleChars = charIdx;
      } else if (currentTime >= timing.start) {
        const wordProgress = (currentTime - timing.start) / Math.max(timing.end - timing.start, 0.01);
        visibleChars = charIdx + Math.floor(wordProgress * wordLen);
        break;
      } else {
        break;
      }
    }

    const exitChars = frame > exitStart
      ? Math.max(0, Math.floor(textLength * (1 - (frame - exitStart) / enterFrames)))
      : textLength;

    return {
      chars: Math.min(visibleChars, exitChars),
      showCursor: frame < exitStart && visibleChars < textLength,
    };
  }

  const charsPerFrame = textLength / Math.max(enterFrames, 1);
  const visibleChars = Math.min(textLength, Math.floor(frame * charsPerFrame));
  const exitChars = frame > exitStart
    ? Math.max(0, textLength - Math.floor((frame - exitStart) * charsPerFrame))
    : textLength;
  return {
    chars: Math.min(visibleChars, exitChars),
    showCursor: frame < exitStart && visibleChars < textLength,
  };
}

export function computeKaraokeState(
  frame: number,
  fps: number,
  words: string[],
  durationInFrames: number,
  wordTimings?: Array<{ start: number; end: number }>,
): { activeWordIndex: number; containerOpacity: number; emojiScale: number } {
  if (words.length === 0) return { activeWordIndex: -1, containerOpacity: 1, emojiScale: 0 };

  const enterFrames = Math.min(Math.round(fps * 0.12), Math.floor(durationInFrames / 4));
  const exitFrames = enterFrames;
  const exitStart = durationInFrames - exitFrames;

  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 180, mass: 0.7 },
  });

  const exitProgress = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });

  const containerOpacity = frame >= exitStart ? exitProgress : Math.min(enterSpring * 2, 1);

  let activeWordIndex: number;
  if (wordTimings && wordTimings.length === words.length) {
    const currentTime = frame / fps;
    activeWordIndex = 0;
    for (let i = 0; i < wordTimings.length; i++) {
      if (currentTime >= wordTimings[i].start) {
        activeWordIndex = i;
      }
    }
  } else {
    const framesPerWord = durationInFrames / words.length;
    activeWordIndex = Math.min(Math.floor(frame / framesPerWord), words.length - 1);
  }

  const emojiSpring = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 200, mass: 0.8 },
  });
  const emojiScale = frame >= exitStart
    ? exitProgress
    : interpolate(emojiSpring, [0, 1], [0, 1]);

  return { activeWordIndex, containerOpacity, emojiScale };
}

export function computeWordByWordState(
  frame: number,
  fps: number,
  words: string[],
  enterFrames: number,
  durationInFrames: number,
  wordTimings?: Array<{ start: number; end: number }>,
): { wordOpacities: number[]; wordTransforms: string[]; containerOpacity: number } {
  const exitStart = durationInFrames - enterFrames;
  const exitProgress = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });

  const wordOpacities: number[] = [];
  const wordTransforms: string[] = [];

  if (wordTimings && wordTimings.length === words.length) {
    const currentTime = frame / fps;

    for (let i = 0; i < words.length; i++) {
      const timing = wordTimings[i];
      const wordStartFrame = Math.round(timing.start * fps);
      const elapsed = Math.max(0, frame - wordStartFrame);

      const wordSpring = currentTime >= timing.start
        ? spring({ frame: elapsed, fps, config: { damping: 12, stiffness: 150 } })
        : 0;

      const y = interpolate(wordSpring, [0, 1], [20, 0]);
      wordOpacities.push(wordSpring);
      wordTransforms.push(`translateY(${y}px)`);
    }
  } else {
    const framesPerWord = Math.max(enterFrames / Math.max(words.length, 1), 2);

    for (let i = 0; i < words.length; i++) {
      const wordStart = i * framesPerWord;
      const wordSpring = spring({
        frame: Math.max(0, frame - wordStart),
        fps,
        config: { damping: 12, stiffness: 150 },
      });
      const y = interpolate(wordSpring, [0, 1], [20, 0]);
      wordOpacities.push(wordSpring);
      wordTransforms.push(`translateY(${y}px)`);
    }
  }

  return {
    wordOpacities,
    wordTransforms,
    containerOpacity: frame > exitStart ? exitProgress : 1,
  };
}
