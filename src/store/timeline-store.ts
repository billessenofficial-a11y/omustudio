import { create } from 'zustand';
import type { TimelineTrack, TimelineClip, ClipTransition, TransitionType, Tool, TrackRole } from '../types/editor';
import { v4 as uuid } from 'uuid';

const DEFAULT_TRACK_TEXT_ID = 'track-text';
const DEFAULT_TRACK_MAIN_ID = 'track-main';
const DEFAULT_TRACK_OVERLAY_ID = 'track-overlay';
const DEFAULT_TRACK_AUDIO_ID = 'track-audio';

const ROLE_ORDER: Record<TrackRole, number> = {
  text: 0,
  overlay: 1,
  main: 2,
  audio: 3,
};

function sortTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  return [...tracks]
    .sort((a, b) => {
      const orderA = a.role ? ROLE_ORDER[a.role] : 1.5;
      const orderB = b.role ? ROLE_ORDER[b.role] : 1.5;
      return orderA - orderB;
    })
    .map((t, i) => ({ ...t, order: i }));
}

const TRACK_CONFIGS: Record<TrackRole, { id: string; type: TimelineTrack['type']; name: string }> = {
  main: { id: DEFAULT_TRACK_MAIN_ID, type: 'video', name: 'Main Video' },
  overlay: { id: DEFAULT_TRACK_OVERLAY_ID, type: 'overlay', name: 'Overlay' },
  text: { id: DEFAULT_TRACK_TEXT_ID, type: 'text', name: 'Text' },
  audio: { id: DEFAULT_TRACK_AUDIO_ID, type: 'audio', name: 'Audio' },
};

const MAX_HISTORY = 50;

interface HistorySnapshot {
  tracks: TimelineTrack[];
  transitions: ClipTransition[];
}

interface TimelineState {
  tracks: TimelineTrack[];
  transitions: ClipTransition[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  selectedClipIds: string[];
  selectedTransitionId: string | null;
  selectedTrackId: string | null;
  zoom: number;
  scrollX: number;
  activeTool: Tool;
  _past: HistorySnapshot[];
  _future: HistorySnapshot[];

  pushUndo: () => void;
  undo: () => void;
  redo: () => void;
  addTrack: (type: 'video' | 'audio' | 'text' | 'overlay', name?: string) => string;
  getTrackByRole: (role: TrackRole) => TimelineTrack | undefined;
  removeTrack: (id: string) => void;
  addClip: (trackId: string, clip: Omit<TimelineClip, 'id' | 'trackId'>) => string;
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
  removeClip: (clipId: string) => void;
  splitClip: (clipId: string, time: number) => void;
  selectClip: (clipId: string | null) => void;
  selectClips: (clipIds: string[]) => void;
  selectTransition: (transitionId: string | null) => void;
  selectTrack: (trackId: string | null) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  setScrollX: (x: number) => void;
  setActiveTool: (tool: Tool) => void;
  getClipById: (id: string) => TimelineClip | undefined;
  getTrackById: (id: string) => TimelineTrack | undefined;
  recalcDuration: () => void;
  toggleTrackMute: (trackId: string) => void;
  addTransition: (trackId: string, fromClipId: string, toClipId: string, type: TransitionType, duration?: number) => string;
  updateTransition: (id: string, updates: Partial<Pick<ClipTransition, 'type' | 'duration'>>) => void;
  removeTransition: (id: string) => void;
  ensureTrack: (role: TrackRole) => string;
  moveClipToTrack: (clipId: string, targetTrackId: string) => void;
  getTransitionBetween: (fromClipId: string, toClipId: string) => ClipTransition | undefined;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  tracks: [],
  transitions: [],
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  selectedClipId: null,
  selectedClipIds: [],
  selectedTransitionId: null,
  selectedTrackId: null,
  zoom: 100,
  scrollX: 0,
  activeTool: 'select',
  _past: [],
  _future: [],

  pushUndo: () => {
    const { tracks, transitions, _past } = get();
    const snapshot: HistorySnapshot = { tracks, transitions };
    set({ _past: [..._past.slice(-MAX_HISTORY + 1), snapshot], _future: [] });
  },

  undo: () => {
    const { tracks, transitions, _past, _future } = get();
    if (_past.length === 0) return;
    const prev = _past[_past.length - 1];
    set({
      tracks: prev.tracks,
      transitions: prev.transitions,
      _past: _past.slice(0, -1),
      _future: [..._future, { tracks, transitions }],
    });
    get().recalcDuration();
  },

  redo: () => {
    const { tracks, transitions, _past, _future } = get();
    if (_future.length === 0) return;
    const next = _future[_future.length - 1];
    set({
      tracks: next.tracks,
      transitions: next.transitions,
      _past: [..._past, { tracks, transitions }],
      _future: _future.slice(0, -1),
    });
    get().recalcDuration();
  },

  addTrack: (type, name) => {
    get().pushUndo();
    const id = uuid();
    const state = get();
    const trackName = name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${state.tracks.filter((t) => t.type === type).length + 1}`;
    const newTrack: TimelineTrack = { id, type, name: trackName, order: 0, isMuted: false, isDefault: false, clips: [] };
    set({ tracks: sortTracks([...state.tracks, newTrack]) });
    return id;
  },

  getTrackByRole: (role) => get().tracks.find((t) => t.role === role),

  removeTrack: (id) => {
    const track = get().tracks.find((t) => t.id === id);
    if (track?.isDefault) return;
    get().pushUndo();
    set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) }));
  },

  addClip: (trackId, clipData) => {
    get().pushUndo();
    const id = uuid();
    const clip: TimelineClip = { ...clipData, id, trackId };

    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t
      ),
    }));

    get().recalcDuration();
    return id;
  },

  updateClip: (clipId, updates) => {
    set((s) => ({
      tracks: s.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...updates } : c)),
      })),
    }));
    get().recalcDuration();
  },

  removeClip: (clipId) => {
    get().pushUndo();
    set((s) => ({
      tracks: s.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      })),
      transitions: s.transitions.filter(
        (t) => t.fromClipId !== clipId && t.toClipId !== clipId
      ),
      selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
      selectedClipIds: s.selectedClipIds.filter((id) => id !== clipId),
    }));
    get().recalcDuration();
  },

  splitClip: (clipId, time) => {
    get().pushUndo();
    const state = get();
    let targetClip: TimelineClip | undefined;
    let trackId = '';

    for (const track of state.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) {
        targetClip = clip;
        trackId = track.id;
        break;
      }
    }

    if (!targetClip) return;

    const relativeTime = time - targetClip.startTime;
    if (relativeTime <= 0.1 || relativeTime >= targetClip.duration - 0.1) return;

    const firstDuration = relativeTime;
    const secondDuration = targetClip.duration - relativeTime;

    const secondClip: TimelineClip = {
      id: uuid(),
      trackId,
      mediaId: targetClip.mediaId,
      type: targetClip.type,
      name: targetClip.name,
      startTime: targetClip.startTime + firstDuration,
      duration: secondDuration,
      trimStart: targetClip.trimStart + firstDuration,
      trimEnd: targetClip.trimEnd,
      properties: { ...targetClip.properties },
    };

    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          clips: [
            ...t.clips.map((c) =>
              c.id === clipId
                ? { ...c, duration: firstDuration, trimEnd: c.trimEnd + secondDuration }
                : c
            ),
            secondClip,
          ],
        };
      }),
    }));
  },

  selectClip: (clipId) => set({ selectedClipId: clipId, selectedClipIds: clipId ? [clipId] : [], selectedTransitionId: null }),
  selectClips: (clipIds) => set({ selectedClipIds: clipIds, selectedClipId: clipIds.length === 1 ? clipIds[0] : null, selectedTransitionId: null }),
  selectTransition: (transitionId) => set({ selectedTransitionId: transitionId, selectedClipId: null, selectedClipIds: [] }),
  selectTrack: (trackId) => set({ selectedTrackId: trackId }),
  setCurrentTime: (time) => set({ currentTime: Math.max(0, time) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setZoom: (zoom) => set({ zoom: Math.max(1, Math.min(500, zoom)) }),
  setScrollX: (x) => set({ scrollX: Math.max(0, x) }),
  setActiveTool: (tool) => set({ activeTool: tool }),

  getClipById: (id) => {
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === id);
      if (clip) return clip;
    }
    return undefined;
  },

  getTrackById: (id) => get().tracks.find((t) => t.id === id),

  recalcDuration: () => {
    const state = get();
    let maxEnd = 0;
    for (const track of state.tracks) {
      for (const clip of track.clips) {
        const end = clip.startTime + clip.duration;
        if (end > maxEnd) maxEnd = end;
      }
    }
    set({ duration: maxEnd });
  },

  toggleTrackMute: (trackId) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, isMuted: !t.isMuted } : t
      ),
    })),

  addTransition: (trackId, fromClipId, toClipId, type, duration = 0.5) => {
    get().pushUndo();
    const id = uuid();
    set((s) => ({
      transitions: [
        ...s.transitions.filter(
          (t) => !(t.fromClipId === fromClipId && t.toClipId === toClipId)
        ),
        { id, trackId, fromClipId, toClipId, type, duration },
      ],
    }));
    return id;
  },

  updateTransition: (id, updates) =>
    set((s) => ({
      transitions: s.transitions.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),

  removeTransition: (id) => {
    get().pushUndo();
    set((s) => ({
      transitions: s.transitions.filter((t) => t.id !== id),
    }));
  },

  moveClipToTrack: (clipId, targetTrackId) => {
    get().pushUndo();
    const state = get();
    let clip: TimelineClip | undefined;
    let sourceTrackId = '';

    for (const track of state.tracks) {
      const found = track.clips.find((c) => c.id === clipId);
      if (found) {
        clip = found;
        sourceTrackId = track.id;
        break;
      }
    }

    if (!clip || sourceTrackId === targetTrackId) return;

    const movedClip = { ...clip, trackId: targetTrackId };

    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id === sourceTrackId) {
          return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
        }
        if (t.id === targetTrackId) {
          return { ...t, clips: [...t.clips, movedClip] };
        }
        return t;
      }),
      transitions: s.transitions.filter(
        (tr) => tr.fromClipId !== clipId && tr.toClipId !== clipId
      ),
    }));
  },

  ensureTrack: (role: TrackRole) => {
    const state = get();
    const existing = state.tracks.find((t) => t.role === role);
    if (existing) return existing.id;

    const config = TRACK_CONFIGS[role];
    const newTrack: TimelineTrack = {
      id: config.id,
      type: config.type,
      name: config.name,
      order: 0,
      isMuted: false,
      isDefault: true,
      role,
      clips: [],
    };

    set({ tracks: sortTracks([...state.tracks, newTrack]) });
    return config.id;
  },

  getTransitionBetween: (fromClipId, toClipId) =>
    get().transitions.find(
      (t) => t.fromClipId === fromClipId && t.toClipId === toClipId
    ),
}));
