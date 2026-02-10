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
  geminiHistory: GeminiMessage[];

  toggle: () => void;
  open: () => void;
  close: () => void;
  sendMessage: (text: string) => Promise<void>;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
}

let msgCounter = 0;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isOpen: false,
  isProcessing: false,
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
    }));

    try {
      const history = get().geminiHistory;
      const response: AgentResponse = await callAgent(history, trimmed);

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
      }));
    }
  },

  addMessage: (msg: ChatMessage) => set((s) => ({ messages: [...s.messages, msg] })),

  clearMessages: () => set({ messages: [], geminiHistory: [] }),
}));
