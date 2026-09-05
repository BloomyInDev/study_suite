# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Dev (all apps in parallel)
pnpm dev

# Dev (single app)
pnpm -F @studysuite/api dev       # Hono API on port 3000
pnpm -F @studysuite/web dev       # Vue frontend on port 5173
pnpm -F @studysuite/scraper dev   # Node scraper

# Type checking
pnpm typecheck                    # all packages
pnpm -F @studysuite/api typecheck # single package

# Lint / format
pnpm lint
pnpm format

# Database (requires DATABASE_URL in .env)
pnpm -F @studysuite/db db:generate  # generate migration from schema
pnpm -F @studysuite/db db:migrate   # apply migrations
pnpm -F @studysuite/db db:studio    # open Drizzle Studio
```

## Architecture

### Monorepo layout

```
apps/api      — Hono HTTP server, runs under Bun
apps/scraper  — Node scraper (Playwright), scrapes Prose Consult
apps/web      — Vue 3 + Vuetify SPA, served by Vite
packages/db      — Drizzle ORM client + schema (shared by api and scraper)
packages/shared  — Zero-runtime-dep package: Zod schemas, shared types, config loader
packages/tsconfig — Base tsconfig variants (base / node / bun)
```

### Workspace resolution

npm scope is `@studysuite`. When an app declares `"@studysuite/shared": "workspace:*"`, pnpm symlinks it to `packages/shared/`. Each package's `exports` field points to its raw TypeScript source (e.g. `"./src/index.ts"`), so Bun/Vite/tsx consume it directly without a build step.

`tsconfig.base.json` at the root defines `paths` for `@studysuite/shared` and `@studysuite/db` so TypeScript resolves them to the correct source files.

### Runtimes per app

| App     | Runtime | Dev tool    | tsconfig variant                 |
| ------- | ------- | ----------- | -------------------------------- |
| api     | Bun     | `bun --hot` | `@studysuite/tsconfig/bun.json`  |
| scraper | Node    | `tsx watch` | `@studysuite/tsconfig/node.json` |
| web     | Node    | `vite`      | `@studysuite/tsconfig/base.json` |

---

## Time: Paris wall-clock labelled UTC

Every event timestamp — `events.start_date`, `events.end_date`, and the `startDate` /
`endDate` an api response carries — is a **label, not an instant**. The scraper builds
them with `Date.UTC` from the hour the Prose Consult page displays, so a course at
10h00 Paris is stored as `10:00:00Z`. Reading it back with the UTC getters gives the
hour a student actually sees.

The consequence: **`new Date()` cannot be compared with one of them.** Doing so is off
by the Paris UTC offset — one hour in winter, two in summer. Every availability feature
("Disponibles maintenant", free rooms, teacher busy/free, current-or-next event) was
wrong by that amount because of exactly this.

`@studysuite/shared/time` is the only correct way across that boundary:

| Helper                                                      | Use                                         |
| ----------------------------------------------------------- | ------------------------------------------- |
| `wallClockNow()`                                            | "now", comparable with an event timestamp   |
| `toWallClock(instant)`                                      | convert a real instant you already hold     |
| `wallClockDayStart(instant?)` / `wallClockDayEnd(instant?)` | the Paris day's bounds; `…End` is exclusive |

It resolves the offset through an explicit `Europe/Paris` `Intl.DateTimeFormat`, never
the local getters. The predecessor (`dateToUTC`) read the process timezone, which is
Europe/Paris on a laptop and **UTC in the api container** — so availability was right in
dev and two hours out in production.

Rules of thumb:

- Query params `from` / `to` on the event routes are wall-clock too, matching the
  responses. Sending `new Date().toISOString()` shifts the window.
- Timestamps that are genuinely instants — `users.updated_at`, `discord_token_expires_at`,
  `assignments.due_date`, iCal's `DTSTAMP` — stay real dates and compare with `new Date()`.
  `HomeView` holds both and keeps them apart as `now` and `wallNow`.
- Displaying an event time means UTC getters or `timeZone: 'UTC'`, which is what
  `apps/web/src/lib/date.ts` does throughout.

## packages/shared

Two entry points:

- `@studysuite/shared` — Zod schemas and TypeScript types for events (`ParsedEvent`, `Location`, `Teacher`, `StudentGroup`)
- `@studysuite/shared/config` — config loader utilities: `loadConfig`, `zBool`, `zInt`

`loadConfig` reads a YAML file then overlays env vars via an explicit `envMap` (`ENV_VAR_NAME → dot.path`). Both `apps/api` and `apps/scraper` use this pattern.

---

## packages/db

`createDb(connectionString)` returns a Drizzle client. Schema tables:

| Table                       | Purpose                                           |
| --------------------------- | ------------------------------------------------- |
| `events`                    | Scraped course events (title, startDate, endDate) |
| `locations`                 | Room names                                        |
| `teachers`                  | Teacher first/last name                           |
| `student_groups`            | Group internal names (e.g. `BUT3-A`)              |
| `student_group_memberships` | Parent/child hierarchy between groups             |
| `event_locations`           | event ↔ location junction                         |
| `event_teachers`            | event ↔ teacher junction                          |
| `event_student_groups`      | event ↔ studentGroup junction                     |
| `event_changes`             | Audit log of scraper diffs                        |
| `users`                     | Discord-authenticated users                       |
| `discord_guilds`            | Configured Discord servers                        |
| `discord_role_mappings`     | Discord role → student group mapping              |

`event_changes.change_type` enum: `added`, `removed`, `updated`, `moved`.
For `moved`, `diff` JSON contains `{ newStart: ISO, newEnd: ISO }`.

### Scraper — two-pass reconciliation

**Pass 1** — per-week, inside a transaction:
`applyWeekEvents(db, weekMonday, scraped[])` — loads existing events for the week window, diffs against scraped list, mutates the `events` table (DELETE old, INSERT new/updated). Returns `WeekDiff { added: EventSlot[], removed: EventSlot[], updated: UpdatedEventChange[] }`. Does **not** write `eventChanges`.

`EventSlot` carries `title`, `startDate`, `endDate`, and a pre-computed `relKey` (`sortedRooms|sortedTeachers|sortedGroups`), used for move matching.

A slot (`title|start|end`) can hold **several** events — the same meeting runs in
Montpellier and in Sète at the same hour — so both sides are bucketed per slot and
`matchSlot` pairs them within the bucket: identical `relKey`s pair off first
(untouched), leftovers pair greedily by shared groups, then teachers, then rooms
(`updated`), and whatever is still unpaired is a real `removed` / `added`. Keying
the scraped list on the slot alone silently dropped every event but the last one
in it.

**Pass 2** — after all weeks scraped, one batch:
`insertAllChanges(db, diffs[])` — aggregates all `WeekDiff`s across the full run, matches `removed+added` pairs by `title|relKey` to detect moves (including **cross-week** moves). Inserts all `eventChanges` in a single `db.insert`.

---

## apps/scraper

Scrapes a **Prose Consult** planning page via Playwright.

**Config** (`config.yaml` + env overrides):
| Env var | Path | Default |
|---|---|---|
| `DATABASE_URL` | `database.url` | — |
| `PROSECONSULT_URL` | `scrape.url` | — |
| `HEADLESS` | `scrape.headless` | `true` |
| `SCRAPE_INTERVAL_MS` | `scrape.intervalMs` | `1800000` (30 min) |
| `SCRAPE_TIMEOUT_MS` | `scrape.timeoutMs` | `60000` (per page action) |
| `SCRAPE_DEBUG_DIR` | `scrape.debugDir` | `./debug` (failure screenshots) |
| `SCRAPE_STRICT_GROUPS` | `scrape.strictGroups` | `false` (only accept known group names) |

Run modes: watch loop (default) or `node index.js --once`.

**DOM structure** of the Prose Consult page:

- `#Planning > div` — event wrappers; `.style.left` gives pixel X position used to infer day column
- `div.labelLegend[style*="top: 20px"]` — day header cells; `.textContent` ends with `dd/mm/yyyy`; `.style.left` values used to compute column width
- `#x-auto-26` — week navigation container; children have IDs `x-auto-N`
- `.x-btn-pressed` — currently selected week button
- `.gwt-PopupPanel` — loading spinner; navigation waits for it to detach

**Event text parsing** (`apps/scraper/src/parser/`):

```
Line 0:         title
Lines 1..N-2:   rooms / teachers / groups (middle lines)
Line N-1:       hours  (format: "8h30 - 10h30")
```

Middle lines are categorized:

- **Teacher**: matches `UPPERCASE_LAST   TitleCase_First` (3-space separator after NBSP normalization). Regex: `/^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ' \-]*   [A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ' \-]*$/`
- **Path line**: contains `/` — building hierarchy, discarded
- **Room**: lines before the first teacher that are not path lines
- **Group**: lines after the last teacher that are not path lines

The site does not always emit a path line per room. When an event has no teacher,
the boundary is the last path line, so a trailing room with no path of its own is
read as a group (this is how `Salle 007` became a student group). With
`scrape.strictGroups` enabled, only names already in `student_groups` are accepted;
an unknown name is read as a room instead, since that is what it usually is. Run
once without it to discover the real groups, purge the bogus rows, then turn it
on. It is ignored while the table is empty, so a fresh database still bootstraps.

---

## apps/api

Hono server on Bun, port 3000.

**Config** env vars: `PORT`, `DATABASE_URL`, `CORS_ORIGIN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `JWT_SECRET` (≥32 chars).

### Route table

| Method | Path                                        | Auth  | Description                                                        |
| ------ | ------------------------------------------- | ----- | ------------------------------------------------------------------ |
| GET    | `/api/health`                               | —     | Health check                                                       |
| GET    | `/api/auth/discord`                         | —     | Redirect to Discord OAuth2 (`identify guilds guilds.members.read`) |
| GET    | `/api/auth/discord/callback`                | —     | Exchange code, upsert user, issue JWT                              |
| GET    | `/api/auth/discord/my-guilds`               | user  | User's guilds + roles from stored Discord token                    |
| GET    | `/api/auth/me`                              | user  | Refresh JWT and return user DTO                                    |
| GET    | `/api/events/week`                          | —     | Events for a week (`?date=`)                                       |
| GET    | `/api/events/day`                           | —     | Events for a day (`?date=`)                                        |
| GET    | `/api/events/upcoming`                      | —     | Next N events (`?limit=`)                                          |
| GET    | `/api/events`                               | —     | Filtered events (`?from=&to=&teacherId=&roomId=&groupId=`)         |
| GET    | `/api/events/:id`                           | —     | Single event                                                       |
| GET    | `/api/calendar.ics`                         | —     | iCal feed (`?groupId=&teacherId=&roomId=&from=&to=`)               |
| GET    | `/api/teachers`                             | —     | All teachers                                                       |
| GET    | `/api/rooms`                                | —     | All rooms                                                          |
| GET    | `/api/groups`                               | —     | All groups with parent/child hierarchy                             |
| GET    | `/api/groups/:id`                           | —     | Single group with hierarchy                                        |
| GET    | `/api/groups/:id/events`                    | —     | Events for a group                                                 |
| POST   | `/api/groups/:id/parents`                   | —     | Add parent relation                                                |
| DELETE | `/api/groups/:id/parents/:parentId`         | —     | Remove parent relation                                             |
| GET    | `/api/admin/users`                          | admin | List all users                                                     |
| PATCH  | `/api/admin/users/:id`                      | admin | Update user (status, role, group, isAdmin)                         |
| GET    | `/api/admin/guilds`                         | admin | List guilds with nested role mappings                              |
| POST   | `/api/admin/guilds`                         | admin | Create guild                                                       |
| DELETE | `/api/admin/guilds/:id`                     | admin | Delete guild                                                       |
| POST   | `/api/admin/guilds/:id/mappings`            | admin | Add role→group mapping                                             |
| DELETE | `/api/admin/guilds/:id/mappings/:mappingId` | admin | Remove mapping                                                     |

### iCal feed

`GET /api/calendar.ics` returns an RFC 5545 document for calendar clients to subscribe to. Same filters as `GET /api/events` (`groupId`, `teacherId`, `roomId`, `from`, `to`); without `from` it reaches 60 days back, so the payload does not grow forever. No auth — like the rest of the event routes.

Event timestamps are Paris wall-clock stored as UTC (the scraper builds them with `Date.UTC` from what the page displays), so `lib/ical.ts` emits `DTSTART;TZID=Europe/Paris` with the UTC components and ships a `VTIMEZONE`. Emitting them as `Z` instants would shift every course by one or two hours.

**JWT**: HS256, 7-day expiry. Claims: `sub` (user UUID), `discordId`, `isAdmin`, `status`, `role`.

**Discord OAuth flow**:

1. `/api/auth/discord` → encodes optional `clientRedirectUri` in base64url `state` param
2. `/api/auth/discord/callback` → exchanges code, fetches `@me` + member roles across all configured guilds in parallel
3. If any guild role matches a `discord_role_mappings` entry → auto-approve user, assign `studentGroupId`
4. Issues JWT; redirects to `clientRedirectUri?token=...` if provided

---

## apps/web

Vue 3 + Vuetify 3 + Pinia SPA.

**Icon setup**: both `mdi` (default) and `fa` iconsets registered. Use `mdi-*` for standard icons, `fa:fab fa-*` for brand icons (e.g. Discord: `fa:fab fa-discord`).

**Route structure**:
| Path | Auth | Component |
|---|---|---|
| `/login` | — | LoginView |
| `/pending` | — | PendingView |
| `/auth/callback` | — | AuthCallbackView |
| `/` | — | HomeView |
| `/planning` | — | PlanningView |
| `/planning/compare` | — | PlanningComparisonView |
| `/teachers` | — | TeachersView |
| `/rooms` | — | RoomsView |
| `/profile` | user | ProfileView |
| `/admin/*` | admin | AdminLayout → groups / users / discord-mappings |

**Route guard logic**:

- Authenticated + approved → skip `/login`
- Pending (non-admin) → redirect to `/pending` on any non-exempt route
- `requiresAdmin` → redirect to `/` if not admin

**Stores**: `auth` (JWT decode + login/logout), `events`, `groups`, `notifications`.

**API client** (`src/lib/api.ts`): typed Hono client via `hono/client` using `AppType` exported from `apps/api`.

### Head tags and static rendering

Every page's title, description and Open Graph tags come from one table,
`src/lib/pages.ts`. `usePageSeo()` — called once, in `App.vue` — feeds it to
unhead, so the head follows the route; the views themselves carry no head code.

`pnpm build` runs **vite-ssg**, which renders each route to its own HTML file
(`dist/planning/index.html`, …) with those tags already in it, because a crawler
does not run JavaScript and would otherwise see the same tags on every URL.
nginx's `try_files $uri $uri/ /index.html` serves them before the SPA fallback.

Consequences to keep in mind:

- `main.ts` exports `createApp = ViteSSG(...)` instead of mounting: vite-ssg owns
  the app, router and head instances. `router.ts` therefore exports `routes` and
  `registerGuards` rather than a router.
- The route guard is skipped under `import.meta.env.SSR` — it answers for a
  visitor with no account, which would give every protected route the login
  page's head.
- The static render runs under jsdom (`ssgOptions.mock`), so Vuetify takes its
  browser path and needs `ResizeObserver` & co.; `main.ts` stubs them for SSR.
  Vuetify is also `ssr.noExternal`, as Node cannot import its `.css` files.
- `@unhead/vue` is pinned to the major vite-ssg depends on. Two copies mean two
  injection keys, and the tags silently never reach the rendered HTML.
- A new route needs an entry in `pages.ts`; without one it is titled
  `Study Suite` and marked `noindex`.

`robots.txt` and `sitemap.xml` are generated from the same table by
`ssgOptions.onFinished` (see `vite.config.ts`): the sitemap lists the entries
that are not `noindex`, robots disallows the ones that are. Both need the
absolute origin, which is why they are built rather than kept in `public/`.

`VITE_SITE_URL` is the absolute origin the `og:` tags, the canonical link and
the sitemap are built from — crawlers do not resolve relative URLs. A local
build takes it from the environment and falls back to the dev server.

**The image does not bake it in.** The docker build sets it to the sentinel
`__SITE_URL__`, and `docker-entrypoint.sh` (installed into nginx's
`/docker-entrypoint.d/`) substitutes the real origin from `$SITE_URL` at
container start, so one image serves any origin and a restart is enough to
change it. `dist` is kept pristine at `/usr/share/nginx/template` and copied to
`/usr/share/nginx/html` on every start — substituting in place would consume the
sentinel on the first boot and leave nothing for the second to replace. Only
text formats are rewritten; the icons and the og image are binary. This makes
the served root mutable at boot, so it cannot be a read-only mount.

nginx serves `$uri/index.html` rather than `$uri/`: matching the directory makes
it 301 to `/planning/`, away from the URL the router and the canonical tag use,
and it builds that redirect from its own scheme and host — behind a
TLS-terminating proxy it would point back at `http://`.

`public/og-image.png` (1200×630) is generated from `public/og-image.svg` with
`rsvg-convert -w 1200 -h 630 public/og-image.svg -o public/og-image.png`.

---

## Commit convention

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <description>`.
Common types: `feat`, `fix`, `chore`, `refactor`, `docs`, `build`, `ci`, `test`.

---

## Key constraints

- The web app never imports `@studysuite/db` — DB access is server-side only.
- `drizzle.config.ts` is excluded from `packages/db/tsconfig.json` (drizzle-kit bundles it itself; including it breaks `rootDir`).
- `schema/index.ts` must always have at least `export {}` to be a valid TS module.
- pnpm 11 ignores the `pnpm` field of `package.json`: `allowBuilds` (esbuild's postinstall, without which vite cannot start) and `overrides` live in `pnpm-workspace.yaml`. The version is pinned by `packageManager` and by `npm install -g pnpm@11.21.0` in
  each Dockerfile — **the two must be the same exact version**. A range (`pnpm@11`)
  drifts to whatever is latest at build time, and pnpm then honours `packageManager`
  by fetching the pinned build over the network on _every_ invocation. The migrate
  container sits on the `internal: true` `backend` network, so that fetch cannot
  resolve and blocks ~86 s before falling back to the store copy — a 1.7 s job took
  87 s. Bump both together.
- `ALTER TYPE ... ADD VALUE` (Postgres enum extension) cannot run inside a transaction — drizzle-kit handles this via migration breakpoints.
- Cross-week move detection works because `insertAllChanges` sees all weeks' diffs at once. Adding per-week change insertion would regress this.
- Never compare `new Date()` with an event timestamp — see [Time](#time-paris-wall-clock-labelled-utc). Use `wallClockNow()` from `@studysuite/shared/time`.
