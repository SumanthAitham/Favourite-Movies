import { AppError } from "@/lib/errors";

export const privateHeaders = { "Cache-Control": "private, no-store" };

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError)
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: privateHeaders },
    );
  // Avoid returning provider errors, SQL, stack traces, or session details to the client.
  console.error("Movie Memory request failed", {
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    },
    { status: 500, headers: privateHeaders },
  );
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.AUTH_URL || request.url).origin;
  if (!origin || origin !== expected)
    throw new AppError(
      "FORBIDDEN",
      "This request could not be verified. Please reload and try again.",
      403,
    );
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("INVALID_REQUEST", "Please send a valid request.", 400);
  // Cap input before JSON parsing; even chunked request bodies are bounded.
  if (Number(request.headers.get("content-length") || 0) > 2048)
    throw new AppError("INVALID_REQUEST", "This request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader)
    throw new AppError("INVALID_REQUEST", "Please send a valid request.", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 2048) {
      await reader.cancel();
      throw new AppError("INVALID_REQUEST", "This request is too large.", 413);
    }
    chunks.push(value);
  }
  try {
    const text = Buffer.concat(chunks).toString("utf8");
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error("Invalid body");
    return value as Record<string, unknown>;
  } catch {
    throw new AppError("INVALID_REQUEST", "Please send a valid request.", 400);
  }
}
