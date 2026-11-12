import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { isAuthConfigured } from "@/lib/session";

export const runtime = "nodejs";

function unavailable() {
  return Response.json(
    {
      error: {
        code: "AUTH_UNAVAILABLE",
        message: "Sign-in is not configured yet. Please try again later.",
      },
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!isAuthConfigured()) return unavailable();
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthConfigured()) return unavailable();
  return handlers.POST(request);
}
