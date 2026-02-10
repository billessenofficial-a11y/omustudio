import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Captions,
  RefreshCw,
  Trash2,
  AlertCircle,
  Video,
  Check,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash,
  Clock,
} from 'lucide-react';
import { useCaptionStore, type CaptionStyle, type CaptionPhrase } from '../store/caption-store';
import { useTimelineStore } from '../store/timeline-store';
import { useUIStore } from '../store/ui-store';
import { formatTimeShort, formatTimePrecise, parseTimeInput } from '../lib/format';
import type { CaptionSegment } from '../lib/gemini-service';

const STYLE_OPTIONS: { id: CaptionStyle; label: string; preview: string }[] = [
  { id: 'karaoke', label: 'Karaoke', preview: 'Word highlight + emojis' },
  { id: 'pop', label: 'Pop', preview: 'Bouncy entrance' },
  { id: 'fade', label: 'Fade', preview: 'Smooth fade in' },
  { id: 'typewriter', label: 'Typewriter', preview: 'Letter by letter' },
  { id: 'word-by-word', label: 'Word by Word', preview: 'Reveal each word' },
  { id: 'slide', label: 'Slide Up', preview: 'Slides from below' },
];

export default function CaptionsPanel() {
  const { toggleCaptionsPanel } = useUIStore();
  const {
    segments,
    isTranscribing,
    transcribeProgress,
    error,
    captionStyle,
    highlightColor,
    clipIds,
    transcribeTimeline,
    setCaptionStyle,
    setHighlightColor,
    applyCaptions,
    clearCaptions,
    getPhrases,
  } = useCaptionStore();

  const mainTrack = useTimelineStore((s) => s.tracks.find((t) => t.role === 'main'));
  const hasMainVideo = mainTrack && mainTrack.clips.some((c) => c.mediaId);
  const hasApplied = clipIds.length > 0;
  const phrases = segments.length > 0 ? getPhrases() : [];

  return (
    <div className="fixed inset-y-0 right-0 w-96 z-40 flex flex-col bg-editor-surface border-l border-editor-border shadow-2xl animate-slide-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border bg-editor-panel">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Captions className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-sm font-semibold text-editor-text">AI Captions</span>
        </div>
        <div className="flex items-center gap-1">
          {(segments.length > 0 || hasApplied) && (
            <button
              onClick={clearCaptions}
              className="btn-icon text-editor-text-dim hover:text-editor-error"
              title="Clear all captions"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={toggleCaptionsPanel} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!hasMainVideo && <EmptyState />}

        {hasMainVideo && segments.length === 0 && !isTranscribing && !error && !hasApplied && (
          <ReadyState onTranscribe={transcribeTimeline} />
        )}

        {isTranscribing && <TranscribingState progress={transcribeProgress} />}

        {error && !isTranscribing && (
          <ErrorState error={error} onRetry={transcribeTimeline} />
        )}

        {segments.length > 0 && !isTranscribing && (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-editor-border space-y-4">
              <div>
                <label className="text-xs font-medium text-editor-text-muted mb-2 block">
                  Caption Style
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {STYLE_OPTIONS.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setCaptionStyle(style.id)}
                      className={`flex flex-col items-start px-3 py-2.5 rounded-lg border text-left transition-all ${
                        captionStyle === style.id
                          ? 'border-amber-500/50 bg-amber-500/10'
                          : 'border-editor-border bg-editor-panel hover:border-editor-border-light'
                      }`}
                    >
                      <span className={`text-xs font-medium ${
                        captionStyle === style.id ? 'text-amber-400' : 'text-editor-text'
                      }`}>
                        {style.label}
                      </span>
                      <span className="text-[10px] text-editor-text-dim mt-0.5">
                        {style.preview}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {captionStyle === 'karaoke' && (
                <div>
                  <label className="text-xs font-medium text-editor-text-muted mb-2 block">
                    Highlight Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={highlightColor}
                      onChange={(e) => setHighlightColor(e.target.value)}
                      className="w-8 h-8 rounded border border-editor-border cursor-pointer bg-transparent shrink-0"
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      {['#d78241', '#e53e3e', '#38a169', '#3182ce', '#d69e2e', '#dd6b20', '#e53e83', '#00b5d8'].map((c) => (
                        <button
                          key={c}
                          onClick={() => setHighlightColor(c)}
                          className={`w-6 h-6 rounded-md border-2 transition-all ${
                            highlightColor === c ? 'border-white scale-110' : 'border-transparent hover:border-editor-border-light'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={applyCaptions}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Check className="w-4 h-4" />
                  {hasApplied ? 'Re-apply Captions' : 'Apply to Timeline'}
                </button>
                <button
                  onClick={transcribeTimeline}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-editor-hover border border-editor-border rounded-lg text-xs text-editor-text hover:bg-editor-active transition-colors"
                  title="Re-transcribe"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-editor-text-muted">
                  {phrases.length} phrase{phrases.length !== 1 ? 's' : ''} ({segments.length} words)
                </span>
                {hasApplied && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-editor-success/20">
                    <Check className="w-3 h-3 text-editor-success" />
                    <span className="text-[10px] text-editor-success font-medium">Applied</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                {phrases.map((phrase, i) => (
                  <PhraseRow key={`${phrase.startTime}-${i}`} phrase={phrase} />
                ))}
              </div>
            </div>
          </div>
        )}

        {hasApplied && segments.length === 0 && !isTranscribing && !error && (
          <AppliedState onRetranscribe={transcribeTimeline} count={clipIds.length} />
        )}
      </div>
    </div>
  );
}

function PhraseRow({ phrase }: { phrase: CaptionPhrase }) {
  const { setCurrentTime, setIsPlaying } = useTimelineStore();
  const currentTime = useTimelineStore((s) => s.currentTime);
  const [expanded, setExpanded] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);

  const isActive = currentTime >= phrase.startTime && currentTime < phrase.endTime;

  const { segments, updateSegmentText } = useCaptionStore();

  const firstWordGlobalIndex = segments.findIndex(
    (s) => s.startTime === phrase.words[0]?.startTime && s.text === phrase.words[0]?.text
  );

  const handleStartEdit = useCallback(() => {
    setEditValue(phrase.text);
    setEditingText(true);
  }, [phrase.text]);

  useEffect(() => {
    if (editingText && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingText]);

  const handleSaveEdit = useCallback(() => {
    if (firstWordGlobalIndex < 0) {
      setEditingText(false);
      return;
    }

    const newWords = editValue.trim().split(/\s+/).filter(Boolean);
    if (newWords.length === 0) {
      setEditingText(false);
      return;
    }

    const oldWords = phrase.words;
    const phraseStart = oldWords[0].startTime;
    const phraseEnd = oldWords[oldWords.length - 1].endTime;
    const totalDuration = phraseEnd - phraseStart;
    const totalChars = newWords.reduce((sum, w) => sum + w.length, 0);

    let cursor = phraseStart;
    for (let i = 0; i < newWords.length; i++) {
      const wordDuration = (newWords[i].length / totalChars) * totalDuration;
      const globalIdx = firstWordGlobalIndex + i;

      if (i < oldWords.length) {
        if (newWords.length !== oldWords.length) {
          const store = useCaptionStore.getState();
          const segs = [...store.segments];
          segs[globalIdx] = {
            text: newWords[i],
            startTime: cursor,
            endTime: cursor + wordDuration,
          };
          useCaptionStore.setState({ segments: segs });
        } else {
          updateSegmentText(globalIdx, newWords[i]);
        }
      } else {
        const store = useCaptionStore.getState();
        const segs = [...store.segments];
        segs.splice(globalIdx, 0, {
          text: newWords[i],
          startTime: cursor,
          endTime: cursor + wordDuration,
        });
        useCaptionStore.setState({ segments: segs });
      }
      cursor += wordDuration;
    }

    if (newWords.length < oldWords.length) {
      const store = useCaptionStore.getState();
      const segs = [...store.segments];
      segs.splice(firstWordGlobalIndex + newWords.length, oldWords.length - newWords.length);
      useCaptionStore.setState({ segments: segs });
    }

    setEditingText(false);
  }, [editValue, phrase, firstWordGlobalIndex, updateSegmentText]);

  return (
    <div className={`rounded-lg border transition-all ${
      isActive
        ? 'border-amber-500/40 bg-amber-500/5'
        : 'border-transparent hover:bg-editor-hover/50'
    }`}>
      <div className="flex items-start gap-2 px-2.5 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-0.5 text-editor-text-dim hover:text-editor-text transition-colors shrink-0"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <button
            onClick={() => {
              setCurrentTime(phrase.startTime);
              setIsPlaying(false);
            }}
            className="w-full text-left"
          >
            <span className="text-[10px] font-mono text-editor-text-dim block mb-0.5">
              {formatTimeShort(phrase.startTime)} - {formatTimeShort(phrase.endTime)}
            </span>
            {editingText ? (
              <textarea
                ref={editRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                  if (e.key === 'Escape') setEditingText(false);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs text-editor-text bg-editor-panel border border-editor-border rounded px-2 py-1.5 resize-none focus:outline-none focus:border-amber-500/50"
                rows={2}
              />
            ) : (
              <span className={`text-xs leading-relaxed transition-colors ${
                isActive ? 'text-amber-300' : 'text-editor-text'
              }`}>
                {phrase.text}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {editingText ? (
            <>
              <button
                onClick={handleSaveEdit}
                className="p-1 rounded text-editor-success hover:bg-editor-success/10 transition-colors"
                title="Save"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={() => setEditingText(false)}
                className="p-1 rounded text-editor-text-dim hover:bg-editor-hover transition-colors"
                title="Cancel"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleStartEdit(); }}
              className="p-1 rounded text-editor-text-dim hover:text-amber-400 hover:bg-editor-hover transition-colors opacity-0 group-hover:opacity-100"
              style={{ opacity: undefined }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '')}
              title="Edit phrase"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="pl-8 pr-2.5 pb-2 space-y-0.5">
          {phrase.words.map((word, wi) => {
            const globalIdx = firstWordGlobalIndex >= 0 ? firstWordGlobalIndex + wi : -1;
            return (
              <WordRow
                key={`${word.startTime}-${wi}`}
                word={word}
                globalIndex={globalIdx}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function WordRow({ word, globalIndex }: { word: CaptionSegment; globalIndex: number }) {
  const { setCurrentTime, setIsPlaying } = useTimelineStore();
  const currentTime = useTimelineStore((s) => s.currentTime);
  const { updateSegmentText, updateSegmentTiming, deleteSegment } = useCaptionStore();

  const isActive = currentTime >= word.startTime && currentTime < word.endTime;
  const [editingWord, setEditingWord] = useState(false);
  const [wordValue, setWordValue] = useState('');
  const [editingStart, setEditingStart] = useState(false);
  const [editingEnd, setEditingEnd] = useState(false);
  const [startValue, setStartValue] = useState('');
  const [endValue, setEndValue] = useState('');
  const wordRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingWord && wordRef.current) { wordRef.current.focus(); wordRef.current.select(); }
  }, [editingWord]);

  useEffect(() => {
    if (editingStart && startRef.current) { startRef.current.focus(); startRef.current.select(); }
  }, [editingStart]);

  useEffect(() => {
    if (editingEnd && endRef.current) { endRef.current.focus(); endRef.current.select(); }
  }, [editingEnd]);

  const handleSaveWord = () => {
    const trimmed = wordValue.trim();
    if (trimmed && globalIndex >= 0) updateSegmentText(globalIndex, trimmed);
    setEditingWord(false);
  };

  const handleSaveStart = () => {
    const parsed = parseTimeInput(startValue);
    if (parsed !== null && globalIndex >= 0 && parsed < word.endTime) {
      updateSegmentTiming(globalIndex, parsed, word.endTime);
    }
    setEditingStart(false);
  };

  const handleSaveEnd = () => {
    const parsed = parseTimeInput(endValue);
    if (parsed !== null && globalIndex >= 0 && parsed > word.startTime) {
      updateSegmentTiming(globalIndex, word.startTime, parsed);
    }
    setEditingEnd(false);
  };

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded transition-all text-[10px] ${
      isActive ? 'bg-amber-500/10' : 'hover:bg-editor-hover/40'
    }`}>
      <button
        onClick={() => { setCurrentTime(word.startTime); setIsPlaying(false); }}
        className="flex items-center gap-1 shrink-0"
        title="Seek to word"
      >
        <Clock className="w-2.5 h-2.5 text-editor-text-dim" />
      </button>

      <div className="flex items-center gap-1 font-mono text-editor-text-dim shrink-0">
        {editingStart ? (
          <input
            ref={startRef}
            value={startValue}
            onChange={(e) => setStartValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveStart();
              if (e.key === 'Escape') setEditingStart(false);
            }}
            onBlur={handleSaveStart}
            className="w-[72px] bg-editor-panel border border-editor-border rounded px-1 py-0.5 text-[10px] text-editor-text focus:outline-none focus:border-amber-500/50"
          />
        ) : (
          <button
            onClick={() => { setStartValue(formatTimePrecise(word.startTime)); setEditingStart(true); }}
            className="hover:text-amber-400 transition-colors"
            title="Edit start time"
          >
            {formatTimePrecise(word.startTime)}
          </button>
        )}
        <span>-</span>
        {editingEnd ? (
          <input
            ref={endRef}
            value={endValue}
            onChange={(e) => setEndValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEnd();
              if (e.key === 'Escape') setEditingEnd(false);
            }}
            onBlur={handleSaveEnd}
            className="w-[72px] bg-editor-panel border border-editor-border rounded px-1 py-0.5 text-[10px] text-editor-text focus:outline-none focus:border-amber-500/50"
          />
        ) : (
          <button
            onClick={() => { setEndValue(formatTimePrecise(word.endTime)); setEditingEnd(true); }}
            className="hover:text-amber-400 transition-colors"
            title="Edit end time"
          >
            {formatTimePrecise(word.endTime)}
          </button>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {editingWord ? (
          <input
            ref={wordRef}
            value={wordValue}
            onChange={(e) => setWordValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveWord();
              if (e.key === 'Escape') setEditingWord(false);
            }}
            onBlur={handleSaveWord}
            className="w-full bg-editor-panel border border-editor-border rounded px-1.5 py-0.5 text-[10px] text-editor-text focus:outline-none focus:border-amber-500/50"
          />
        ) : (
          <button
            onClick={() => { setWordValue(word.text); setEditingWord(true); }}
            className={`text-[11px] transition-colors truncate ${
              isActive ? 'text-amber-300 font-medium' : 'text-editor-text hover:text-amber-400'
            }`}
            title="Edit word"
          >
            {word.text}
          </button>
        )}
      </div>

      <button
        onClick={() => { if (globalIndex >= 0) deleteSegment(globalIndex); }}
        className="p-0.5 rounded text-editor-text-dim hover:text-editor-error transition-colors shrink-0 opacity-0 hover:opacity-100"
        style={{ opacity: undefined }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '')}
        title="Delete word"
      >
        <Trash className="w-2.5 h-2.5" />
      </button>
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
        Add a video to the main track, then come back to generate captions from the audio.
      </p>
    </div>
  );
}

function ReadyState({ onTranscribe }: { onTranscribe: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
        <Sparkles className="w-7 h-7 text-amber-400" />
      </div>
      <p className="text-sm text-editor-text mb-2">Generate captions</p>
      <p className="text-xs text-editor-text-dim leading-relaxed mb-5">
        AI will listen to your video's audio and transcribe it into animated captions.
        Each phrase will be placed on the text track with precise timing.
      </p>
      <button
        onClick={onTranscribe}
        className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <Captions className="w-4 h-4" />
        Transcribe Audio
      </button>
    </div>
  );
}

function TranscribingState({ progress }: { progress: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 relative">
        <Captions className="w-7 h-7 text-amber-400" />
        <div className="absolute inset-0 rounded-2xl border-2 border-amber-400/40 animate-ping" />
      </div>
      <p className="text-sm text-editor-text mb-2">Transcribing audio...</p>
      {progress && (
        <p className="text-xs text-amber-400 mb-1">{progress}</p>
      )}
      <p className="text-xs text-editor-text-dim leading-relaxed">
        Gemini is listening to your video and generating captions with precise timing.
        This may take 15-30 seconds.
      </p>
      <div className="mt-5 flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-amber-400"
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

function AppliedState({ onRetranscribe, count }: { onRetranscribe: () => void; count: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-editor-success/10 border border-editor-success/20 flex items-center justify-center mb-4">
        <Check className="w-7 h-7 text-editor-success" />
      </div>
      <p className="text-sm text-editor-text mb-2">{count} captions applied</p>
      <p className="text-xs text-editor-text-dim leading-relaxed mb-5">
        Captions have been added to the text track. You can edit individual captions by selecting
        them on the timeline.
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
