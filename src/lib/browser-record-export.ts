import { useTimelineStore } from '../store/timeline-store';
import { useProjectStore } from '../store/project-store';
import { getFFmpeg } from './ffmpeg';
import { loadVideo, drawVideo, drawOverlay, drawText, type VideoEntry } from './canvas-draw-utils';
import { computeTransitionPair, getTransitionProgress } from './transition-effects';

export interface BrowserRecordExportOptions {
  width: number;
  height: number;
  fps: number;
  totalDuration: number;
  quality: 'high' | 'medium' | 'low';
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

const RECORD_BITRATE: Record<string, number> = {
  high: 8_000_000,
  medium: 4_000_000,
  low: 2_000_000,
};

const CRF_MAP: Record<string, string> = {
  high: '18',
  medium: '23',
  low: '28',
};

function pickMimeType(): { mimeType: string; isNativeMp4: boolean } {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return { mimeType: mime, isNativeMp4: mime.startsWith('video/mp4') };
    }
  }
  return { mimeType: 'video/webm', isNativeMp4: false };
}

interface ClipEntry extends VideoEntry {
  gainNode: GainNode;
  playing: boolean;
}

export async function exportWithBrowserRecord(
  options: BrowserRecordExportOptions
): Promise<Blob> {
  const { width, height, fps, totalDuration, quality, onProgress, signal } = options;

  const { tracks, transitions } = useTimelineStore.getState();
  const { mediaFiles } = useProjectStore.getState();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();

  const entries: ClipEntry[] = [];
  for (const track of tracks) {
    if (track.type !== 'video' && track.type !== 'overlay') continue;
    if (track.isMuted) continue;
    for (const clip of track.clips) {
      if (!clip.mediaId) continue;
      const media = mediaFiles.find((m) => m.id === clip.mediaId);
      if (!media || media.type !== 'video') continue;

      const video = await loadVideo(media.blobUrl);
      const gain = audioCtx.createGain();
      gain.gain.value = 0;

      try {
        const src = audioCtx.createMediaElementSource(video);
        src.connect(gain);
        gain.connect(dest);
      } catch {
        // no audio track
      }

      entries.push({ clip, video, gainNode: gain, playing: false });
    }
  }

  const videoStream = canvas.captureStream(fps);
  const combined = new MediaStream();
  for (const t of videoStream.getVideoTracks()) combined.addTrack(t);
  for (const t of dest.stream.getAudioTracks()) combined.addTrack(t);

  const { mimeType, isNativeMp4 } = pickMimeType();

  const recorder = new MediaRecorder(combined, {
    mimeType,
    videoBitsPerSecond: RECORD_BITRATE[quality] ?? RECORD_BITRATE.high,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const cleanup = () => {
    for (const e of entries) {
      e.video.pause();
      e.video.removeAttribute('src');
    }
    audioCtx.close().catch(() => {});
  };

  const recordedBlob = await new Promise<Blob>((resolve, reject) => {
    if (signal?.aborted) {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const onAbort = () => {
      try { recorder.stop(); } catch { /* */ }
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    recorder.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      cleanup();
      reject(new Error('MediaRecorder error'));
    };

    recorder.onstop = () => {
      signal?.removeEventListener('abort', onAbort);
      cleanup();
      const blobType = isNativeMp4 ? 'video/mp4' : 'video/webm';
      resolve(new Blob(chunks, { type: blobType }));
    };

    recorder.start(100);
    const t0 = performance.now();
    const progressCeil = isNativeMp4 ? 99 : 65;
    const frameInterval = 1000 / fps;
    let stopped = false;

    const safetyTimer = setTimeout(() => {
      if (!stopped) {
        stopped = true;
        for (const e of entries) { e.video.pause(); e.gainNode.gain.value = 0; }
        try { recorder.stop(); } catch { /* */ }
      }
    }, (totalDuration + 3) * 1000);

    const tick = () => {
      if (stopped || signal?.aborted) return;
      const currentTime = (performance.now() - t0) / 1000;

      if (currentTime >= totalDuration) {
        stopped = true;
        clearTimeout(safetyTimer);
        for (const e of entries) {
          e.video.pause();
          e.gainNode.gain.value = 0;
          e.playing = false;
        }
        recorder.stop();
        return;
      }

      onProgress?.(Math.round((currentTime / totalDuration) * progressCeil));

      for (const entry of entries) {
        const { clip, video, gainNode } = entry;
        const clipEnd = clip.startTime + clip.duration;
        const active = currentTime >= clip.startTime && currentTime < clipEnd;

        if (active && !entry.playing) {
          video.currentTime = clip.trimStart;
          video.play().catch(() => {});
          gainNode.gain.value = clip.properties.volume ?? 1;
          entry.playing = true;
        } else if (!active && entry.playing) {
          video.pause();
          gainNode.gain.value = 0;
          entry.playing = false;
        }

        if (active && entry.playing) {
          const expected = clip.trimStart + (currentTime - clip.startTime);
          if (Math.abs(video.currentTime - expected) > 0.2) {
            video.currentTime = expected;
          }
        }
      }

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      const drawnIds = new Set<string>();

      for (const track of tracks) {
        if (track.type !== 'video' || track.isMuted) continue;
        for (const clip of track.clips) {
          if (currentTime < clip.startTime || currentTime >= clip.startTime + clip.duration) continue;
          if (drawnIds.has(clip.id)) continue;

          const entry = entries.find((e) => e.clip.id === clip.id);
          if (!entry) continue;

          const trans = transitions.find((t) => t.toClipId === clip.id);
          if (trans && trans.type !== 'none') {
            const tp = getTransitionProgress(currentTime, clip.startTime, trans.duration);
            if (tp < 1) {
              const outEntry = entries.find((e) => e.clip.id === trans.fromClipId);
              if (outEntry) {
                const pair = computeTransitionPair(trans.type, tp);
                drawVideo(ctx, outEntry.video, width, height, pair.outgoing);
                drawVideo(ctx, entry.video, width, height, pair.incoming);
                if (pair.overlay) {
                  ctx.save();
                  ctx.globalAlpha = pair.overlay.opacity;
                  ctx.fillStyle = 'rgba(255,140,20,0.4)';
                  ctx.fillRect(0, 0, width, height);
                  ctx.restore();
                }
                drawnIds.add(clip.id);
                drawnIds.add(trans.fromClipId);
                continue;
              }
            }
          }

          drawVideo(ctx, entry.video, width, height);
          drawnIds.add(clip.id);
        }
      }

      for (const track of tracks) {
        if (track.type !== 'overlay' || track.isMuted) continue;
        for (const clip of track.clips) {
          if (currentTime < clip.startTime || currentTime >= clip.startTime + clip.duration) continue;
          const entry = entries.find((e) => e.clip.id === clip.id);
          if (entry) {
            drawOverlay(ctx, entry.video, clip, currentTime, width, height);
          }
        }
      }

      for (const track of tracks) {
        if (track.type !== 'text' || track.isMuted) continue;
        for (const clip of track.clips) {
          if (currentTime < clip.startTime || currentTime >= clip.startTime + clip.duration) continue;
          drawText(ctx, clip, currentTime, width, height);
        }
      }

      setTimeout(tick, frameInterval);
    };

    setTimeout(tick, 0);
  });

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (isNativeMp4) {
    onProgress?.(100);
    return recordedBlob;
  }

  onProgress?.(68);

  const mp4Blob = await remuxToMp4(recordedBlob, quality, (p) => {
    onProgress?.(68 + Math.round(p * 32));
  });

  return mp4Blob;
}

async function remuxToMp4(
  webm: Blob,
  quality: string,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();

  const handler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.round(Math.max(0, Math.min(1, progress)) * 100));
  };
  ffmpeg.on('progress', handler);

  try {
    const buf = new Uint8Array(await webm.arrayBuffer());
    await ffmpeg.writeFile('rec.webm', buf);

    const crf = CRF_MAP[quality] ?? '18';

    await ffmpeg.exec([
      '-i', 'rec.webm',
      '-c:v', 'libx264', '-crf', crf, '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      '-y', 'rec.mp4',
    ]);

    const data = await ffmpeg.readFile('rec.mp4');
    return new Blob([data], { type: 'video/mp4' });
  } finally {
    ffmpeg.off('progress', handler);
    try { await ffmpeg.deleteFile('rec.webm'); } catch { /* */ }
    try { await ffmpeg.deleteFile('rec.mp4'); } catch { /* */ }
  }
}
