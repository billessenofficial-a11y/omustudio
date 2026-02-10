import { useRef, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  FileText,
  RefreshCw,
  Trash2,
  AlertCircle,
  Video,
  Check,
  Sparkles,
  Eraser,
  Scissors,
  Undo2,
} from 'lucide-react';
import { useTranscriptStore, type TranscriptWord } from '../store/transcript-store';
import { useTimelineStore } from '../store/timeline-store';
import { useUIStore } from '../store/ui-store';
import { formatTimeShort } from '../lib/format';

const PARAGRAPH_PAUSE = 0.5;

interface WordParagraph {
  timestamp: number;
  words: TranscriptWord[];
}

function groupIntoParagraphs(words: TranscriptWord[]): WordParagraph[] {
  if (words.length === 0) return [];

  const paragraphs: WordParagraph[] = [];
  let current: TranscriptWord[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].startTime - words[i - 1].endTime;
    if (gap > PARAGRAPH_PAUSE) {
      paragraphs.push({ timestamp: current[0].startTime, words: current });
      current = [words[i]];
    } else {
      current.push(words[i]);
    }
  }

  if (current.length > 0) {
    paragraphs.push({ timestamp: current[0].startTime, words: current });
  }

  return paragraphs;
}

export default function TranscriptPanel() {
  const { toggleTranscriptPanel } = useUIStore();
  const {
    words,
    isTranscribing,
    transcribeProgress,
    error,
    skipRegions,
    hasApplied,
    transcribe,
    toggleWord,
    crossOutFillerWords,
    uncrossAll,
    applyToTimeline,
    clear,
  } = useTranscriptStore();

  const mainTrack = useTimelineStore((s) => s.tracks.find((t) => t.role === 'main'));
  const hasMainVideo = mainTrack && mainTrack.clips.some((c) => c.mediaId);

  const crossedCount = useMemo(() => words.filter((w) => w.isCrossed).length, [words]);
  const totalSaved = useMemo(
    () => skipRegions.reduce((sum, r) => sum + (r.end - r.start), 0),
    [skipRegions],
  );

  return (
    <div className="fixed inset-y-0 right-0 w-[440px] z-40 flex flex-col bg-editor-surface border-l border-editor-border shadow-2xl animate-slide-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border bg-editor-panel">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-teal-500/20 flex items-center justify-center">
            <FileText className="w-4 h-4 text-teal-400" />
          </div>
          <span className="text-sm font-semibold text-editor-text">Transcript</span>
        </div>
        <div className="flex items-center gap-1">
          {(words.length > 0 || hasApplied) && (
            <button
              onClick={clear}
              className="btn-icon text-editor-text-dim hover:text-editor-error"
              title="Clear transcript"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={toggleTranscriptPanel} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {!hasMainVideo && <EmptyState />}

        {hasMainVideo && words.length === 0 && !isTranscribing && !error && !hasApplied && (
          <ReadyState onTranscribe={transcribe} />
        )}

        {isTranscribing && <TranscribingState progress={transcribeProgress} />}

        {error && !isTranscribing && (
          <ErrorState error={error} onRetry={transcribe} />
        )}

        {words.length > 0 && !isTranscribing && (
          <>
            <TranscriptToolbar
              wordCount={words.length}
              crossedCount={crossedCount}
              totalSaved={totalSaved}
              onRemoveFillers={crossOutFillerWords}
              onUncrossAll={uncrossAll}
              onRetranscribe={transcribe}
            />
            <TranscriptDocument words={words} onToggleWord={toggleWord} />
            <TranscriptFooter
              crossedCount={crossedCount}
              hasApplied={hasApplied}
              onApply={applyToTimeline}
            />
          </>
        )}

        {hasApplied && words.length === 0 && !isTranscribing && !error && (
          <AppliedState onRetranscribe={transcribe} />
        )}
      </div>
    </div>
  );
}

function TranscriptToolbar({
  wordCount,
  crossedCount,
  totalSaved,
  onRemoveFillers,
  onUncrossAll,
  onRetranscribe,
}: {
  wordCount: number;
  crossedCount: number;
  totalSaved: number;
  onRemoveFillers: () => void;
  onUncrossAll: () => void;
  onRetranscribe: () => void;
}) {
  return (
    <div className="px-4 py-3 border-b border-editor-border space-y-3 shrink-0">
      <div className="flex items-center gap-2">
        <button
          onClick={onRemoveFillers}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 rounded-lg text-xs font-medium transition-colors"
        >
          <Eraser className="w-3.5 h-3.5" />
          Remove Filler Words
        </button>
        {crossedCount > 0 && (
          <button
            onClick={onUncrossAll}
            className="flex items-center gap-1.5 px-3 py-2 bg-editor-hover border border-editor-border rounded-lg text-xs text-editor-text-muted hover:text-editor-text transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Restore
          </button>
        )}
        <button
          onClick={onRetranscribe}
          className="flex items-center gap-1.5 px-2.5 py-2 bg-editor-hover border border-editor-border rounded-lg text-xs text-editor-text-muted hover:text-editor-text transition-colors"
          title="Re-transcribe"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between text-[11px] text-editor-text-dim">
        <span>{wordCount} words</span>
        {crossedCount > 0 && (
          <span className="text-teal-400">
            {crossedCount} crossed out &middot; {totalSaved.toFixed(1)}s saved
          </span>
        )}
      </div>
    </div>
  );
}

function TranscriptDocument({
  words,
  onToggleWord,
}: {
  words: TranscriptWord[];
  onToggleWord: (id: string) => void;
}) {
  const paragraphs = useMemo(() => groupIntoParagraphs(words), [words]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {paragraphs.map((para, pi) => (
        <ParagraphBlock
          key={`${para.timestamp}-${pi}`}
          paragraph={para}
          onToggleWord={onToggleWord}
        />
      ))}
    </div>
  );
}

function ParagraphBlock({
  paragraph,
  onToggleWord,
}: {
  paragraph: WordParagraph;
  onToggleWord: (id: string) => void;
}) {
  const currentTime = useTimelineStore((s) => s.currentTime);
  const { setCurrentTime, setIsPlaying } = useTimelineStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={scrollContainerRef}>
      <span className="text-[10px] font-mono text-editor-text-dim block mb-1.5 select-none">
        {formatTimeShort(paragraph.timestamp)}
      </span>
      <div className="leading-relaxed">
        {paragraph.words.map((word) => (
          <WordSpan
            key={word.id}
            word={word}
            currentTime={currentTime}
            onToggle={() => onToggleWord(word.id)}
            onSeek={() => {
              setCurrentTime(word.startTime);
              setIsPlaying(false);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function WordSpan({
  word,
  currentTime,
  onToggle,
  onSeek,
}: {
  word: TranscriptWord;
  currentTime: number;
  onToggle: () => void;
  onSeek: () => void;
}) {
  const isActive = currentTime >= word.startTime && currentTime < word.endTime;
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey) {
        onSeek();
      } else {
        onToggle();
      }
    },
    [onToggle, onSeek],
  );

  const handleDoubleClick = useCallback(() => {
    onSeek();
  }, [onSeek]);

  return (
    <span
      ref={ref}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`
        inline cursor-pointer select-none rounded-sm px-0.5 py-px text-[13px] transition-all duration-150
        ${word.isCrossed
          ? 'line-through opacity-40 text-red-400/70 hover:opacity-60'
          : isActive
            ? 'bg-teal-500/30 text-teal-200'
            : 'text-editor-text hover:bg-editor-hover/60'
        }
      `}
      title={word.isCrossed ? 'Click to restore' : 'Click to cross out, Shift+click to seek'}
    >
      {word.text}{' '}
    </span>
  );
}

function TranscriptFooter({
  crossedCount,
  hasApplied,
  onApply,
}: {
  crossedCount: number;
  hasApplied: boolean;
  onApply: () => void;
}) {
  if (crossedCount === 0 && !hasApplied) return null;

  return (
    <div className="px-4 py-3 border-t border-editor-border bg-editor-panel shrink-0 space-y-2">
      {hasApplied && crossedCount === 0 && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-editor-success/10 border border-editor-success/20">
          <Check className="w-3.5 h-3.5 text-editor-success" />
          <span className="text-xs text-editor-success font-medium">Edits applied -- cross out more words to continue editing</span>
        </div>
      )}
      {crossedCount > 0 && (
        <>
          <button
            onClick={onApply}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors bg-teal-500 hover:bg-teal-400 text-white"
          >
            <Scissors className="w-4 h-4" />
            {hasApplied ? 'Apply More Edits' : 'Apply Edits to Timeline'}
          </button>
          <p className="text-[10px] text-editor-text-dim text-center">
            Permanently cuts crossed-out portions. Ctrl+Z to undo.
          </p>
        </>
      )}
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
        Add a video to the main track, then come back to edit the transcript.
      </p>
    </div>
  );
}

function ReadyState({ onTranscribe }: { onTranscribe: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-4">
        <Sparkles className="w-7 h-7 text-teal-400" />
      </div>
      <p className="text-sm text-editor-text mb-2">Edit your transcript</p>
      <p className="text-xs text-editor-text-dim leading-relaxed mb-5">
        AI will transcribe your video, then you can cross out filler words and
        unwanted sections. Crossed-out words are skipped during playback in real time.
      </p>
      <button
        onClick={onTranscribe}
        className="flex items-center gap-2 px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <FileText className="w-4 h-4" />
        Transcribe Audio
      </button>
    </div>
  );
}

function TranscribingState({ progress }: { progress: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-4 relative">
        <FileText className="w-7 h-7 text-teal-400" />
        <div className="absolute inset-0 rounded-2xl border-2 border-teal-400/40 animate-ping" />
      </div>
      <p className="text-sm text-editor-text mb-2">Transcribing audio...</p>
      {progress && (
        <p className="text-xs text-teal-400 mb-1">{progress}</p>
      )}
      <p className="text-xs text-editor-text-dim leading-relaxed">
        Gemini is listening to your video and generating a word-level transcript.
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
      <p className="text-sm text-editor-text mb-2">Transcription failed</p>
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

function AppliedState({ onRetranscribe }: { onRetranscribe: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-editor-success/10 border border-editor-success/20 flex items-center justify-center mb-4">
        <Check className="w-7 h-7 text-editor-success" />
      </div>
      <p className="text-sm text-editor-text mb-2">Edits applied to timeline</p>
      <p className="text-xs text-editor-text-dim leading-relaxed mb-5">
        Crossed-out words have been permanently removed from the timeline.
        Use Ctrl+Z to undo if needed.
      </p>
      <button
        onClick={onRetranscribe}
        className="flex items-center gap-2 px-4 py-2 bg-editor-hover border border-editor-border rounded-lg text-sm text-editor-text hover:bg-editor-active transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Re-transcribe
      </button>
    </div>
  );
}
