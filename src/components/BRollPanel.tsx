import { useState } from 'react';
import {
  Wand2,
  X,
  Sparkles,
  Clock,
  Play,
  Trash2,
  RefreshCw,
  Check,
  Loader2,
  AlertCircle,
  Video,
  Image,
  Plus,
} from 'lucide-react';
import { useBRollStore } from '../store/broll-store';
import { useTimelineStore } from '../store/timeline-store';
import { useUIStore } from '../store/ui-store';
import { formatTimeShort } from '../lib/format';
import type { BRollSuggestion, BRollModel } from '../types/editor';

const MODEL_OPTIONS: { id: BRollModel; label: string; desc: string; icon: typeof Video }[] = [
  { id: 'veo-3.1-fast', label: 'Veo 3.1 Fast', desc: 'AI Video', icon: Video },
  { id: 'gemini-3-pro-image', label: 'Gemini 3 Pro', desc: 'AI Image', icon: Image },
];

export default function BRollPanel() {
  const { toggleBRollPanel } = useUIStore();
  const {
    suggestions,
    isAnalyzing,
    generatingIds,
    error,
    selectedModel,
    setSelectedModel,
    analyzeTimeline,
    generateMoreSuggestions,
    generateAll,
    clearAll,
  } = useBRollStore();

  const mainTrack = useTimelineStore((s) => s.tracks.find((t) => t.role === 'main'));
  const hasMainVideo = mainTrack && mainTrack.clips.some((c) => c.mediaId);

  return (
    <div className="fixed inset-y-0 right-0 w-96 z-40 flex flex-col bg-editor-surface border-l border-editor-border shadow-2xl animate-slide-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border bg-editor-panel">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-teal-500/20 flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-teal-400" />
          </div>
          <span className="text-sm font-semibold text-editor-text">AI B-Roll</span>
        </div>
        <div className="flex items-center gap-1">
          {suggestions.length > 0 && (
            <button
              onClick={clearAll}
              className="btn-icon text-editor-text-dim hover:text-editor-error"
              title="Clear all suggestions"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={toggleBRollPanel} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-3 py-2.5 border-b border-editor-border bg-editor-panel/50">
        <div className="flex gap-1.5">
          {MODEL_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = selectedModel === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setSelectedModel(opt.id)}
                className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? 'bg-teal-500/15 border border-teal-500/40 text-teal-300'
                    : 'bg-editor-hover border border-transparent text-editor-text-muted hover:text-editor-text hover:border-editor-border'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <div className="text-left">
                  <div>{opt.label}</div>
                  <div className={`text-[10px] ${active ? 'text-teal-400/70' : 'text-editor-text-dim'}`}>{opt.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!hasMainVideo && <EmptyState />}

        {hasMainVideo && suggestions.length === 0 && !isAnalyzing && !error && (
          <ReadyState onAnalyze={analyzeTimeline} />
        )}

        {isAnalyzing && <AnalyzingState />}

        {error && !isAnalyzing && (
          <ErrorState error={error} onRetry={analyzeTimeline} />
        )}

        {suggestions.length > 0 && !isAnalyzing && (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-editor-text-muted">
                {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                {suggestions.some((s) => s.status === 'suggested' || s.status === 'failed') && (
                  <button
                    onClick={generateAll}
                    className="flex items-center gap-1 px-2.5 py-1 bg-teal-500 hover:bg-teal-400 text-white rounded-md text-xs font-medium transition-colors"
                  >
                    <Sparkles className="w-3 h-3" />
                    Generate All
                  </button>
                )}
                <button
                  onClick={generateMoreSuggestions}
                  className="flex items-center gap-1 px-2.5 py-1 bg-editor-hover border border-editor-border hover:bg-editor-active text-editor-text rounded-md text-xs font-medium transition-colors"
                  title="Generate more suggestions"
                >
                  <Plus className="w-3 h-3" />
                  More
                </button>
                <button
                  onClick={analyzeTimeline}
                  className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Re-analyze
                </button>
              </div>
            </div>
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                isGenerating={generatingIds.has(s.id)}
                model={selectedModel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-editor-panel border border-editor-border flex items-center justify-center mb-4">
        <Video className="w-7 h-7 text-editor-text-dim" />
      </div>
      <p className="text-sm text-editor-text-muted mb-1">No video on main track</p>
      <p className="text-xs text-editor-text-dim leading-relaxed">
        Add a video to the main track, then come back to analyze it for b-roll opportunities.
      </p>
    </div>
  );
}

function ReadyState({ onAnalyze }: { onAnalyze: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-4">
        <Sparkles className="w-7 h-7 text-teal-400" />
      </div>
      <p className="text-sm text-editor-text mb-2">Ready to analyze</p>
      <p className="text-xs text-editor-text-dim leading-relaxed mb-5">
        AI will watch your main video track and suggest moments where b-roll footage would
        improve the edit. Placeholders will be placed on the overlay track automatically.
      </p>
      <button
        onClick={onAnalyze}
        className="flex items-center gap-2 px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <Wand2 className="w-4 h-4" />
        Analyze Timeline
      </button>
    </div>
  );
}

function AnalyzingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-4 relative">
        <Wand2 className="w-7 h-7 text-teal-400" />
        <div className="absolute inset-0 rounded-2xl border-2 border-teal-400/40 animate-ping" />
      </div>
      <p className="text-sm text-editor-text mb-2">Analyzing your video...</p>
      <p className="text-xs text-editor-text-dim leading-relaxed">
        Gemini is watching your main track and identifying optimal b-roll moments.
        This may take 15-30 seconds.
      </p>
      <div className="mt-5 flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-teal-400"
            style={{
              animation: 'pulse 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-editor-error/10 border border-editor-error/20 flex items-center justify-center mb-4">
        <AlertCircle className="w-7 h-7 text-editor-error" />
      </div>
      <p className="text-sm text-editor-text mb-2">Analysis failed</p>
      <p className="text-xs text-editor-text-dim leading-relaxed mb-1">{error}</p>
      <button
        onClick={onRetry}
        className="mt-4 flex items-center gap-2 px-4 py-2 bg-editor-hover border border-editor-border rounded-lg text-sm text-editor-text hover:bg-editor-active transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Try Again
      </button>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  isGenerating,
  model,
}: {
  suggestion: BRollSuggestion;
  isGenerating: boolean;
  model: BRollModel;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(suggestion.prompt);
  const { updatePrompt, generateVideo, dismissSuggestion } = useBRollStore();
  const { setCurrentTime, setIsPlaying } = useTimelineStore();

  const handleSavePrompt = () => {
    updatePrompt(suggestion.id, editValue);
    setIsEditing(false);
  };

  const handleJumpTo = () => {
    setCurrentTime(suggestion.timestampStart);
    setIsPlaying(false);
  };

  const statusColors: Record<string, string> = {
    suggested: 'border-editor-border bg-editor-panel',
    generating: 'border-teal-500/30 bg-teal-500/5',
    generated: 'border-editor-success/30 bg-editor-success/5',
    failed: 'border-editor-error/30 bg-editor-error/5',
  };

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${statusColors[suggestion.status]}`}
    >
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={handleJumpTo}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-editor-hover hover:bg-editor-active transition-colors"
          title="Jump to this timestamp"
        >
          <Clock className="w-3 h-3 text-teal-400" />
          <span className="text-xs font-mono text-editor-text">
            {formatTimeShort(suggestion.timestampStart)}
          </span>
          <span className="text-[10px] text-editor-text-dim">
            ({suggestion.duration.toFixed(1)}s)
          </span>
        </button>

        <div className="flex items-center gap-0.5">
          {suggestion.status === 'generated' && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-editor-success/20">
              <Check className="w-3 h-3 text-editor-success" />
              <span className="text-[10px] text-editor-success font-medium">Added</span>
            </div>
          )}
          <button
            onClick={() => dismissSuggestion(suggestion.id)}
            className="btn-icon text-editor-text-dim hover:text-editor-error"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="mb-2">
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={3}
            className="w-full bg-editor-bg border border-editor-border rounded-lg px-2.5 py-2 text-xs text-editor-text resize-none outline-none focus:border-teal-500/50 transition-colors"
          />
          <div className="flex justify-end gap-1.5 mt-1.5">
            <button
              onClick={() => {
                setEditValue(suggestion.prompt);
                setIsEditing(false);
              }}
              className="px-2.5 py-1 text-xs text-editor-text-muted hover:text-editor-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSavePrompt}
              className="px-2.5 py-1 text-xs bg-teal-500/20 text-teal-400 rounded-md hover:bg-teal-500/30 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="w-full text-left mb-2 group"
          title="Click to edit prompt"
        >
          <p className="text-xs text-editor-text leading-relaxed group-hover:text-teal-300 transition-colors">
            {suggestion.prompt}
          </p>
        </button>
      )}

      {suggestion.rationale && (
        <p className="text-[11px] text-editor-text-dim leading-relaxed mb-3 italic">
          {suggestion.rationale}
        </p>
      )}

      {suggestion.status === 'suggested' && (
        <button
          onClick={() => generateVideo(suggestion.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-teal-500 hover:bg-teal-400 text-white rounded-lg text-xs font-medium transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {model === 'gemini-3-pro-image' ? 'Generate Image' : 'Generate Video'}
        </button>
      )}

      {isGenerating && (
        <div className="flex items-center justify-center gap-2 px-3 py-2 bg-teal-500/10 border border-teal-500/20 rounded-lg">
          <Loader2 className="w-3.5 h-3.5 text-teal-400 animate-spin" />
          <span className="text-xs text-teal-400">Generating video... this may take a minute</span>
        </div>
      )}

      {suggestion.status === 'failed' && (
        <button
          onClick={() => generateVideo(suggestion.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-editor-hover border border-editor-border rounded-lg text-xs text-editor-text hover:bg-editor-active transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Generation
        </button>
      )}
    </div>
  );
}
