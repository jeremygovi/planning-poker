# CLAUDE.md

## Project overview

Poker Express is a self-hosted, real-time planning poker application.

- Client: React 19, Vite, TypeScript
- Server: Fastify 5, TypeScript
- Persistence: SQLite through `better-sqlite3`
- Real-time updates: WebSockets
- Validation: TypeBox
- Tests: Vitest, Testing Library, Playwright
- Runtime and development environment: Docker Compose, Node.js 24

The application is bilingual (French and English), responsive, keyboard-accessible, and supports reduced-motion preferences.

## Repository structure

- `src/client`: React SPA, browser storage, themes, sounds, and UI
- `src/server`: Fastify application, authentication, API routes, room service, WebSockets, and database access
- `src/shared`: types, validation schemas, and deck definitions shared by client and server
- `migrations`: ordered SQLite migrations
- `tests`: unit, API, WebSocket, React, static asset, style, migration, and end-to-end tests
- `public`: static assets
- `data`: persistent local SQLite data; never delete it as part of cleanup

## Commands

Use the Docker-based Make targets documented by the project:

- `make dev`: start the development server and client
- `make test`: run Vitest tests
- `make e2e`: run the Playwright multi-user journey
- `make lint`: run ESLint
- `make typecheck`: type-check client and server
- `make build`: build the production image
- `make prod`: build and start the production application

Prefer these commands over installing or updating dependencies directly on the host.

For a normal code change, run the relevant focused tests first, then:

```sh
make typecheck
make lint
make test
```

Run `make e2e` when changing a user journey, authentication, room membership, voting, reveal/finalization, persistence, or real-time behavior.

## Architecture and domain invariants

The server is authoritative. Do not reproduce authoritative room or estimation logic only in the client.

Preserve these invariants:

- Vote values remain secret until reveal.
- Before reveal, snapshots may expose whether a participant voted, but not their vote value.
- Observers cannot vote, but room participants can otherwise manage the room and its rounds.
- A room has at most one active story.
- An active story keeps its deck snapshot; the room default deck may change at any time and then applies to the next story.
- `abstain` is excluded from consensus and suggestion calculations.
- Finalized estimates retain the deck snapshot, revealed votes, suggestion, final value, and timestamps.
- WebSocket snapshots are connection-specific because membership and `ownVote` depend on the current participant.
- Sessions and online presence are in memory; rooms, participants, stories, votes, and history are persisted.
- Rejoin tokens must remain random and stored hashed in SQLite.
- Invitation tokens must stay out of URL query parameters; the client currently consumes them from the URL fragment.

When modifying estimation rules, update `src/server/core/estimation.ts` and its focused tests.

## API and shared contracts

When changing an API payload or domain value, review all relevant layers:

1. `src/shared/types.ts`
2. `src/shared/schemas.ts`
3. `src/server/routes.ts`
4. `src/server/room-service.ts`
5. `src/client/api.ts`
6. affected UI and tests

Keep TypeBox validation strict and reject unexpected properties.

Server-side TypeScript uses NodeNext resolution. Keep explicit `.js` extensions in relative imports, even when importing `.ts` source files.

Return stable application error codes through `AppError`; translate user-facing errors in both supported locales.

## Database changes

Do not edit an already-applied migration to evolve an existing database.

Create a new, ordered SQL file in `migrations/` and add or update migration tests. Migrations must remain transactional and compatible with existing persisted installations.

Use database transactions for multi-step state changes that must remain atomic.

Never delete or overwrite `data/` or user databases during development, testing, or cleanup.

## Client conventions

- Keep French and English translations synchronized in `src/client/i18n.ts`.
- Preserve keyboard navigation, semantic labels, and screen-reader behavior.
- Respect `prefers-reduced-motion`.
- Do not introduce externally hosted media or proprietary visual assets.
- Keep profile images processed client-side and within the existing validation and payload limits.
- Treat values read from `localStorage`, URLs, and API responses as untrusted input.

Add or update Testing Library tests for meaningful UI behavior. Prefer queries by role or accessible label over implementation-specific selectors where practical.

## Security constraints

Preserve the existing security model:

- shared access token authentication
- `HttpOnly`, `SameSite=Strict` session cookies
- constant-time access-token comparison
- login rate limiting
- origin checks for mutating API requests and WebSockets
- restrictive CSP and security headers
- bounded HTTP and WebSocket payloads

Never log, expose, or commit session tokens, rejoin tokens, tunnel credentials, `.env`, database files, backups, or user-provided avatar data.

## Generated and local files

Do not commit generated or local artifacts, including:

- `.env`
- `node_modules/`
- `dist/`
- `coverage/`
- `playwright-report/`
- `test-results/`
- `data/*` except `data/.gitkeep`
- `backups/`

Keep `package-lock.json` synchronized with `package.json` whenever dependencies change.
