const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com';

interface AnalyzeSuggestion {
  timestampStart: number;
  duration: number;
  prompt: string;
  rationale: string;
}

async function uploadFileToGemini(file: File): Promise<string> {
  const startRes = await fetch(
    `${BASE_URL}/upload/v1beta/files?key=${API_KEY}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(file.size),
        'X-Goog-Upload-Header-Content-Type': file.type || 'video/mp4',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { displayName: file.name } }),
    },
  );

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`File upload init failed: ${err}`);
  }

  const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('No upload URL returned');

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Type': file.type || 'video/mp4',
    },
    body: file,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`File upload failed: ${err}`);
  }

  const uploadData = await uploadRes.json();
  const fileName = uploadData.file?.name;
  if (!fileName) throw new Error('Upload succeeded but no file name returned');

  let state = uploadData.file?.state;
  let fileUri = uploadData.file?.uri;
  let attempts = 0;

  while (state === 'PROCESSING' && attempts < 120) {
    await new Promise((r) => setTimeout(r, 1500));
    const pollRes = await fetch(
      `${BASE_URL}/v1beta/${fileName}?key=${API_KEY}`,
    );
    if (!pollRes.ok) {
      attempts++;
      continue;
    }
    const pollData = await pollRes.json();
    state = pollData.state;
    fileUri = pollData.uri;
    attempts++;
  }

  if (state !== 'ACTIVE') {
    throw new Error('File processing timed out');
  }

  return fileUri;
}

export async function analyzeForBRoll(
  videoFile: File,
  context: {
    projectWidth: number;
    projectHeight: number;
    clipTimestamps: { start: number; end: number; name: string }[];
    existingSuggestions?: { timestampStart: number; duration: number; prompt: string }[];
  },
): Promise<AnalyzeSuggestion[]> {
  if (!API_KEY) throw new Error('Gemini API key not configured');

  const fileUri = await uploadFileToGemini(videoFile);

  const isGeneratingMore = context.existingSuggestions && context.existingSuggestions.length > 0;

  const systemInstruction = isGeneratingMore
    ? `You are a professional video editor specializing in b-roll selection and pacing. Analyze the provided video and identify 3 to 5 ADDITIONAL moments where overlay b-roll footage would enhance the production value. These should be DIFFERENT from the suggestions already provided. Focus on finding NEW opportunities that complement but don't overlap with existing suggestions.

For each suggestion, provide:
- timestampStart: the exact second where the b-roll should begin (avoid timestamps that are already covered)
- duration: how long the b-roll should last (between 2 and 8 seconds)
- prompt: a detailed visual description suitable for AI video generation (describe the scene, camera angle, lighting, mood, movement)
- rationale: a brief explanation of why b-roll enhances this moment

Return ONLY valid JSON. No markdown, no code fences.`
    : `You are a professional video editor specializing in b-roll selection and pacing. Analyze the provided video from the main timeline track and identify 3 to 6 specific moments where overlay b-roll footage would significantly enhance the production value. Consider pacing, visual variety, narrative emphasis, and moments where the viewer's attention could benefit from supplementary visuals.

For each suggestion, provide:
- timestampStart: the exact second where the b-roll should begin
- duration: how long the b-roll should last (between 2 and 8 seconds)
- prompt: a detailed visual description suitable for AI video generation (describe the scene, camera angle, lighting, mood, movement)
- rationale: a brief explanation of why b-roll enhances this moment

Return ONLY valid JSON. No markdown, no code fences.`;

  const existingInfo = isGeneratingMore
    ? `\n\nEXISTING SUGGESTIONS (find different moments):\n${JSON.stringify(context.existingSuggestions, null, 2)}`
    : '';

  const userPrompt = `Analyze this video for ${isGeneratingMore ? 'ADDITIONAL' : ''} b-roll opportunities.

Project resolution: ${context.projectWidth}x${context.projectHeight}
Existing clips on timeline: ${JSON.stringify(context.clipTimestamps)}${existingInfo}

Return a JSON array of suggestion objects with fields: timestampStart (number), duration (number), prompt (string), rationale (string).`;

  const res = await fetch(
    `${BASE_URL}/v1beta/models/gemini-3-flash-preview:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { mimeType: videoFile.type || 'video/mp4', fileUri } },
              { text: userPrompt },
            ],
          },
        ],
        generationConfig: { temperature: 0.7 },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Analysis request failed' } }));
    throw new Error(err.error?.message || 'Analysis request failed');
  }

  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  let suggestions;
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    suggestions = JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to parse AI response');
  }

  if (!Array.isArray(suggestions)) {
    throw new Error('AI response is not an array');
  }

  return suggestions
    .filter(
      (s: Record<string, unknown>) =>
        typeof s.timestampStart === 'number' &&
        typeof s.duration === 'number' &&
        typeof s.prompt === 'string',
    )
    .map((s: Record<string, unknown>) => ({
      timestampStart: s.timestampStart as number,
      duration: Math.min(8, Math.max(2, s.duration as number)),
      prompt: s.prompt as string,
      rationale: (s.rationale as string) || '',
    }));
}

export interface CaptionSegment {
  startTime: number;
  endTime: number;
  text: string;
}

export async function transcribeForCaptions(
  videoFile: File,
): Promise<CaptionSegment[]> {
  if (!API_KEY) throw new Error('Gemini API key not configured');

  const fileUri = await uploadFileToGemini(videoFile);

  const systemInstruction = `You are a professional subtitle timing engineer. Your job is to produce word-level timestamps that are perfectly synchronized with spoken audio.

CRITICAL RULES:
1. ONE word per JSON object. Never combine multiple words.
2. Timestamps in seconds with at least 2 decimal places (e.g. 0.52, 1.78).
3. startTime = the EXACT moment the word begins being spoken in the audio waveform.
4. endTime = the EXACT moment the word finishes being spoken.
5. Average speaking rate is 2-4 words per second. A typical word lasts 0.15-0.50 seconds. Use this as a sanity check.
6. Short words (a, the, I, is, it) still have measurable duration: minimum 0.08 seconds.
7. Long/multi-syllable words take longer: "beautiful" ~0.45s, "conversation" ~0.55s, "understanding" ~0.50s.
8. In fluent speech, the next word starts very close to when the previous word ends (gap < 0.05s).
9. Pauses between sentences or phrases create gaps of 0.2-1.0+ seconds. Measure these gaps precisely.
10. Timestamps MUST be strictly increasing. No word can start before the previous word ends.
11. Do NOT round timestamps to whole or half seconds. Use the actual audio timing.
12. Transcribe ALL spoken words. Skip nothing.
13. Return empty array [] if no speech is detected.

Return ONLY a valid JSON array. No markdown, no code fences, no explanation.`;

  const userPrompt = `Listen carefully to the audio and transcribe every spoken word with precise timing aligned to the audio signal.

Return a JSON array where each entry is one word:
[{"startTime":0.52,"endTime":0.78,"text":"Hello"},{"startTime":0.79,"endTime":1.15,"text":"everyone"}]`;

  const res = await fetch(
    `${BASE_URL}/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { mimeType: videoFile.type || 'video/mp4', fileUri } },
              { text: userPrompt },
            ],
          },
        ],
        generationConfig: { temperature: 0.05 },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Transcription request failed' } }));
    throw new Error(err.error?.message || 'Transcription request failed');
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  let segments;
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    segments = JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to parse transcription response');
  }

  if (!Array.isArray(segments)) {
    throw new Error('Transcription response is not an array');
  }

  const raw: CaptionSegment[] = segments
    .filter(
      (s: Record<string, unknown>) =>
        typeof s.startTime === 'number' &&
        typeof s.endTime === 'number' &&
        typeof s.text === 'string' &&
        (s.text as string).trim().length > 0,
    )
    .map((s: Record<string, unknown>) => ({
      startTime: s.startTime as number,
      endTime: s.endTime as number,
      text: (s.text as string).trim(),
    }));

  return postProcessTimestamps(raw);
}

function postProcessTimestamps(segments: CaptionSegment[]): CaptionSegment[] {
  if (segments.length === 0) return segments;

  segments.sort((a, b) => a.startTime - b.startTime);

  const MIN_WORD_DURATION = 0.08;
  const MAX_WORD_DURATION = 1.5;
  const AVG_CHARS_PER_SEC = 12;
  const SPEECH_GAP_THRESHOLD = 0.08;

  const result: CaptionSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = { ...segments[i] };
    let duration = seg.endTime - seg.startTime;

    const expectedDur = Math.max(MIN_WORD_DURATION, seg.text.length / AVG_CHARS_PER_SEC);

    if (duration < MIN_WORD_DURATION) {
      seg.endTime = seg.startTime + expectedDur;
      duration = expectedDur;
    }

    if (duration > MAX_WORD_DURATION) {
      seg.endTime = seg.startTime + Math.min(expectedDur * 1.5, MAX_WORD_DURATION);
    }

    if (i > 0) {
      const prev = result[result.length - 1];

      if (seg.startTime < prev.endTime) {
        const overlap = prev.endTime - seg.startTime;
        if (overlap < 0.15) {
          const mid = (prev.endTime + seg.startTime) / 2;
          prev.endTime = mid;
          seg.startTime = mid;
        } else {
          seg.startTime = prev.endTime;
        }
        if (seg.endTime <= seg.startTime) {
          seg.endTime = seg.startTime + expectedDur;
        }
      }

      const gap = seg.startTime - prev.endTime;
      if (gap > 0 && gap < SPEECH_GAP_THRESHOLD) {
        prev.endTime = seg.startTime;
      }
    }

    result.push(seg);
  }

  return result;
}

export async function generateBRollVideo(
  prompt: string,
  aspectRatio = '16:9',
): Promise<string> {
  if (!API_KEY) throw new Error('Gemini API key not configured');

  const res = await fetch(
    `${BASE_URL}/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          aspectRatio,
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Generation request failed' } }));
    throw new Error(err.error?.message || 'Generation request failed');
  }

  let operation = await res.json();
  let attempts = 0;

  while (!operation.done && attempts < 60) {
    await new Promise((r) => setTimeout(r, 10000));
    const pollRes = await fetch(
      `${BASE_URL}/v1beta/${operation.name}?key=${API_KEY}`,
    );
    if (pollRes.ok) {
      operation = await pollRes.json();
    }
    attempts++;
  }

  if (!operation.done) {
    throw new Error('Video generation timed out');
  }

  const samples = operation.response?.generateVideoResponse?.generatedSamples;
  if (!samples || samples.length === 0) {
    throw new Error('No videos were generated');
  }

  const videoUri = samples[0].video?.uri;
  if (!videoUri) throw new Error('Generated video has no URI');

  return `${videoUri}&key=${API_KEY}`;
}

export async function generateBRollImage(
  prompt: string,
  aspectRatio = '16:9',
): Promise<string> {
  if (!API_KEY) throw new Error('Gemini API key not configured');

  const orientationHint = aspectRatio === '9:16' ? 'vertical/portrait orientation (9:16)' : 'horizontal/landscape orientation (16:9)';

  const res = await fetch(
    `${BASE_URL}/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `Generate a high-quality photo-realistic image in ${orientationHint} for use as b-roll footage in a video edit. The image should be: ${prompt}` }],
          },
        ],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: {
            aspectRatio,
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Image generation failed' } }));
    throw new Error(err.error?.message || 'Image generation failed');
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) throw new Error('No content in image generation response');

  const imagePart = parts.find(
    (p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith('image/'),
  );

  if (!imagePart?.inlineData) {
    throw new Error('No image was generated');
  }

  const { mimeType, data: b64 } = imagePart.inlineData;
  return `data:${mimeType};base64,${b64}`;
}

