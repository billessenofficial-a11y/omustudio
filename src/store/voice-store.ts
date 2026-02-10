import { create } from 'zustand';
import { LiveVoiceService, isVoiceSupported } from '../lib/live-voice-service';
import { useChatStore, type ChatMessage, type ChatAction } from './chat-store';

export type VoiceConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

interface VoiceState {
  isVoiceActive: boolean;
  connectionState: VoiceConnectionState;
  isSpeaking: boolean;
  isListening: boolean;
  currentUserTranscript: string;
  currentAITranscript: string;
  pendingActions: ChatAction[];
  error: string | null;
  isSupported: boolean;

  startVoice: () => Promise<void>;
  stopVoice: () => Promise<void>;
  sendTextDuringVoice: (text: string) => void;
}

let service: LiveVoiceService | null = null;
let msgCounter = 1000;

export const useVoiceStore = create<VoiceState>((set, get) => ({
  isVoiceActive: false,
  connectionState: 'idle',
  isSpeaking: false,
  isListening: false,
  currentUserTranscript: '',
  currentAITranscript: '',
  pendingActions: [],
  error: null,
  isSupported: isVoiceSupported(),

  startVoice: async () => {
    if (get().isVoiceActive || get().connectionState === 'connecting') return;

    set({ connectionState: 'connecting', error: null });

    service = new LiveVoiceService({
      onConnected: () => {
        set({
          isVoiceActive: true,
          connectionState: 'connected',
          isListening: true,
        });
      },

      onDisconnected: () => {
        const currentError = get().error;
        set({
          isVoiceActive: false,
          connectionState: currentError ? 'error' : 'idle',
          isSpeaking: false,
          isListening: false,
          currentUserTranscript: '',
          currentAITranscript: '',
          pendingActions: [],
        });
        service = null;
      },

      onError: (error: string) => {
        set({
          connectionState: 'error',
          error,
          isVoiceActive: false,
          isListening: false,
          isSpeaking: false,
        });
      },

      onUserTranscript: (text: string) => {
        set((s) => ({
          currentUserTranscript: s.currentUserTranscript + text,
        }));
      },

      onAITranscript: (text: string) => {
        set((s) => ({
          currentAITranscript: s.currentAITranscript + text,
        }));
      },

      onTurnComplete: () => {
        const state = get();
        const chatStore = useChatStore.getState();

        if (state.currentUserTranscript.trim()) {
          const userMsg: ChatMessage = {
            id: `voice-${++msgCounter}`,
            role: 'user',
            text: state.currentUserTranscript.trim(),
            timestamp: Date.now(),
          };
          chatStore.addMessage(userMsg);
        }

        if (state.currentAITranscript.trim() || state.pendingActions.length > 0) {
          const aiMsg: ChatMessage = {
            id: `voice-${++msgCounter}`,
            role: 'assistant',
            text: state.currentAITranscript.trim() || 'Done.',
            actions: state.pendingActions.length > 0 ? [...state.pendingActions] : undefined,
            timestamp: Date.now(),
          };
          chatStore.addMessage(aiMsg);
        }

        set({
          currentUserTranscript: '',
          currentAITranscript: '',
          pendingActions: [],
        });
      },

      onAudioStart: () => {
        set({ isSpeaking: true });
      },

      onAudioEnd: () => {
        set({ isSpeaking: false });
      },

      onFunctionCall: (name: string, result: string) => {
        set((s) => ({
          pendingActions: [...s.pendingActions, { name, result }],
        }));
      },

      onGoAway: () => {
        get().stopVoice();
      },
    });

    try {
      await service.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      set({
        connectionState: 'error',
        error: message,
        isVoiceActive: false,
      });
      service = null;
    }
  },

  stopVoice: async () => {
    if (service) {
      await service.disconnect();
      service = null;
    }
    set({
      isVoiceActive: false,
      connectionState: 'idle',
      isSpeaking: false,
      isListening: false,
      currentUserTranscript: '',
      currentAITranscript: '',
      pendingActions: [],
      error: null,
    });
  },

  sendTextDuringVoice: (text: string) => {
    if (!service || !get().isVoiceActive) return;
    service.sendText(text);

    const userMsg: ChatMessage = {
      id: `voice-${++msgCounter}`,
      role: 'user',
      text: text.trim(),
      timestamp: Date.now(),
    };
    useChatStore.getState().addMessage(userMsg);
  },
}));
