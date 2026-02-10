import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const REMOTION_VERSION = "4.0.420";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500) {
  return jsonResponse({ error: message }, status);
}

async function hmacSha256(
  key: ArrayBuffer | Uint8Array,
  message: string
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(
    new TextEncoder().encode("AWS4" + secretKey),
    dateStamp
  );
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function signRequest(
  method: string,
  url: string,
  body: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<Record<string, string>> {
  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname;
  const path = parsedUrl.pathname;
  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);

  const payloadHash = await sha256(body);
  const canonicalHeaders =
    `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";

  const canonicalRequest = [
    method,
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/lambda/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  const signingKey = await getSignatureKey(
    secretAccessKey,
    dateStamp,
    region,
    "lambda"
  );
  const signatureBuffer = await hmacSha256(signingKey, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    Authorization: authorization,
  };
}

async function invokeLambda(
  functionName: string,
  payload: unknown,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<unknown> {
  const url = `https://lambda.${region}.amazonaws.com/2015-03-31/functions/${functionName}/invocations`;
  const body = JSON.stringify(payload);
  const headers = await signRequest(
    "POST",
    url,
    body,
    region,
    accessKeyId,
    secretAccessKey
  );

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
  });

  const functionError = response.headers.get("x-amz-function-error");

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lambda invocation failed (${response.status}): ${text}`);
  }

  const result = await response.json();

  if (functionError) {
    const errMsg = result?.errorMessage || result?.message || JSON.stringify(result);
    throw new Error(`Lambda function error (${functionError}): ${errMsg}`);
  }

  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const accessKeyId = Deno.env.get("REMOTION_AWS_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("REMOTION_AWS_SECRET_ACCESS_KEY");
    const region = Deno.env.get("REMOTION_AWS_REGION") || "us-east-1";
    const functionName = Deno.env.get("REMOTION_FUNCTION_NAME");
    const serveUrl = Deno.env.get("REMOTION_SERVE_URL");

    if (!accessKeyId || !secretAccessKey || !functionName || !serveUrl) {
      return errorResponse(
        "Cloud rendering is not configured. AWS credentials and Remotion deployment details are required.",
        503
      );
    }

    const { action, ...params } = await req.json();

    if (action === "start") {
      const { compositionProps, width, height, fps, durationInFrames } = params;

      const serializedInputProps = {
        type: "payload" as const,
        payload: JSON.stringify({
          ...compositionProps,
          width,
          height,
          fps,
          durationInFrames,
        }),
      };

      const lambdaPayload = {
        type: "start",
        version: REMOTION_VERSION,
        serveUrl,
        composition: "main",
        inputProps: serializedInputProps,
        codec: "h264",
        imageFormat: "jpeg",
        crf: null,
        envVariables: {},
        pixelFormat: null,
        proResProfile: null,
        x264Preset: null,
        jpegQuality: 80,
        maxRetries: 1,
        privacy: "public",
        logLevel: "info",
        frameRange: null,
        outName: `render-${Date.now()}.mp4`,
        timeoutInMilliseconds: 240000,
        chromiumOptions: {},
        scale: 1,
        everyNthFrame: 1,
        numberOfGifLoops: null,
        concurrencyPerLambda: 1,
        concurrency: null,
        downloadBehavior: { type: "play-in-browser" },
        muted: false,
        overwrite: true,
        audioBitrate: null,
        videoBitrate: null,
        encodingMaxRate: null,
        encodingBufferSize: null,
        webhook: null,
        forceHeight: null,
        forceWidth: null,
        bucketName: null,
        audioCodec: null,
        offthreadVideoCacheSizeInBytes: null,
        offthreadVideoThreads: null,
        mediaCacheSizeInBytes: null,
        deleteAfter: null,
        colorSpace: null,
        preferLossless: false,
        forcePathStyle: false,
        metadata: null,
        licenseKey: null,
        rendererFunctionName: null,
        framesPerLambda: 20,
        storageClass: null,
        isProduction: null,
      };

      const result = await invokeLambda(
        functionName,
        lambdaPayload,
        region,
        accessKeyId,
        secretAccessKey
      );

      const parsed =
        typeof result === "string" ? JSON.parse(result) : result;

      if (parsed?.type === "error") {
        return errorResponse(parsed.message || "Lambda returned an error", 502);
      }

      return jsonResponse({
        renderId: parsed.renderId,
        bucketName: parsed.bucketName,
      });
    }

    if (action === "progress") {
      const { renderId, bucketName } = params;

      const lambdaPayload = {
        type: "status",
        bucketName,
        renderId,
        version: REMOTION_VERSION,
        logLevel: "info",
        forcePathStyle: false,
        s3OutputProvider: null,
      };

      const result = await invokeLambda(
        functionName,
        lambdaPayload,
        region,
        accessKeyId,
        secretAccessKey
      );

      const parsed =
        typeof result === "string" ? JSON.parse(result) : result;

      if (parsed?.type === "error") {
        return errorResponse(parsed.message || "Status check failed", 502);
      }

      const done = parsed.done === true || parsed.overallProgress === 1;
      const progress = Math.round((parsed.overallProgress ?? 0) * 100);

      return jsonResponse({
        progress,
        done,
        outputUrl: parsed.outputFile ?? null,
        outputSize: parsed.outputSizeInBytes ?? null,
        errors: parsed.errors ?? [],
        fatalErrorEncountered: parsed.fatalErrorEncountered ?? false,
      });
    }

    return errorResponse(
      'Invalid action. Use "start" or "progress".',
      400
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error occurred";
    return errorResponse(message, 500);
  }
});
