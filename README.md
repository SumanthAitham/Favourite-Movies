# Movie Memory

A personal movie collection: discover films by genre, sign in with Google, save multiple favorites, and see a short AI-generated fact under **“Did you know?”**.

Built with TypeScript, Next.js App Router, React, Tailwind CSS, PostgreSQL, and Prisma. Google authentication uses Auth.js, catalog data comes from TMDB, and facts use the Gemini API. The selected take-home variant is **Variant A**: backend caching, duplicate-generation protection, and failure recovery.

## Run locally

Prerequisites: Node.js 22.12+ (Node 24 recommended), npm, PostgreSQL 17 or Docker with Compose, and credentials for Google OAuth, TMDB, and Gemini.

```bash
npm ci
cp .env.example .env
```

If `.env` already exists, keep it and fill in the missing values. The initial workspace setup created a local `.env` with a generated `AUTH_SECRET` and the local database URL. External service credentials must be supplied separately. Real secrets belong only in the ignored `.env`; keep `.env.example` as a placeholder-only template. Never put secrets in `NEXT_PUBLIC_` variables.

Start PostgreSQL and apply the checked-in migration:

```bash
docker compose -p movie-memory up -d --wait
npm run db:migrate
npm run dev
```

On systems with the standalone Compose command, use `docker-compose` instead of `docker compose`. The initial setup used `docker-compose -p movie-memory up -d --wait`. The database listens only on `127.0.0.1:5432`; its password in `compose.yaml` is a local development default. Use your own connection string for a hosted database.

Open **http://localhost:3000**. Use this hostname consistently with `AUTH_URL` and the Google redirect URI; `127.0.0.1` and `localhost` are different origins.

The homepage and About page render before services are configured. Missing catalog credentials show an unavailable state, and Google sign-in remains disabled until its configuration is present. There is no demo login, fabricated movie catalog, or in-memory substitute for saved user data.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by the application. The example matches Compose. |
| `DIRECT_DATABASE_URL` | Optional direct connection for migrations when the runtime connection uses a pooler. |
| `AUTH_SECRET` | Random session/authentication secret. Generate with `openssl rand -base64 32`. |
| `AUTH_URL` | Canonical app origin, initially `http://localhost:3000`. |
| `AUTH_GOOGLE_ID` | Google OAuth web client ID. |
| `AUTH_GOOGLE_SECRET` | Google OAuth web client secret. |
| `TMDB_READ_ACCESS_TOKEN` | TMDB **API Read Access Token** used as a bearer token; not the v3 API key. |
| `GEMINI_API_KEY` | Server-side Gemini API key from Google AI Studio. |
| `GEMINI_MODEL` | Configurable text model; defaults to `gemini-3.5-flash-lite`. |

In Google Cloud, configure an OAuth **Web application**, the consent screen, and any required test users. Add `http://localhost:3000` as an authorized JavaScript origin and `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. Update both for a future deployment. Restart the development server after changing `.env`.

TMDB credentials are available in your TMDB account’s API settings. Create a Gemini key in [Google AI Studio](https://aistudio.google.com/apikey) and add it as `GEMINI_API_KEY` in `.env`. This is separate from the Google OAuth client ID and secret used for sign-in. Your Gemini project needs access and quota for the configured model. Restart the development server after setting the key.

## User flow

1. Browse genre rows or search for a movie. Genres are read from TMDB; every additional results page requires an explicit action.
2. Selecting a favorite while signed out carries its TMDB ID through Google login.
3. A new user confirms their first favorite in onboarding. The favorite and `onboardingCompletedAt` commit in one transaction. Returning users go directly to their dashboard, and a pending movie is saved through an authenticated POST.
4. A successful save marks the movie as saved, then opens the fact dialog. Fact generation is a separate request; failures cannot roll back the favorite.
5. Reopen “Did you know?” for a saved film, or remove it. Removing every favorite does not restart onboarding.

On a fact-cache miss, the server tries to supply Gemini with a trusted TMDB overview alongside the stored title and release year. This helps identify recent or unfamiliar films. If TMDB is unavailable, generation can still use the stored title/year. An empty Gemini response is treated as **no fact available for this film** (`FACT_NOT_AVAILABLE`, HTTP 422), rather than a service outage. An existing saved fact is always preferred as the fallback, with its timestamp unchanged.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model, cache algorithm, authorization boundaries, and tradeoffs.

```text
src/app/                Server pages, protected routes, and API handlers
src/components/         Catalog, cards, onboarding, dashboard, and fact dialog
src/actions/auth.ts     Auth.js sign-in and sign-out server actions
src/lib/session.ts      Current-user lookup and authentication requirement
src/lib/favorites.ts    Trusted metadata resolution and transactional persistence
src/lib/facts/          Testable cache service and Prisma repository adapter
src/lib/tmdb.ts          TMDB validation, catalog requests, and catalog caching
src/lib/gemini.ts        Server-only Gemini integration
prisma/                 Schema and initial PostgreSQL migration
tests/                  Unit, HTTP-handler, and opt-in database tests
```

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The normal test suite uses mocked dependencies. It covers exact cache timing, one generation for simultaneous requests, user/movie isolation, authorization, malformed input, origin checks, failure fallback, retries, trusted metadata, favorite transactions, and the Gemini adapter. Five database integration checks and one live Gemini check are skipped by default.

With the local database running and migrated:

```bash
npm run test:database
```

These **five integration tests** use the real local Postgres database and mock only TMDB/Gemini. They create uniquely named fixtures, clean up only their own records, and refuse non-local databases or a database name other than `movie_memory`.

Initial verification, before the provider migration: TypeScript, ESLint, 99 unit/handler tests, all five database integration tests, Prisma validation, migration application, and a production build passed. The local homepage returned HTTP 200. Subsequent direct Gemini diagnostics verified that the configured key/model can generate text for a known film and reproduced an HTTP 200 response with no text for a recent film. This distinction motivated the added movie context and explicit no-fact response. The updated production fact service has also passed a live check using TMDB, Gemini, and local PostgreSQL: it generated a fact for a previously empty response, persisted it, and returned the same fact from cache. This service check uses an isolated test user and does not verify the browser UI. Browser automation was unavailable, so visual layout and keyboard interactions still need manual verification. Live Google OAuth and TMDB acceptance checks remain separate.

To check the real Gemini/TMDB/database pipeline for a movie already stored locally:

```bash
GEMINI_SMOKE_TMDB_ID=272 npm run test:gemini
```

This opt-in check consumes Gemini quota, creates an isolated test user, verifies generation/persistence/cache, and removes that user's fixtures. It does not modify existing users or their favorites. Use a stored TMDB ID; the default is `272` (Batman Begins).

Manual acceptance checks after configuring credentials:

- Google login/logout; new and returning user routing; pending movie confirmation.
- Multiple favorites, repeated saves, removals, and an empty returning-user collection.
- Catalog search, genres, pagination, provider errors, and missing poster/profile fallbacks.
- Fact loading, no-fact availability, keyboard focus/Escape in the dialog, retry, stale fallback, and switching movies while a request is in flight.
- Mobile and desktop layout.

For production locally, run `npm run build` then `npm start`. `npm run db:dev` creates development migrations; `npm run db:migrate` applies committed migrations. `npm run db:studio` opens Prisma Studio.

## Scope and tradeoffs

- Genre browsing and multiple favorites are agreed additions to the original exercise. The original roughly three-hour estimate does not include those additions.
- The supplied specification named OpenAI; the project owner subsequently requested Gemini for fact generation. Variant A’s cache, concurrency, and recovery behavior is unchanged.
- Variant A was selected because this project emphasizes correct server-side caching and failure handling. Variant B’s client-cache and optimistic-edit requirements are not included.
- Auth.js v5 is pinned to its beta release for the documented App Router integration. Authentication and session cryptography are handled by the library.
- Concurrent fact requests share a promise **inside one server process**. Multiple replicas, separate serverless instances, or restarts are not coordinated. Use a Postgres-backed lease/lock before deploying to multiple instances; the current design makes no distributed guarantee.
- Public TMDB catalog caching and private fact caching are separate. Saved metadata keeps the collection readable during a TMDB outage. Additional TMDB context is fetched only when a new fact is needed and is optional if the catalog is unavailable.
- There is no periodic 60-second job. An expired fact generates only when requested.
- Facts are AI-generated, not independently verified. The About page contains the required TMDB credit and its unmodified approved logo.
- A valid Gemini key does not guarantee a fact for every film. Recent or unfamiliar movies can produce empty output; the app reports that separately from a provider failure. Server diagnostics categorize failures without logging credentials, raw provider responses, or movie prompts.
- The dependency audit found no production dependency vulnerabilities during initial verification. Seven moderate development-tool findings remain in the ESLint dependency tree; the available automatic audit fix did not resolve them.
- This workspace contains the implementation and setup documentation. GitHub publication and public deployment have not been performed. Public deployment and the optional walkthrough video are not required by the supplied specification.

## With two more hours

Complete live OAuth/provider acceptance checks and mobile/keyboard QA; add browser regression coverage for onboarding and dialog races; implement a database-backed generation lease if the chosen hosting platform runs multiple instances; add per-user generation limits and structured operational metrics. Review auth-library release status and development dependency updates before submission.

## AI usage

Codex assisted with scaffolding, implementation, tests, review, and documentation. Automated checks and their limits are listed above. The project owner should review the code and be ready to explain its design choices; this note does not claim a manual human review or live verification that has not happened.

## References and credits

- [Auth.js installation](https://authjs.dev/getting-started/installation?framework=Next.js)
- [Prisma PostgreSQL driver adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)
- [TMDB discovery](https://developer.themoviedb.org/reference/discover-movie), [attribution requirements](https://developer.themoviedb.org/docs/faq), and [approved logo source](https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg)
- [Gemini content-generation API](https://ai.google.dev/api/generate-content), [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key), and [configured model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
