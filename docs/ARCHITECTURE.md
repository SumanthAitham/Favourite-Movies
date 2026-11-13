# Movie Memory architecture

## Application and data model

One Next.js App Router application serves the React interface and API routes. TypeScript is used throughout; Tailwind and `globals.css` provide styling. Server components load session and database data. Client components handle search, selection, loading states, and the fact dialog. Auth.js handles Google OAuth and database sessions. Prisma connects to PostgreSQL through the `pg` adapter.

`User` stores the Google name, email, optional photo, and `onboardingCompletedAt`. Auth.js owns the account, session, and verification-token tables. Onboarding completion is explicit: removing every favorite must not turn a returning user into a new user.

`Movie` stores selected TMDB metadata with a unique `tmdbId`. This distinguishes remakes and movies with identical titles. `Favorite` joins users and movies; its unique `(userId, movieId)` constraint prevents duplicate saves. `MovieFact` stores generated text and its timestamp for one user/movie pair. A descending `(userId, movieId, createdAt)` index supports the latest-fact lookup. Foreign keys protect these relationships. Removing a favorite deletes only the join row, preserving other users' collections and shared metadata.

## Authentication and saving

Signed-out visitors can browse the catalog and start Google sign-in. `/auth/continue` sends incomplete users to onboarding and completed users to the dashboard. A pending TMDB ID survives login; first-time users confirm it before saving. The dashboard shows the Google profile, saved movies, and sign-out control.

Every personal operation derives identity from the server session. Movie IDs are validated, metadata is resolved through TMDB, and titles are trimmed and limited to 1–200 characters. Browser-supplied user IDs and movie metadata cannot authorize writes. A transaction saves the first favorite and completes onboarding together. Repeated submissions preserve the original completion time.

Favorite saving and fact generation are separate requests. A provider failure cannot undo a saved favorite. Personal responses use `private, no-store`; mutations also check the request origin and bound JSON body size. API keys stay in server-only modules. Missing Google names and photos have text and initials fallbacks.

## Variant A: caching and concurrency

PostgreSQL is the fact cache; Redis is not needed. The service checks favorite ownership before finding the latest fact for the authenticated user/movie. A fact younger than 60 seconds is returned immediately. At exactly 60 seconds or later, the next request can generate a replacement. There is no scheduled refresh.

A local Map shares pending promises within a process. For cache misses, the production adapter also opens a database transaction and acquires a transaction-scoped advisory lock keyed by user/movie. Independent Vercel instances using the same database therefore coordinate. After acquiring the lock, the service rechecks ownership and freshness; a waiting request can reuse the previous worker's committed fact.

Generation, the final ownership check, and persistence happen before the transaction commits and releases its lock. `createdAt` is set immediately before saving, after generation, because PostgreSQL's `now()` inside a transaction would otherwise record its start time. Callers receive generated success only after commit. Locks release on rollback too, and local promises are removed in `finally`.

This keeps one database connection occupied during generation. Lock waits are bounded to 25 seconds, transactions to 50 seconds, and the fact route allows 60 seconds. This tradeoff suits the exercise; higher traffic would benefit from a durable job queue. All app instances must use this coordinator and the same database. The advisory lock coordinates application requests; it cannot guarantee exactly-once external billing during a database/network failure.

## Providers and failures

OpenAI uses the Responses API with `gpt-4.1-mini` by default, a 15-second timeout, a 1,024-token output cap, `store: false`, and no automatic retries. Title, year, and optional TMDB synopsis are supplied as data separately from instructions. TMDB context has an eight-second timeout and is optional. Fresh fact-cache responses call neither provider. On a cache miss, the last five facts for the same user/movie are sent as data so OpenAI can choose a different detail. A normalized-text and word-pair overlap check rejects exact and near-verbatim repeats before saving. This is a wording heuristic, not a guarantee against every semantic paraphrase; rejected output uses the existing stale fallback without updating its timestamp.

Only completed assistant text is accepted. Refusals, incomplete output, malformed responses, and text over 1,000 characters are rejected. Empty completed output returns a friendly no-fact error. On provider, lock, or persistence failure, an existing fact can be returned as stale with its original timestamp. Otherwise the UI offers retry. Favorite ownership is checked again before fallback. Logs contain safe categories, not credentials or raw responses.

The UI labels facts as AI-generated. Dialog requests are cancelled on unmount and late responses ignored. Tests cover expiry boundaries, authorization, concurrent independent service instances, lock release, stale fallback, and onboarding redirects. See the [requirements checklist](REQUIREMENTS.md) for verification evidence and remaining manual checks.
