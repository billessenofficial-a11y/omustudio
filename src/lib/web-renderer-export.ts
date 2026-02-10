import { renderMediaOnWeb } from '@remotion/web-renderer';
import {
  ExportComposition,
  type VideoClipInput,
  type TextClipInput,
  type TransitionOverlayInput,
  type OverlayClipInput,
  type AudioClipInput,
  type ExportCompositionProps,
} from '../remotion/ExportComposition';
import type { TextAnimation, TransitionType } from '../types/editor';

export interface WebRendererExportOptions {
  videoClips: Array<{
    blobUrl: string;
    mediaType?: 'video' | 'image';
    outputStart: number;
    duration: number;
    trimStart: number;
    transitionIn?: TransitionType;
    transitionInDuration?: number;
    outgoingBlobUrl?: string;
    outgoingMediaType?: 'video' | 'image';
    outgoingTrimStart?: number;
    outgoingDuration?: number;
  }>;
  textClips: Array<{
    id: string;
    startTime: number;
    duration: number;
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
  }>;
  overlayClips: Array<{
    blobUrl: string;
    mediaType: 'video' | 'image';
    startTime: number;
    duration: number;
    trimStart: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    opacity: number;
    fadeInDuration: number;
    fadeOutDuration: number;
    overlayAnimation: 'none' | 'zoomIn';
  }>;
  audioClips: Array<{
    blobUrl: string;
    startTime: number;
    duration: number;
    trimStart: number;
    volume: number;
  }>;
  width: number;
  height: number;
  fps: number;
  totalDuration: number;
  quality: 'high' | 'medium' | 'low';
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

const qualityMap: Record<string, 'very-high' | 'high' | 'medium'> = {
  high: 'very-high',
  medium: 'high',
  low: 'medium',
};

export async function exportWithWebRenderer(
  options: WebRendererExportOptions
): Promise<Blob> {
  const {
    videoClips, textClips, overlayClips, audioClips,
    width, height, fps, totalDuration, quality, onProgress, signal,
  } = options;

  const durationInFrames = Math.max(Math.round(totalDuration * fps), 1);

  const videoInputs: VideoClipInput[] = videoClips.map((clip) => ({
    mediaUrl: clip.blobUrl,
    mediaType: clip.mediaType,
    outputStartFrame: Math.round(clip.outputStart * fps),
    durationInFrames: Math.round(clip.duration * fps),
    trimStartFrame: Math.round(clip.trimStart * fps),
    transitionIn: clip.transitionIn,
    transitionInFrames: clip.transitionInDuration
      ? Math.round(clip.transitionInDuration * fps)
      : undefined,
  }));

  const transitionOverlays: TransitionOverlayInput[] = videoClips
    .filter((clip) => clip.transitionIn && clip.transitionIn !== 'none' && clip.transitionInDuration && clip.outgoingBlobUrl != null)
    .map((clip) => {
      const transFrames = Math.round(clip.transitionInDuration! * fps);
      const outTrimStart = Math.round((clip.outgoingTrimStart ?? 0) * fps);
      const outDuration = Math.round((clip.outgoingDuration ?? 0) * fps);
      return {
        atFrame: Math.round(clip.outputStart * fps),
        durationInFrames: transFrames,
        type: clip.transitionIn!,
        mediaUrl: clip.outgoingBlobUrl!,
        mediaType: clip.outgoingMediaType,
        outgoingStartFrom: Math.max(0, outTrimStart + outDuration - transFrames),
      };
    });

  const textInputs: TextClipInput[] = textClips.map((clip) => ({
    id: clip.id,
    startFrame: Math.round(clip.startTime * fps),
    durationInFrames: Math.round(clip.duration * fps),
    text: clip.text,
    fontSize: clip.fontSize,
    fontColor: clip.fontColor,
    fontFamily: clip.fontFamily,
    textAlign: clip.textAlign,
    animation: clip.animation,
    animationDuration: clip.animationDuration,
    x: clip.x,
    y: clip.y,
    scale: clip.scale,
    rotation: clip.rotation,
    emoji: clip.emoji,
    wordTimings: clip.wordTimings,
    highlightColor: clip.highlightColor,
  }));

  const overlayInputs: OverlayClipInput[] = overlayClips.map((clip) => ({
    mediaUrl: clip.blobUrl,
    mediaType: clip.mediaType,
    startFrame: Math.round(clip.startTime * fps),
    durationInFrames: Math.round(clip.duration * fps),
    trimStartFrame: Math.round(clip.trimStart * fps),
    x: clip.x,
    y: clip.y,
    scale: clip.scale,
    rotation: clip.rotation,
    opacity: clip.opacity,
    fadeInFrames: Math.round(clip.fadeInDuration * fps),
    fadeOutFrames: Math.round(clip.fadeOutDuration * fps),
    overlayAnimation: clip.overlayAnimation,
  }));

  const audioInputs: AudioClipInput[] = audioClips.map((clip) => ({
    mediaUrl: clip.blobUrl,
    startFrame: Math.round(clip.startTime * fps),
    durationInFrames: Math.round(clip.duration * fps),
    trimStartFrame: Math.round(clip.trimStart * fps),
    volume: clip.volume,
  }));

  const inputProps: ExportCompositionProps = {
    videoClips: videoInputs,
    textClips: textInputs,
    transitionOverlays,
    overlayClips: overlayInputs,
    audioClips: audioInputs,
  };

  const { getBlob } = await renderMediaOnWeb({
    composition: {
      component: ExportComposition,
      durationInFrames,
      fps,
      width,
      height,
      id: 'editor-export',
    },
    inputProps,
    container: 'mp4',
    videoCodec: 'h264',
    videoBitrate: qualityMap[quality] || 'high',
    licenseKey: 'free-license',
    isProduction: false,
    onProgress: ({ renderedFrames }) => {
      const pct = Math.round((renderedFrames / durationInFrames) * 100);
      onProgress?.(Math.min(pct, 99));
    },
    signal,
  });

  onProgress?.(100);
  return getBlob();
}
