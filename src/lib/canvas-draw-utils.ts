import { computeTransitionPair, getTransitionProgress } from './transition-effects';
import type { TimelineClip, TimelineTrack, ClipTransition } from '../types/editor';
import type { MediaFile } from '../types/editor';

export interface TransitionStyle {
  opacity?: number;
  transform?: string;
  clipPath?: string;
  filter?: string;
}

export async function loadVideo(blobUrl: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.src = blobUrl;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.oncanplaythrough = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video'));
    video.load();
  });

  return video;
}

export function drawVideo(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  video: DrawSource,
  w: number,
  h: number,
  style?: TransitionStyle
) {
  ctx.save();
  if (style?.opacity !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, style.opacity));
  if (style?.filter) (ctx as CanvasRenderingContext2D).filter = style.filter;

  const isVideoFrame = video instanceof VideoFrame;
  const isBitmap = video instanceof ImageBitmap;
  const vw = isVideoFrame ? video.displayWidth : isBitmap ? video.width : (video.videoWidth || w);
  const vh = isVideoFrame ? video.displayHeight : isBitmap ? video.height : (video.videoHeight || h);
  const scale = Math.min(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;

  if (style?.transform && style.transform !== 'none') {
    const txM = style.transform.match(/translateX\(([-\d.]+)%\)/);
    const tyM = style.transform.match(/translateY\(([-\d.]+)%\)/);
    const sM = style.transform.match(/scale\(([-\d.]+)\)/);
    let tx = 0, ty = 0, s = 1;
    if (txM) tx = (parseFloat(txM[1]) / 100) * w;
    if (tyM) ty = (parseFloat(tyM[1]) / 100) * h;
    if (sM) s = parseFloat(sM[1]);
    ctx.translate(w / 2 + tx, h / 2 + ty);
    ctx.scale(s, s);
    ctx.translate(-w / 2, -h / 2);
  }

  if (style?.clipPath) {
    const m = style.clipPath.match(/inset\(([\d.]+)%?\s+([\d.]+)%?\s+([\d.]+)%?\s+([\d.]+)%?\)/);
    if (m) {
      const t = (parseFloat(m[1]) / 100) * h;
      const r = (parseFloat(m[2]) / 100) * w;
      const b = (parseFloat(m[3]) / 100) * h;
      const l = (parseFloat(m[4]) / 100) * w;
      ctx.beginPath();
      ctx.rect(l, t, w - l - r, h - t - b);
      ctx.clip();
    }
  }

  ctx.drawImage(video, dx, dy, dw, dh);
  ctx.restore();
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: DrawSource,
  clip: TimelineClip,
  currentTime: number,
  w: number,
  h: number,
) {
  const localTime = currentTime - clip.startTime;
  const clipDuration = clip.duration;
  const clipProgress = clipDuration > 0 ? Math.max(0, Math.min(1, localTime / clipDuration)) : 0;

  let baseOpacity = clip.properties.opacity ?? 1;
  const fadeIn = clip.properties.fadeInDuration ?? 0;
  const fadeOut = clip.properties.fadeOutDuration ?? 0;
  if (fadeIn > 0 && localTime < fadeIn) {
    baseOpacity *= Math.max(0, localTime / fadeIn);
  }
  if (fadeOut > 0 && localTime > clipDuration - fadeOut) {
    baseOpacity *= Math.max(0, (clipDuration - localTime) / fadeOut);
  }

  const posX = (clip.properties.x ?? 50) / 100;
  const posY = (clip.properties.y ?? 50) / 100;
  let scaleVal = clip.properties.scale ?? 1;
  const rotation = clip.properties.rotation ?? 0;

  const anim = clip.properties.overlayAnimation ?? 'none';
  if (anim === 'zoomIn') {
    scaleVal *= 1 + clipProgress * 0.15;
  }

  const isVideoFrame = source instanceof VideoFrame;
  const isBitmap = source instanceof ImageBitmap;
  const vw = isVideoFrame ? source.displayWidth : isBitmap ? source.width : ((source as HTMLVideoElement).videoWidth || w);
  const vh = isVideoFrame ? source.displayHeight : isBitmap ? source.height : ((source as HTMLVideoElement).videoHeight || h);

  const fitScale = Math.min(w / vw, h / vh);
  const dw = vw * fitScale;
  const dh = vh * fitScale;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, baseOpacity));
  ctx.translate(posX * w, posY * h);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scaleVal, scaleVal);
  ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

export function drawText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  clip: TimelineClip,
  currentTime: number,
  w: number,
  h: number
) {
  const text = clip.properties.text || '';
  if (!text) return;

  const fontSize = clip.properties.fontSize ?? 48;
  const fontColor = clip.properties.fontColor ?? '#ffffff';
  const fontFamily = clip.properties.fontFamily ?? "'Inter', sans-serif";
  const textAlign = (clip.properties.textAlign ?? 'center') as CanvasTextAlign;
  const posX = (clip.properties.x ?? 50) / 100;
  const posY = (clip.properties.y ?? 50) / 100;
  const scaleVal = (clip.properties.scale as number) ?? 1;
  const rotation = (clip.properties.rotation as number) ?? 0;
  const animation = clip.properties.textAnimation ?? 'fadeIn';
  const animDur = clip.properties.animationDuration ?? 0.5;

  const localTime = currentTime - clip.startTime;

  if (animation === 'karaoke') {
    drawKaraokeText(ctx, clip, localTime, w, h);
    return;
  }

  const progress = animDur > 0 ? Math.max(0, Math.min(1, localTime / animDur)) : 1;

  let opacity = 1, offX = 0, offY = 0, scale = scaleVal;
  switch (animation) {
    case 'fadeIn': opacity = progress; break;
    case 'slideUp': offY = (1 - progress) * 50; opacity = progress; break;
    case 'slideDown': offY = -(1 - progress) * 50; opacity = progress; break;
    case 'slideLeft': offX = (1 - progress) * 50; opacity = progress; break;
    case 'slideRight': offX = -(1 - progress) * 50; opacity = progress; break;
    case 'scaleUp': scale = scaleVal * (0.5 + progress * 0.5); opacity = progress; break;
    case 'pop':
      scale = scaleVal * (progress < 0.7
        ? 0.5 + (progress / 0.7) * 0.7
        : 1.2 - ((progress - 0.7) / 0.3) * 0.2);
      opacity = Math.min(1, progress * 2);
      break;
    case 'blurReveal': opacity = progress; break;
    default: break;
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(posX * w + offX, posY * h + offY);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scale, scale);

  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = fontColor;
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  const maxW = w * 0.85;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);

  let display = lines;
  if (animation === 'typewriter') {
    display = [text.substring(0, Math.floor(progress * text.length))];
  } else if (animation === 'wordByWord') {
    const all = text.split(/\s+/);
    display = [all.slice(0, Math.floor(progress * all.length)).join(' ')];
  }

  const lh = fontSize * 1.2;
  const totalH = display.length * lh;
  const startY = -totalH / 2 + lh / 2;
  const alignX = textAlign === 'left' ? -maxW / 2 : textAlign === 'right' ? maxW / 2 : 0;
  for (let i = 0; i < display.length; i++) {
    ctx.fillText(display[i], alignX, startY + i * lh);
  }
  ctx.restore();
}

function drawKaraokeText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  clip: TimelineClip,
  localTime: number,
  w: number,
  h: number,
) {
  const text = clip.properties.text || '';
  if (!text) return;

  const fontSize = clip.properties.fontSize ?? 48;
  const fontColor = clip.properties.fontColor ?? '#ffffff';
  const fontFamily = clip.properties.fontFamily ?? "'Inter', sans-serif";
  const posX = (clip.properties.x ?? 50) / 100;
  const posY = (clip.properties.y ?? 50) / 100;
  const scaleVal = (clip.properties.scale as number) ?? 1;
  const rotation = (clip.properties.rotation as number) ?? 0;
  const hlColor = clip.properties.highlightColor || '#d78241';

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  const enterDur = 0.12;
  const exitDur = 0.12;
  let containerOpacity = 1;
  if (localTime < enterDur) containerOpacity = Math.max(0, localTime / enterDur);
  const timeToEnd = clip.duration - localTime;
  if (timeToEnd < exitDur) containerOpacity = Math.max(0, timeToEnd / exitDur);

  const wordTimings = clip.properties.wordTimings;
  let activeWordIndex = 0;
  if (wordTimings && wordTimings.length === words.length) {
    for (let i = 0; i < wordTimings.length; i++) {
      if (localTime >= wordTimings[i].start) activeWordIndex = i;
    }
  } else {
    const wordDur = clip.duration / words.length;
    activeWordIndex = Math.min(Math.floor(localTime / wordDur), words.length - 1);
  }

  ctx.save();
  ctx.globalAlpha = containerOpacity;
  ctx.translate(posX * w, posY * h);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scaleVal, scaleVal);

  ctx.font = `800 ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'middle';

  const uppercaseWords = words.map((wd) => wd.toUpperCase());
  const gap = fontSize * 0.15;
  const padX = fontSize * 0.12;
  const maxW = w * 0.85;

  const wordWidths = uppercaseWords.map((wd) => ctx.measureText(wd).width + padX * 2);

  const rows: { indices: number[] }[] = [];
  let curRow: number[] = [];
  let rowW = 0;
  for (let i = 0; i < uppercaseWords.length; i++) {
    const testW = rowW + (curRow.length > 0 ? gap : 0) + wordWidths[i];
    if (testW > maxW && curRow.length > 0) {
      rows.push({ indices: curRow });
      curRow = [i];
      rowW = wordWidths[i];
    } else {
      curRow.push(i);
      rowW = testW;
    }
  }
  if (curRow.length > 0) rows.push({ indices: curRow });

  const lh = fontSize * 1.4;
  const totalH = rows.length * lh;
  const startY = -totalH / 2 + lh / 2;

  for (let r = 0; r < rows.length; r++) {
    const idxs = rows[r].indices;
    const totalRowW = idxs.reduce((s, i) => s + wordWidths[i], 0) + (idxs.length - 1) * gap;
    let wx = -totalRowW / 2;

    for (const idx of idxs) {
      const ww = wordWidths[idx];
      const isActive = idx === activeWordIndex;

      if (isActive) {
        ctx.save();
        ctx.globalAlpha = containerOpacity * 0.92;
        ctx.fillStyle = hlColor;
        const rx = wx;
        const ry = startY + r * lh - lh * 0.42;
        const rw = ww;
        const rh = lh * 0.84;
        const rad = fontSize * 0.15;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(rx, ry, rw, rh, rad);
        } else {
          ctx.rect(rx, ry, rw, rh);
        }
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = containerOpacity;
      }

      ctx.fillStyle = fontColor;
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.textAlign = 'left';
      ctx.font = `800 ${fontSize}px ${fontFamily}`;
      ctx.fillText(uppercaseWords[idx], wx + padX, startY + r * lh);

      wx += ww + gap;
    }
  }

  ctx.restore();
}

export type DrawSource = HTMLVideoElement | VideoFrame | ImageBitmap;

export interface VideoEntry {
  clip: TimelineClip;
  video: HTMLVideoElement;
  frame?: VideoFrame;
  bitmap?: ImageBitmap;
}

export function compositeFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  currentTime: number,
  width: number,
  height: number,
  tracks: TimelineTrack[],
  transitions: ClipTransition[],
  entries: VideoEntry[]
) {
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

      const src: DrawSource = entry.frame ?? entry.bitmap ?? entry.video;
      const trans = transitions.find((t) => t.toClipId === clip.id);
      if (trans && trans.type !== 'none') {
        const tp = getTransitionProgress(currentTime, clip.startTime, trans.duration);
        if (tp < 1) {
          const outEntry = entries.find((e) => e.clip.id === trans.fromClipId);
          if (outEntry) {
            const outSrc: DrawSource = outEntry.frame ?? outEntry.bitmap ?? outEntry.video;
            const pair = computeTransitionPair(trans.type, tp);
            drawVideo(ctx, outSrc, width, height, pair.outgoing);
            drawVideo(ctx, src, width, height, pair.incoming);
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

      drawVideo(ctx, src, width, height);
      drawnIds.add(clip.id);
    }
  }

  for (const track of tracks) {
    if (track.type !== 'overlay' || track.isMuted) continue;
    for (const clip of track.clips) {
      if (currentTime < clip.startTime || currentTime >= clip.startTime + clip.duration) continue;
      const entry = entries.find((e) => e.clip.id === clip.id);
      if (entry) {
        const overlaySrc: DrawSource = entry.frame ?? entry.bitmap ?? entry.video;
        drawOverlay(ctx, overlaySrc, clip, currentTime, width, height);
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
}

export async function loadClipEntries(
  tracks: TimelineTrack[],
  mediaFiles: MediaFile[]
): Promise<VideoEntry[]> {
  const entries: VideoEntry[] = [];
  for (const track of tracks) {
    if (track.type !== 'video' && track.type !== 'overlay') continue;
    if (track.isMuted) continue;
    for (const clip of track.clips) {
      if (!clip.mediaId) continue;
      const media = mediaFiles.find((m) => m.id === clip.mediaId);
      if (!media || media.type !== 'video') continue;
      const video = await loadVideo(media.blobUrl);
      entries.push({ clip, video });
    }
  }
  return entries;
}

export function cleanupEntries(entries: VideoEntry[]) {
  for (const e of entries) {
    if (e.bitmap) {
      try { e.bitmap.close(); } catch { /* already closed */ }
      e.bitmap = undefined;
    }
    e.video.pause();
    e.video.removeAttribute('src');
    e.video.load();
  }
}
