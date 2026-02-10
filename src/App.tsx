import { useEffect, useState, useCallback, useRef } from 'react';
import TopBar from './components/TopBar';
import MediaPanel from './components/MediaPanel';
import VideoPreview from './components/VideoPreview';
import Timeline from './components/Timeline';
import PropertiesPanel from './components/PropertiesPanel';
import ExportModal from './components/ExportModal';
import Toasts from './components/Toasts';
import BRollPanel from './components/BRollPanel';
import CaptionsPanel from './components/CaptionsPanel';
import TranscriptPanel from './components/TranscriptPanel';
import AIChatPanel from './components/AIChatPanel';
import LandingPage from './components/landing/LandingPage';
import { useUIStore } from './store/ui-store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { getFFmpeg } from './lib/ffmpeg';

function Editor() {
  const { showMediaPanel, showPropertiesPanel, showExportModal, showBRollPanel, showCaptionsPanel, showTranscriptPanel, setFfmpegReady, ffmpegReady } =
    useUIStore();

  useKeyboardShortcuts();

  useEffect(() => {
    getFFmpeg()
      .then(() => setFfmpegReady(true))
      .catch((err) => console.error('FFmpeg failed to load:', err));
  }, [setFfmpegReady]);

  const [timelineHeight, setTimelineHeight] = useState(300);
  const resizeRef = useRef({ startY: 0, startH: 0 });

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startY: e.clientY, startH: timelineHeight };
    const onMove = (me: MouseEvent) => {
      const dy = resizeRef.current.startY - me.clientY;
      setTimelineHeight(Math.max(150, Math.min(700, resizeRef.current.startH + dy)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [timelineHeight]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <TopBar />

      <div className="flex-1 flex overflow-hidden">
        {showMediaPanel && <MediaPanel />}

        <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
          <VideoPreview />
          <div
            className="h-1.5 cursor-row-resize flex-shrink-0 relative group"
            onMouseDown={handleResizeStart}
          >
            <div className="absolute inset-x-0 -top-1.5 -bottom-1.5 z-10" />
            <div className="absolute inset-0 bg-editor-border group-hover:bg-editor-accent/40 active:bg-editor-accent/60 transition-colors" />
          </div>
          <Timeline height={timelineHeight} />
        </div>

        {showPropertiesPanel && <PropertiesPanel />}
      </div>

      {showExportModal && <ExportModal />}
      {showBRollPanel && <BRollPanel />}
      {showCaptionsPanel && <CaptionsPanel />}
      {showTranscriptPanel && <TranscriptPanel />}

      <Toasts />
      <AIChatPanel />

      {!ffmpegReady && (
        <div className="fixed bottom-6 left-6 z-40">
          <div className="flex items-center gap-2.5 bg-editor-panel border border-editor-border rounded-xl px-4 py-3 shadow-xl">
            <div className="w-3 h-3 rounded-full border-2 border-editor-accent border-t-transparent animate-spin" />
            <span className="text-xs text-editor-text-muted">Loading video engine...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const appView = useUIStore((s) => s.appView);

  if (appView === 'landing') {
    return <LandingPage />;
  }

  return <Editor />;
}
