import { requireUser } from "@/lib/session";
import { getMovieFact } from "@/lib/facts";
import {
  errorResponse,
  privateHeaders,
  readJson,
  requireSameOrigin,
} from "@/lib/http";
import { parseTmdbId } from "@/lib/validation";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requireSameOrigin(request);
    const body = await readJson(request);
    const fact = await getMovieFact(user.id, parseTmdbId(body.tmdbId));
    return Response.json(fact, { headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
