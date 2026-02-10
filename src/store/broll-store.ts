import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { BRollSuggestion, BRollModel } from '../types/editor';
import { analyzeForBRoll, generateBRollVideo, generateBRollImage } from '../lib/gemini-service';
import { useProjectStore } from './project-store';
import { useTimelineStore } from './timeline-store';
import { useUIStore } from './ui-store';
import { supabase } from '../lib/supabase';

const MAX_CONCURRENT_GENERATIONS_VIDEO = 2;

interface BRollState {
  suggestions: BRollSuggestion[];
  isAnalyzing: boolean;
  generatingIds: Set<string>;
  error: string | null;
  selectedModel: BRollModel;

  setSelectedModel: (model: BRollModel) => void;
  analyzeTimeline: () => Promise<void>;
  generateMoreSuggestions: () => Promise<void>;
  updatePrompt: (id: string, newPrompt: string) => void;
  generateVideo: (id: string) => Promise<void>;
  generateAll: () => void;
  dismissSuggestion: (id: string) => void;
  clearAll: () => void;
}

export const useBRollStore = create<BRollState>((set, get) => ({
  suggestions: [],
  isAnalyzing: false,
  generatingIds: new Set(),
  error: null,
  selectedModel: 'veo-3.1-fast',

  setSelectedModel: (model) => set({ selectedModel: model }),

  analyzeTimeline: async () => {
    const { addToast } = useUIStore.getState();
    const timelineState = useTimelineStore.getState();
    const projectState = useProjectStore.getState();

    const mainTrack = timelineState.tracks.find((t) => t.role === 'main');
    if (!mainTrack || mainTrack.clips.length === 0) {
      addToast('No video on the main track to analyze', 'warning');
      return;
    }

    const firstVideoClip = mainTrack.clips.find((c) => c.mediaId);
    if (!firstVideoClip) {
      addToast('No media found on the main track', 'warning');
      return;
    }

    const media = projectState.getMediaById(firstVideoClip.mediaId!);
    if (!media || !media.file) {
      addToast('Cannot access the video file', 'error');
      return;
    }

    set({ isAnalyzing: true, error: null });

    try {
      const clipTimestamps = mainTrack.clips.map((c) => ({
        start: c.startTime,
        end: c.startTime + c.duration,
        name: c.name,
      }));

      const rawSuggestions = await analyzeForBRoll(media.file, {
        projectWidth: projectState.project.width,
        projectHeight: projectState.project.height,
        clipTimestamps,
      });

      const overlayTrackId = useTimelineStore.getState().ensureTrack('overlay');

      const suggestions: BRollSuggestion[] = rawSuggestions.map((s) => {
        const id = uuid();

        const clipId = useTimelineStore.getState().addClip(overlayTrackId, {
          type: 'video',
          name: `AI: ${s.prompt.slice(0, 40)}...`,
          startTime: s.timestampStart,
          duration: s.duration,
          trimStart: 0,
          trimEnd: 0,
          properties: { opacity: 1, overlayAnimation: 'zoomIn', fadeInDuration: 0.3, fadeOutDuration: 0.3 },
        });

        return {
          id,
          projectId: projectState.project.id,
          timestampStart: s.timestampStart,
          duration: s.duration,
          prompt: s.prompt,
          rationale: s.rationale,
          status: 'suggested' as const,
          videoUrl: null,
          clipId,
        };
      });

      for (const s of suggestions) {
        await supabase.from('broll_suggestions').insert({
          id: s.id,
          project_id: s.projectId,
          timestamp_start: s.timestampStart,
          duration: s.duration,
          prompt: s.prompt,
          rationale: s.rationale,
          status: s.status,
          clip_id: s.clipId,
        });
      }

      set({ suggestions, isAnalyzing: false });
      addToast(`Found ${suggestions.length} b-roll opportunities`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      set({ isAnalyzing: false, error: message });
      addToast(`Analysis failed: ${message}`, 'error');
    }
  },

  generateMoreSuggestions: async () => {
    const { addToast } = useUIStore.getState();
    const timelineState = useTimelineStore.getState();
    const projectState = useProjectStore.getState();

    const mainTrack = timelineState.tracks.find((t) => t.role === 'main');
    if (!mainTrack || mainTrack.clips.length === 0) {
      addToast('No video on the main track to analyze', 'warning');
      return;
    }

    const firstVideoClip = mainTrack.clips.find((c) => c.mediaId);
    if (!firstVideoClip) {
      addToast('No media found on the main track', 'warning');
      return;
    }

    const media = projectState.getMediaById(firstVideoClip.mediaId!);
    if (!media || !media.file) {
      addToast('Cannot access the video file', 'error');
      return;
    }

    const currentSuggestions = get().suggestions;

    set({ isAnalyzing: true, error: null });

    try {
      const clipTimestamps = mainTrack.clips.map((c) => ({
        start: c.startTime,
        end: c.startTime + c.duration,
        name: c.name,
      }));

      const existingSuggestions = currentSuggestions.map((s) => ({
        timestampStart: s.timestampStart,
        duration: s.duration,
        prompt: s.prompt,
      }));

      const rawSuggestions = await analyzeForBRoll(media.file, {
        projectWidth: projectState.project.width,
        projectHeight: projectState.project.height,
        clipTimestamps,
        existingSuggestions,
      });

      const overlayTrackId = useTimelineStore.getState().ensureTrack('overlay');

      const newSuggestions: BRollSuggestion[] = rawSuggestions.map((s) => {
        const id = uuid();

        const clipId = useTimelineStore.getState().addClip(overlayTrackId, {
          type: 'video',
          name: `AI: ${s.prompt.slice(0, 40)}...`,
          startTime: s.timestampStart,
          duration: s.duration,
          trimStart: 0,
          trimEnd: 0,
          properties: { opacity: 1, overlayAnimation: 'zoomIn', fadeInDuration: 0.3, fadeOutDuration: 0.3 },
        });

        return {
          id,
          projectId: projectState.project.id,
          timestampStart: s.timestampStart,
          duration: s.duration,
          prompt: s.prompt,
          rationale: s.rationale,
          status: 'suggested' as const,
          videoUrl: null,
          clipId,
        };
      });

      for (const s of newSuggestions) {
        await supabase.from('broll_suggestions').insert({
          id: s.id,
          project_id: s.projectId,
          timestamp_start: s.timestampStart,
          duration: s.duration,
          prompt: s.prompt,
          rationale: s.rationale,
          status: s.status,
          clip_id: s.clipId,
        });
      }

      set((state) => ({
        suggestions: [...state.suggestions, ...newSuggestions],
        isAnalyzing: false,
      }));

      addToast(`Found ${newSuggestions.length} additional b-roll opportunities`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      set({ isAnalyzing: false, error: message });
      addToast(`Analysis failed: ${message}`, 'error');
    }
  },

  updatePrompt: (id, newPrompt) => {
    set((state) => ({
      suggestions: state.suggestions.map((s) =>
        s.id === id ? { ...s, prompt: newPrompt } : s,
      ),
    }));

    supabase
      .from('broll_suggestions')
      .update({ prompt: newPrompt })
      .eq('id', id)
      .then();
  },

  generateVideo: async (id) => {
    const state = get();
    const suggestion = state.suggestions.find((s) => s.id === id);
    if (!suggestion) return;

    const model = get().selectedModel;
    if (model !== 'gemini-3-pro-image' && state.generatingIds.size >= MAX_CONCURRENT_GENERATIONS_VIDEO) {
      useUIStore.getState().addToast('Max 2 concurrent video generations. Please wait.', 'warning');
      return;
    }

    set((s) => {
      const newIds = new Set(s.generatingIds);
      newIds.add(id);
      return {
        generatingIds: newIds,
        suggestions: s.suggestions.map((sg) =>
          sg.id === id ? { ...sg, status: 'generating' as const } : sg,
        ),
      };
    });

    await supabase
      .from('broll_suggestions')
      .update({ status: 'generating' })
      .eq('id', id);

    try {
      const { project } = useProjectStore.getState();
      const ratio = project.width > project.height ? '16:9' : '9:16';

      let mediaFile;

      if (model === 'gemini-3-pro-image') {
        const dataUrl = await generateBRollImage(suggestion.prompt, ratio);
        const imgRes = await fetch(dataUrl);
        const blob = await imgRes.blob();
        const file = new File([blob], `broll-${id.slice(0, 8)}.png`, { type: blob.type });
        mediaFile = await useProjectStore.getState().importMedia(file);
      } else {
        const videoUrl = await generateBRollVideo(suggestion.prompt, ratio);
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const file = new File([blob], `broll-${id.slice(0, 8)}.mp4`, { type: 'video/mp4' });
        mediaFile = await useProjectStore.getState().importMedia(file);
      }

      if (suggestion.clipId) {
        useTimelineStore.getState().updateClip(suggestion.clipId, {
          mediaId: mediaFile.id,
          name: mediaFile.name,
        });
      }

      const resultUrl = mediaFile.blobUrl;

      set((s) => {
        const newIds = new Set(s.generatingIds);
        newIds.delete(id);
        return {
          generatingIds: newIds,
          suggestions: s.suggestions.map((sg) =>
            sg.id === id
              ? { ...sg, status: 'generated' as const, videoUrl: resultUrl }
              : sg,
          ),
        };
      });

      await supabase
        .from('broll_suggestions')
        .update({ status: 'generated', video_url: resultUrl })
        .eq('id', id);

      useUIStore.getState().addToast('B-roll video generated', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';

      set((s) => {
        const newIds = new Set(s.generatingIds);
        newIds.delete(id);
        return {
          generatingIds: newIds,
          suggestions: s.suggestions.map((sg) =>
            sg.id === id ? { ...sg, status: 'failed' as const } : sg,
          ),
        };
      });

      await supabase
        .from('broll_suggestions')
        .update({ status: 'failed' })
        .eq('id', id);

      useUIStore.getState().addToast(`Generation failed: ${message}`, 'error');
    }
  },

  generateAll: () => {
    const { suggestions } = get();
    const pending = suggestions.filter((s) => s.status === 'suggested' || s.status === 'failed');
    if (pending.length === 0) {
      useUIStore.getState().addToast('No suggestions to generate', 'info');
      return;
    }
    for (const s of pending) {
      get().generateVideo(s.id);
    }
  },

  dismissSuggestion: (id) => {
    const suggestion = get().suggestions.find((s) => s.id === id);

    if (suggestion?.clipId) {
      useTimelineStore.getState().removeClip(suggestion.clipId);
    }

    set((state) => ({
      suggestions: state.suggestions.filter((s) => s.id !== id),
    }));

    supabase.from('broll_suggestions').delete().eq('id', id).then();
  },

  clearAll: () => {
    const { suggestions } = get();

    for (const s of suggestions) {
      if (s.clipId) {
        useTimelineStore.getState().removeClip(s.clipId);
      }
    }

    const projectId = useProjectStore.getState().project.id;

    set({ suggestions: [], error: null });

    supabase
      .from('broll_suggestions')
      .delete()
      .eq('project_id', projectId)
      .then();
  },
}));
