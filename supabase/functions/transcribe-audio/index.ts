import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return errorResponse("ELEVENLABS_API_KEY not configured", 500);
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return errorResponse("No file provided", 400);
    }

    const elevenLabsForm = new FormData();
    elevenLabsForm.append("file", file);
    elevenLabsForm.append("model_id", "scribe_v2");
    elevenLabsForm.append("timestamps_granularity", "word");
    elevenLabsForm.append("tag_audio_events", "false");

    const languageCode = formData.get("language_code");
    if (languageCode && typeof languageCode === "string") {
      elevenLabsForm.append("language_code", languageCode);
    }

    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
        },
        body: elevenLabsForm,
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      return errorResponse(
        `ElevenLabs API error (${response.status}): ${errBody}`,
        response.status,
      );
    }

    const result = await response.json();

    const words = (result.words || [])
      .filter(
        (w: { type: string }) => w.type === "word",
      )
      .map((w: { text: string; start: number; end: number }) => ({
        startTime: w.start,
        endTime: w.end,
        text: w.text,
      }));

    return jsonResponse({
      segments: words,
      languageCode: result.language_code || null,
      fullText: result.text || "",
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
