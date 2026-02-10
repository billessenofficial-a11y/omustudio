import { useState, useRef, useEffect } from 'react';
import {
  Download,
  Undo2,
  Redo2,
  Film,
  Settings,
  ChevronDown,
  Wand2,
  Captions,
  FileText,
  Scissors,
  Loader2,
  LogOut,
} from 'lucide-react';
import { useProjectStore } from '../store/project-store';
import { useUIStore } from '../store/ui-store';
import { useAuthStore } from '../store/auth-store';
import { removeSilences } from '../lib/silence-remover';

export default function TopBar() {
  const { project, setProject } = useProjectStore();
  const { setShowExportModal, toggleBRollPanel, showBRollPanel, toggleCaptionsPanel, showCaptionsPanel, toggleTranscriptPanel, showTranscriptPanel, setAppView } = useUIStore();
  const { signOut } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const [removingSilences, setRemovingSilences] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleRemoveSilences = async () => {
    if (removingSilences) return;
    setRemovingSilences(true);
    try {
      await removeSilences();
    } catch (err) {
      useUIStore.getState().addToast(
        err instanceof Error ? err.message : 'Failed to remove silences',
        'error',
      );
    } finally {
      setRemovingSilences(false);
    }
  };

  const commitName = () => {
    const trimmed = nameValue.trim();
    if (trimmed) setProject({ name: trimmed });
    else setNameValue(project.name);
    setEditing(false);
  };

  const handleLogout = async () => {
    await signOut();
    setAppView('landing');
  };

  return (
    <header className="h-12 bg-editor-surface border-b border-editor-border flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-editor-accent/20 flex items-center justify-center">
            <Film className="w-4 h-4 text-editor-accent" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-editor-text">
            Omu
          </span>
        </div>

        <div className="w-px h-5 bg-editor-border mx-1" />

        {editing ? (
          <input
            ref={inputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') {
                setNameValue(project.name);
                setEditing(false);
              }
            }}
            className="bg-editor-hover border border-editor-border-light rounded px-2 py-0.5 text-sm w-48 outline-none focus:border-editor-accent"
          />
        ) : (
          <button
            onClick={() => {
              setNameValue(project.name);
              setEditing(true);
            }}
            className="flex items-center gap-1 text-sm text-editor-text-muted hover:text-editor-text transition-colors"
          >
            {project.name}
            <ChevronDown className="w-3 h-3" />
          </button>
        )}

        <span className="text-xs text-editor-text-dim font-mono">
          {project.width}x{project.height}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button className="btn-icon" title="Undo">
          <Undo2 className="w-4 h-4" />
        </button>
        <button className="btn-icon" title="Redo">
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-editor-border mx-2" />

        <button
          onClick={toggleBRollPanel}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            showBRollPanel
              ? 'bg-teal-500/20 text-teal-400'
              : 'text-editor-text-muted hover:bg-editor-hover hover:text-editor-text'
          }`}
          title="AI B-Roll"
        >
          <Wand2 className="w-3.5 h-3.5" />
          AI B-Roll
        </button>

        <button
          onClick={toggleCaptionsPanel}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            showCaptionsPanel
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-editor-text-muted hover:bg-editor-hover hover:text-editor-text'
          }`}
          title="AI Captions"
        >
          <Captions className="w-3.5 h-3.5" />
          Captions
        </button>

        <button
          onClick={toggleTranscriptPanel}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            showTranscriptPanel
              ? 'bg-teal-500/20 text-teal-400'
              : 'text-editor-text-muted hover:bg-editor-hover hover:text-editor-text'
          }`}
          title="Transcript Editor"
        >
          <FileText className="w-3.5 h-3.5" />
          Transcript
        </button>

        <button
          onClick={handleRemoveSilences}
          disabled={removingSilences}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            removingSilences
              ? 'bg-rose-500/20 text-rose-400'
              : 'text-editor-text-muted hover:bg-editor-hover hover:text-editor-text'
          }`}
          title="AI Remove Silences"
        >
          {removingSilences ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Scissors className="w-3.5 h-3.5" />
          )}
          {removingSilences ? 'Removing...' : 'Remove Silences'}
        </button>

        <div className="w-px h-5 bg-editor-border mx-1" />

        <button className="btn-icon" title="Settings">
          <Settings className="w-4 h-4" />
        </button>
        <button
          onClick={handleLogout}
          className="btn-icon"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowExportModal(true)}
          className="btn-primary flex items-center gap-2 ml-2"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>
    </header>
  );
}
