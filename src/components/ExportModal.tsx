import { useState, useRef } from 'react';
import { X, Download, Loader2, CheckCircle2, Monitor, Cloud, ExternalLink, AlertCircle } from 'lucide-react';
import { useProjectStore } from '../store/project-store';
import { useTimelineStore } from '../store/timeline-store';
import { useUIStore } from '../store/ui-store';
import { exportWithWebRenderer } from '../lib/web-renderer-export';
import { exportWithBrowserRecord } from '../lib/browser-record-export';
import { exportWithMediabunny } from '../lib/mediabunny-export';
import { startCloudRender, type CloudRenderStatus } from '../lib/cloud-render-service';
import type { TextAnimation } from '../types/editor';

type ExportMethod = 'renderer' | 'browser-record' | 'mediabunny' | 'cloud';

export default function ExportModal() {
  const { project, mediaFiles, exportSettings, setExportSettings, setExporting, isExporting, exportProgress } =
    useProjectStore();
  const { tracks, transitions, duration: timelineDuration } = useTimelineStore();
  const { setShowExportModal, addToast } = useUIStore();
  const [done, setDone] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [exportMethod, setExportMethod] = useState<ExportMethod>('browser-record');
  const [cloudStatus, setCloudStatus] = useState<CloudRenderStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const mainVideoClips = tracks
    .filter((t) => t.type === 'video')
    .flatMap((t) => t.clips)
    .sort((a, b) => a.startTime - b.startTime);

  const textClips = tracks
    .filter((t) => t.type === 'text' && !t.isMuted)
    .flatMap((t) => t.clips);

  const overlayClips = tracks
    .filter((t) => t.type === 'overlay' && !t.isMuted)
    .flatMap((t) => t.clips);

  const audioClips = tracks
    .filter((t) => t.type === 'audio' && !t.isMuted)
    .flatMap((t) => t.clips);

  const hasClips = mainVideoClips.length > 0 || textClips.length > 0;

  const buildVideoInputs = () => {
    return mainVideoClips.map((clip) => {
      const media = mediaFiles.find((m) => m.id === clip.mediaId);
      if (!media) throw new Error(`Media not found for clip: ${clip.name}`);
      const incoming = transitions.find((t) => t.toClipId === clip.id);
      let outgoingBlobUrl: string | undefined;
      let outgoingMediaType: 'video' | 'image' | undefined;
      let outgoingTrimStart: number | undefined;
      let outgoingDuration: number | undefined;
      if (incoming) {
        const fromClip = mainVideoClips.find((c) => c.id === incoming.fromClipId);
        if (fromClip) {
          const fromMedia = mediaFiles.find((m) => m.id === fromClip.mediaId);
          if (fromMedia) {
            outgoingBlobUrl = fromMedia.blobUrl;
            outgoingMediaType = fromMedia.type === 'image' ? 'image' : 'video';
            outgoingTrimStart = fromClip.trimStart;
            outgoingDuration = fromClip.duration;
          }
        }
      }
      return {
        blobUrl: media.blobUrl,
        mediaType: (media.type === 'image' ? 'image' : 'video') as 'video' | 'image',
        outputStart: clip.startTime,
        duration: clip.duration,
        trimStart: clip.trimStart,
        transitionIn: incoming?.type,
        transitionInDuration: incoming?.duration,
        outgoingBlobUrl,
        outgoingMediaType,
        outgoingTrimStart,
        outgoingDuration,
      };
    });
  };

  const buildTextInputs = () => {
    return textClips
      .filter((c) => c.properties.text)
      .map((clip) => ({
        id: clip.id,
        startTime: clip.startTime,
        duration: clip.duration,
        text: clip.properties.text || '',
        fontSize: clip.properties.fontSize ?? 48,
        fontColor: clip.properties.fontColor ?? '#ffffff',
        fontFamily: clip.properties.fontFamily ?? "'Inter', sans-serif",
        textAlign: (clip.properties.textAlign as 'left' | 'center' | 'right') ?? 'center',
        animation: (clip.properties.textAnimation as TextAnimation) ?? 'fadeIn',
        animationDuration: clip.properties.animationDuration ?? 0.5,
        x: clip.properties.x ?? 50,
        y: clip.properties.y ?? 50,
        scale: (clip.properties.scale as number) ?? 1,
        rotation: (clip.properties.rotation as number) ?? 0,
        emoji: clip.properties.emoji,
        wordTimings: clip.properties.wordTimings,
        highlightColor: clip.properties.highlightColor,
      }));
  };

  const buildOverlayInputs = () => {
    return overlayClips
      .filter((clip) => {
        const media = clip.mediaId ? mediaFiles.find((m) => m.id === clip.mediaId) : undefined;
        return !!media;
      })
      .map((clip) => {
        const media = mediaFiles.find((m) => m.id === clip.mediaId)!;
        return {
          blobUrl: media.blobUrl,
          mediaType: (media.type === 'image' ? 'image' : 'video') as 'video' | 'image',
          startTime: clip.startTime,
          duration: clip.duration,
          trimStart: clip.trimStart,
          x: clip.properties.x ?? 50,
          y: clip.properties.y ?? 50,
          scale: clip.properties.scale ?? 1,
          rotation: clip.properties.rotation ?? 0,
          opacity: clip.properties.opacity ?? 1,
          fadeInDuration: clip.properties.fadeInDuration ?? 0,
          fadeOutDuration: clip.properties.fadeOutDuration ?? 0,
          overlayAnimation: clip.properties.overlayAnimation ?? ('none' as const),
        };
      });
  };

  const buildAudioInputs = () => {
    return audioClips
      .filter((clip) => {
        const media = clip.mediaId ? mediaFiles.find((m) => m.id === clip.mediaId) : undefined;
        return !!media;
      })
      .map((clip) => {
        const media = mediaFiles.find((m) => m.id === clip.mediaId)!;
        return {
          blobUrl: media.blobUrl,
          startTime: clip.startTime,
          duration: clip.duration,
          trimStart: clip.trimStart,
          volume: clip.properties.volume ?? 1,
        };
      });
  };

  const handleExportRenderer = async (controller: AbortController) => {
    return exportWithWebRenderer({
      videoClips: buildVideoInputs(),
      textClips: buildTextInputs(),
      overlayClips: buildOverlayInputs(),
      audioClips: buildAudioInputs(),
      width: exportSettings.width,
      height: exportSettings.height,
      fps: project.fps,
      totalDuration: timelineDuration,
      quality: exportSettings.quality,
      onProgress: (p) => setExporting(true, p),
      signal: controller.signal,
    });
  };

  const handleExportBrowserRecord = async (controller: AbortController) => {
    return exportWithBrowserRecord({
      width: exportSettings.width,
      height: exportSettings.height,
      fps: project.fps,
      totalDuration: timelineDuration,
      quality: exportSettings.quality,
      onProgress: (p) => setExporting(true, p),
      signal: controller.signal,
    });
  };

  const handleExportMediabunny = async (controller: AbortController) => {
    return exportWithMediabunny({
      width: exportSettings.width,
      height: exportSettings.height,
      fps: project.fps,
      totalDuration: timelineDuration,
      quality: exportSettings.quality,
      onProgress: (p) => setExporting(true, p),
      signal: controller.signal,
    });
  };

  const handleExportCloud = async (controller: AbortController) => {
    setCloudStatus({ phase: 'uploading', progress: 0, message: 'Preparing...' });

    const outputUrl = await startCloudRender({
      project,
      exportSettings,
      mediaFiles,
      tracks,
      transitions,
      totalDuration: timelineDuration,
      onStatus: (status) => {
        setCloudStatus(status);
        if (status.phase === 'rendering') {
          setExporting(true, status.progress);
        }
      },
      signal: controller.signal,
    });

    return outputUrl;
  };

  const handleExport = async () => {
    if (!hasClips) {
      addToast('Add clips to the timeline before exporting', 'warning');
      return;
    }

    setExporting(true, 0);
    setDone(false);
    setCloudStatus(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (exportMethod === 'cloud') {
        const outputUrl = await handleExportCloud(controller);
        if (outputUrl) {
          setDownloadUrl(outputUrl);
        }
        setDone(true);
        setExporting(false, 100);
        addToast('Cloud render complete', 'success');
      } else {
        let blob: Blob;
        if (exportMethod === 'renderer') {
          blob = await handleExportRenderer(controller);
        } else if (exportMethod === 'mediabunny') {
          blob = await handleExportMediabunny(controller);
        } else {
          blob = await handleExportBrowserRecord(controller);
        }
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setDone(true);
        setExporting(false, 100);
        addToast('Export complete', 'success');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('Export failed:', err);
      const errorMsg = err instanceof Error ? err.message : 'Export failed';
      setExporting(false, 0);
      if (exportMethod === 'cloud') {
        setCloudStatus({
          phase: 'failed',
          progress: 0,
          message: errorMsg,
          error: errorMsg,
        });
        setExporting(true, 0);
      } else {
        setCloudStatus(null);
        addToast(errorMsg, 'error');
      }
    }
  };

  const fileExtension = '.mp4';

  const triggerDownload = () => {
    if (!downloadUrl) return;
    if (exportMethod === 'cloud' && downloadUrl.startsWith('http')) {
      window.open(downloadUrl, '_blank');
      return;
    }
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${exportSettings.filename || 'export'}${fileExtension}`;
    a.click();
  };

  const handleClose = () => {
    abortRef.current?.abort();
    if (downloadUrl && !downloadUrl.startsWith('http')) {
      URL.revokeObjectURL(downloadUrl);
    }
    setDownloadUrl(null);
    setDone(false);
    setCloudStatus(null);
    setExporting(false, 0);
    setShowExportModal(false);
  };

  const qualityOptions: Array<{ value: 'high' | 'medium' | 'low'; label: string; desc: string }> = [
    { value: 'high', label: 'High', desc: 'Best quality, larger file' },
    { value: 'medium', label: 'Medium', desc: 'Balanced' },
    { value: 'low', label: 'Low', desc: 'Smaller file, faster' },
  ];

  const isCloudRendering = exportMethod === 'cloud' && isExporting && cloudStatus;

  const renderProgressContent = () => {
    if (isCloudRendering && cloudStatus) {
      return (
        <div className="text-center py-6">
          {cloudStatus.phase === 'failed' ? (
            <>
              <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-red-400" />
              </div>
              <p className="text-sm text-editor-text mb-1">Render failed</p>
              <p className="text-xs text-red-400 mb-4 max-w-[280px] mx-auto">{cloudStatus.error}</p>
              <button onClick={handleClose} className="btn-primary w-full justify-center">
                Close
              </button>
            </>
          ) : (
            <>
              <div className="relative w-14 h-14 mx-auto mb-4">
                <Cloud className="w-14 h-14 text-editor-accent/30" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-editor-accent animate-spin" />
                </div>
              </div>
              <p className="text-sm text-editor-text mb-1">
                {cloudStatus.phase === 'uploading' && 'Uploading media...'}
                {cloudStatus.phase === 'starting' && 'Starting cloud render...'}
                {cloudStatus.phase === 'rendering' && 'Rendering on cloud...'}
              </p>
              <p className="text-xs text-editor-text-dim mb-3">{cloudStatus.message}</p>
              <div className="w-full bg-editor-hover rounded-full h-2 mb-2">
                <div
                  className="bg-editor-accent h-2 rounded-full transition-all duration-500"
                  style={{ width: `${cloudStatus.progress}%` }}
                />
              </div>
              <p className="text-xs text-editor-text-dim">{cloudStatus.progress}%</p>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="text-center py-6">
        <Loader2 className="w-10 h-10 text-editor-accent animate-spin mx-auto mb-4" />
        <p className="text-sm text-editor-text mb-2">
          {exportMethod === 'browser-record'
            ? exportProgress < 66
              ? 'Recording timeline...'
              : exportProgress < 99
              ? 'Converting to MP4...'
              : 'Finalizing...'
            : exportMethod === 'mediabunny'
            ? exportProgress < 10
              ? 'Preparing media...'
              : exportProgress < 90
              ? 'Encoding frames...'
              : 'Finalizing...'
            : 'Exporting video...'}
        </p>
        <div className="w-full bg-editor-hover rounded-full h-2 mb-2">
          <div
            className="bg-editor-accent h-2 rounded-full transition-all duration-300"
            style={{ width: `${exportProgress}%` }}
          />
        </div>
        <p className="text-xs text-editor-text-dim">{exportProgress}% complete</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-editor-panel border border-editor-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-editor-border">
          <h2 className="text-base font-semibold">Export Video</h2>
          <button onClick={handleClose} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {done ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-editor-success/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-editor-success" />
              </div>
              <p className="text-sm text-editor-text mb-1">Export complete</p>
              <p className="text-xs text-editor-text-dim mb-5">
                Your video is ready to download
              </p>
              <button onClick={triggerDownload} className="btn-primary w-full justify-center flex items-center gap-2">
                {exportMethod === 'cloud' ? (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    Open Video
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download MP4
                  </>
                )}
              </button>
            </div>
          ) : isExporting ? (
            renderProgressContent()
          ) : (
            <>
              <div>
                <label className="text-xs text-editor-text-dim uppercase tracking-wider mb-1.5 block">
                  Export Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setExportMethod('browser-record')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      exportMethod === 'browser-record'
                        ? 'border-editor-accent bg-editor-accent/10'
                        : 'border-editor-border hover:border-editor-border-light'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Monitor className={`w-3.5 h-3.5 ${
                        exportMethod === 'browser-record' ? 'text-editor-accent' : 'text-editor-text-dim'
                      }`} />
                      <span className={`text-[11px] font-medium ${
                        exportMethod === 'browser-record' ? 'text-editor-accent' : 'text-editor-text'
                      }`}>
                        Render Locally
                      </span>
                    </div>
                    <p className="text-[9px] text-editor-text-dim leading-tight">
                      Real-time capture.
                    </p>
                  </button>
                  <button
                    onClick={() => setExportMethod('cloud')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      exportMethod === 'cloud'
                        ? 'border-sky-500 bg-sky-500/10'
                        : 'border-editor-border hover:border-editor-border-light'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Cloud className={`w-3.5 h-3.5 ${
                        exportMethod === 'cloud' ? 'text-sky-400' : 'text-editor-text-dim'
                      }`} />
                      <span className={`text-[11px] font-medium flex items-center gap-1 ${
                        exportMethod === 'cloud' ? 'text-sky-400' : 'text-editor-text'
                      }`}>
                        Cloud
                        <span className="text-[9px] px-1 py-0.5 rounded bg-sky-500/20 text-sky-400">BETA</span>
                      </span>
                    </div>
                    <p className="text-[9px] text-editor-text-dim leading-tight">
                      Lambda render. Perfect quality.
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-editor-text-dim uppercase tracking-wider mb-1.5 block">
                  Filename
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={exportSettings.filename}
                    onChange={(e) => setExportSettings({ filename: e.target.value })}
                    className="flex-1 bg-editor-hover border border-editor-border rounded-lg px-3 py-2 text-sm outline-none focus:border-editor-accent"
                  />
                  <span className="text-xs text-editor-text-dim">{fileExtension}</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-editor-text-dim uppercase tracking-wider mb-1.5 block">
                  Resolution
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <input
                      type="number"
                      value={exportSettings.width}
                      onChange={(e) => setExportSettings({ width: parseInt(e.target.value) || project.width })}
                      className="w-full bg-editor-hover border border-editor-border rounded-lg px-3 py-2 text-sm outline-none focus:border-editor-accent font-mono"
                    />
                    <span className="text-[10px] text-editor-text-dim mt-0.5 block">Width</span>
                  </div>
                  <div>
                    <input
                      type="number"
                      value={exportSettings.height}
                      onChange={(e) => setExportSettings({ height: parseInt(e.target.value) || project.height })}
                      className="w-full bg-editor-hover border border-editor-border rounded-lg px-3 py-2 text-sm outline-none focus:border-editor-accent font-mono"
                    />
                    <span className="text-[10px] text-editor-text-dim mt-0.5 block">Height</span>
                  </div>
                </div>
              </div>

              {exportMethod !== 'cloud' && (
                <div>
                  <label className="text-xs text-editor-text-dim uppercase tracking-wider mb-1.5 block">
                    Quality
                  </label>
                  <div className="flex gap-2">
                    {qualityOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setExportSettings({ quality: opt.value })}
                        className={`flex-1 p-2.5 rounded-lg border text-center transition-colors ${
                          exportSettings.quality === opt.value
                            ? 'border-editor-accent bg-editor-accent/10'
                            : 'border-editor-border hover:border-editor-border-light'
                        }`}
                      >
                        <span className={`text-xs font-medium ${
                          exportSettings.quality === opt.value ? 'text-editor-accent' : 'text-editor-text'
                        }`}>
                          {opt.label}
                        </span>
                        <p className="text-[9px] text-editor-text-dim mt-0.5">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleExport}
                disabled={!hasClips}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                  !hasClips
                    ? 'opacity-50 cursor-not-allowed bg-editor-hover text-editor-text-dim'
                    : exportMethod === 'cloud'
                    ? 'bg-sky-600 hover:bg-sky-500 text-white'
                    : 'btn-primary'
                }`}
              >
                {exportMethod === 'cloud' ? (
                  <>
                    <Cloud className="w-4 h-4" />
                    Start Cloud Render
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export MP4
                  </>
                )}
              </button>

              {!hasClips && (
                <p className="text-[10px] text-editor-text-dim text-center">
                  Add clips to the timeline to enable export
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
