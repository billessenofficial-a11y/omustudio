import type {
  ExportCompositionProps,
  VideoClipInput,
  TextClipInput,
  TransitionOverlayInput,
  OverlayClipInput,
  AudioClipInput,
} from '../remotion/ExportComposition';
import type { TimelineTrack, ClipTransition, TextAnimation } from '../types/editor';

interface PrepareOptions {
  tracks: TimelineTrack[];
  transitions: ClipTransition[];
  fps: number;
  urlMap: Record<string, string>;
}

export function prepareCompositionProps(options: PrepareOptions): ExportCompositionProps {
  const { tracks, transitions, fps, urlMap } = options;

  const mainTrack = tracks.find((t) => t.role === 'main' || t.type === 'video');
  const videoClips = mainTrack
    ? [...mainTrack.clips].sort((a, b) => a.startTime - b.startTime)
    : [];

  const textClips = tracks
    .filter((t) => t.type === 'text' && !t.isMuted)
    .flatMap((t) => t.clips);

  const overlayTracks = tracks.filter((t) => t.type === 'overlay' && !t.isMuted);
  const rawOverlayClips = overlayTracks.flatMap((t) => t.clips);

  const audioTracks = tracks.filter((t) => t.type === 'audio' && !t.isMuted);
  const rawAudioClips = audioTracks.flatMap((t) => t.clips);

  const videoInputs: VideoClipInput[] = videoClips.map((clip) => {
    const mediaUrl = clip.mediaId ? urlMap[clip.mediaId] : '';
    const incoming = transitions.find((t) => t.toClipId === clip.id);
    return {
      mediaUrl,
      mediaType: clip.type === 'video' ? 'video' : 'image',
      outputStartFrame: Math.round(clip.startTime * fps),
      durationInFrames: Math.round(clip.duration * fps),
      trimStartFrame: Math.round(clip.trimStart * fps),
      transitionIn: incoming?.type,
      transitionInFrames: incoming?.duration
        ? Math.round(incoming.duration * fps)
        : undefined,
    };
  });

  const transitionOverlays: TransitionOverlayInput[] = videoClips
    .filter((clip) => {
      const incoming = transitions.find((t) => t.toClipId === clip.id);
      if (!incoming || incoming.type === 'none') return false;
      const fromClip = videoClips.find((c) => c.id === incoming.fromClipId);
      return !!fromClip?.mediaId;
    })
    .map((clip) => {
      const incoming = transitions.find((t) => t.toClipId === clip.id)!;
      const fromClip = videoClips.find((c) => c.id === incoming.fromClipId)!;
      const transFrames = Math.round(incoming.duration * fps);
      const outTrimStart = Math.round(fromClip.trimStart * fps);
      const outDuration = Math.round(fromClip.duration * fps);
      return {
        atFrame: Math.round(clip.startTime * fps),
        durationInFrames: transFrames,
        type: incoming.type,
        mediaUrl: fromClip.mediaId ? urlMap[fromClip.mediaId] : '',
        mediaType: (fromClip.type === 'video' ? 'video' : 'image') as 'video' | 'image',
        outgoingStartFrom: Math.max(0, outTrimStart + outDuration - transFrames),
      };
    });

  const textInputs: TextClipInput[] = textClips
    .filter((c) => c.properties.text)
    .map((clip) => ({
      id: clip.id,
      startFrame: Math.round(clip.startTime * fps),
      durationInFrames: Math.round(clip.duration * fps),
      text: clip.properties.text || '',
      fontSize: clip.properties.fontSize ?? 48,
      fontColor: clip.properties.fontColor ?? '#ffffff',
      fontFamily: clip.properties.fontFamily ?? "'Inter', sans-serif",
      textAlign: (clip.properties.textAlign as 'left' | 'center' | 'right') ?? 'center',
      animation: (clip.properties.textAnimation as TextAnimation) ?? 'fadeIn',
      animationDuration: clip.properties.animationDuration ?? 0.5,
      x: clip.properties.x ?? 50,
      y: clip.properties.y ?? 50,
      scale: (clip.properties.scale as number) ?? 1,
      rotation: (clip.properties.rotation as number) ?? 0,
      emoji: clip.properties.emoji,
      wordTimings: clip.properties.wordTimings,
      highlightColor: clip.properties.highlightColor,
    }));

  const overlayInputs: OverlayClipInput[] = rawOverlayClips
    .filter((clip) => clip.mediaId && urlMap[clip.mediaId])
    .map((clip) => ({
      mediaUrl: clip.mediaId ? urlMap[clip.mediaId] : '',
      mediaType: (clip.type === 'video' ? 'video' : 'image') as 'video' | 'image',
      startFrame: Math.round(clip.startTime * fps),
      durationInFrames: Math.round(clip.duration * fps),
      trimStartFrame: Math.round(clip.trimStart * fps),
      x: clip.properties.x ?? 50,
      y: clip.properties.y ?? 50,
      scale: clip.properties.scale ?? 1,
      rotation: clip.properties.rotation ?? 0,
      opacity: clip.properties.opacity ?? 1,
      fadeInFrames: Math.round((clip.properties.fadeInDuration ?? 0) * fps),
      fadeOutFrames: Math.round((clip.properties.fadeOutDuration ?? 0) * fps),
      overlayAnimation: clip.properties.overlayAnimation ?? 'none',
    }));

  const audioInputs: AudioClipInput[] = rawAudioClips
    .filter((clip) => clip.mediaId && urlMap[clip.mediaId])
    .map((clip) => ({
      mediaUrl: clip.mediaId ? urlMap[clip.mediaId] : '',
      startFrame: Math.round(clip.startTime * fps),
      durationInFrames: Math.round(clip.duration * fps),
      trimStartFrame: Math.round(clip.trimStart * fps),
      volume: clip.properties.volume ?? 1,
    }));

  return {
    videoClips: videoInputs,
    textClips: textInputs,
    transitionOverlays,
    overlayClips: overlayInputs,
    audioClips: audioInputs,
  };
}
