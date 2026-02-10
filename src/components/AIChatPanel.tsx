import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Trash2, ChevronRight, Loader2, Bot, User, Mic, MicOff, Radio } from 'lucide-react';
import { useChatStore, type ChatMessage, type ChatAction } from '../store/chat-store';
import { useVoiceStore } from '../store/voice-store';

const ACTION_LABELS: Record<string, string> = {
  analyze_broll: 'Analyzed B-Roll',
  add_captions: 'Added Captions',
  set_caption_style: 'Changed Caption Style',
  add_text: 'Added Text',
  seek: 'Moved Playhead',
  playback: 'Playback Control',
  split_clip: 'Split Clip',
  delete_clip: 'Deleted Clip',
  set_project: 'Updated Project',
  open_export: 'Opened Export',
  get_timeline_info: 'Checked Timeline',
  remove_silences: 'Removed Silences',
  add_all_media_to_timeline: 'Added Media to Timeline',
};

export default function AIChatPanel() {
  const { isOpen, toggle } = useChatStore();

  return (
    <>
      <ChatButton onClick={toggle} isOpen={isOpen} />
      {isOpen && <ChatWindow />}
    </>
  );
}

function ChatButton({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
        isOpen
          ? 'bg-editor-surface border border-editor-border text-editor-text-muted hover:text-editor-text rotate-0'
          : 'bg-gradient-to-br from-sky-500 to-cyan-600 text-white hover:from-sky-400 hover:to-cyan-500 hover:shadow-sky-500/25 hover:shadow-xl'
      }`}
    >
      {isOpen ? <X className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
    </button>
  );
}

function ChatWindow() {
  const { messages, isProcessing, sendMessage, clearMessages } = useChatStore();
  const { isVoiceActive, connectionState, sendTextDuringVoice } = useVoiceStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (isVoiceActive) {
      sendTextDuringVoice(trimmed);
    } else {
      if (isProcessing) return;
      sendMessage(trimmed);
    }
    setInput('');
  }, [input, isProcessing, isVoiceActive, sendMessage, sendTextDuringVoice]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-20 right-5 z-50 w-[380px] max-h-[520px] flex flex-col bg-editor-surface border border-editor-border rounded-2xl shadow-2xl overflow-hidden animate-chat-open">
      <ChatHeader
        messagesExist={messages.length > 0}
        onClear={clearMessages}
        isVoiceActive={isVoiceActive}
        connectionState={connectionState}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">
        {messages.length === 0 && !isProcessing && <WelcomeView />}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isProcessing && <ThinkingIndicator />}
      </div>

      {isVoiceActive && <VoiceStatusBar />}

      <div className="border-t border-editor-border p-3 bg-editor-panel/50">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isVoiceActive ? 'Type while speaking...' : 'Ask me anything...'}
            rows={1}
            className="flex-1 resize-none bg-editor-hover border border-editor-border rounded-xl px-3 py-2.5 text-sm text-editor-text placeholder:text-editor-text-dim outline-none focus:border-sky-500/50 transition-colors max-h-24 overflow-y-auto"
            disabled={isProcessing && !isVoiceActive}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || (isProcessing && !isVoiceActive)}
            className="w-9 h-9 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:bg-editor-hover disabled:text-editor-text-dim text-white flex items-center justify-center transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
          <VoiceMicButton />
        </div>
        <p className="text-[10px] text-editor-text-dim mt-1.5 text-center">
          {isVoiceActive ? 'Voice active -- type or speak' : 'Enter to send -- Shift+Enter for new line'}
        </p>
      </div>
    </div>
  );
}

function ChatHeader({
  messagesExist,
  onClear,
  isVoiceActive,
  connectionState,
}: {
  messagesExist: boolean;
  onClear: () => void;
  isVoiceActive: boolean;
  connectionState: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border bg-editor-panel">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500/20 to-cyan-500/20 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-sky-400" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-editor-text">Framecraft AI</span>
          {isVoiceActive ? (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-voice-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">Voice</span>
            </span>
          ) : (
            <span className="text-[10px] text-editor-text-dim font-mono">
              {connectionState === 'connecting' ? 'Connecting...' : 'Gemini 3 Flash'}
            </span>
          )}
        </div>
      </div>
      {messagesExist && (
        <button
          onClick={onClear}
          className="btn-icon text-editor-text-dim hover:text-editor-error"
          title="Clear chat"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function VoiceMicButton() {
  const { isVoiceActive, connectionState, isSupported, startVoice, stopVoice, error } = useVoiceStore();
  const isConnecting = connectionState === 'connecting';

  if (!isSupported) return null;

  const handleClick = () => {
    if (isVoiceActive || isConnecting) {
      stopVoice();
    } else {
      useVoiceStore.setState({ error: null, connectionState: 'idle' });
      startVoice();
    }
  };

  return (
    <div className="relative group">
      <button
        onClick={handleClick}
        title={isVoiceActive ? 'Stop voice' : 'Start voice chat'}
        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 ${
          isVoiceActive
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-voice-mic-glow'
            : isConnecting
              ? 'bg-editor-hover text-sky-400 border border-editor-border'
              : error
                ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                : 'bg-editor-hover text-editor-text-muted border border-editor-border hover:text-editor-text hover:border-editor-border-light'
        }`}
      >
        {isConnecting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isVoiceActive ? (
          <MicOff className="w-4 h-4" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </button>
      {error && !isVoiceActive && (
        <div className="absolute bottom-full right-0 mb-2 w-56 px-2.5 py-1.5 rounded-lg bg-red-950/90 border border-red-500/30 text-[10px] text-red-300 leading-snug shadow-lg pointer-events-none">
          {error}
        </div>
      )}
    </div>
  );
}

function VoiceStatusBar() {
  const { isSpeaking, isListening, currentUserTranscript, currentAITranscript } = useVoiceStore();

  const liveText = isSpeaking
    ? currentAITranscript
    : currentUserTranscript;

  return (
    <div className="border-t border-editor-border bg-editor-panel/30 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {isSpeaking ? (
            <>
              <Radio className="w-3 h-3 text-sky-400" />
              <VoiceWaveform color="sky" />
              <span className="text-[10px] text-sky-400 font-medium">AI speaking</span>
            </>
          ) : isListening ? (
            <>
              <Mic className="w-3 h-3 text-emerald-400" />
              <VoiceWaveform color="emerald" />
              <span className="text-[10px] text-emerald-400 font-medium">Listening</span>
            </>
          ) : (
            <>
              <Radio className="w-3 h-3 text-editor-text-dim" />
              <span className="text-[10px] text-editor-text-dim">Connected</span>
            </>
          )}
        </div>
      </div>
      {liveText && (
        <p className="text-[11px] text-editor-text-muted mt-1 truncate leading-snug italic">
          {liveText}
        </p>
      )}
    </div>
  );
}

function VoiceWaveform({ color }: { color: 'sky' | 'emerald' }) {
  const colorClass = color === 'sky' ? 'bg-sky-400' : 'bg-emerald-400';
  return (
    <div className="flex items-center gap-[2px] h-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-[2px] rounded-full ${colorClass} animate-voice-wave`}
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

function WelcomeView() {
  const { sendMessage } = useChatStore();
  const { isSupported } = useVoiceStore();

  const suggestions = [
    'Add captions to my video',
    'Analyze my video for B-Roll',
    'Add a title text overlay',
    'What\'s on my timeline?',
  ];

  return (
    <div className="flex flex-col items-center pt-6 pb-2">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500/15 to-cyan-500/15 border border-sky-500/20 flex items-center justify-center mb-3">
        <Bot className="w-6 h-6 text-sky-400" />
      </div>
      <p className="text-sm font-medium text-editor-text mb-1">How can I help?</p>
      <p className="text-xs text-editor-text-dim text-center mb-4 px-4 leading-relaxed">
        I can add captions, suggest B-Roll, add text overlays, control playback, and more.
        {isSupported && ' Click the mic button to use voice.'}
      </p>
      <div className="w-full space-y-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => sendMessage(s)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-editor-hover/50 border border-editor-border/50 text-xs text-editor-text-muted hover:text-editor-text hover:bg-editor-hover hover:border-editor-border transition-colors text-left group"
          >
            <ChevronRight className="w-3 h-3 text-sky-400/60 group-hover:text-sky-400 transition-colors shrink-0" />
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isVoiceMsg = message.id.startsWith('voice-');

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
        isUser
          ? 'bg-sky-500/20'
          : 'bg-editor-hover border border-editor-border'
      }`}>
        {isUser
          ? (isVoiceMsg ? <Mic className="w-3 h-3 text-sky-400" /> : <User className="w-3 h-3 text-sky-400" />)
          : <Bot className="w-3 h-3 text-editor-text-muted" />
        }
      </div>
      <div className={`flex flex-col gap-1.5 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        {message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.actions.map((a, i) => (
              <ActionChip key={i} action={a} />
            ))}
          </div>
        )}
        <div className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? 'bg-sky-500/15 text-editor-text border border-sky-500/20'
            : 'bg-editor-hover text-editor-text border border-editor-border'
        }`}>
          {message.text}
        </div>
      </div>
    </div>
  );
}

function ActionChip({ action }: { action: ChatAction }) {
  const label = ACTION_LABELS[action.name] || action.name;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-[10px] text-sky-400 font-medium">
      <Sparkles className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex gap-2">
      <div className="w-6 h-6 rounded-lg bg-editor-hover border border-editor-border flex items-center justify-center shrink-0">
        <Loader2 className="w-3 h-3 text-sky-400 animate-spin" />
      </div>
      <div className="bg-editor-hover border border-editor-border rounded-xl px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-sky-400/60"
                style={{
                  animation: 'chat-dot 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
          <span className="text-[10px] text-editor-text-dim ml-1">Thinking...</span>
        </div>
      </div>
    </div>
  );
}
