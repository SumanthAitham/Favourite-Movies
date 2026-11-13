# Movie Memory architecture

## Application structure

Next.js App Router serves the interface and HTTP endpoints in one TypeScript application. Server components load the current user, catalog, or saved collection. Client components own interactions, loading states, movie selection, and the native fact dialog. Tailwind is available for styling; the visual system is defined in `globals.css`. Auth.js and the Prisma adapter handle Google OAuth and database sessions. Zod validates external catalog responses, and Vitest runs the backend checks.

Prisma uses the PostgreSQL driver adapter. Its generated client is ignored by Git and rebuilt during installation and builds.

## Data model

`User` stores Google profile fields and explicit `onboardingCompletedAt`. Auth.js owns `Account`, `Session`, and `VerificationToken`. `Movie` is a shared record identified by unique `tmdbId`, with a title, nullable release year, and nullable poster path. Only selected films are persisted, not TMDB’s complete catalog.

`Favorite` joins a user to a movie. The unique `(userId, movieId)` constraint prevents duplicate rows. `MovieFact` stores a user/movie-specific generated statement and its creation time. A descending `(userId, movieId, createdAt)` index supports latest-fact lookup. Foreign keys enforce relationships; deleting a favorite never deletes the movie, another user’s favorite, or a fact.

Favorite creation validates a positive TMDB ID and resolves metadata through TMDB. A database transaction upserts the shared movie and user’s favorite, then completes onboarding when explicitly requested. Onboarding completion only updates a null timestamp. Bounded retries handle a uniqueness race if concurrent upserts compete. The database constraint remains the final authority.

## Identity and authorization

Every personal route derives its user ID from the authenticated server session. Browser-supplied user IDs and metadata cannot authorize or populate a write. `/dashboard` and `/onboarding` check the session on the server and route using the explicit onboarding field. Removing every favorite leaves that field intact.

Sign-in preserves only the selected numeric TMDB ID in a validated internal callback URL. `/auth/continue` performs a redirect, never a data write. New users confirm their selection; returning users’ pending selection is saved by an authenticated POST from the dashboard. Before completion, new users are directed to onboarding when they try to save from Discover.

Auth.js supplies OAuth state, redirect, session, and authentication-action protections. Personal JSON mutations additionally require an exact same-origin request and bounded JSON bodies. Fact requests confirm the film is currently in the caller’s collection before any cache access. Personal responses use `private, no-store`; no private state is included in the public movie API. Provider/SQL errors are converted to safe client errors.

## Variant A cache and concurrency

PostgreSQL stores the cached facts; Redis is not used. The fact service accepts a repository, generator, and clock so tests can exercise expiry and concurrency without network calls or real-time waits.

1. Authorize the user and selected movie, then find the latest fact for that pair.
2. If `now - createdAt < 60_000`, return it without calling OpenAI. At exactly 60 seconds, it is expired.
3. For a missing/expired fact, reuse an active promise keyed by user and database movie ID if present.
4. Otherwise register the promise synchronously before its deferred work starts. Inside that operation, recheck the database cache to cover a just-completed request.
5. For a new generation, try to enrich the stored title/year with a trusted TMDB overview. Generate a fact, validate its trimmed length, recheck favorite membership after the slow call, and persist it before resolving the shared promise. The database timestamps the stored record.
6. Remove the active promise in `finally`, on both success and failure.

The freshness window rolls from successful persistence; it is neither a calendar-minute bucket nor a background schedule. Revisiting a fact uses the same service. The in-memory map coordinates only one server process. A deployment with multiple instances needs a shared database-backed generation guard. An ownership recheck handles removals while OpenAI runs, but does not hold a database lock across network I/O.

## Failure behavior and provider separation

Favorite save and fact retrieval are different HTTP requests. The client waits for a successful save before showing the saved state and requesting a fact, so a OpenAI failure cannot undo persistence.

OpenAI runs only on the server through native `fetch` to `/v1/responses`. `OPENAI_API_KEY` is sent in the Authorization header. Requests use `cache: "no-store"`, `store: false`, a 15-second timeout, no automatic retries, and a 1,024-token output cap. `OPENAI_MODEL` defaults to `gpt-4.1-mini` and can be overridden with another Responses-compatible text model. No model-specific reasoning settings are sent.

The system instruction asks for a short, spoiler-light statement. Stored title/year and, when available, the trusted TMDB overview are supplied as JSON data rather than instructions. The overview lookup happens only inside new generation work after the cache recheck; it does not delay fresh-cache responses. A TMDB outage falls back to the stored title/year and does not prevent OpenAI generation.

Only completed responses without a provider error are accepted. The adapter collects `output_text` parts from completed assistant messages, skips reasoning items, and rejects refusals or malformed output. Text must contain 1–1,000 characters after trimming. An empty completed response becomes `FACT_NOT_AVAILABLE` (HTTP 422); incomplete, blocked, transport, and provider failures return a safe retryable error. Logs contain failure categories rather than raw responses or credentials. The UI supplies “Did you know?” and labels facts as AI-generated. TMDB context helps identify the film but does not independently verify the fact.

On generation or persistence failure, including `FACT_NOT_AVAILABLE`, an available prior fact is returned first with `source: stale` and its original timestamp. Without a prior fact, an empty result preserves the 422 no-fact outcome; provider and storage failures return a safe retryable error. An intervening loss of favorite ownership is never converted to stale success. A deleted favorite’s historical facts remain inaccessible unless that user saves it again.

TMDB is a separate module with an eight-second request bound, validated genre identifiers, page bounds, and per-record response validation. Public metadata caches have their own freshness settings. The dashboard reads persisted metadata without calling TMDB, except to resolve a pending post-login selection.

## Interface consistency and validation

Buttons lock repeated submissions while saves/removals are in progress. New facts use a dialog component keyed by TMDB ID; its requests are aborted on unmount and late results ignored. Loading, error/retry, stale-fact, missing poster, missing profile, and empty collection states are explicit. Genre strips preserve all returned movies and load more only on request. First-favorite selection requires confirmation.

Tests cover expiry at exactly 60 seconds, concurrent requests, user isolation, stale fallback, and retry after failure. Database integration tests check constraints, transactions, and persistence against local PostgreSQL. The opt-in live test exercises TMDB, OpenAI, and storage together. See [README.md](../README.md#checks) for commands, results, and the remaining browser checks.
