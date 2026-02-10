import { Sliders, Type, Film, Music, Wand2, Move, Blend, Trash2, ChevronDown } from 'lucide-react';
import { useTimelineStore } from '../store/timeline-store';
import { useProjectStore } from '../store/project-store';
import { formatDuration } from '../lib/format';
import { useState, useRef, useEffect } from 'react';
import AnimationPicker from './AnimationPicker';
import TransitionPicker from './TransitionPicker';
import type { TextAnimation } from '../types/editor';

const FONT_OPTIONS: { label: string; value: string; category: string }[] = [
  { label: 'Inter', value: "'Inter', sans-serif", category: 'Sans Serif' },
  { label: 'Roboto', value: "'Roboto', sans-serif", category: 'Sans Serif' },
  { label: 'Montserrat', value: "'Montserrat', sans-serif", category: 'Sans Serif' },
  { label: 'Poppins', value: "'Poppins', sans-serif", category: 'Sans Serif' },
  { label: 'Open Sans', value: "'Open Sans', sans-serif", category: 'Sans Serif' },
  { label: 'Lato', value: "'Lato', sans-serif", category: 'Sans Serif' },
  { label: 'Nunito', value: "'Nunito', sans-serif", category: 'Sans Serif' },
  { label: 'DM Sans', value: "'DM Sans', sans-serif", category: 'Sans Serif' },
  { label: 'Playfair Display', value: "'Playfair Display', serif", category: 'Serif' },
  { label: 'Merriweather', value: "'Merriweather', serif", category: 'Serif' },
  { label: 'Lora', value: "'Lora', serif", category: 'Serif' },
  { label: 'Bebas Neue', value: "'Bebas Neue', sans-serif", category: 'Display' },
  { label: 'Oswald', value: "'Oswald', sans-serif", category: 'Display' },
  { label: 'Anton', value: "'Anton', sans-serif", category: 'Display' },
  { label: 'Fira Code', value: "'Fira Code', monospace", category: 'Monospace' },
  { label: 'Space Mono', value: "'Space Mono', monospace", category: 'Monospace' },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace", category: 'Monospace' },
  { label: 'Caveat', value: "'Caveat', cursive", category: 'Handwriting' },
  { label: 'Dancing Script', value: "'Dancing Script', cursive", category: 'Handwriting' },
];

export default function PropertiesPanel() {
  const {
    selectedClipId,
    selectedTransitionId,
    tracks,
    transitions,
    pushUndo,
    updateClip,
    updateTransition,
    removeTransition,
    selectTransition,
  } = useTimelineStore();
  const { project, setProject } = useProjectStore();

  let selectedClip = null;
  let parentTrack = null;
  if (selectedClipId) {
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) {
        selectedClip = clip;
        parentTrack = track;
        break;
      }
    }
  }

  const selectedTransition = selectedTransitionId
    ? transitions.find((t) => t.id === selectedTransitionId)
    : null;

  let panelLabel = 'Project';
  if (selectedClip) panelLabel = 'Clip';
  else if (selectedTransition) panelLabel = 'Transition';

  return (
    <div className="w-56 bg-editor-surface border-l border-editor-border flex flex-col h-full shrink-0">
      <div className="h-10 flex items-center px-3 border-b border-editor-border shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-editor-text-muted">
          {panelLabel}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selectedClip && parentTrack ? (
          <ClipProperties
            clip={selectedClip}
            trackType={parentTrack.type}
            onUpdate={(updates) => { pushUndo(); updateClip(selectedClip!.id, updates); }}
          />
        ) : selectedTransition ? (
          <TransitionProperties
            transition={selectedTransition}
            tracks={tracks}
            onUpdate={(updates) => { pushUndo(); updateTransition(selectedTransition.id, updates); }}
            onRemove={() => {
              removeTransition(selectedTransition.id);
              selectTransition(null);
            }}
          />
        ) : (
          <ProjectProperties
            project={project}
            onUpdate={setProject}
          />
        )}
      </div>
    </div>
  );
}

function ClipProperties({
  clip,
  trackType,
  onUpdate,
}: {
  clip: ReturnType<typeof useTimelineStore.getState>['tracks'][0]['clips'][0];
  trackType: string;
  onUpdate: (updates: Record<string, unknown>) => void;
}) {
  const Icon = trackType === 'audio' ? Music : trackType === 'text' ? Type : Film;

  return (
    <div>
      <div className="panel-section">
        <div className="flex items-center gap-2 mb-3">
          <Icon className="w-4 h-4 text-editor-text-dim" />
          <span className="text-xs text-editor-text truncate">{clip.name}</span>
        </div>

        <div className="space-y-2">
          <PropertyRow label="Start" value={`${clip.startTime.toFixed(2)}s`} />
          <PropertyRow label="Duration" value={formatDuration(clip.duration)} />
          <PropertyRow label="Trim In" value={`${clip.trimStart.toFixed(2)}s`} />
          <PropertyRow label="Trim Out" value={`${clip.trimEnd.toFixed(2)}s`} />
        </div>
      </div>

      {(trackType === 'video' || trackType === 'audio' || trackType === 'overlay') && (
        <div className="panel-section">
          <SectionLabel icon={<Sliders className="w-3 h-3" />} label="Adjustments" />

          {(trackType === 'video' || trackType === 'overlay') && (
            <SliderField
              label="Opacity"
              value={clip.properties.opacity ?? 1}
              min={0}
              max={1}
              step={0.01}
              displayValue={`${Math.round((clip.properties.opacity ?? 1) * 100)}%`}
              onChange={(v) =>
                onUpdate({ properties: { ...clip.properties, opacity: v } })
              }
            />
          )}

          {(trackType === 'video' || trackType === 'audio') && (
            <SliderField
              label="Volume"
              value={clip.properties.volume ?? 1}
              min={0}
              max={2}
              step={0.01}
              displayValue={`${Math.round((clip.properties.volume ?? 1) * 100)}%`}
              onChange={(v) =>
                onUpdate({ properties: { ...clip.properties, volume: v } })
              }
            />
          )}
        </div>
      )}

      {trackType === 'overlay' && (
        <div className="panel-section">
          <SectionLabel icon={<Wand2 className="w-3 h-3" />} label="Effects" />
          <div className="space-y-2">
            <SliderField
              label="Fade In"
              value={clip.properties.fadeInDuration ?? 0}
              min={0}
              max={2}
              step={0.05}
              displayValue={`${(clip.properties.fadeInDuration ?? 0).toFixed(2)}s`}
              onChange={(v) =>
                onUpdate({ properties: { ...clip.properties, fadeInDuration: v } })
              }
            />
            <SliderField
              label="Fade Out"
              value={clip.properties.fadeOutDuration ?? 0}
              min={0}
              max={2}
              step={0.05}
              displayValue={`${(clip.properties.fadeOutDuration ?? 0).toFixed(2)}s`}
              onChange={(v) =>
                onUpdate({ properties: { ...clip.properties, fadeOutDuration: v } })
              }
            />
            <div>
              <label className="text-[10px] text-editor-text-dim uppercase tracking-wider">
                Animation
              </label>
              <select
                value={clip.properties.overlayAnimation ?? 'none'}
                onChange={(e) =>
                  onUpdate({
                    properties: {
                      ...clip.properties,
                      overlayAnimation: e.target.value as 'none' | 'zoomIn',
                    },
                  })
                }
                className="w-full bg-editor-hover border border-editor-border rounded px-2 py-1.5 text-xs mt-0.5 outline-none focus:border-editor-accent"
              >
                <option value="none">None</option>
                <option value="zoomIn">Slow Zoom In</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {trackType === 'text' && (
        <div className="panel-section">
          <SectionLabel icon={<Type className="w-3 h-3" />} label="Text" />

          <div className="space-y-2">
            <textarea
              value={clip.properties.text ?? ''}
              onChange={(e) =>
                onUpdate({ properties: { ...clip.properties, text: e.target.value } })
              }
              className="w-full bg-editor-hover border border-editor-border rounded px-2 py-1.5 text-xs resize-none h-16 outline-none focus:border-editor-accent"
              placeholder="Enter text..."
            />

            <FontPicker
              value={clip.properties.fontFamily ?? "'Inter', sans-serif"}
              onChange={(v) =>
                onUpdate({ properties: { ...clip.properties, fontFamily: v } })
              }
            />

            <SliderField
              label="Font Size"
              value={clip.properties.fontSize ?? 48}
              min={12}
              max={200}
              step={1}
              displayValue={`${clip.properties.fontSize ?? 48}px`}
              onChange={(v) =>
                onUpdate({ properties: { ...clip.properties, fontSize: v } })
              }
            />

            <div>
              <label className="text-[10px] text-editor-text-dim uppercase tracking-wider">
                Color
              </label>
              <input
                type="color"
                value={clip.properties.fontColor ?? '#ffffff'}
                onChange={(e) =>
                  onUpdate({ properties: { ...clip.properties, fontColor: e.target.value } })
                }
                className="w-full h-7 mt-1 rounded border border-editor-border cursor-pointer bg-transparent"
              />
            </div>

            {clip.properties.textAnimation === 'karaoke' && (
              <div>
                <label className="text-[10px] text-editor-text-dim uppercase tracking-wider">
                  Highlight Color
                </label>
                <input
                  type="color"
                  value={clip.properties.highlightColor ?? '#d78241'}
                  onChange={(e) =>
                    onUpdate({ properties: { ...clip.properties, highlightColor: e.target.value } })
                  }
                  className="w-full h-7 mt-1 rounded border border-editor-border cursor-pointer bg-transparent"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {(trackType === 'text' || trackType === 'overlay') && (
        <div className="panel-section">
          <SectionLabel icon={<Move className="w-3 h-3" />} label="Transform" />
          <div className="space-y-2">
            <SliderField
              label="X"
              value={clip.properties.x ?? 50}
              min={0}
              max={100}
              step={1}
              displayValue={`${Math.round(clip.properties.x ?? 50)}%`}
              onChange={(v) =>
                onUpdate({ properties: { ...clip.properties, x: v } })
              }
            />
            <SliderField
              label="Y"
              value={clip.properties.y ?? 50}
              min={0}
              max={100}
              step={1}
              displayValue={`${Math.round(clip.properties.y ?? 50)}%`}
              onChange={(v) =>
                onUpdate({ properties: { ...clip.properties, y: v } })
              }
            />
            <SliderField
              label="Scale"
              value={clip.properties.scale ?? 1}
              min={0.1}
              max={3}
              step={0.05}
              displayValue={`${Math.round((clip.properties.scale ?? 1) * 100)}%`}
              onChange={(v) =>
                onUpdate({ properties: { ...clip.properties, scale: v } })
              }
            />
            <SliderField
              label="Rotation"
              value={clip.properties.rotation ?? 0}
              min={-180}
              max={180}
              step={1}
              displayValue={`${Math.round(clip.properties.rotation ?? 0)}deg`}
              onChange={(v) =>
                onUpdate({ properties: { ...clip.properties, rotation: v } })
              }
            />
          </div>
        </div>
      )}

      {trackType === 'text' && (
        <div className="panel-section">
          <SectionLabel icon={<Wand2 className="w-3 h-3" />} label="Animation" />
          <AnimationPicker
            value={(clip.properties.textAnimation as TextAnimation) ?? 'fadeIn'}
            animationDuration={clip.properties.animationDuration ?? 0.5}
            onChange={(animation) =>
              onUpdate({ properties: { ...clip.properties, textAnimation: animation } })
            }
            onDurationChange={(duration) =>
              onUpdate({ properties: { ...clip.properties, animationDuration: duration } })
            }
          />
        </div>
      )}
    </div>
  );
}

function TransitionProperties({
  transition,
  tracks,
  onUpdate,
  onRemove,
}: {
  transition: ReturnType<typeof useTimelineStore.getState>['transitions'][0];
  tracks: ReturnType<typeof useTimelineStore.getState>['tracks'];
  onUpdate: (updates: Partial<Pick<typeof transition, 'type' | 'duration'>>) => void;
  onRemove: () => void;
}) {
  let fromClipName = '';
  let toClipName = '';
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.id === transition.fromClipId) fromClipName = clip.name;
      if (clip.id === transition.toClipId) toClipName = clip.name;
    }
  }

  return (
    <div>
      <div className="panel-section">
        <div className="flex items-center gap-2 mb-3">
          <Blend className="w-4 h-4 text-teal-400" />
          <span className="text-xs text-editor-text capitalize">{transition.type}</span>
        </div>

        <div className="space-y-1.5 mb-3">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-editor-text-dim">From:</span>
            <span className="text-editor-text-muted truncate">{fromClipName || 'Unknown'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-editor-text-dim">To:</span>
            <span className="text-editor-text-muted truncate">{toClipName || 'Unknown'}</span>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <SectionLabel icon={<Blend className="w-3 h-3" />} label="Type" />
        <TransitionPicker
          value={transition.type}
          duration={transition.duration}
          onChange={(type) => {
            if (type === 'none') {
              onRemove();
            } else {
              onUpdate({ type });
            }
          }}
          onDurationChange={(duration) => onUpdate({ duration })}
        />
      </div>

      <div className="panel-section">
        <SectionLabel icon={<Sliders className="w-3 h-3" />} label="Duration" />
        <SliderField
          label="Duration"
          value={transition.duration}
          min={0.1}
          max={3}
          step={0.1}
          displayValue={`${transition.duration.toFixed(1)}s`}
          onChange={(v) => onUpdate({ duration: v })}
        />
      </div>

      <div className="px-3 pt-2 pb-3">
        <button
          onClick={onRemove}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-red-500/30 text-red-400 text-[10px] hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Remove Transition
        </button>
      </div>
    </div>
  );
}

function ProjectProperties({
  project,
  onUpdate,
}: {
  project: ReturnType<typeof useProjectStore.getState>['project'];
  onUpdate: (updates: Record<string, unknown>) => void;
}) {
  const presets = [
    { label: '1080p', w: 1920, h: 1080 },
    { label: '720p', w: 1280, h: 720 },
    { label: '4K', w: 3840, h: 2160 },
    { label: '9:16', w: 1080, h: 1920 },
    { label: '1:1', w: 1080, h: 1080 },
  ];

  return (
    <div>
      <div className="panel-section">
        <SectionLabel icon={<Film className="w-3 h-3" />} label="Canvas" />

        <div className="flex gap-1.5 flex-wrap mb-3">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => onUpdate({ width: p.w, height: p.h })}
              className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                project.width === p.w && project.height === p.h
                  ? 'border-editor-accent bg-editor-accent/10 text-editor-accent'
                  : 'border-editor-border text-editor-text-dim hover:border-editor-border-light'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Width"
            value={project.width}
            onChange={(v) => onUpdate({ width: v })}
          />
          <NumberField
            label="Height"
            value={project.height}
            onChange={(v) => onUpdate({ height: v })}
          />
        </div>

        <div className="mt-2">
          <NumberField
            label="FPS"
            value={project.fps}
            onChange={(v) => onUpdate({ fps: v })}
          />
        </div>
      </div>

      <div className="p-3">
        <p className="text-[10px] text-editor-text-dim leading-relaxed">
          Import a video to automatically set canvas size to match.
        </p>
      </div>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-editor-text-dim">{label}</span>
      <span className="text-[10px] font-mono text-editor-text-muted">{value}</span>
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-editor-text-dim">{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-editor-text-dim">
        {label}
      </span>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-editor-text-dim">{label}</span>
        <span className="text-[10px] font-mono text-editor-text-muted">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-editor-text-dim uppercase tracking-wider">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-full bg-editor-hover border border-editor-border rounded px-2 py-1 text-xs mt-0.5 outline-none focus:border-editor-accent font-mono"
      />
    </div>
  );
}

function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const current = FONT_OPTIONS.find((f) => f.value === value);
  const displayName = current?.label ?? 'Inter';

  const categories = ['Sans Serif', 'Serif', 'Display', 'Monospace', 'Handwriting'];

  return (
    <div ref={ref} className="relative">
      <label className="text-[10px] text-editor-text-dim uppercase tracking-wider">
        Font
      </label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-editor-hover border border-editor-border rounded px-2 py-1.5 text-xs mt-0.5 hover:border-editor-border-light transition-colors"
      >
        <span style={{ fontFamily: value }} className="truncate">{displayName}</span>
        <ChevronDown className={`w-3 h-3 text-editor-text-dim shrink-0 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-editor-surface border border-editor-border rounded shadow-xl max-h-64 overflow-y-auto">
          {categories.map((cat) => {
            const fonts = FONT_OPTIONS.filter((f) => f.category === cat);
            if (fonts.length === 0) return null;
            return (
              <div key={cat}>
                <div className="px-2 py-1 text-[9px] uppercase tracking-wider text-editor-text-dim bg-editor-bg/50 sticky top-0">
                  {cat}
                </div>
                {fonts.map((font) => (
                  <button
                    key={font.value}
                    onClick={() => { onChange(font.value); setOpen(false); }}
                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-editor-hover transition-colors flex items-center gap-2 ${
                      value === font.value ? 'text-editor-accent bg-editor-accent/5' : 'text-editor-text'
                    }`}
                  >
                    <span style={{ fontFamily: font.value }} className="truncate">{font.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
