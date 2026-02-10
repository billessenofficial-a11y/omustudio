// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — mp4box has no type declarations
import MP4Box from 'mp4box/dist/mp4box.all.js';

interface MP4Sample {
  cts: number;
  duration: number;
  is_sync: boolean;
  data: ArrayBuffer;
}

interface MP4Track {
  id: number;
  codec: string;
  timescale: number;
  duration: number;
  nb_samples: number;
  track_width: number;
  track_height: number;
}

export class VideoFrameDecoder {
  private mp4File: ReturnType<typeof MP4Box.createFile> | null = null;
  private decoder: VideoDecoder | null = null;
  private samples: MP4Sample[] = [];
  private nativeFps = 30;
  private videoTrack: MP4Track | null = null;
  private resolveFrame: ((frame: VideoFrame) => void) | null = null;
  private rejectFrame: ((err: Error) => void) | null = null;
  private targetTimestamp = -1;
  private lastDecodedTimestamp = -1;
  private ready = false;
  private initPromise: Promise<void>;
  private frameCache = new Map<number, VideoFrame>();
  private cacheOrder: number[] = [];
  private readonly MAX_CACHE = 5;

  constructor(private blobUrl: string) {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    const response = await fetch(this.blobUrl);
    const arrayBuffer = await response.arrayBuffer();
    (arrayBuffer as ArrayBuffer & { fileStart: number }).fileStart = 0;

    this.mp4File = MP4Box.createFile();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const infoReady = new Promise<any>((resolve) => {
      this.mp4File!.onReady = resolve;
    });

    this.mp4File.appendBuffer(arrayBuffer);
    this.mp4File.flush();

    const info = await infoReady;
    const vTrack = info.videoTracks[0];
    if (!vTrack) throw new Error('No video track found');
    this.videoTrack = vTrack;

    const timescale = vTrack.timescale;
    const sampleCount = vTrack.nb_samples;
    const durationSeconds = vTrack.duration / timescale;
    this.nativeFps = sampleCount / durationSeconds;

    this.decoder = new VideoDecoder({
      output: (frame: VideoFrame) => this.onFrame(frame),
      error: (err: DOMException) => {
        console.error('VideoDecoder error:', err);
        if (this.rejectFrame) {
          this.rejectFrame(new Error(`VideoDecoder error: ${err.message}`));
          this.rejectFrame = null;
          this.resolveFrame = null;
        }
      },
    });

    this.decoder.configure({
      codec: vTrack.codec,
      codedWidth: vTrack.track_width,
      codedHeight: vTrack.track_height,
      description: this.getDescription(vTrack),
    });

    this.mp4File.onSamples = (_trackId: number, _user: unknown, samples: MP4Sample[]) => {
      this.samples.push(...samples);
    };

    this.mp4File.setExtractionOptions(vTrack.id, null, { nbSamples: Infinity });
    this.mp4File.start();
    this.mp4File.flush();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    this.samples.sort((a, b) => a.cts - b.cts);
    this.ready = true;
  }

  private getDescription(track: MP4Track): Uint8Array | undefined {
    const trak = this.mp4File!.getTrackById(track.id);
    if (!trak) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stsd = (trak as any)?.mdia?.minf?.stbl?.stsd;
    if (!stsd?.entries?.length) return undefined;

    const entry = stsd.entries[0];
    const codecBox = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (!codecBox) return undefined;

    const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
    codecBox.write(stream);
    return new Uint8Array(stream.buffer, 8);
  }

  private onFrame(frame: VideoFrame): void {
    const ts = frame.timestamp;

    if (this.resolveFrame && Math.abs(ts - this.targetTimestamp) < 1000) {
      this.resolveFrame(frame);
      this.resolveFrame = null;
      this.targetTimestamp = -1;
      return;
    }

    if (this.resolveFrame && ts < this.targetTimestamp) {
      frame.close();
      return;
    }

    if (this.resolveFrame) {
      this.resolveFrame(frame);
      this.resolveFrame = null;
      this.targetTimestamp = -1;
      return;
    }

    frame.close();
  }

  async waitReady(): Promise<void> {
    await this.initPromise;
  }

  getNativeFps(): number {
    return this.nativeFps;
  }

  private static readonly FRAME_TIMEOUT_MS = 5000;

  async getFrameAtTime(seconds: number): Promise<VideoFrame> {
    await this.initPromise;
    if (!this.ready || !this.decoder || this.samples.length === 0) {
      throw new Error('Decoder not ready');
    }

    if (this.decoder.state === 'closed') {
      throw new Error('Decoder closed');
    }

    const timescale = this.videoTrack!.timescale;
    const targetCts = Math.round(seconds * timescale);

    const cachedKey = this.findCacheKey(targetCts, timescale);
    if (cachedKey !== -1) {
      const cached = this.frameCache.get(cachedKey)!;
      return cached.clone();
    }

    let targetIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const dist = Math.abs(this.samples[i].cts - targetCts);
      if (dist < minDist) {
        minDist = dist;
        targetIdx = i;
      }
    }

    const targetSample = this.samples[targetIdx];
    const targetTs = (targetSample.cts / timescale) * 1_000_000;

    let startIdx = targetIdx;
    for (let i = targetIdx; i >= 0; i--) {
      if (this.samples[i].is_sync) {
        startIdx = i;
        break;
      }
    }

    const needsSeek = this.lastDecodedTimestamp < 0 ||
      targetTs < this.lastDecodedTimestamp ||
      targetTs - this.lastDecodedTimestamp > 2_000_000;

    if (needsSeek) {
      await this.decoder.flush();
    } else {
      startIdx = targetIdx;
    }

    this.targetTimestamp = targetTs;

    const framePromise = new Promise<VideoFrame>((resolve, reject) => {
      this.resolveFrame = resolve;
      this.rejectFrame = reject;
    });

    for (let i = startIdx; i <= targetIdx; i++) {
      const sample = this.samples[i];
      const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: (sample.cts / timescale) * 1_000_000,
        duration: (sample.duration / timescale) * 1_000_000,
        data: sample.data,
      });
      this.decoder!.decode(chunk);
    }

    this.decoder!.flush().catch((err: unknown) => {
      if (this.rejectFrame) {
        this.rejectFrame(err instanceof Error ? err : new Error('Flush failed'));
        this.rejectFrame = null;
        this.resolveFrame = null;
      }
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Frame decode timeout')), VideoFrameDecoder.FRAME_TIMEOUT_MS);
    });

    const frame = await Promise.race([framePromise, timeoutPromise]);

    this.lastDecodedTimestamp = targetTs;
    this.addToCache(targetCts, frame);

    return frame.clone();
  }

  private findCacheKey(targetCts: number, timescale: number): number {
    const tolerance = timescale / (this.nativeFps * 2);
    for (const key of this.cacheOrder) {
      if (Math.abs(key - targetCts) < tolerance) return key;
    }
    return -1;
  }

  private addToCache(key: number, frame: VideoFrame): void {
    if (this.frameCache.has(key)) return;

    if (this.cacheOrder.length >= this.MAX_CACHE) {
      const evictKey = this.cacheOrder.shift()!;
      const evicted = this.frameCache.get(evictKey);
      if (evicted) {
        try { evicted.close(); } catch { /* already closed */ }
      }
      this.frameCache.delete(evictKey);
    }

    this.frameCache.set(key, frame);
    this.cacheOrder.push(key);
  }

  dispose(): void {
    for (const frame of this.frameCache.values()) {
      try { frame.close(); } catch { /* already closed */ }
    }
    this.frameCache.clear();
    this.cacheOrder = [];

    if (this.decoder && this.decoder.state !== 'closed') {
      try { this.decoder.close(); } catch { /* ignore */ }
    }

    this.mp4File = null;
    this.decoder = null;
    this.samples = [];
    this.ready = false;
  }
}
