import { useTimelineStore } from '../store/timeline-store';
import { useProjectStore } from '../store/project-store';
import { useCaptionStore, type CaptionStyle } from '../store/caption-store';
import { useBRollStore } from '../store/broll-store';
import { useUIStore } from '../store/ui-store';
import { useMusicStore, MUSIC_LIBRARY } from '../store/music-store';
import { useTranscriptStore } from '../store/transcript-store';
import { removeSilences } from './silence-remover';
import type { TextAnimation, TransitionType } from '../types/editor';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com';
const MODEL = 'gemini-3-flash-preview';

export const SYSTEM_PROMPT = `You are the AI assistant for Omu, a professional browser-based video editor. You help users edit their videos through natural language.

You have access to tools that control the editor. Use them when the user asks to perform editor actions. You can call multiple tools in sequence if needed.

Be concise, friendly, and action-oriented. When you perform actions, briefly confirm what you did. If something fails, explain why and suggest what the user can do.

CRITICAL VOICE BEHAVIOR: When you are going to call a tool/function, you MUST ALWAYS speak a brief acknowledgment to the user BEFORE making the function call. For example, say something like "Sure, let me do that!" or "On it, adding that now!" or "Alright, working on it!" FIRST, then call the tool. NEVER call a tool silently without speaking to the user first. The user needs to hear that you understood their request before you start working on it. This is extremely important for a good voice experience.

IMPORTANT -- CAPTIONS vs TRANSCRIPT EDITOR (these are DIFFERENT features):
- CAPTIONS (add_captions, set_caption_style): Add styled TEXT OVERLAYS displayed on screen during playback. Styles: karaoke, pop, fade, typewriter, word-by-word, slide. This is for visual subtitles.
- TRANSCRIPT EDITOR (open_transcript, remove_fillers, remove_outtakes, make_concise, apply_transcript_edits): Edit the ACTUAL VIDEO CONTENT by removing words/sections from the timeline. When the user says "transcript", "edit transcript", "remove fillers", "clean up", "remove outtakes", "make it shorter/concise", they mean THIS feature -- NOT captions.

Important notes:
- The user must have a video on the main track before B-Roll analysis, captioning, or transcript editing will work.
- B-Roll analysis uses AI to suggest overlay footage moments, then the user can generate the actual footage.
- When adding text, if no startTime is given, use the current playhead position.
- Always check the editor state before suggesting actions to avoid errors.
- Remove silences analyzes the audio to find dead air and removes those portions, compacting the video.
- Transition types: crossfade, dipToBlack, slideLeft, slideRight, slideUp, slideDown, wipeLeft, wipeRight, zoom, glare, filmBurn. Default duration is 0.5s.
- When adding transitions, you need to identify adjacent clips on the same track. Use get_timeline_info to find clip IDs if needed.
- You can add transitions between all adjacent clips at once using add_transitions_all, or between specific clips using add_transition.
- Music tracks available: calm, lush, guitar, jazzy, optimistic, cute, drill, energetic, hype. Use add_music to add background music. Music auto-trims to video length.
- Use set_music_volume to adjust the volume of music on the audio track (0.0 to 1.0). Default is 0.3.`;

export const TOOL_DECLARATIONS = [
  {
    name: 'analyze_broll',
    description: 'Analyze the main video track to find moments where AI-generated B-Roll overlay footage would improve the edit. Opens the B-Roll panel and starts AI analysis. Requires a video on the main track.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'add_captions',
    description: 'Transcribe the main video audio using AI and add timed captions to the timeline. This may take 15-30 seconds. Requires a video on the main track.',
    parameters: {
      type: 'object',
      properties: {
        style: {
          type: 'string',
          enum: ['karaoke', 'pop', 'fade', 'typewriter', 'word-by-word', 'slide'],
          description: 'Caption animation style. Default is karaoke.',
        },
      },
    },
  },
  {
    name: 'set_caption_style',
    description: 'Change the animation style of existing captions and re-apply them.',
    parameters: {
      type: 'object',
      properties: {
        style: {
          type: 'string',
          enum: ['karaoke', 'pop', 'fade', 'typewriter', 'word-by-word', 'slide'],
        },
      },
      required: ['style'],
    },
  },
  {
    name: 'add_text',
    description: 'Add a text overlay clip to the timeline.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text content to display' },
        startTime: { type: 'number', description: 'Start time in seconds. Uses current playhead if omitted.' },
        duration: { type: 'number', description: 'Duration in seconds. Default 3.' },
        y: { type: 'number', description: 'Vertical position 0-100 (0=top, 50=center, 100=bottom). Default 50.' },
        fontSize: { type: 'number', description: 'Font size in pixels. Default 48.' },
        fontColor: { type: 'string', description: 'Text color hex. Default #ffffff.' },
        animation: {
          type: 'string',
          enum: ['none', 'fadeIn', 'slideUp', 'slideDown', 'scaleUp', 'pop', 'typewriter'],
          description: 'Text animation. Default fadeIn.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'seek',
    description: 'Move the playhead to a specific time.',
    parameters: {
      type: 'object',
      properties: {
        time: { type: 'number', description: 'Time in seconds to seek to' },
      },
      required: ['time'],
    },
  },
  {
    name: 'playback',
    description: 'Control video playback.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['play', 'pause', 'toggle'] },
      },
      required: ['action'],
    },
  },
  {
    name: 'split_clip',
    description: 'Split the clip under the playhead at the current time position.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'delete_clip',
    description: 'Delete the currently selected clip from the timeline.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'set_project',
    description: 'Update project settings.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        width: { type: 'number', description: 'Canvas width in pixels' },
        height: { type: 'number', description: 'Canvas height in pixels' },
        fps: { type: 'number', description: 'Frames per second' },
      },
    },
  },
  {
    name: 'open_export',
    description: 'Open the export dialog to render the final video.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_timeline_info',
    description: 'Get detailed information about the current state of the timeline, tracks, clips, and project.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'remove_silences',
    description: 'Detect and remove silent portions from the main video track using AI audio analysis, making the video more concise. Requires a video on the main track.',
    parameters: {
      type: 'object',
      properties: {
        min_duration: {
          type: 'number',
          description: 'Minimum silence duration in seconds to detect and remove. Default 0.3.',
        },
      },
    },
  },
  {
    name: 'add_transition',
    description: 'Add a transition effect between two specific adjacent clips on the same track. Use get_timeline_info to find clip IDs.',
    parameters: {
      type: 'object',
      properties: {
        fromClipId: { type: 'string', description: 'The ID of the first (outgoing) clip' },
        toClipId: { type: 'string', description: 'The ID of the second (incoming) clip' },
        type: {
          type: 'string',
          enum: ['crossfade', 'dipToBlack', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'wipeLeft', 'wipeRight', 'zoom', 'glare', 'filmBurn'],
          description: 'Transition effect type',
        },
        duration: { type: 'number', description: 'Transition duration in seconds. Default 0.5.' },
      },
      required: ['fromClipId', 'toClipId', 'type'],
    },
  },
  {
    name: 'add_transitions_all',
    description: 'Add the same transition effect between all adjacent clips on the main video track. Great for applying a consistent look across the whole timeline.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['crossfade', 'dipToBlack', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'wipeLeft', 'wipeRight', 'zoom', 'glare', 'filmBurn'],
          description: 'Transition effect type',
        },
        duration: { type: 'number', description: 'Transition duration in seconds. Default 0.5.' },
      },
      required: ['type'],
    },
  },
  {
    name: 'set_transition_duration',
    description: 'Change the duration of an existing transition. Use get_timeline_info to find transition details.',
    parameters: {
      type: 'object',
      properties: {
        transitionId: { type: 'string', description: 'The transition ID to update. If omitted, updates all transitions.' },
        duration: { type: 'number', description: 'New duration in seconds.' },
      },
      required: ['duration'],
    },
  },
  {
    name: 'remove_transitions',
    description: 'Remove transitions. Can remove a specific transition by ID, or all transitions at once.',
    parameters: {
      type: 'object',
      properties: {
        transitionId: { type: 'string', description: 'Specific transition ID to remove. If omitted, removes all transitions.' },
      },
    },
  },
  {
    name: 'add_all_media_to_timeline',
    description: 'Add all media files from the media library to the timeline consecutively (back to back). Videos and images go on the main track, audio files go on the audio track. If a track filter is specified, only matching media types are added.',
    parameters: {
      type: 'object',
      properties: {
        track: {
          type: 'string',
          enum: ['main', 'overlay', 'audio'],
          description: 'Which track to place media on. Default: auto (videos/images to main, audio to audio track).',
        },
      },
    },
  },
  {
    name: 'add_music',
    description: 'Add a background music track to the audio timeline. Available tracks: calm, lush, guitar, jazzy, optimistic, cute, drill, energetic, hype. The music is auto-trimmed to match the video duration and starts at volume 0.3.',
    parameters: {
      type: 'object',
      properties: {
        track_name: {
          type: 'string',
          enum: ['calm', 'lush', 'guitar', 'jazzy', 'optimistic', 'cute', 'drill', 'energetic', 'hype'],
          description: 'Name of the music track to add.',
        },
        volume: {
          type: 'number',
          description: 'Volume level from 0.0 to 1.0. Default 0.3.',
        },
      },
      required: ['track_name'],
    },
  },
  {
    name: 'set_music_volume',
    description: 'Set the volume of all audio clips on the audio track.',
    parameters: {
      type: 'object',
      properties: {
        volume: {
          type: 'number',
          description: 'Volume level from 0.0 to 1.0.',
        },
      },
      required: ['volume'],
    },
  },
  {
    name: 'open_transcript',
    description: 'Open the Transcript Editor panel and start transcribing the video if not already done. This lets the user edit the actual video content by removing words and sections. NOT the same as captions.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'remove_fillers',
    description: 'Use AI to analyze the transcript and cross out filler words (um, uh, like, you know, etc.) based on context. Opens transcript panel if needed. Requires transcription first.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'remove_outtakes',
    description: 'Use AI to analyze the transcript and cross out outtakes -- false starts, repeated phrases, stumbles, and self-corrections. Opens transcript panel if needed.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'make_concise',
    description: 'Use AI to analyze the transcript and cross out redundant/verbose sections to make the video shorter and tighter without losing the core message.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'apply_transcript_edits',
    description: 'Apply the currently crossed-out words from the Transcript Editor to the timeline, permanently removing those sections from the video.',
    parameters: { type: 'object', properties: {} },
  },
];

export function buildEditorContext(): string {
  const { project } = useProjectStore.getState();
  const { mediaFiles } = useProjectStore.getState();
  const { tracks, currentTime, duration, isPlaying, selectedClipId } = useTimelineStore.getState();
  const { segments, captionStyle, clipIds } = useCaptionStore.getState();
  const { suggestions } = useBRollStore.getState();

  let selectedClipInfo = 'None';
  if (selectedClipId) {
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) {
        selectedClipInfo = `"${clip.name}" (${clip.type}, ${clip.startTime.toFixed(1)}s - ${(clip.startTime + clip.duration).toFixed(1)}s)`;
        break;
      }
    }
  }

  const { transitions } = useTimelineStore.getState();

  const trackSummaries = tracks.map((t) => {
    const sorted = [...t.clips].sort((a, b) => a.startTime - b.startTime);
    const clipDetails = sorted.map((c) => `    - "${c.name}" id=${c.id} (${c.startTime.toFixed(1)}s-${(c.startTime + c.duration).toFixed(1)}s)`).join('\n');
    return `  ${t.name} (${t.type}, id=${t.id}): ${t.clips.length} clips${t.isMuted ? ' [muted]' : ''}${clipDetails ? '\n' + clipDetails : ''}`;
  }).join('\n');

  const mediaSummary = mediaFiles.length > 0
    ? mediaFiles.map((m) => `  "${m.name}" (${m.type}, ${m.duration.toFixed(1)}s)`).join('\n')
    : '  (empty)';

  return `[Editor State]
Project: "${project.name}" (${project.width}x${project.height}, ${project.fps}fps)
Timeline: ${duration.toFixed(1)}s total, playhead at ${currentTime.toFixed(1)}s, ${isPlaying ? 'playing' : 'paused'}
Selected clip: ${selectedClipInfo}
Tracks:
${trackSummaries || '  (no tracks)'}
Media library (${mediaFiles.length} file(s)):
${mediaSummary}
Transitions: ${transitions.length > 0 ? transitions.map((t) => `  ${t.type} (${t.duration}s) id=${t.id} from=${t.fromClipId} to=${t.toClipId}`).join('\n') : 'none'}
Captions: ${segments.length} words transcribed, ${clipIds.length} caption clips applied, style: ${captionStyle}
B-Roll: ${suggestions.length} suggestions
Transcript Editor: ${(() => { const ts = useTranscriptStore.getState(); const wc = ts.words.length; if (wc === 0) return 'not transcribed'; const cc = ts.words.filter((w: { isCrossed: boolean }) => w.isCrossed).length; return `${wc} words, ${cc} crossed out, ${ts.hasApplied ? 'edits applied' : 'edits pending'}`; })()}`;
}

export async function executeAction(
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: string }> {
  try {
    switch (name) {
      case 'analyze_broll': {
        const ui = useUIStore.getState();
        if (!ui.showBRollPanel) ui.toggleBRollPanel();
        await useBRollStore.getState().analyzeTimeline();
        const count = useBRollStore.getState().suggestions.length;
        return { result: count > 0 ? `Analysis complete. Found ${count} B-Roll opportunities. The user can generate them from the B-Roll panel.` : 'Analysis complete but no B-Roll opportunities were found.' };
      }

      case 'add_captions': {
        const style = (args.style as CaptionStyle) || 'karaoke';
        const captionStore = useCaptionStore.getState();
        captionStore.setCaptionStyle(style);
        const ui = useUIStore.getState();
        if (!ui.showCaptionsPanel) ui.toggleCaptionsPanel();
        await captionStore.transcribeTimeline();
        const segs = useCaptionStore.getState().segments;
        if (segs.length === 0) return { result: 'Transcription complete but no speech was detected in the video.' };
        useCaptionStore.getState().applyCaptions();
        const count = useCaptionStore.getState().clipIds.length;
        return { result: `Added ${count} caption clips with "${style}" style.` };
      }

      case 'set_caption_style': {
        const style = args.style as CaptionStyle;
        if (!style) return { result: 'Error: No style specified.' };
        const captionStore = useCaptionStore.getState();
        if (captionStore.segments.length === 0) return { result: 'Error: No captions transcribed yet. Use add_captions first.' };
        captionStore.setCaptionStyle(style);
        captionStore.applyCaptions();
        const count = useCaptionStore.getState().clipIds.length;
        return { result: `Changed caption style to "${style}" and re-applied ${count} caption clips.` };
      }

      case 'add_text': {
        const text = args.text as string;
        if (!text) return { result: 'Error: No text provided.' };
        const timeline = useTimelineStore.getState();
        const startTime = (args.startTime as number) ?? timeline.currentTime;
        const dur = (args.duration as number) ?? 3;
        const y = (args.y as number) ?? 50;
        const fontSize = (args.fontSize as number) ?? 48;
        const fontColor = (args.fontColor as string) ?? '#ffffff';
        const animation = (args.animation as TextAnimation) ?? 'fadeIn';
        const trackId = timeline.ensureTrack('text');
        timeline.addClip(trackId, {
          type: 'text',
          name: text.slice(0, 30),
          startTime,
          duration: dur,
          trimStart: 0,
          trimEnd: 0,
          properties: {
            text,
            fontSize,
            fontColor,
            fontFamily: "'Inter', sans-serif",
            textAlign: 'center',
            y,
            textAnimation: animation,
            animationDuration: 0.5,
          },
        });
        return { result: `Added text "${text.slice(0, 40)}" at ${startTime.toFixed(1)}s for ${dur}s.` };
      }

      case 'seek': {
        const time = args.time as number;
        if (typeof time !== 'number') return { result: 'Error: No time specified.' };
        useTimelineStore.getState().setCurrentTime(time);
        return { result: `Seeked to ${time.toFixed(1)}s.` };
      }

      case 'playback': {
        const action = args.action as string;
        const timeline = useTimelineStore.getState();
        if (action === 'play') timeline.setIsPlaying(true);
        else if (action === 'pause') timeline.setIsPlaying(false);
        else if (action === 'toggle') timeline.setIsPlaying(!timeline.isPlaying);
        return { result: `Playback ${action === 'toggle' ? (timeline.isPlaying ? 'started' : 'paused') : action === 'play' ? 'started' : 'paused'}.` };
      }

      case 'split_clip': {
        const timeline = useTimelineStore.getState();
        const time = timeline.currentTime;
        let found = false;
        for (const track of timeline.tracks) {
          for (const clip of track.clips) {
            if (time > clip.startTime && time < clip.startTime + clip.duration) {
              timeline.splitClip(clip.id, time);
              found = true;
              break;
            }
          }
          if (found) break;
        }
        return { result: found ? `Split clip at ${time.toFixed(1)}s.` : 'No clip found at the current playhead position.' };
      }

      case 'delete_clip': {
        const clipId = useTimelineStore.getState().selectedClipId;
        if (!clipId) return { result: 'No clip is currently selected. Select a clip first.' };
        const clip = useTimelineStore.getState().getClipById(clipId);
        const name = clip?.name || 'clip';
        useTimelineStore.getState().removeClip(clipId);
        return { result: `Deleted "${name}".` };
      }

      case 'set_project': {
        const updates: Record<string, unknown> = {};
        if (args.name) updates.name = args.name;
        if (args.width) updates.width = args.width;
        if (args.height) updates.height = args.height;
        if (args.fps) updates.fps = args.fps;
        if (Object.keys(updates).length === 0) return { result: 'No settings provided to update.' };
        useProjectStore.getState().setProject(updates);
        return { result: `Updated project settings: ${Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(', ')}.` };
      }

      case 'open_export': {
        useUIStore.getState().setShowExportModal(true);
        return { result: 'Export dialog opened.' };
      }

      case 'get_timeline_info': {
        return { result: buildEditorContext() };
      }

      case 'remove_silences': {
        const minDur = (args.min_duration as number) ?? 0.3;
        const res = await removeSilences(minDur);
        if (res.silencesRemoved === 0) {
          return { result: res.silencesFound > 0 ? `Found ${res.silencesFound} silence(s) but none were long enough to remove within clip boundaries.` : 'No silences detected in the video.' };
        }
        return { result: `Removed ${res.silencesRemoved} silence(s), saving ${res.savedSeconds.toFixed(1)}s. New timeline duration: ${res.newDuration.toFixed(1)}s.` };
      }

      case 'add_transition': {
        const fromClipId = args.fromClipId as string;
        const toClipId = args.toClipId as string;
        const type = args.type as TransitionType;
        const dur = (args.duration as number) ?? 0.5;
        if (!fromClipId || !toClipId || !type) return { result: 'Error: fromClipId, toClipId, and type are required.' };

        const timeline = useTimelineStore.getState();
        const fromClip = timeline.getClipById(fromClipId);
        const toClip = timeline.getClipById(toClipId);
        if (!fromClip) return { result: `Error: Clip "${fromClipId}" not found.` };
        if (!toClip) return { result: `Error: Clip "${toClipId}" not found.` };

        let trackId = '';
        for (const track of timeline.tracks) {
          if (track.clips.some((c) => c.id === fromClipId)) {
            trackId = track.id;
            break;
          }
        }

        timeline.addTransition(trackId, fromClipId, toClipId, type, dur);
        return { result: `Added "${type}" transition (${dur}s) between "${fromClip.name}" and "${toClip.name}".` };
      }

      case 'add_transitions_all': {
        const type = args.type as TransitionType;
        const dur = (args.duration as number) ?? 0.5;
        if (!type) return { result: 'Error: type is required.' };

        const timeline = useTimelineStore.getState();
        const mainTrack = timeline.tracks.find((t) => t.role === 'main');
        if (!mainTrack || mainTrack.clips.length < 2) {
          return { result: 'Error: Need at least 2 clips on the main track to add transitions.' };
        }

        const sorted = [...mainTrack.clips].sort((a, b) => a.startTime - b.startTime);
        let count = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
          timeline.addTransition(mainTrack.id, sorted[i].id, sorted[i + 1].id, type, dur);
          count++;
        }
        return { result: `Added "${type}" transition (${dur}s) between all ${count} adjacent clip pairs on the main track.` };
      }

      case 'set_transition_duration': {
        const transitionId = args.transitionId as string | undefined;
        const dur = args.duration as number;
        if (typeof dur !== 'number' || dur <= 0) return { result: 'Error: duration must be a positive number.' };

        const timeline = useTimelineStore.getState();
        if (transitionId) {
          const existing = timeline.transitions.find((t) => t.id === transitionId);
          if (!existing) return { result: `Error: Transition "${transitionId}" not found.` };
          timeline.updateTransition(transitionId, { duration: dur });
          return { result: `Updated transition duration to ${dur}s.` };
        }

        if (timeline.transitions.length === 0) return { result: 'No transitions to update.' };
        for (const t of timeline.transitions) {
          timeline.updateTransition(t.id, { duration: dur });
        }
        return { result: `Updated all ${timeline.transitions.length} transition(s) to ${dur}s duration.` };
      }

      case 'remove_transitions': {
        const transitionId = args.transitionId as string | undefined;
        const timeline = useTimelineStore.getState();

        if (transitionId) {
          const existing = timeline.transitions.find((t) => t.id === transitionId);
          if (!existing) return { result: `Error: Transition "${transitionId}" not found.` };
          timeline.removeTransition(transitionId);
          return { result: 'Removed transition.' };
        }

        const count = timeline.transitions.length;
        if (count === 0) return { result: 'No transitions to remove.' };
        for (const t of [...timeline.transitions]) {
          timeline.removeTransition(t.id);
        }
        return { result: `Removed all ${count} transition(s).` };
      }

      case 'add_all_media_to_timeline': {
        const projectStore = useProjectStore.getState();
        const timeline = useTimelineStore.getState();
        const { mediaFiles } = projectStore;

        if (mediaFiles.length === 0) {
          return { result: 'No media files in the library. Import some files first.' };
        }

        const trackArg = args.track as string | undefined;
        let addedCount = 0;
        const results: string[] = [];

        const videoImageFiles = mediaFiles.filter((m) => m.type === 'video' || m.type === 'image');
        const audioFiles = mediaFiles.filter((m) => m.type === 'audio');

        if (trackArg === 'audio') {
          if (audioFiles.length === 0) {
            return { result: 'No audio files in the media library.' };
          }
          const trackId = timeline.ensureTrack('audio');
          const existingClips = useTimelineStore.getState().tracks.find((t) => t.id === trackId)?.clips ?? [];
          let cursor = existingClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
          for (const media of audioFiles) {
            timeline.addClip(trackId, {
              mediaId: media.id,
              type: 'audio',
              name: media.name,
              startTime: cursor,
              duration: media.duration,
              trimStart: 0,
              trimEnd: 0,
              properties: { opacity: 1, volume: 1 },
            });
            cursor += media.duration;
            addedCount++;
          }
          results.push(`${addedCount} audio file(s) to audio track`);
        } else if (trackArg === 'overlay') {
          if (videoImageFiles.length === 0) {
            return { result: 'No video or image files in the media library.' };
          }
          const trackId = timeline.ensureTrack('overlay');
          const existingClips = useTimelineStore.getState().tracks.find((t) => t.id === trackId)?.clips ?? [];
          let cursor = existingClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
          for (const media of videoImageFiles) {
            timeline.addClip(trackId, {
              mediaId: media.id,
              type: 'video',
              name: media.name,
              startTime: cursor,
              duration: media.duration,
              trimStart: 0,
              trimEnd: 0,
              properties: { opacity: 1, volume: 1 },
            });
            cursor += media.duration;
            addedCount++;
          }
          results.push(`${addedCount} file(s) to overlay track`);
        } else {
          if (videoImageFiles.length > 0) {
            const mainTrackId = timeline.ensureTrack('main');
            const mainClips = useTimelineStore.getState().tracks.find((t) => t.id === mainTrackId)?.clips ?? [];
            let cursor = mainClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
            for (const media of videoImageFiles) {
              timeline.addClip(mainTrackId, {
                mediaId: media.id,
                type: 'video',
                name: media.name,
                startTime: cursor,
                duration: media.duration,
                trimStart: 0,
                trimEnd: 0,
                properties: { opacity: 1, volume: 1 },
              });
              cursor += media.duration;
              addedCount++;
            }
            results.push(`${videoImageFiles.length} video/image file(s) to main track`);
          }

          if (audioFiles.length > 0) {
            const audioTrackId = timeline.ensureTrack('audio');
            const audioClips = useTimelineStore.getState().tracks.find((t) => t.id === audioTrackId)?.clips ?? [];
            let cursor = audioClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
            for (const media of audioFiles) {
              timeline.addClip(audioTrackId, {
                mediaId: media.id,
                type: 'audio',
                name: media.name,
                startTime: cursor,
                duration: media.duration,
                trimStart: 0,
                trimEnd: 0,
                properties: { opacity: 1, volume: 1 },
              });
              cursor += media.duration;
              addedCount++;
            }
            results.push(`${audioFiles.length} audio file(s) to audio track`);
          }
        }

        useTimelineStore.getState().recalcDuration();
        return { result: `Added ${results.join(' and ')} consecutively. Total: ${addedCount} clip(s). Timeline duration: ${useTimelineStore.getState().duration.toFixed(1)}s.` };
      }

      case 'add_music': {
        const trackName = (args.track_name as string || '').toLowerCase();
        const volume = Math.max(0, Math.min(1, (args.volume as number) ?? 0.3));

        const musicTrack = MUSIC_LIBRARY.find(
          (t) => t.name.toLowerCase() === trackName
        );
        if (!musicTrack) {
          const available = MUSIC_LIBRARY.map((t) => t.name.toLowerCase()).join(', ');
          return { result: `Error: Unknown track "${trackName}". Available: ${available}.` };
        }

        const musicStore = useMusicStore.getState();
        musicStore.stopPreview();

        const audioDuration = await musicStore.loadDuration(musicTrack.id, musicTrack.url);
        const timeline = useTimelineStore.getState();
        const videoDuration = timeline.duration;
        const clipDuration = videoDuration > 0 ? Math.min(audioDuration, videoDuration) : audioDuration;

        const projectStore = useProjectStore.getState();
        const media = projectStore.addMediaFromUrl(
          `${musicTrack.name} (Music)`,
          musicTrack.url,
          audioDuration
        );

        const audioTrackId = timeline.ensureTrack('audio');
        timeline.addClip(audioTrackId, {
          mediaId: media.id,
          type: 'audio',
          name: `${musicTrack.name} (Music)`,
          startTime: 0,
          duration: clipDuration,
          trimStart: 0,
          trimEnd: audioDuration - clipDuration,
          properties: { opacity: 1, volume },
        });

        return {
          result: `Added "${musicTrack.name}" music at volume ${(volume * 100).toFixed(0)}%. Duration: ${clipDuration.toFixed(1)}s${videoDuration > 0 ? ' (trimmed to video length)' : ''}.`,
        };
      }

      case 'set_music_volume': {
        const volume = args.volume as number;
        if (typeof volume !== 'number' || volume < 0 || volume > 1) {
          return { result: 'Error: Volume must be a number between 0.0 and 1.0.' };
        }

        const timeline = useTimelineStore.getState();
        const audioTrack = timeline.tracks.find((t) => t.role === 'audio');
        if (!audioTrack || audioTrack.clips.length === 0) {
          return { result: 'Error: No audio clips on the audio track.' };
        }

        let updated = 0;
        for (const clip of audioTrack.clips) {
          timeline.updateClip(clip.id, {
            properties: { ...clip.properties, volume },
          });
          updated++;
        }

        return { result: `Set volume to ${(volume * 100).toFixed(0)}% on ${updated} audio clip(s).` };
      }

      case 'open_transcript': {
        const ui = useUIStore.getState();
        if (!ui.showTranscriptPanel) ui.toggleTranscriptPanel();
        const ts = useTranscriptStore.getState();
        if (ts.words.length === 0 && !ts.isTranscribing) {
          await ts.transcribe();
          const count = useTranscriptStore.getState().words.length;
          return { result: count > 0 ? `Opened transcript editor and transcribed ${count} words. The user can now cross out words to remove or use AI clean-up tools.` : 'Opened transcript editor but no speech was detected.' };
        }
        return { result: `Transcript editor is open with ${ts.words.length} words transcribed.` };
      }

      case 'remove_fillers': {
        const ui = useUIStore.getState();
        if (!ui.showTranscriptPanel) ui.toggleTranscriptPanel();
        const ts = useTranscriptStore.getState();
        if (ts.words.length === 0 && !ts.isTranscribing) {
          await ts.transcribe();
        }
        if (useTranscriptStore.getState().words.length === 0) {
          return { result: 'No speech detected in the video to analyze for fillers.' };
        }
        const count = await useTranscriptStore.getState().crossOutFillerWords();
        return { result: count > 0 ? `AI found and crossed out ${count} filler word(s). The user can review them in the transcript panel and click "Apply Edits" when ready.` : 'No filler words found in the transcript.' };
      }

      case 'remove_outtakes': {
        const ui = useUIStore.getState();
        if (!ui.showTranscriptPanel) ui.toggleTranscriptPanel();
        const ts = useTranscriptStore.getState();
        if (ts.words.length === 0 && !ts.isTranscribing) {
          await ts.transcribe();
        }
        if (useTranscriptStore.getState().words.length === 0) {
          return { result: 'No speech detected in the video to analyze for outtakes.' };
        }
        const count = await useTranscriptStore.getState().crossOutOuttakes();
        return { result: count > 0 ? `AI found and crossed out ${count} word(s) from outtakes/false starts. The user can review in the transcript panel and click "Apply Edits".` : 'No outtakes found in the transcript.' };
      }

      case 'make_concise': {
        const ui = useUIStore.getState();
        if (!ui.showTranscriptPanel) ui.toggleTranscriptPanel();
        const ts = useTranscriptStore.getState();
        if (ts.words.length === 0 && !ts.isTranscribing) {
          await ts.transcribe();
        }
        if (useTranscriptStore.getState().words.length === 0) {
          return { result: 'No speech detected in the video.' };
        }
        const count = await useTranscriptStore.getState().makeConcise();
        return { result: count > 0 ? `AI identified ${count} word(s) to remove for a more concise version. The user can review in the transcript panel and click "Apply Edits".` : 'The transcript is already concise.' };
      }

      case 'apply_transcript_edits': {
        const ts = useTranscriptStore.getState();
        if (ts.words.length === 0) return { result: 'No transcript to apply. Open the transcript editor first.' };
        const crossedCount = ts.words.filter((w) => w.isCrossed).length;
        if (crossedCount === 0) return { result: 'No words are crossed out. Cross out words first using remove_fillers, remove_outtakes, make_concise, or manually in the transcript panel.' };
        ts.applyToTimeline();
        return { result: `Applied transcript edits: removed ${crossedCount} word(s) from the timeline.` };
      }

      default:
        return { result: `Unknown action: ${name}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Action failed';
    return { result: `Error: ${message}` };
  }
}

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{
    text?: string;
    functionCall?: { name: string; args: Record<string, unknown> };
    functionResponse?: { name: string; response: Record<string, unknown> };
  }>;
}

export interface AgentResponse {
  text: string;
  actions: Array<{ name: string; result: string }>;
}

export type AgentProgressCallback = (toolNames: string[]) => void;

export async function callAgent(
  history: GeminiMessage[],
  userText: string,
  onProgress?: AgentProgressCallback,
): Promise<AgentResponse> {
  if (!API_KEY) throw new Error('Gemini API key not configured');

  const context = buildEditorContext();
  const userMessage: GeminiMessage = {
    role: 'user',
    parts: [{ text: `${context}\n\nUser: ${userText}` }],
  };

  const messages = [...history, userMessage];
  const actions: AgentResponse['actions'] = [];
  const maxLoops = 6;

  for (let loop = 0; loop < maxLoops; loop++) {
    const res = await fetch(
      `${BASE_URL}/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: messages,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
      throw new Error(err.error?.message || 'Agent request failed');
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts) throw new Error('No response from AI');

    const parts = candidate.content.parts;
    const functionCalls = parts.filter(
      (p: Record<string, unknown>) => p.functionCall,
    );

    if (functionCalls.length > 0) {
      const toolNames = functionCalls.map(
        (fc: { functionCall: { name: string } }) => fc.functionCall.name,
      );
      onProgress?.(toolNames);

      messages.push({ role: 'model', parts });

      const responseParts: GeminiMessage['parts'] = [];
      for (const fc of functionCalls) {
        const { name, args } = fc.functionCall!;
        const result = await executeAction(name, args || {});
        actions.push({ name, result: result.result });
        responseParts.push({
          functionResponse: { name, response: result },
        });
      }
      messages.push({ role: 'user', parts: responseParts });
      continue;
    }

    const textParts = parts.filter((p: Record<string, unknown>) => p.text);
    const text = textParts.map((p: { text?: string }) => p.text || '').join('');
    return { text: text || 'Done.', actions };
  }

  return { text: 'Completed the requested actions.', actions };
}
