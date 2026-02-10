import { create } from 'zustand';

export interface MusicTrack {
  id: string;
  name: string;
  url: string;
  duration: number;
}

export const MUSIC_LIBRARY: Omit<MusicTrack, 'duration'>[] = [
  { id: 'music-calm', name: 'Calm', url: 'https://media.avilta.com/music/8f92ab28-3a50-4a1b-b89b-da7d82c54f23/music_track_639ea66f-2021-4a4c-9389-c2d73aac1203_1765357210339.mp3' },
  { id: 'music-lush', name: 'Lush', url: 'https://media.avilta.com/music/8f92ab28-3a50-4a1b-b89b-da7d82c54f23/music_track_884b8094-9c7b-4d40-92bb-6c922d08c98f_1765357212034.mp3' },
  { id: 'music-guitar', name: 'Guitar', url: 'https://media.avilta.com/music/8f92ab28-3a50-4a1b-b89b-da7d82c54f23/music_track_649b1099-79cd-4498-9791-615c9f8631ce_1765357213898.mp3' },
  { id: 'music-jazzy', name: 'Jazzy', url: 'https://media.avilta.com/music/8f92ab28-3a50-4a1b-b89b-da7d82c54f23/music_track_50787689-840a-4502-8261-f46702a4fbc9_1765357215755.mp3' },
  { id: 'music-optimistic', name: 'Optimistic', url: 'https://media.avilta.com/music/8f92ab28-3a50-4a1b-b89b-da7d82c54f23/music_track_4e9ae2e4-c3b0-4144-b062-c1df7f9af1ec_1765357217604.mp3' },
  { id: 'music-cute', name: 'Cute', url: 'https://media.avilta.com/music/8f92ab28-3a50-4a1b-b89b-da7d82c54f23/music_track_24cc1d46-be56-46ef-a178-b3ffe2a87f92_1765357219367.mp3' },
  { id: 'music-drill', name: 'Drill', url: 'https://media.avilta.com/music/8f92ab28-3a50-4a1b-b89b-da7d82c54f23/music_track_dfb7948b-4686-40c1-a2e8-3974a6d6b4ee_1765357221525.mp3' },
  { id: 'music-energetic', name: 'Energetic', url: 'https://media.avilta.com/music/8f92ab28-3a50-4a1b-b89b-da7d82c54f23/music_track_9ef3968b-5f59-4c16-b122-b70386425c6f_1765357223557.mp3' },
  { id: 'music-hype', name: 'Hype', url: 'https://media.avilta.com/music/8f92ab28-3a50-4a1b-b89b-da7d82c54f23/music_track_29429e2e-fc31-45fd-a33a-32bf4ffc55b7_1765357225499.mp3' },
];

interface MusicState {
  previewingId: string | null;
  previewAudio: HTMLAudioElement | null;
  durations: Record<string, number>;

  previewTrack: (id: string) => void;
  stopPreview: () => void;
  loadDuration: (id: string, url: string) => Promise<number>;
}

export const useMusicStore = create<MusicState>((set, get) => ({
  previewingId: null,
  previewAudio: null,
  durations: {},

  previewTrack: (id: string) => {
    const state = get();
    if (state.previewAudio) {
      state.previewAudio.pause();
      state.previewAudio.src = '';
    }

    if (state.previewingId === id) {
      set({ previewingId: null, previewAudio: null });
      return;
    }

    const track = MUSIC_LIBRARY.find((t) => t.id === id);
    if (!track) return;

    const audio = new Audio(track.url);
    audio.crossOrigin = 'anonymous';
    audio.volume = 0.5;
    audio.play().catch(() => {});
    audio.onended = () => set({ previewingId: null, previewAudio: null });

    set({ previewingId: id, previewAudio: audio });
  },

  stopPreview: () => {
    const state = get();
    if (state.previewAudio) {
      state.previewAudio.pause();
      state.previewAudio.src = '';
    }
    set({ previewingId: null, previewAudio: null });
  },

  loadDuration: async (id: string, url: string) => {
    const cached = get().durations[id];
    if (cached) return cached;

    const duration = await new Promise<number>((resolve) => {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        resolve(isFinite(audio.duration) ? audio.duration : 120);
        audio.src = '';
      };
      audio.onerror = () => resolve(120);
      audio.src = url;
    });

    set((s) => ({ durations: { ...s.durations, [id]: duration } }));
    return duration;
  },
}));
