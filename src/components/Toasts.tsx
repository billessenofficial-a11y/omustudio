import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useUIStore } from '../store/ui-store';

export default function Toasts() {
  const { toasts, removeToast } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const icons = {
          success: <CheckCircle2 className="w-4 h-4 text-editor-success shrink-0" />,
          error: <AlertCircle className="w-4 h-4 text-editor-error shrink-0" />,
          warning: <AlertTriangle className="w-4 h-4 text-editor-warning shrink-0" />,
          info: <Info className="w-4 h-4 text-editor-accent shrink-0" />,
        };

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center gap-2.5 bg-editor-panel border border-editor-border rounded-xl px-4 py-3 shadow-xl animate-slide-in min-w-[240px]"
          >
            {icons[toast.type]}
            <span className="text-sm text-editor-text flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-editor-text-dim hover:text-editor-text transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
