import { useCurrentFrame, useVideoConfig } from '../lib/animation-player';
import {
  computeAnimationStyle,
  computeTypewriterChars,
  computeWordByWordState,
  computeKaraokeState,
} from './animation-styles';
import type { TextAnimation } from '../types/editor';

export interface AnimatedTextProps {
  text: string;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  textAlign: 'left' | 'center' | 'right';
  animation: TextAnimation;
  animationDuration: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  emoji?: string;
  wordTimings?: Array<{ word: string; start: number; end: number }>;
  highlightColor?: string;
  [key: string]: unknown;
}

const positionWrapper = (x: number, y: number, scale: number, rotation: number): React.CSSProperties => ({
  position: 'absolute',
  left: `${x}%`,
  top: `${y}%`,
  transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
  transformOrigin: 'center center',
  maxWidth: '90%',
});

const textBase = (
  fontSize: number,
  fontColor: string,
  fontFamily: string,
  textAlign: string
): React.CSSProperties => ({
  fontSize,
  color: fontColor,
  fontFamily,
  textAlign: textAlign as React.CSSProperties['textAlign'],
  textShadow: '0 2px 8px rgba(0,0,0,0.7), 0 0 2px rgba(0,0,0,0.5)',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.2,
  wordBreak: 'break-word',
});

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  fontSize,
  fontColor,
  fontFamily,
  textAlign,
  animation,
  animationDuration,
  x = 50,
  y = 50,
  scale = 1,
  rotation = 0,
  emoji,
  wordTimings,
  highlightColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enterFrames = Math.round(animationDuration * fps);

  if (animation === 'typewriter') {
    const timingsForTypewriter = wordTimings?.map((wt) => ({ start: wt.start, end: wt.end, word: wt.word }));
    const { chars, showCursor } = computeTypewriterChars(
      frame, text.length, enterFrames, durationInFrames,
      fps, text, timingsForTypewriter
    );
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div style={positionWrapper(x, y, scale, rotation)}>
          <div style={textBase(fontSize, fontColor, fontFamily, textAlign)}>
            {text.slice(0, chars)}
            {showCursor && (
              <span style={{ opacity: Math.round(frame / (fps / 4)) % 2 === 0 ? 1 : 0 }}>|</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (animation === 'karaoke') {
    const words = text.split(/\s+/).filter(Boolean);
    const timings = wordTimings?.map((wt) => ({ start: wt.start, end: wt.end }));
    const state = computeKaraokeState(frame, fps, words, durationInFrames, timings);
    const hlColor = highlightColor || '#d78241';

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div style={positionWrapper(x, y, scale, rotation)}>
          {emoji && (
            <div style={{
              textAlign: 'center',
              fontSize: fontSize * 1.1,
              lineHeight: 1,
              marginBottom: fontSize * 0.25,
              transform: `scale(${state.emojiScale})`,
              transformOrigin: 'center bottom',
              opacity: state.emojiScale,
            }}>
              {emoji}
            </div>
          )}
          <div style={{
            ...textBase(fontSize, fontColor, fontFamily, 'center'),
            fontWeight: 800,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.02em',
            opacity: state.containerOpacity,
            display: 'flex',
            flexWrap: 'wrap' as const,
            justifyContent: 'center',
            gap: '0.05em',
          }}>
            {words.map((word, i) => {
              const isActive = i === state.activeWordIndex;
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    position: 'relative',
                    padding: '0.04em 0.1em',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '0.18em',
                      backgroundColor: isActive ? hlColor : 'transparent',
                      opacity: isActive ? 0.92 : 0,
                      transition: 'opacity 0.08s ease-out, background-color 0.08s ease-out',
                    }}
                  />
                  <span style={{ position: 'relative' }}>{word}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (animation === 'wordByWord') {
    const words = text.split(/\s+/).filter(Boolean);
    const timingsForWbW = wordTimings?.map((wt) => ({ start: wt.start, end: wt.end }));
    const state = computeWordByWordState(frame, fps, words, enterFrames, durationInFrames, timingsForWbW);
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div style={positionWrapper(x, y, scale, rotation)}>
          <div style={{ ...textBase(fontSize, fontColor, fontFamily, textAlign), opacity: state.containerOpacity }}>
            {words.map((word, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  opacity: state.wordOpacities[i],
                  transform: state.wordTransforms[i],
                  marginRight: i < words.length - 1 ? '0.25em' : 0,
                }}
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const anim = computeAnimationStyle(animation, { frame, fps, durationInFrames, animationDuration });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={positionWrapper(x, y, scale, rotation)}>
        <div
          style={{
            ...textBase(fontSize, fontColor, fontFamily, textAlign),
            opacity: anim.opacity,
            transform: anim.transform,
            filter: anim.filter,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};
