import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Blend,
  Moon,
  PanelLeft,
  PanelRight,
  ZoomIn,
  X,
  Sparkles,
  Flame,
} from 'lucide-react';
import type { TransitionType } from '../types/editor';

const TRANSITIONS: {
  value: TransitionType;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: 'none', label: 'None', icon: <X className="w-3.5 h-3.5" /> },
  { value: 'crossfade', label: 'Crossfade', icon: <Blend className="w-3.5 h-3.5" /> },
  { value: 'dipToBlack', label: 'Dip to Black', icon: <Moon className="w-3.5 h-3.5" /> },
  { value: 'glare', label: 'Glare', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { value: 'filmBurn', label: 'Film Burn', icon: <Flame className="w-3.5 h-3.5" /> },
  { value: 'slideLeft', label: 'Slide Left', icon: <ArrowLeft className="w-3.5 h-3.5" /> },
  { value: 'slideRight', label: 'Slide Right', icon: <ArrowRight className="w-3.5 h-3.5" /> },
  { value: 'slideUp', label: 'Slide Up', icon: <ArrowUp className="w-3.5 h-3.5" /> },
  { value: 'slideDown', label: 'Slide Down', icon: <ArrowDown className="w-3.5 h-3.5" /> },
  { value: 'wipeLeft', label: 'Wipe Left', icon: <PanelLeft className="w-3.5 h-3.5" /> },
  { value: 'wipeRight', label: 'Wipe Right', icon: <PanelRight className="w-3.5 h-3.5" /> },
  { value: 'zoom', label: 'Zoom', icon: <ZoomIn className="w-3.5 h-3.5" /> },
];

interface TransitionPickerProps {
  value: TransitionType;
  duration: number;
  onChange: (transition: TransitionType) => void;
  onDurationChange: (duration: number) => void;
}

export default function TransitionPicker({
  value,
  duration,
  onChange,
  onDurationChange,
}: TransitionPickerProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1">
        {TRANSITIONS.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] transition-all ${
              value === t.value
                ? 'bg-editor-accent/15 text-editor-accent border border-editor-accent/40'
                : 'bg-editor-hover text-editor-text-dim border border-transparent hover:border-editor-border-light hover:text-editor-text-muted'
            }`}
          >
            {t.icon}
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>

      {value !== 'none' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-editor-text-dim">Duration</span>
            <span className="text-[10px] font-mono text-editor-text-muted">{duration.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={3}
            step={0.1}
            value={duration}
            onChange={(e) => onDurationChange(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
