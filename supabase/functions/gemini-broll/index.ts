import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenAI } from "npm:@google/genai@1.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500) {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return errorResponse("GEMINI_API_KEY not configured", 500);
    }

    const ai = new GoogleGenAI({ apiKey });
    const body = await req.json();
    const { action } = body;

    if (action === "analyze") {
      return await handleAnalyze(ai, body);
    } else if (action === "generate") {
      return await handleGenerate(ai, body);
    } else {
      return errorResponse("Unknown action. Use 'analyze' or 'generate'.", 400);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
});

async function handleAnalyze(
  ai: InstanceType<typeof GoogleGenAI>,
  body: {
    videoBase64: string;
    mimeType: string;
    projectWidth: number;
    projectHeight: number;
    clipTimestamps: { start: number; end: number; name: string }[];
  },
) {
  const { videoBase64, mimeType, projectWidth, projectHeight, clipTimestamps } =
    body;

  if (!videoBase64 || !mimeType) {
    return errorResponse("videoBase64 and mimeType are required", 400);
  }

  const systemInstruction = `You are a professional video editor specializing in b-roll selection and pacing. Analyze the provided video from the main timeline track and identify 3 to 6 specific moments where overlay b-roll footage would significantly enhance the production value. Consider pacing, visual variety, narrative emphasis, and moments where the viewer's attention could benefit from supplementary visuals.

For each suggestion, provide:
- timestampStart: the exact second where the b-roll should begin
- duration: how long the b-roll should last (between 2 and 8 seconds)
- prompt: a detailed visual description suitable for AI video generation (describe the scene, camera angle, lighting, mood, movement)
- rationale: a brief explanation of why b-roll enhances this moment

Return ONLY valid JSON. No markdown, no code fences.`;

  const userPrompt = `Analyze this video for b-roll opportunities.

Project resolution: ${projectWidth}x${projectHeight}
Existing clips on timeline: ${JSON.stringify(clipTimestamps)}

Return a JSON array of suggestion objects with fields: timestampStart (number), duration (number), prompt (string), rationale (string).`;

  const result = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: videoBase64,
            },
          },
          { text: userPrompt },
        ],
      },
    ],
    config: {
      systemInstruction,
      temperature: 0.7,
    },
  });

  const text = result.text ?? "";

  let suggestions;
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    suggestions = JSON.parse(cleaned);
  } catch {
    return errorResponse("Failed to parse AI response: " + text, 500);
  }

  if (!Array.isArray(suggestions)) {
    return errorResponse("AI response is not an array", 500);
  }

  const validated = suggestions
    .filter(
      (s: Record<string, unknown>) =>
        typeof s.timestampStart === "number" &&
        typeof s.duration === "number" &&
        typeof s.prompt === "string",
    )
    .map((s: Record<string, unknown>) => ({
      timestampStart: s.timestampStart as number,
      duration: Math.min(8, Math.max(2, s.duration as number)),
      prompt: s.prompt as string,
      rationale: (s.rationale as string) || "",
    }));

  return jsonResponse({ suggestions: validated });
}

async function handleGenerate(
  ai: InstanceType<typeof GoogleGenAI>,
  body: { prompt: string; aspectRatio?: string },
) {
  const { prompt, aspectRatio } = body;

  if (!prompt) {
    return errorResponse("prompt is required", 400);
  }

  let operation = await ai.models.generateVideos({
    model: "veo-3.0-generate-preview",
    prompt,
    config: {
      aspectRatio: aspectRatio || "16:9",
      numberOfVideos: 1,
    },
  });

  const maxAttempts = 60;
  let attempts = 0;

  while (!operation.done && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({
      operation: operation,
    });
    attempts++;
  }

  if (!operation.done) {
    return errorResponse("Video generation timed out after 10 minutes", 504);
  }

  if (
    !operation.response?.generatedVideos ||
    operation.response.generatedVideos.length === 0
  ) {
    return errorResponse("No videos were generated", 500);
  }

  const video = operation.response.generatedVideos[0];
  const videoUri = video.video?.uri;

  if (!videoUri) {
    return errorResponse("Generated video has no URI", 500);
  }

  const downloadUrl = `${videoUri}&key=${Deno.env.get("GEMINI_API_KEY")}`;

  return jsonResponse({ videoUrl: downloadUrl });
}
