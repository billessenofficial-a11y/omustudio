export interface ProjectSettings {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
}

export interface MediaFile {
  id: string;
  file: File;
  name: string;
  type: 'video' | 'audio' | 'image';
  duration: number;
  width?: number;
  height?: number;
  thumbnailUrl: string;
  blobUrl: string;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  mediaId?: string;
  type: 'video' | 'audio' | 'text';
  name: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  properties: ClipProperties;
}

export type TextAnimation =
  | 'none'
  | 'fadeIn'
  | 'typewriter'
  | 'slideUp'
  | 'slideDown'
  | 'slideLeft'
  | 'slideRight'
  | 'scaleUp'
  | 'blurReveal'
  | 'pop'
  | 'wordByWord'
  | 'karaoke';

export type TransitionType =
  | 'none'
  | 'crossfade'
  | 'dipToBlack'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'wipeLeft'
  | 'wipeRight'
  | 'zoom'
  | 'glare'
  | 'filmBurn';

export interface ClipProperties {
  opacity?: number;
  volume?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  textAnimation?: TextAnimation;
  animationDuration?: number;
  emoji?: string;
  wordTimings?: Array<{ word: string; start: number; end: number }>;
  highlightColor?: string;
  overlayAnimation?: 'none' | 'zoomIn';
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

export interface ClipTransition {
  id: string;
  trackId: string;
  fromClipId: string;
  toClipId: string;
  type: TransitionType;
  duration: number;
}

export type TrackRole = 'text' | 'main' | 'overlay' | 'audio';

export interface TimelineTrack {
  id: string;
  type: 'video' | 'audio' | 'text' | 'overlay';
  name: string;
  order: number;
  isMuted: boolean;
  isDefault: boolean;
  role?: TrackRole;
  clips: TimelineClip[];
}

export interface ExportSettings {
  width: number;
  height: number;
  quality: 'high' | 'medium' | 'low';
  filename: string;
}

export type Tool = 'select' | 'trim' | 'split' | 'text';

export type BRollStatus = 'suggested' | 'generating' | 'generated' | 'failed';

export type BRollModel = 'veo-3.1-fast' | 'gemini-3-pro-image';

export interface BRollSuggestion {
  id: string;
  projectId: string;
  timestampStart: number;
  duration: number;
  prompt: string;
  rationale: string;
  status: BRollStatus;
  videoUrl: string | null;
  clipId: string | null;
}
