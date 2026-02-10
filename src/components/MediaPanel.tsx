import { useCallback, useRef, useState } from 'react';
import {
  Upload,
  Film,
  Music,
  Image,
  Trash2,
  GripVertical,
  Layers,
  Type,
} from 'lucide-react';
import { useProjectStore } from '../store/project-store';
import { useTimelineStore } from '../store/timeline-store';
import { useUIStore } from '../store/ui-store';
import { formatDuration, formatFileSize } from '../lib/format';
import { TEXT_TEMPLATES } from '../lib/text-templates';
import type { TextTemplate } from '../lib/text-templates';
import type { MediaFile } from '../types/editor';
import MusicTab from './MusicPanel';

type Tab = 'media' | 'text' | 'music';

export default function MediaPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('media');

  return (
    <div className="w-64 bg-editor-surface border-r border-editor-border flex flex-col h-full shrink-0">
      <div className="h-10 flex items-center border-b border-editor-border shrink-0">
        <button
          onClick={() => setActiveTab('media')}
          className={`flex-1 h-full text-xs font-semibold uppercase tracking-wider transition-colors ${
            activeTab === 'media'
              ? 'text-editor-text border-b-2 border-editor-accent'
              : 'text-editor-text-dim hover:text-editor-text-muted'
          }`}
        >
          Media
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={`flex-1 h-full text-xs font-semibold uppercase tracking-wider transition-colors ${
            activeTab === 'text'
              ? 'text-editor-text border-b-2 border-editor-accent'
              : 'text-editor-text-dim hover:text-editor-text-muted'
          }`}
        >
          Text
        </button>
        <button
          onClick={() => setActiveTab('music')}
          className={`flex-1 h-full text-xs font-semibold uppercase tracking-wider transition-colors ${
            activeTab === 'music'
              ? 'text-editor-text border-b-2 border-editor-accent'
              : 'text-editor-text-dim hover:text-editor-text-muted'
          }`}
        >
          Music
        </button>
      </div>

      {activeTab === 'media' ? <MediaTab /> : activeTab === 'text' ? <TextTab /> : <MusicTab />}
    </div>
  );
}

function MediaTab() {
  const { mediaFiles, importMedia, removeMedia } = useProjectStore();
  const { ensureTrack, addClip } = useTimelineStore();
  const { addToast } = useUIStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [placementPopup, setPlacementPopup] = useState<{
    media: MediaFile;
    x: number;
    y: number;
  } | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');
        const isImage = file.type.startsWith('image/');
        if (!isVideo && !isAudio && !isImage) {
          addToast('Unsupported file type', 'warning');
          continue;
        }

        try {
          const media = await importMedia(file);
          addToast(`Imported ${media.name}`, 'success');
        } catch {
          addToast(`Failed to import ${file.name}`, 'error');
        }
      }
    },
    [importMedia, addToast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const addMediaToTrack = (media: MediaFile, role: 'main' | 'overlay' | 'audio') => {
    const trackId = ensureTrack(role);
    const currentTracks = useTimelineStore.getState().tracks;
    const existingClips = currentTracks.find((t) => t.id === trackId)?.clips ?? [];
    const lastEnd = existingClips.reduce(
      (max, c) => Math.max(max, c.startTime + c.duration),
      0
    );

    addClip(trackId, {
      mediaId: media.id,
      type: media.type === 'audio' ? 'audio' : 'video',
      name: media.name,
      startTime: lastEnd,
      duration: media.duration,
      trimStart: 0,
      trimEnd: 0,
      properties: { opacity: 1, volume: 1 },
    });

    addToast(`Added ${media.name} to ${role === 'main' ? 'main video' : role}`, 'success');
  };

  const handleMediaClick = (media: MediaFile, e: React.MouseEvent) => {
    if (media.type === 'audio') {
      addMediaToTrack(media, 'audio');
      return;
    }

    const mainTrack = useTimelineStore.getState().tracks.find((t) => t.role === 'main');
    const mainHasClips = mainTrack && mainTrack.clips.length > 0;

    if (!mainHasClips) {
      addMediaToTrack(media, 'main');
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPlacementPopup({
        media,
        x: rect.right + 4,
        y: rect.top,
      });
    }
  };

  return (
    <>
      <div className="flex items-center justify-end px-3 py-1.5 shrink-0">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn-icon"
          title="Import media"
        >
          <Upload className="w-4 h-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*,image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      <div
        className="flex-1 overflow-y-auto"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {mediaFiles.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full px-6 text-center cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-14 h-14 rounded-2xl bg-editor-hover flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-editor-text-dim" />
            </div>
            <p className="text-sm text-editor-text-muted mb-1">
              Drop files here
            </p>
            <p className="text-xs text-editor-text-dim">
              MP4, WebM, MOV, MP3, WAV, JPG, PNG
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {mediaFiles.map((media) => (
              <MediaItem
                key={media.id}
                media={media}
                onAdd={(e) => handleMediaClick(media, e)}
                onRemove={() => removeMedia(media.id)}
              />
            ))}
          </div>
        )}
      </div>

      {placementPopup && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setPlacementPopup(null)} />
          <div
            className="fixed z-50 bg-editor-panel border border-editor-border rounded-lg shadow-2xl py-1.5 w-48"
            style={{
              left: placementPopup.x,
              top: placementPopup.y,
            }}
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-editor-text-dim font-semibold">
              Add to...
            </div>
            <button
              onClick={() => {
                addMediaToTrack(placementPopup.media, 'main');
                setPlacementPopup(null);
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-editor-hover text-editor-text-muted hover:text-editor-text transition-colors flex items-center gap-2"
            >
              <Film className="w-3.5 h-3.5 text-sky-400" />
              Main Video
            </button>
            <button
              onClick={() => {
                addMediaToTrack(placementPopup.media, 'overlay');
                setPlacementPopup(null);
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-editor-hover text-editor-text-muted hover:text-editor-text transition-colors flex items-center gap-2"
            >
              <Layers className="w-3.5 h-3.5 text-rose-400" />
              Overlay
            </button>
          </div>
        </>
      )}
    </>
  );
}

function TextTab() {
  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
      {TEXT_TEMPLATES.map((template) => (
        <TextTemplateItem key={template.id} template={template} />
      ))}
    </div>
  );
}

function TextTemplateItem({ template }: { template: TextTemplate }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/text-template-id', template.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const animationColors: Record<string, string> = {
    fadeIn: 'text-white',
    typewriter: 'text-cyan-400',
    slideUp: 'text-sky-300',
    slideDown: 'text-sky-300',
    slideLeft: 'text-sky-300',
    slideRight: 'text-sky-300',
    scaleUp: 'text-white',
    blurReveal: 'text-gray-300',
    pop: 'text-orange-400',
    wordByWord: 'text-emerald-300',
    none: 'text-white',
  };

  const previewColor = animationColors[template.properties.textAnimation || 'none'] || 'text-white';
  const fontStyle = template.properties.fontFamily === 'monospace' ? 'font-mono' : 'font-sans';
  const textAlign = template.properties.textAlign || 'center';
  const fontSize = template.properties.fontSize || 48;
  const scaledSize = Math.min(Math.max(fontSize / 5, 10), 18);

  return (
    <div
      className="group relative rounded-lg border border-editor-border bg-editor-panel hover:border-editor-border-light cursor-grab active:cursor-grabbing transition-all hover:shadow-md"
      draggable
      onDragStart={handleDragStart}
    >
      <div
        className="h-14 flex items-center overflow-hidden rounded-t-lg px-3"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <p
          className={`w-full truncate ${fontStyle} ${previewColor}`}
          style={{
            fontSize: `${scaledSize}px`,
            textAlign,
            color: template.properties.fontColor,
          }}
        >
          {template.preview}
        </p>
      </div>
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <Type className="w-3 h-3 text-amber-400" />
          <span className="text-[11px] text-editor-text-muted font-medium">{template.label}</span>
        </div>
        <span className="text-[10px] text-editor-text-dim">{template.duration}s</span>
      </div>
    </div>
  );
}

function MediaItem({
  media,
  onAdd,
  onRemove,
}: {
  media: MediaFile;
  onAdd: (e: React.MouseEvent) => void;
  onRemove: () => void;
}) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/media-id', media.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      className="group flex items-center gap-2 p-2 rounded-lg hover:bg-editor-hover transition-colors cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={handleDragStart}
      onDoubleClick={onAdd}
    >
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-3 h-3 text-editor-text-dim" />
      </div>

      {media.thumbnailUrl ? (
        <img
          src={media.thumbnailUrl}
          alt={media.name}
          className="w-12 h-8 object-cover rounded border border-editor-border"
        />
      ) : (
        <div className="w-12 h-8 rounded border border-editor-border bg-editor-hover flex items-center justify-center">
          {media.type === 'audio' ? (
            <Music className="w-4 h-4 text-editor-text-dim" />
          ) : media.type === 'image' ? (
            <Image className="w-4 h-4 text-editor-text-dim" />
          ) : (
            <Film className="w-4 h-4 text-editor-text-dim" />
          )}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-xs text-editor-text truncate">{media.name}</p>
        <p className="text-[10px] text-editor-text-dim">
          {formatDuration(media.duration)} &middot; {formatFileSize(media.file.size)}
        </p>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="opacity-0 group-hover:opacity-100 btn-icon transition-opacity"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}
