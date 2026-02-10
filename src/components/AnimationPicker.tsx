import { useState, useMemo } from 'react';
import { Player } from '../lib/animation-player';
import { AnimatedText } from '../remotion/AnimatedText';
import type { TextAnimation } from '../types/editor';
import {
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Scaling,
  Circle,
  Eye,
  Keyboard,
  AlignJustify,
  Ban,
} from 'lucide-react';

interface AnimationPickerProps {
  value: TextAnimation;
  animationDuration: number;
  onChange: (animation: TextAnimation) => void;
  onDurationChange: (duration: number) => void;
}

const PRESETS: { id: TextAnimation; label: string; icon: React.ReactNode }[] = [
  { id: 'none', label: 'None', icon: <Ban className="w-3 h-3" /> },
  { id: 'fadeIn', label: 'Fade In', icon: <Eye className="w-3 h-3" /> },
  { id: 'slideUp', label: 'Slide Up', icon: <ArrowUp className="w-3 h-3" /> },
  { id: 'slideDown', label: 'Slide Down', icon: <ArrowDown className="w-3 h-3" /> },
  { id: 'slideLeft', label: 'Slide Left', icon: <ArrowLeft className="w-3 h-3" /> },
  { id: 'slideRight', label: 'Slide Right', icon: <ArrowRight className="w-3 h-3" /> },
  { id: 'scaleUp', label: 'Scale Up', icon: <Scaling className="w-3 h-3" /> },
  { id: 'pop', label: 'Pop', icon: <Circle className="w-3 h-3" /> },
  { id: 'blurReveal', label: 'Blur Reveal', icon: <Sparkles className="w-3 h-3" /> },
  { id: 'typewriter', label: 'Typewriter', icon: <Keyboard className="w-3 h-3" /> },
  { id: 'wordByWord', label: 'Word by Word', icon: <AlignJustify className="w-3 h-3" /> },
];

export default function AnimationPicker({
  value,
  animationDuration,
  onChange,
  onDurationChange,
}: AnimationPickerProps) {
  const [hoveredPreset, setHoveredPreset] = useState<TextAnimation | null>(null);

  return (
    <div>
      <div className="grid grid-cols-2 gap-1">
        {PRESETS.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isSelected={value === preset.id}
            isHovered={hoveredPreset === preset.id}
            onClick={() => onChange(preset.id)}
            onHover={() => setHoveredPreset(preset.id)}
            onLeave={() => setHoveredPreset(null)}
          />
        ))}
      </div>

      {value !== 'none' && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-editor-text-dim">Duration</span>
            <span className="text-[10px] font-mono text-editor-text-muted">
              {animationDuration.toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={2.0}
            step={0.1}
            value={animationDuration}
            onChange={(e) => onDurationChange(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
      )}

      {value !== 'none' && (
        <div className="mt-3 rounded-lg overflow-hidden border border-editor-border bg-black">
          <AnimationPreview
            animation={value}
            animationDuration={animationDuration}
          />
        </div>
      )}
    </div>
  );
}

function PresetCard({
  preset,
  isSelected,
  isHovered,
  onClick,
  onHover,
  onLeave,
}: {
  preset: (typeof PRESETS)[0];
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onHover: () => void;
  onLeave: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] transition-all border ${
        isSelected
          ? 'border-editor-accent bg-editor-accent/10 text-editor-accent'
          : isHovered
            ? 'border-editor-border-light bg-editor-hover text-editor-text'
            : 'border-editor-border text-editor-text-dim hover:border-editor-border-light'
      }`}
    >
      {preset.icon}
      <span className="truncate">{preset.label}</span>
    </button>
  );
}

function AnimationPreview({
  animation,
  animationDuration,
}: {
  animation: TextAnimation;
  animationDuration: number;
}) {
  const fps = 30;
  const totalDuration = animationDuration * 2 + 1;
  const durationInFrames = Math.max(Math.round(totalDuration * fps), 2);

  const inputProps = useMemo(
    () => ({
      text: 'Aa',
      fontSize: 24,
      fontColor: '#ffffff',
      fontFamily: 'sans-serif',
      textAlign: 'center' as const,
      animation,
      animationDuration,
    }),
    [animation, animationDuration]
  );

  return (
    <Player
      component={AnimatedText}
      inputProps={inputProps}
      durationInFrames={durationInFrames}
      fps={fps}
      compositionWidth={200}
      compositionHeight={60}
      loop
      autoPlay
      style={{
        width: '100%',
        height: 48,
      }}
      controls={false}
    />
  );
}
