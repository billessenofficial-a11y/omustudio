import { Output, CanvasSource, AudioBufferSource, Mp4OutputFormat, BufferTarget } from 'mediabunny';
import { useTimelineStore } from '../store/timeline-store';
import { useProjectStore } from '../store/project-store';
import { loadVideo, compositeFrame, cleanupEntries, type VideoEntry } from './canvas-draw-utils';
import { VideoFrameDecoder } from './video-frame-decoder';

export interface MediabunnyExportOptions {
  width: number;
  height: number;
  fps: number;
  totalDuration: number;
  quality: 'high' | 'medium' | 'low';
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

const VIDEO_BITRATE: Record<string, number> = {
  high: 8_000_000,
  medium: 4_000_000,
  low: 2_000_000,
};

const AUDIO_BITRATE: Record<string, number> = {
  high: 192_000,
  medium: 128_000,
  low: 96_000,
};

export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';
}

interface AudioClipInfo {
  buffer: AudioBuffer;
  startTime: number;
  trimStart: number;
  duration: number;
  volume: number;
}

async function decodeAudioFromBlob(blobUrl: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(blobUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = new AudioContext();
    try {
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      return decoded;
    } finally {
      await audioCtx.close();
    }
  } catch {
    return null;
  }
}

async function mixAudio(
  clips: AudioClipInfo[],
  totalDuration: number,
  sampleRate: number
): Promise<AudioBuffer | null> {
  if (clips.length === 0) return null;

  const totalSamples = Math.ceil(totalDuration * sampleRate);
  const channels = 2;
  const offlineCtx = new OfflineAudioContext(channels, totalSamples, sampleRate);

  for (const clip of clips) {
    const source = offlineCtx.createBufferSource();
    source.buffer = clip.buffer;
    const gain = offlineCtx.createGain();
    gain.gain.value = clip.volume;
    source.connect(gain);
    gain.connect(offlineCtx.destination);
    source.start(clip.startTime, clip.trimStart, clip.duration);
  }

  return offlineCtx.startRendering();
}

function splitAudioBuffer(
  buffer: AudioBuffer,
  chunkDuration: number
): AudioBuffer[] {
  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const chunkSamples = Math.ceil(chunkDuration * sampleRate);
  const totalSamples = buffer.length;
  const chunks: AudioBuffer[] = [];

  for (let offset = 0; offset < totalSamples; offset += chunkSamples) {
    const len = Math.min(chunkSamples, totalSamples - offset);
    const chunk = new AudioBuffer({ length: len, numberOfChannels: channels, sampleRate });
    for (let ch = 0; ch < channels; ch++) {
      const srcData = buffer.getChannelData(ch);
      const dstData = chunk.getChannelData(ch);
      dstData.set(srcData.subarray(offset, offset + len));
    }
    chunks.push(chunk);
  }

  return chunks;
}

async function seekAndCapture(video: HTMLVideoElement, time: number): Promise<ImageBitmap | null> {
  const target = Math.max(0, time);
  video.currentTime = target;
  await Promise.race([
    new Promise<void>((resolve) => {
      video.onseeked = () => { video.onseeked = null; resolve(); };
    }),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  try {
    return await createImageBitmap(video);
  } catch {
    return null;
  }
}

async function warmupVideoElements(entries: VideoEntry[]): Promise<void> {
  for (const { clip, video } of entries) {
    video.muted = true;
    video.currentTime = clip.trimStart;
    await Promise.race([
      new Promise<void>((resolve) => {
        video.onseeked = () => { video.onseeked = null; resolve(); };
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
    try {
      await video.play();
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    } catch { /* empty */ }
    video.pause();
    const bmp = await seekAndCapture(video, clip.trimStart);
    if (bmp) bmp.close();
  }
}

interface DecoderEntry {
  clipId: string;
  mediaId: string;
  decoder: VideoFrameDecoder;
}

export async function exportWithMediabunny(
  options: MediabunnyExportOptions
): Promise<Blob> {
  const { width, height, totalDuration, quality, onProgress, signal } = options;

  const { tracks, transitions } = useTimelineStore.getState();
  const { mediaFiles } = useProjectStore.getState();

  onProgress?.(1);

  let useWebCodecsDecode = typeof VideoDecoder !== 'undefined';
  const decoders: DecoderEntry[] = [];
  const decoderCache = new Map<string, VideoFrameDecoder>();

  const entries: VideoEntry[] = [];
  for (const track of tracks) {
    if (track.type !== 'video' && track.type !== 'overlay') continue;
    if (track.isMuted) continue;
    for (const clip of track.clips) {
      if (!clip.mediaId) continue;
      const media = mediaFiles.find((m) => m.id === clip.mediaId);
      if (!media || media.type !== 'video') continue;

      const video = await loadVideo(media.blobUrl);
      video.pause();
      entries.push({ clip, video });

      if (useWebCodecsDecode) {
        try {
          let decoder = decoderCache.get(media.id);
          if (!decoder) {
            decoder = new VideoFrameDecoder(media.blobUrl);
            await decoder.waitReady();
            decoderCache.set(media.id, decoder);
          }
          decoders.push({ clipId: clip.id, mediaId: media.id, decoder });
        } catch (err) {
          console.warn('WebCodecs decode init failed, falling back to video element:', err);
          useWebCodecsDecode = false;
          for (const d of decoderCache.values()) d.dispose();
          decoderCache.clear();
          decoders.length = 0;
        }
      }
    }
  }

  const fps = options.fps;
  const totalFrames = Math.max(Math.round(totalDuration * fps), 1);
  const frameDuration = 1 / fps;

  if (!useWebCodecsDecode) {
    await warmupVideoElements(entries);
  }

  onProgress?.(5);

  const sampleRate = 48000;
  const audioClips: AudioClipInfo[] = [];
  const decodedAudioCache = new Map<string, AudioBuffer | null>();

  for (const track of tracks) {
    if (track.type !== 'video' && track.type !== 'overlay') continue;
    if (track.isMuted) continue;
    for (const clip of track.clips) {
      if (!clip.mediaId) continue;
      const media = mediaFiles.find((m) => m.id === clip.mediaId);
      if (!media || media.type !== 'video') continue;

      let decoded = decodedAudioCache.get(media.id);
      if (decoded === undefined) {
        decoded = await decodeAudioFromBlob(media.blobUrl);
        decodedAudioCache.set(media.id, decoded);
      }
      if (decoded) {
        audioClips.push({
          buffer: decoded,
          startTime: clip.startTime,
          trimStart: clip.trimStart,
          duration: clip.duration,
          volume: clip.properties.volume ?? 1,
        });
      }
    }
  }

  onProgress?.(8);

  const mixedAudio = await mixAudio(audioClips, totalDuration, sampleRate);

  onProgress?.(10);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });

  const canvasSource = new CanvasSource(canvas, {
    codec: 'avc',
    bitrate: VIDEO_BITRATE[quality] ?? VIDEO_BITRATE.high,
    keyFrameInterval: 1,
  });
  output.addVideoTrack(canvasSource);

  let audioSource: AudioBufferSource | null = null;
  if (mixedAudio) {
    audioSource = new AudioBufferSource({
      codec: 'aac',
      bitrate: AUDIO_BITRATE[quality] ?? AUDIO_BITRATE.high,
    });
    output.addAudioTrack(audioSource);
  }

  await output.start();

  const disposeDecoders = () => {
    for (const d of decoderCache.values()) d.dispose();
    decoderCache.clear();
  };

  let webCodecsFailures = 0;
  const MAX_WEBCODECS_FAILURES = 3;

  try {
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (signal?.aborted) {
        await output.cancel();
        cleanupEntries(entries);
        disposeDecoders();
        throw new DOMException('Aborted', 'AbortError');
      }

      const currentTime = frameIdx * frameDuration;

      for (const entry of entries) {
        const { clip } = entry;
        const clipEnd = clip.startTime + clip.duration;
        if (currentTime >= clip.startTime && currentTime < clipEnd) {
          const seekTo = clip.trimStart + (currentTime - clip.startTime);

          if (entry.frame) {
            try { entry.frame.close(); } catch { /* already closed */ }
            entry.frame = undefined;
          }
          if (entry.bitmap) {
            try { entry.bitmap.close(); } catch { /* already closed */ }
            entry.bitmap = undefined;
          }

          if (useWebCodecsDecode && webCodecsFailures < MAX_WEBCODECS_FAILURES) {
            const de = decoders.find((d) => d.clipId === clip.id);
            if (de) {
              try {
                entry.frame = await de.decoder.getFrameAtTime(seekTo);
              } catch {
                webCodecsFailures++;
                if (webCodecsFailures >= MAX_WEBCODECS_FAILURES) {
                  console.warn('WebCodecs decode failed repeatedly, falling back to video element');
                  for (const d of decoderCache.values()) d.dispose();
                  decoderCache.clear();
                  useWebCodecsDecode = false;
                  await warmupVideoElements(entries);
                }
                entry.bitmap = await seekAndCapture(entry.video, seekTo);
              }
            } else {
              entry.bitmap = await seekAndCapture(entry.video, seekTo);
            }
          } else {
            entry.bitmap = await seekAndCapture(entry.video, seekTo);
          }
        } else {
          if (entry.frame) {
            try { entry.frame.close(); } catch { /* already closed */ }
            entry.frame = undefined;
          }
          if (entry.bitmap) {
            try { entry.bitmap.close(); } catch { /* already closed */ }
            entry.bitmap = undefined;
          }
        }
      }

      compositeFrame(ctx, currentTime, width, height, tracks, transitions, entries);

      for (const entry of entries) {
        if (entry.frame) {
          try { entry.frame.close(); } catch { /* already closed */ }
          entry.frame = undefined;
        }
      }

      await canvasSource.add(currentTime, frameDuration);

      const pct = 10 + Math.round((frameIdx / totalFrames) * 80);
      onProgress?.(pct);
    }

    if (audioSource && mixedAudio) {
      const audioChunks = splitAudioBuffer(mixedAudio, 1.0);
      for (const chunk of audioChunks) {
        if (signal?.aborted) {
          await output.cancel();
          cleanupEntries(entries);
          disposeDecoders();
          throw new DOMException('Aborted', 'AbortError');
        }
        await audioSource.add(chunk);
      }
    }

    onProgress?.(95);

    await output.finalize();

    onProgress?.(100);

    cleanupEntries(entries);
    disposeDecoders();

    if (!target.buffer) {
      throw new Error('Export produced no output');
    }

    return new Blob([target.buffer], { type: 'video/mp4' });
  } catch (err) {
    cleanupEntries(entries);
    disposeDecoders();
    throw err;
  }
}
