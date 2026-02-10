import { supabase } from './supabase';
import { uploadMediaForRender, cleanupRenderMedia, type UploadProgress } from './media-upload';
import { prepareCompositionProps } from './lambda-export';
import type { MediaFile, TimelineTrack, ClipTransition, ProjectSettings, ExportSettings } from '../types/editor';

export type CloudRenderPhase = 'uploading' | 'starting' | 'rendering' | 'complete' | 'failed';

export interface CloudRenderStatus {
  phase: CloudRenderPhase;
  progress: number;
  message: string;
  outputUrl?: string;
  error?: string;
}

interface CloudRenderOptions {
  project: ProjectSettings;
  exportSettings: ExportSettings;
  mediaFiles: MediaFile[];
  tracks: TimelineTrack[];
  transitions: ClipTransition[];
  totalDuration: number;
  onStatus: (status: CloudRenderStatus) => void;
  signal?: AbortSignal;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function callEdgeFunction(action: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const url = `${SUPABASE_URL}/functions/v1/render-video`;

  const timeoutMs = action === 'start' ? 120_000 : 60_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...params }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error('Cloud render request timed out. The render-video edge function may not be deployed or is not responding.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  let data: Record<string, unknown>;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Edge function returned invalid response (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(data.error as string || `Edge function error (${response.status})`);
  }

  return data;
}

export async function startCloudRender(options: CloudRenderOptions): Promise<string | null> {
  const {
    project, exportSettings, mediaFiles, tracks,
    transitions, totalDuration, onStatus, signal,
  } = options;

  let sessionId = '';
  let jobId = '';

  try {
    const { data: job } = await supabase
      .from('render_jobs')
      .insert({
        project_id: project.id,
        status: 'uploading',
        progress: 0,
      })
      .select('id')
      .maybeSingle();

    jobId = job?.id || '';

    onStatus({ phase: 'uploading', progress: 0, message: 'Preparing media files...' });

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const { sessionId: sid, urlMap } = await uploadMediaForRender(
      mediaFiles,
      tracks,
      (p: UploadProgress) => {
        const pct = Math.round((p.current / p.total) * 100);
        onStatus({
          phase: 'uploading',
          progress: pct,
          message: `Uploading ${p.current} of ${p.total}: ${p.filename}`,
        });
      },
    );
    sessionId = sid;

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    onStatus({ phase: 'starting', progress: 0, message: 'Starting cloud render...' });

    if (jobId) {
      await supabase
        .from('render_jobs')
        .update({ status: 'rendering', progress: 0 })
        .eq('id', jobId);
    }

    const compositionProps = prepareCompositionProps({
      tracks,
      transitions,
      fps: project.fps,
      urlMap,
    });

    const durationInFrames = Math.max(Math.round(totalDuration * project.fps), 1);

    const startResult = await callEdgeFunction('start', {
      compositionProps,
      width: exportSettings.width,
      height: exportSettings.height,
      fps: project.fps,
      durationInFrames,
    }, signal) as { renderId: string; bucketName: string };

    if (!startResult.renderId) {
      throw new Error('Failed to start render: no render ID returned');
    }

    if (jobId) {
      await supabase
        .from('render_jobs')
        .update({
          render_id: startResult.renderId,
          bucket_name: startResult.bucketName,
          status: 'rendering',
        })
        .eq('id', jobId);
    }

    onStatus({ phase: 'rendering', progress: 0, message: 'Rendering on cloud...' });

    let outputUrl: string | null = null;

    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      await new Promise((r) => setTimeout(r, 2000));

      const progressResult = await callEdgeFunction('progress', {
        renderId: startResult.renderId,
        bucketName: startResult.bucketName,
      }, signal) as {
        progress: number;
        done: boolean;
        outputUrl: string | null;
        fatalErrorEncountered: boolean;
        errors: unknown[];
      };

      if (progressResult.fatalErrorEncountered) {
        const errors = progressResult.errors ?? [];
        const errMsg = errors
          .map((e: unknown) => {
            if (typeof e === 'string') return e;
            if (e && typeof e === 'object') {
              const obj = e as Record<string, unknown>;
              return obj.message || obj.name || JSON.stringify(e);
            }
            return String(e);
          })
          .join('; ') || 'Render failed on cloud';
        throw new Error(errMsg);
      }

      if (progressResult.done && progressResult.outputUrl) {
        outputUrl = progressResult.outputUrl;

        if (jobId) {
          await supabase
            .from('render_jobs')
            .update({
              status: 'completed',
              progress: 100,
              output_url: outputUrl,
            })
            .eq('id', jobId);
        }

        onStatus({
          phase: 'complete',
          progress: 100,
          message: 'Render complete!',
          outputUrl,
        });

        break;
      }

      onStatus({
        phase: 'rendering',
        progress: progressResult.progress,
        message: `Rendering on cloud... ${progressResult.progress}%`,
      });

      if (jobId) {
        await supabase
          .from('render_jobs')
          .update({ progress: progressResult.progress })
          .eq('id', jobId);
      }
    }

    cleanupRenderMedia(sessionId).catch(() => {});

    return outputUrl;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      cleanupRenderMedia(sessionId).catch(() => {});
      throw err;
    }

    const errorMessage = err instanceof Error ? err.message : 'Cloud render failed';

    if (jobId) {
      await supabase
        .from('render_jobs')
        .update({ status: 'failed', error: errorMessage })
        .eq('id', jobId)
        .then(() => {});
    }

    onStatus({
      phase: 'failed',
      progress: 0,
      message: errorMessage,
      error: errorMessage,
    });

    cleanupRenderMedia(sessionId).catch(() => {});

    throw err;
  }
}
