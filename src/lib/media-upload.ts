import { supabase } from './supabase';
import { v4 as uuid } from 'uuid';
import type { MediaFile, TimelineTrack } from '../types/editor';

export interface UploadProgress {
  phase: 'uploading';
  current: number;
  total: number;
  filename: string;
}

export async function uploadMediaForRender(
  mediaFiles: MediaFile[],
  tracks: TimelineTrack[],
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ sessionId: string; urlMap: Record<string, string> }> {
  const referencedMediaIds = new Set<string>();
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.mediaId) referencedMediaIds.add(clip.mediaId);
    }
  }

  const filesToUpload = mediaFiles.filter((m) => referencedMediaIds.has(m.id));

  if (filesToUpload.length === 0) {
    return { sessionId: '', urlMap: {} };
  }

  const sessionId = uuid();
  const urlMap: Record<string, string> = {};

  for (let i = 0; i < filesToUpload.length; i++) {
    const media = filesToUpload[i];
    const path = `${sessionId}/${media.id}/${media.name}`;

    onProgress?.({
      phase: 'uploading',
      current: i + 1,
      total: filesToUpload.length,
      filename: media.name,
    });

    const { error } = await supabase.storage
      .from('render-media')
      .upload(path, media.file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload ${media.name}: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('render-media')
      .getPublicUrl(path);

    urlMap[media.id] = urlData.publicUrl;
  }

  return { sessionId, urlMap };
}

export async function cleanupRenderMedia(sessionId: string): Promise<void> {
  if (!sessionId) return;

  const { data: files } = await supabase.storage
    .from('render-media')
    .list(sessionId, { limit: 1000 });

  if (!files || files.length === 0) return;

  const allPaths: string[] = [];

  for (const folder of files) {
    const { data: subFiles } = await supabase.storage
      .from('render-media')
      .list(`${sessionId}/${folder.name}`, { limit: 100 });

    if (subFiles) {
      for (const f of subFiles) {
        allPaths.push(`${sessionId}/${folder.name}/${f.name}`);
      }
    }
  }

  if (allPaths.length > 0) {
    await supabase.storage.from('render-media').remove(allPaths);
  }
}
