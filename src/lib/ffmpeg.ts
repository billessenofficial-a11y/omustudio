import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let loading = false;
let loadPromise: Promise<FFmpeg> | null = null;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loading = true;
  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    const coreURL = new URL(
      '/node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js',
      window.location.origin
    ).href;

    const wasmURL = new URL(
      '/node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',
      window.location.origin
    ).href;

    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    loading = false;
    return ffmpeg;
  })();

  return loadPromise;
}

export function isFFmpegLoading(): boolean {
  return loading;
}

export async function extractVideoMetadata(
  file: File
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      });
      URL.revokeObjectURL(video.src);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };

    video.src = URL.createObjectURL(file);
  });
}

export async function generateThumbnail(
  file: File,
  time = 0.5
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const blobUrl = URL.createObjectURL(file);
    video.src = blobUrl;

    video.onloadeddata = () => {
      const seekTime = Math.min(time, video.duration * 0.5);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      const scale = 160 / video.videoWidth;
      canvas.width = 160;
      canvas.height = video.videoHeight * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Canvas context unavailable'));
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
      URL.revokeObjectURL(blobUrl);
      resolve(thumbnailUrl);
    };

    video.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error('Failed to generate thumbnail'));
    };
  });
}

export interface TextOverlay {
  text: string;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  outputStart: number;
  outputEnd: number;
}

export interface ExportOptions {
  clips: Array<{
    file: File;
    trimStart: number;
    trimEnd: number;
    duration: number;
  }>;
  textOverlays?: TextOverlay[];
  width: number;
  height: number;
  quality: 'high' | 'medium' | 'low';
  totalDuration?: number;
  onProgress?: (progress: number) => void;
}

async function renderTextToPng(
  text: string,
  fontSize: number,
  fontColor: string,
  fontFamily: string,
  width: number,
  height: number
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);

  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = fontColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  const maxWidth = width * 0.9;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  if (lines.length === 0) lines.push('');

  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  const startY = (height - totalHeight) / 2 + lineHeight / 2;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], width / 2, startY + i * lineHeight);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      blob!.arrayBuffer().then((buf) => {
        resolve(new Uint8Array(buf));
      });
    }, 'image/png');
  });
}

export async function exportToMp4(options: ExportOptions): Promise<Blob> {
  const { clips, textOverlays = [], width, height, quality, totalDuration = 0, onProgress } = options;
  const ffmpeg = await getFFmpeg();
  const crf = quality === 'high' ? '18' : quality === 'medium' ? '23' : '28';

  ffmpeg.on('progress', ({ progress }) => {
    onProgress?.(Math.round(progress * 100));
  });

  const hasVideo = clips.length > 0;
  const hasText = textOverlays.length > 0;

  if (!hasVideo && !hasText) {
    throw new Error('Nothing to export');
  }

  if (hasVideo && !hasText) {
    return exportVideoOnly(ffmpeg, clips, width, height, crf);
  }

  for (let i = 0; i < textOverlays.length; i++) {
    const t = textOverlays[i];
    const pngData = await renderTextToPng(t.text, t.fontSize, t.fontColor, t.fontFamily, width, height);
    await ffmpeg.writeFile(`text${i}.png`, pngData);
  }

  const inputArgs: string[] = [];
  let videoInputCount = 0;

  if (hasVideo) {
    for (let i = 0; i < clips.length; i++) {
      await ffmpeg.writeFile(`input${i}.mp4`, await fetchFile(clips[i].file));
      inputArgs.push('-i', `input${i}.mp4`);
      videoInputCount++;
    }
  } else {
    const dur = totalDuration || 5;
    inputArgs.push('-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:d=${dur}:r=30`);
    videoInputCount = 1;
  }

  for (let i = 0; i < textOverlays.length; i++) {
    inputArgs.push('-i', `text${i}.png`);
  }

  const filterParts: string[] = [];
  let lastVideoLabel: string;
  let lastAudioLabel: string | null = null;

  if (hasVideo) {
    if (clips.length === 1) {
      const clip = clips[0];
      filterParts.push(
        `[0:v]trim=start=${clip.trimStart}:duration=${clip.duration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black[base]`
      );
      filterParts.push(
        `[0:a]atrim=start=${clip.trimStart}:duration=${clip.duration},asetpts=PTS-STARTPTS[outa]`
      );
      lastVideoLabel = 'base';
      lastAudioLabel = 'outa';
    } else {
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        filterParts.push(
          `[${i}:v]trim=start=${clip.trimStart}:duration=${clip.duration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black[v${i}]`
        );
        filterParts.push(
          `[${i}:a]atrim=start=${clip.trimStart}:duration=${clip.duration},asetpts=PTS-STARTPTS[a${i}]`
        );
      }
      const concatInputs = clips.map((_, i) => `[v${i}][a${i}]`).join('');
      filterParts.push(
        `${concatInputs}concat=n=${clips.length}:v=1:a=1[base][outa]`
      );
      lastVideoLabel = 'base';
      lastAudioLabel = 'outa';
    }
  } else {
    lastVideoLabel = '0:v';
  }

  for (let i = 0; i < textOverlays.length; i++) {
    const overlay = textOverlays[i];
    const inputIdx = videoInputCount + i;
    const outLabel = `ov${i}`;
    filterParts.push(
      `[${lastVideoLabel}][${inputIdx}:v]overlay=0:0:enable='between(t,${overlay.outputStart.toFixed(3)},${overlay.outputEnd.toFixed(3)})'[${outLabel}]`
    );
    lastVideoLabel = outLabel;
  }

  const args: string[] = [...inputArgs, '-filter_complex', filterParts.join(';')];
  args.push('-map', `[${lastVideoLabel}]`);
  if (lastAudioLabel) {
    args.push('-map', `[${lastAudioLabel}]`);
  }

  args.push('-c:v', 'libx264', '-crf', crf, '-preset', 'fast', '-pix_fmt', 'yuv420p');

  if (lastAudioLabel) {
    args.push('-c:a', 'aac', '-b:a', '128k');
  } else {
    args.push('-an');
  }

  args.push('-movflags', '+faststart', '-y', 'output.mp4');
  await ffmpeg.exec(args);

  const data = await ffmpeg.readFile('output.mp4');
  const blob = new Blob([data], { type: 'video/mp4' });

  await ffmpeg.deleteFile('output.mp4');
  for (let i = 0; i < clips.length; i++) {
    try { await ffmpeg.deleteFile(`input${i}.mp4`); } catch { /* ignore */ }
  }
  for (let i = 0; i < textOverlays.length; i++) {
    try { await ffmpeg.deleteFile(`text${i}.png`); } catch { /* ignore */ }
  }

  return blob;
}

async function exportVideoOnly(
  ffmpeg: FFmpeg,
  clips: ExportOptions['clips'],
  width: number,
  height: number,
  crf: string
): Promise<Blob> {
  if (clips.length === 1) {
    const clip = clips[0];
    await ffmpeg.writeFile('input0.mp4', await fetchFile(clip.file));

    await ffmpeg.exec([
      '-i', 'input0.mp4',
      '-ss', String(clip.trimStart),
      '-t', String(clip.duration),
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
      '-c:v', 'libx264', '-crf', crf, '-preset', 'fast',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', 'output.mp4',
    ]);
  } else {
    const inputArgs: string[] = [];
    const filterParts: string[] = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      await ffmpeg.writeFile(`input${i}.mp4`, await fetchFile(clip.file));
      inputArgs.push('-i', `input${i}.mp4`);
      filterParts.push(
        `[${i}:v]trim=start=${clip.trimStart}:duration=${clip.duration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black[v${i}];` +
        `[${i}:a]atrim=start=${clip.trimStart}:duration=${clip.duration},asetpts=PTS-STARTPTS[a${i}];`
      );
    }

    const concatInputs = clips.map((_, i) => `[v${i}][a${i}]`).join('');
    const filterComplex =
      filterParts.join('') +
      `${concatInputs}concat=n=${clips.length}:v=1:a=1[outv][outa]`;

    await ffmpeg.exec([
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[outv]', '-map', '[outa]',
      '-c:v', 'libx264', '-crf', crf, '-preset', 'fast',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', 'output.mp4',
    ]);
  }

  const data = await ffmpeg.readFile('output.mp4');
  const blob = new Blob([data], { type: 'video/mp4' });

  await ffmpeg.deleteFile('output.mp4');
  for (let i = 0; i < clips.length; i++) {
    try { await ffmpeg.deleteFile(`input${i}.mp4`); } catch { /* ignore */ }
  }

  return blob;
}
