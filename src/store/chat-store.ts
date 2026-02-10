import { create } from 'zustand';
import { callAgent, type GeminiMessage, type AgentResponse } from '../lib/agent-service';

export interface ChatAction {
  name: string;
  result: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: ChatAction[];
  timestamp: number;
}

interface ChatState {
  messages: ChatMessage[];
  isOpen: boolean;
  isProcessing: boolean;
  activeToolNames: string[];
  geminiHistory: GeminiMessage[];

  toggle: () => void;
  open: () => void;
  close: () => void;
  sendMessage: (text: string) => Promise<void>;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
}

const ACTION_DISPLAY: Record<string, string> = {
  analyze_broll: 'Analyzing B-Roll',
  add_captions: 'Adding captions',
  set_caption_style: 'Changing caption style',
  add_text: 'Adding text',
  seek: 'Seeking',
  playback: 'Controlling playback',
  split_clip: 'Splitting clip',
  delete_clip: 'Deleting clip',
  set_project: 'Updating project',
  open_export: 'Opening export',
  get_timeline_info: 'Checking timeline',
  remove_silences: 'Removing silences',
  add_transition: 'Adding transition',
  add_transitions_all: 'Adding transitions',
  set_transition_duration: 'Updating transitions',
  remove_transitions: 'Removing transitions',
  add_all_media_to_timeline: 'Adding media',
  add_music: 'Adding music',
  set_music_volume: 'Adjusting volume',
};

export function getActionDisplayName(toolName: string): string {
  return ACTION_DISPLAY[toolName] || toolName;
}

let msgCounter = 0;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isOpen: false,
  isProcessing: false,
  activeToolNames: [],
  geminiHistory: [],

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  sendMessage: async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || get().isProcessing) return;

    const userMsg: ChatMessage = {
      id: `msg-${++msgCounter}`,
      role: 'user',
      text: trimmed,
      timestamp: Date.now(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      isProcessing: true,
      activeToolNames: [],
    }));

    try {
      const history = get().geminiHistory;

      const onProgress = (toolNames: string[]) => {
        set({ activeToolNames: toolNames });
      };

      const response: AgentResponse = await callAgent(history, trimmed, onProgress);

      const assistantMsg: ChatMessage = {
        id: `msg-${++msgCounter}`,
        role: 'assistant',
        text: response.text,
        actions: response.actions.length > 0 ? response.actions : undefined,
        timestamp: Date.now(),
      };

      const newHistory: GeminiMessage[] = [
        ...history,
        { role: 'user', parts: [{ text: trimmed }] },
        { role: 'model', parts: [{ text: response.text }] },
      ];

      const maxHistory = 20;
      const trimmedHistory = newHistory.length > maxHistory
        ? newHistory.slice(newHistory.length - maxHistory)
        : newHistory;

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isProcessing: false,
        activeToolNames: [],
        geminiHistory: trimmedHistory,
      }));
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `msg-${++msgCounter}`,
        role: 'assistant',
        text: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        timestamp: Date.now(),
      };

      set((s) => ({
        messages: [...s.messages, errorMsg],
        isProcessing: false,
        activeToolNames: [],
      }));
    }
  },

  addMessage: (msg: ChatMessage) => set((s) => ({ messages: [...s.messages, msg] })),

  clearMessages: () => set({ messages: [], geminiHistory: [] }),
}));
