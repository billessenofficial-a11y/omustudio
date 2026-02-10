import { GoogleGenAI, Modality, type LiveServerMessage, type FunctionCall } from '@google/genai';
import { SYSTEM_PROMPT, TOOL_DECLARATIONS, buildEditorContext, executeAction } from './agent-service';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

export interface LiveVoiceCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (error: string) => void;
  onUserTranscript: (text: string) => void;
  onAITranscript: (text: string) => void;
  onTurnComplete: () => void;
  onAudioStart: () => void;
  onAudioEnd: () => void;
  onFunctionCall: (name: string, result: string) => void;
  onGoAway: () => void;
}

interface PlaybackItem {
  buffer: AudioBuffer;
  source?: AudioBufferSourceNode;
}

export class LiveVoiceService {
  private session: Awaited<ReturnType<InstanceType<typeof GoogleGenAI>['live']['connect']>> | null = null;
  private micStream: MediaStream | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private callbacks: LiveVoiceCallbacks;
  private connected = false;
  private intentionalClose = false;
  private hadError = false;
  private playbackQueue: PlaybackItem[] = [];
  private isPlayingAudio = false;
  private nextPlayTime = 0;

  constructor(callbacks: LiveVoiceCallbacks) {
    this.callbacks = callbacks;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (!API_KEY) throw new Error('Gemini API key not configured');

    this.intentionalClose = false;
    this.hadError = false;

    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const context = buildEditorContext();

    this.session = await ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: `${SYSTEM_PROMPT}\n\n${context}`,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: {
          languageCode: 'en-US',
        },
      },
      callbacks: {
        onopen: () => {
          this.connected = true;
          this.callbacks.onConnected();
        },
        onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
        onerror: (e: ErrorEvent) => {
          this.hadError = true;
          this.callbacks.onError(e.message || 'Connection error');
        },
        onclose: (e: CloseEvent) => {
          const wasConnected = this.connected;
          this.connected = false;
          this.stopMicrophone();

          if (this.intentionalClose || this.hadError) {
            if (!this.hadError) {
              this.callbacks.onDisconnected();
            }
          } else {
            const reason = e.reason
              ? `Voice connection closed: ${e.reason}`
              : wasConnected
                ? 'Voice session ended unexpectedly. Please try again.'
                : 'Could not establish voice connection. Check your API key and try again.';
            this.callbacks.onError(reason);
          }
        },
      },
    });

    await this.startMicrophone();
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    this.stopMicrophone();
    this.clearPlaybackQueue();

    if (this.session) {
      try { this.session.close(); } catch (_) { /* ignore */ }
      this.session = null;
    }

    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
      try { await this.outputAudioContext.close(); } catch (_) { /* ignore */ }
    }
    this.outputAudioContext = null;

    this.connected = false;
  }

  sendText(text: string): void {
    if (!this.session || !this.connected) return;
    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: true,
    });
  }

  private handleMessage(msg: LiveServerMessage): void {
    if (msg.goAway) {
      this.callbacks.onGoAway();
      return;
    }

    if (msg.toolCall?.functionCalls) {
      this.handleToolCalls(msg.toolCall.functionCalls);
      return;
    }

    if (msg.serverContent) {
      const sc = msg.serverContent;

      if (sc.inputTranscription?.text) {
        this.callbacks.onUserTranscript(sc.inputTranscription.text);
      }

      if (sc.outputTranscription?.text) {
        this.callbacks.onAITranscript(sc.outputTranscription.text);
      }

      if (sc.modelTurn?.parts) {
        for (const part of sc.modelTurn.parts) {
          if (part.inlineData?.data && part.inlineData?.mimeType?.startsWith('audio/')) {
            this.enqueueAudio(part.inlineData.data, part.inlineData.mimeType);
          }
        }
      }

      if (sc.interrupted) {
        this.clearPlaybackQueue();
      }

      if (sc.turnComplete) {
        this.callbacks.onTurnComplete();
      }
    }
  }

  private async handleToolCalls(calls: FunctionCall[]): Promise<void> {
    const responses = [];

    for (const call of calls) {
      if (!call.name) continue;
      const result = await executeAction(call.name, call.args || {});
      this.callbacks.onFunctionCall(call.name, result.result);
      responses.push({
        id: call.id,
        name: call.name,
        response: { output: result.result },
      });
    }

    if (this.session && responses.length > 0) {
      this.session.sendToolResponse({ functionResponses: responses });
    }
  }

  private async startMicrophone(): Promise<void> {
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.inputAudioContext = new AudioContext({ sampleRate: 16000 });
    await this.inputAudioContext.audioWorklet.addModule('/pcm-worklet-processor.js');

    const source = this.inputAudioContext.createMediaStreamSource(this.micStream);
    this.workletNode = new AudioWorkletNode(this.inputAudioContext, 'pcm-worklet-processor');

    this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (!this.session || !this.connected) return;
      const pcmBuffer = event.data;
      const bytes = new Uint8Array(pcmBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      this.session.sendRealtimeInput({
        audio: { data: base64, mimeType: 'audio/pcm;rate=16000' },
      });
    };

    source.connect(this.workletNode);
    this.workletNode.connect(this.inputAudioContext.destination);
  }

  private stopMicrophone(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode.port.close();
      this.workletNode = null;
    }

    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      try { this.inputAudioContext.close(); } catch (_) { /* ignore */ }
    }
    this.inputAudioContext = null;

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
  }

  private async enqueueAudio(base64Data: string, mimeType: string): Promise<void> {
    if (!this.outputAudioContext) {
      this.outputAudioContext = new AudioContext({ sampleRate: 24000 });
    }

    if (this.outputAudioContext.state === 'suspended') {
      await this.outputAudioContext.resume();
    }

    const sampleRate = this.parseSampleRate(mimeType);
    const raw = atob(base64Data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const audioBuffer = this.outputAudioContext.createBuffer(1, float32.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32);

    const item: PlaybackItem = { buffer: audioBuffer };
    this.playbackQueue.push(item);
    this.schedulePlayback();
  }

  private schedulePlayback(): void {
    if (!this.outputAudioContext || this.playbackQueue.length === 0) return;

    if (!this.isPlayingAudio) {
      this.isPlayingAudio = true;
      this.nextPlayTime = this.outputAudioContext.currentTime;
      this.callbacks.onAudioStart();
    }

    while (this.playbackQueue.length > 0) {
      const item = this.playbackQueue.shift()!;
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = item.buffer;
      source.connect(this.outputAudioContext.destination);

      const startAt = Math.max(this.nextPlayTime, this.outputAudioContext.currentTime);
      source.start(startAt);
      this.nextPlayTime = startAt + item.buffer.duration;

      item.source = source;
      source.onended = () => {
        if (this.playbackQueue.length === 0 && this.outputAudioContext) {
          const now = this.outputAudioContext.currentTime;
          if (now >= this.nextPlayTime - 0.05) {
            this.isPlayingAudio = false;
            this.callbacks.onAudioEnd();
          }
        }
      };
    }
  }

  private clearPlaybackQueue(): void {
    this.playbackQueue = [];
    this.isPlayingAudio = false;
    this.nextPlayTime = 0;
    this.callbacks.onAudioEnd();
  }

  private parseSampleRate(mimeType: string): number {
    const match = mimeType.match(/rate=(\d+)/);
    return match ? parseInt(match[1], 10) : 24000;
  }
}

export function isVoiceSupported(): boolean {
  return !!(
    navigator.mediaDevices?.getUserMedia &&
    window.AudioContext &&
    window.AudioWorklet
  );
}
