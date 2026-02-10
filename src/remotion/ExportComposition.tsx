import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Img,
} from 'remotion';
import { Video, Audio } from '@remotion/media';
import {
  computeAnimationStyle,
  computeTypewriterChars,
  computeWordByWordState,
  computeKaraokeState,
} from './animation-styles';
import { computeTransitionPair } from '../lib/transition-effects';
import { interpolate } from '../lib/animation-engine';
import type { TextAnimation, TransitionType } from '../types/editor';

export interface VideoClipInput {
  mediaUrl: string;
  mediaType?: 'video' | 'image';
  outputStartFrame: number;
  durationInFrames: number;
  trimStartFrame: number;
  transitionIn?: TransitionType;
  transitionInFrames?: number;
}

export interface TransitionOverlayInput {
  atFrame: number;
  durationInFrames: number;
  type: TransitionType;
  mediaUrl: string;
  mediaType?: 'video' | 'image';
  outgoingStartFrom: number;
}

export interface TextClipInput {
  id: string;
  startFrame: number;
  durationInFrames: number;
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
}

export interface OverlayClipInput {
  mediaUrl: string;
  mediaType: 'video' | 'image';
  startFrame: number;
  durationInFrames: number;
  trimStartFrame: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  overlayAnimation: 'none' | 'zoomIn';
}

export interface AudioClipInput {
  mediaUrl: string;
  startFrame: number;
  durationInFrames: number;
  trimStartFrame: number;
  volume: number;
}

export interface ExportCompositionProps {
  videoClips: VideoClipInput[];
  textClips: TextClipInput[];
  transitionOverlays: TransitionOverlayInput[];
  overlayClips: OverlayClipInput[];
  audioClips: AudioClipInput[];
}

export const ExportComposition: React.FC<ExportCompositionProps> = ({
  videoClips,
  textClips,
  transitionOverlays,
  overlayClips,
  audioClips,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {transitionOverlays.map((overlay, i) => (
        <Sequence
          key={`to-${i}`}
          from={overlay.atFrame}
          durationInFrames={overlay.durationInFrames}
        >
          <ExportTransitionOutgoing
            mediaUrl={overlay.mediaUrl}
            mediaType={overlay.mediaType}
            startFrom={overlay.outgoingStartFrom}
            type={overlay.type}
            transitionFrames={overlay.durationInFrames}
          />
        </Sequence>
      ))}

      {videoClips.map((clip, i) => (
        <Sequence
          key={`v-${i}`}
          from={clip.outputStartFrame}
          durationInFrames={clip.durationInFrames}
        >
          <ExportVideoClip
            mediaUrl={clip.mediaUrl}
            mediaType={clip.mediaType}
            trimStartFrame={clip.trimStartFrame}
            transitionIn={clip.transitionIn}
            transitionInFrames={clip.transitionInFrames}
          />
        </Sequence>
      ))}

      {overlayClips.map((clip, i) => (
        <Sequence
          key={`ol-${i}`}
          from={clip.startFrame}
          durationInFrames={clip.durationInFrames}
        >
          <ExportOverlayClip {...clip} />
        </Sequence>
      ))}

      {textClips.map((clip) => (
        <Sequence
          key={clip.id}
          from={clip.startFrame}
          durationInFrames={clip.durationInFrames}
        >
          <ExportAnimatedText
            text={clip.text}
            fontSize={clip.fontSize}
            fontColor={clip.fontColor}
            fontFamily={clip.fontFamily}
            textAlign={clip.textAlign}
            animation={clip.animation}
            animationDuration={clip.animationDuration}
            x={clip.x}
            y={clip.y}
            scale={clip.scale}
            rotation={clip.rotation}
            emoji={clip.emoji}
            wordTimings={clip.wordTimings}
            highlightColor={clip.highlightColor}
          />
        </Sequence>
      ))}

      {audioClips.map((clip, i) => (
        <Sequence
          key={`a-${i}`}
          from={clip.startFrame}
          durationInFrames={clip.durationInFrames}
        >
          <Audio
            src={clip.mediaUrl}
            startFrom={clip.trimStartFrame}
            volume={clip.volume}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

const ExportTransitionOutgoing: React.FC<{
  mediaUrl: string;
  mediaType?: 'video' | 'image';
  startFrom: number;
  type: TransitionType;
  transitionFrames: number;
}> = ({ mediaUrl, mediaType, startFrom, type, transitionFrames }) => {
  const frame = useCurrentFrame();
  const progress = transitionFrames > 0 ? frame / transitionFrames : 1;
  const pair = computeTransitionPair(type, progress);

  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
  };
  if (pair.outgoing.opacity < 1) style.opacity = pair.outgoing.opacity;
  if (pair.outgoing.transform !== 'none') style.transform = pair.outgoing.transform;
  if (pair.outgoing.clipPath) style.clipPath = pair.outgoing.clipPath;
  if (pair.outgoing.filter) style.filter = pair.outgoing.filter;

  return (
    <AbsoluteFill>
      {mediaType === 'image' ? (
        <Img src={mediaUrl} style={style} />
      ) : (
        <Video src={mediaUrl} startFrom={startFrom} style={style} />
      )}
    </AbsoluteFill>
  );
};

const ExportVideoClip: React.FC<{
  mediaUrl: string;
  mediaType?: 'video' | 'image';
  trimStartFrame: number;
  transitionIn?: TransitionType;
  transitionInFrames?: number;
}> = ({ mediaUrl, mediaType, trimStartFrame, transitionIn, transitionInFrames }) => {
  const frame = useCurrentFrame();
  const hasTransition = transitionIn && transitionIn !== 'none' && transitionInFrames && transitionInFrames > 0;

  if (!hasTransition || frame >= transitionInFrames!) {
    return (
      <AbsoluteFill>
        {mediaType === 'image' ? (
          <Img src={mediaUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <Video
            src={mediaUrl}
            startFrom={trimStartFrame}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        )}
      </AbsoluteFill>
    );
  }

  const progress = frame / transitionInFrames!;
  const pair = computeTransitionPair(transitionIn!, progress);
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
  };
  if (pair.incoming.opacity < 1) style.opacity = pair.incoming.opacity;
  if (pair.incoming.transform !== 'none') style.transform = pair.incoming.transform;
  if (pair.incoming.clipPath) style.clipPath = pair.incoming.clipPath;
  if (pair.incoming.filter) style.filter = pair.incoming.filter;

  return (
    <AbsoluteFill>
      {mediaType === 'image' ? (
        <Img src={mediaUrl} style={style} />
      ) : (
        <Video src={mediaUrl} startFrom={trimStartFrame} style={style} />
      )}
      {pair.overlay && (
        <AbsoluteFill
          style={{
            background: pair.overlay.background,
            opacity: pair.overlay.opacity,
            mixBlendMode: pair.overlay.mixBlendMode as React.CSSProperties['mixBlendMode'],
          }}
        />
      )}
    </AbsoluteFill>
  );
};

const ExportOverlayClip: React.FC<OverlayClipInput> = ({
  mediaUrl,
  mediaType,
  trimStartFrame,
  x,
  y,
  scale: overlayScale,
  rotation,
  opacity: baseOpacity,
  fadeInFrames,
  fadeOutFrames,
  overlayAnimation,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const localTime = frame;

  let opacity = baseOpacity;
  if (fadeInFrames > 0 && localTime < fadeInFrames) {
    opacity *= Math.max(0, localTime / fadeInFrames);
  }
  if (fadeOutFrames > 0 && localTime > durationInFrames - fadeOutFrames) {
    opacity *= Math.max(0, (durationInFrames - localTime) / fadeOutFrames);
  }

  let animScale = overlayScale;
  if (overlayAnimation === 'zoomIn') {
    const zoomProgress = durationInFrames > 0 ? localTime / durationInFrames : 0;
    const zoomFactor = interpolate(zoomProgress, [0, 1], [1, 1.15]);
    animScale *= zoomFactor;
  }

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${animScale})`,
    transformOrigin: 'center center',
    opacity,
  };

  const mediaStyle: React.CSSProperties = {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain' as const,
  };

  return (
    <AbsoluteFill>
      <div style={wrapperStyle}>
        {mediaType === 'image' ? (
          <Img src={mediaUrl} style={mediaStyle} />
        ) : (
          <Video
            src={mediaUrl}
            startFrom={trimStartFrame}
            style={mediaStyle}
            muted
          />
        )}
      </div>
    </AbsoluteFill>
  );
};

interface ExportAnimatedTextProps {
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
}

const exportTextBase = (
  fontSize: number,
  fontColor: string,
  fontFamily: string,
  textAlign: string,
): React.CSSProperties => ({
  fontSize,
  color: fontColor,
  fontFamily,
  textAlign: textAlign as React.CSSProperties['textAlign'],
  whiteSpace: 'pre-wrap',
  lineHeight: 1.2,
  wordBreak: 'break-word',
});

const ExportAnimatedText: React.FC<ExportAnimatedTextProps> = ({
  text,
  fontSize,
  fontColor,
  fontFamily,
  textAlign,
  animation,
  animationDuration,
  x,
  y,
  scale,
  rotation,
  emoji,
  wordTimings,
  highlightColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enterFrames = Math.round(animationDuration * fps);

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
    transformOrigin: 'center center',
    maxWidth: '90%',
    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8)) drop-shadow(0 0 2px rgba(0,0,0,0.6))',
  };

  if (animation === 'karaoke') {
    const words = text.split(/\s+/).filter(Boolean);
    const timings = wordTimings?.map((wt) => ({ start: wt.start, end: wt.end }));
    const state = computeKaraokeState(frame, fps, words, durationInFrames, timings);
    const hlColor = highlightColor || '#d78241';

    return (
      <AbsoluteFill>
        <div style={wrapperStyle}>
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
            ...exportTextBase(fontSize, fontColor, fontFamily, 'center'),
            fontWeight: 800,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.02em',
            opacity: state.containerOpacity,
            display: 'flex',
            flexWrap: 'wrap' as const,
            justifyContent: 'center',
            gap: '0.05em',
            textShadow: '0 2px 8px rgba(0,0,0,0.7), 0 0 2px rgba(0,0,0,0.5)',
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
                    }}
                  />
                  <span style={{ position: 'relative' }}>{word}</span>
                </span>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  if (animation === 'typewriter') {
    const timingsForTypewriter = wordTimings?.map((wt) => ({ start: wt.start, end: wt.end, word: wt.word }));
    const { chars, showCursor } = computeTypewriterChars(
      frame, text.length, enterFrames, durationInFrames,
      fps, text, timingsForTypewriter
    );
    return (
      <AbsoluteFill>
        <div style={wrapperStyle}>
          <span style={exportTextBase(fontSize, fontColor, fontFamily, textAlign)}>
            {text.slice(0, chars)}
            {showCursor && (
              <span style={{ opacity: Math.round(frame / (fps / 4)) % 2 === 0 ? 1 : 0 }}>|</span>
            )}
          </span>
        </div>
      </AbsoluteFill>
    );
  }

  if (animation === 'wordByWord') {
    const words = text.split(/\s+/).filter(Boolean);
    const timingsForWbW = wordTimings?.map((wt) => ({ start: wt.start, end: wt.end }));
    const state = computeWordByWordState(frame, fps, words, enterFrames, durationInFrames, timingsForWbW);
    return (
      <AbsoluteFill>
        <div style={wrapperStyle}>
          <span style={{ ...exportTextBase(fontSize, fontColor, fontFamily, textAlign), opacity: state.containerOpacity }}>
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
          </span>
        </div>
      </AbsoluteFill>
    );
  }

  const anim = computeAnimationStyle(animation, { frame, fps, durationInFrames, animationDuration });

  return (
    <AbsoluteFill>
      <div style={wrapperStyle}>
        <span
          style={{
            ...exportTextBase(fontSize, fontColor, fontFamily, textAlign),
            opacity: anim.opacity,
            transform: anim.transform,
            filter: anim.filter,
          }}
        >
          {text}
        </span>
      </div>
    </AbsoluteFill>
  );
};
