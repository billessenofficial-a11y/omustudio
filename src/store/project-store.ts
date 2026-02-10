import { create } from 'zustand';
import type { ProjectSettings, MediaFile, ExportSettings } from '../types/editor';
import { v4 as uuid } from 'uuid';
import { extractVideoMetadata, generateThumbnail } from '../lib/ffmpeg';

interface ProjectState {
  project: ProjectSettings;
  mediaFiles: MediaFile[];
  isExporting: boolean;
  exportProgress: number;
  exportSettings: ExportSettings;

  setProject: (settings: Partial<ProjectSettings>) => void;
  importMedia: (file: File) => Promise<MediaFile>;
  addMediaFromUrl: (name: string, url: string, duration: number) => MediaFile;
  removeMedia: (id: string) => void;
  getMediaById: (id: string) => MediaFile | undefined;
  setExporting: (exporting: boolean, progress?: number) => void;
  setExportSettings: (settings: Partial<ExportSettings>) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: {
    id: uuid(),
    name: 'Untitled Project',
    width: 1920,
    height: 1080,
    fps: 30,
  },
  mediaFiles: [],
  isExporting: false,
  exportProgress: 0,
  exportSettings: {
    width: 1920,
    height: 1080,
    quality: 'high',
    filename: 'export',
  },

  setProject: (settings) =>
    set((state) => ({
      project: { ...state.project, ...settings },
      exportSettings: {
        ...state.exportSettings,
        width: settings.width ?? state.exportSettings.width,
        height: settings.height ?? state.exportSettings.height,
      },
    })),

  importMedia: async (file: File) => {
    const id = uuid();
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    const isImage = file.type.startsWith('image/');

    let duration = 0;
    let width: number | undefined;
    let height: number | undefined;
    let thumbnailUrl = '';
    const blobUrl = URL.createObjectURL(file);

    if (isVideo) {
      const meta = await extractVideoMetadata(file);
      duration = meta.duration;
      width = meta.width;
      height = meta.height;
      thumbnailUrl = await generateThumbnail(file);

      const state = get();
      if (state.mediaFiles.length === 0) {
        set({
          project: {
            ...state.project,
            width: meta.width,
            height: meta.height,
          },
          exportSettings: {
            ...state.exportSettings,
            width: meta.width,
            height: meta.height,
          },
        });
      }
    } else if (isAudio) {
      duration = await new Promise<number>((resolve) => {
        const audio = new Audio(blobUrl);
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => resolve(0);
      });
    } else if (isImage) {
      duration = 5;
      const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 1920, height: 1080 });
        img.src = blobUrl;
      });
      width = dimensions.width;
      height = dimensions.height;
      thumbnailUrl = blobUrl;
    }

    const mediaFile: MediaFile = {
      id,
      file,
      name: file.name,
      type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
      duration,
      width,
      height,
      thumbnailUrl,
      blobUrl,
    };

    set((state) => ({ mediaFiles: [...state.mediaFiles, mediaFile] }));
    return mediaFile;
  },

  addMediaFromUrl: (name: string, url: string, duration: number) => {
    const id = uuid();
    const emptyFile = new File([], name, { type: 'audio/mpeg' });
    const mediaFile: MediaFile = {
      id,
      file: emptyFile,
      name,
      type: 'audio',
      duration,
      thumbnailUrl: '',
      blobUrl: url,
    };
    set((state) => ({ mediaFiles: [...state.mediaFiles, mediaFile] }));
    return mediaFile;
  },

  removeMedia: (id) =>
    set((state) => {
      const file = state.mediaFiles.find((f) => f.id === id);
      if (file) URL.revokeObjectURL(file.blobUrl);
      return { mediaFiles: state.mediaFiles.filter((f) => f.id !== id) };
    }),

  getMediaById: (id) => get().mediaFiles.find((f) => f.id === id),

  setExporting: (exporting, progress) =>
    set({ isExporting: exporting, exportProgress: progress ?? 0 }),

  setExportSettings: (settings) =>
    set((state) => ({
      exportSettings: { ...state.exportSettings, ...settings },
    })),
}));
