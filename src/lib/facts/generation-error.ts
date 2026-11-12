import { AppError } from "@/lib/errors";

export type GenerationFailureReason =
  | "missing_key"
  | "invalid_model"
  | "authentication"
  | "model_not_found"
  | "request_rejected"
  | "rate_limited"
  | "upstream_unavailable"
  | "timeout"
  | "network"
  | "blocked"
  | "truncated"
  | "invalid_response"
  | "empty_response"
  | "oversized_response";

// Only these application-owned messages may pass through to the fact panel.
// Raw provider errors, prompts and credential values never become UI messages.
export class FactGenerationError extends AppError {
  constructor(public readonly reason: GenerationFailureReason) {
    const noFact = reason === "empty_response";
    const message = noFact
      ? "We couldn’t generate a reliable fact for this movie yet. Try another film, or check back later."
      : reason === "rate_limited"
        ? "Movie facts have reached a temporary request limit. Please try again later."
        : reason === "timeout"
          ? "The fact took too long to arrive. Please try again."
          : "Movie facts are temporarily unavailable. Please try again.";
    super(
      noFact ? "FACT_NOT_AVAILABLE" : "FACT_UNAVAILABLE",
      message,
      noFact ? 422 : 503,
    );
    this.name = "FactGenerationError";
  }
}
