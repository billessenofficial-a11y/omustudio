import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

type AppView = 'landing' | 'role-gate' | 'auth' | 'editor';

interface UIState {
  appView: AppView;
  showMediaPanel: boolean;
  showPropertiesPanel: boolean;
  showExportModal: boolean;
  showBRollPanel: boolean;
  showCaptionsPanel: boolean;
  showTranscriptPanel: boolean;
  toasts: Toast[];
  ffmpegReady: boolean;

  setAppView: (view: AppView) => void;
  toggleMediaPanel: () => void;
  togglePropertiesPanel: () => void;
  setShowExportModal: (show: boolean) => void;
  toggleBRollPanel: () => void;
  toggleCaptionsPanel: () => void;
  toggleTranscriptPanel: () => void;
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
  setFfmpegReady: (ready: boolean) => void;
}

let toastCounter = 0;

export const useUIStore = create<UIState>((set) => ({
  appView: 'landing',
  showMediaPanel: true,
  showPropertiesPanel: true,
  showExportModal: false,
  showBRollPanel: false,
  showCaptionsPanel: false,
  showTranscriptPanel: false,
  toasts: [],
  ffmpegReady: false,

  setAppView: (view) => set({ appView: view }),
  toggleMediaPanel: () => set((s) => ({ showMediaPanel: !s.showMediaPanel })),
  togglePropertiesPanel: () => set((s) => ({ showPropertiesPanel: !s.showPropertiesPanel })),
  setShowExportModal: (show) => set({ showExportModal: show }),
  toggleBRollPanel: () => set((s) => ({ showBRollPanel: !s.showBRollPanel })),
  toggleCaptionsPanel: () => set((s) => ({ showCaptionsPanel: !s.showCaptionsPanel })),
  toggleTranscriptPanel: () => set((s) => ({ showTranscriptPanel: !s.showTranscriptPanel })),

  addToast: (message, type = 'info') => {
    const id = `toast-${++toastCounter}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setFfmpegReady: (ready) => set({ ffmpegReady: ready }),
}));
