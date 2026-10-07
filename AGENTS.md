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

# Tests (vitest; packages/shared and apps/api carry them)
pnpm test                         # all packages
pnpm -F @studysuite/shared test   # single package

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
apps/api          Hono HTTP server, runs under Bun
apps/scraper      Node scraper (Playwright), scrapes Prose Consult
apps/web          Vue 3 + Vuetify SPA, served by Vite
packages/db       Drizzle ORM client and schema, shared by api and scraper
packages/shared   Zod schemas, shared types, config loader. No runtime deps
packages/tsconfig Base tsconfig variants (base / node / bun)
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

## Time: the calendar is Paris's

Event timestamps are ordinary instants. Their day, week and displayed hour are
Europe/Paris ones whatever machine asks, and the `Date` getters cannot answer
that: the local ones read the process timezone (Europe/Paris on a laptop, UTC in
the api container), the UTC ones put a 00h30 course on the previous day. Use
`@studysuite/shared/time` (`parisDate`, `parisParts`, `parisDayStart`,
`parisWeekStart`, `addParisDays`, ...) and `timeZone: 'Europe/Paris'` when
formatting. Its tests, and the api's, must pass under any `TZ`.

- `v-calendar` only knows the browser's local getters. `toCalendarLocalDate`
  (`apps/web/src/lib/date.ts`) hands it a date whose local reading is the Paris
  one. That value is for the calendar alone and is no longer the instant.
- A `from` / `to` query value that names no offset (`2026-09-07`,
  `2026-09-07T08:00`) is read in Paris, not in UTC or the process timezone.
  Bare digits are an epoch, in seconds below 1e11 and milliseconds above, so
  both `unix` and `unix-ms` output can be sent back.
- `dateFormat=unix-instant` and `unix-ms-instant` are deprecated aliases of
  `unix` and `unix-ms`, kept for clients that already send them.
- eslint bans the `Date` getters, `Date.UTC` and `new Date(y, m, d)` in `.ts`
  files outside `shared/time`. `.vue` files are not linted, so the views rely
  on review.
- **An image built before migration `0017` must never run against a migrated
  database.** Until then timestamps were Paris wall-clock labelled UTC; such a
  scraper would reconcile every course as moved by an hour or two and fill
  `event_changes`. Rolling back the code means restoring the database too.

## packages/shared

Two entry points:

- `@studysuite/shared` holds Zod schemas and TypeScript types for events:
  `ParsedEvent`, `Location`, `Teacher`, `StudentGroup`
- `@studysuite/shared/config` holds the config loader: `loadConfig`, `zBool`, `zInt`

`loadConfig` reads a YAML file then overlays env vars through an explicit `envMap`
mapping `ENV_VAR_NAME` to `dot.path`. Both `apps/api` and `apps/scraper` use it.

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
| `users`                     | Accounts; identity lives in `user_identities`     |
| `user_identities`           | One row per external account a user signs in with |
| `discord_guilds`            | Configured Discord servers                        |
| `discord_role_mappings`     | Discord role → student group mapping              |
| `iut_group_mappings`        | IUT directory group → student group mapping       |
| `push_subscriptions`        | One row per browser that wants course reminders   |
| `push_reminder_sends`       | Which reminder has already gone out               |

`event_changes.change_type` enum: `added`, `removed`, `updated`, `moved`.
For `moved`, `diff` JSON contains `{ newStart: ISO, newEnd: ISO }`.

### Scraper: two-pass reconciliation

**Pass 1**, per week, inside a transaction. `applyWeekEvents(db, weekMonday, scraped[])`
loads existing events for the week window, diffs them against the scraped list, and
mutates the `events` table (DELETE old, INSERT new and updated). It returns
`WeekDiff { added: EventSlot[], removed: EventSlot[], updated: UpdatedEventChange[] }`
and writes nothing to `eventChanges`.

`EventSlot` carries `title`, `startDate`, `endDate`, and a pre-computed `relKey` (`sortedRooms|sortedTeachers|sortedGroups`), used for move matching.

A slot (`title|start|end`) can hold several events, because the same meeting runs in
Montpellier and in Sète at the same hour. Both sides are therefore bucketed per slot,
and `matchSlot` pairs them within the bucket. Identical `relKey`s pair off first and
count as untouched. Leftovers pair greedily by shared groups, then teachers, then
rooms, and count as `updated`. Whatever is still unpaired is a real `removed` or
`added`. Keying the scraped list on the slot alone silently dropped every event in it
but the last.

**Pass 2**, after every week is scraped, in one batch. `insertAllChanges(db, diffs[])`
aggregates the `WeekDiff`s from the whole run and matches `removed`+`added` pairs by
`title|relKey` to detect moves, cross-week ones included. It inserts every
`eventChanges` row in a single `db.insert`.

---

## apps/scraper

Scrapes a Prose Consult planning page with Playwright.

**Config** (`config.yaml` + env overrides):
| Env var | Path | Default |
|---|---|---|
| `DATABASE_URL` | `database.url` | none |
| `PROSECONSULT_URL` | `scrape.url` | none |
| `HEADLESS` | `scrape.headless` | `true` |
| `SCRAPE_INTERVAL_MS` | `scrape.intervalMs` | `1800000` (30 min) |
| `SCRAPE_TIMEOUT_MS` | `scrape.timeoutMs` | `60000` (per page action) |
| `SCRAPE_DEBUG_DIR` | `scrape.debugDir` | `./debug` (failure screenshots) |
| `SCRAPE_STRICT_GROUPS` | `scrape.strictGroups` | `false` (only accept known group names) |

Run modes: watch loop (default) or `node index.js --once`.

**DOM structure** of the Prose Consult page:

- `#Planning > div`: event wrappers. `.style.left` gives the pixel X position the day
  column is inferred from
- `div.labelLegend[style*="top: 20px"]`: day header cells. `.textContent` ends with
  `dd/mm/yyyy`, and the `.style.left` values give the column width
- `#x-auto-26`: week navigation container, whose children have IDs `x-auto-N`
- `.x-btn-pressed`: the currently selected week button
- `.gwt-PopupPanel`: the loading spinner, up for the whole of a week swap

**A week that has not rendered looks exactly like a week with no courses.** Both
show zero `#Planning > div`: the Christmas weeks settle that way, and so does
any week for the ~600 ms between the click and GWT appending its events. The
pressed class and the day headers flip within ~50 ms of the click, so neither is
evidence the week is on screen. `waitForWeekRender` (`browser/navigation.ts`)
therefore requires all three at once (the button pressed, the spinner gone, and
the wrapper count unchanged for 600 ms) and throws `WeekNavigationError` after
20 s rather than handing back what it found.

It has to, because `applyWeekEvents` deletes whatever the scrape did not return:
an empty extraction wipes the week, the next run puts it back, and in between a
student's day is missing from the app while `event_changes` fills with bogus
`removed` rows and cross-week `moved` pairs. `scrapeAllWeeks` skips a week that
throws instead of applying it, counts it in `failedWeeks`, and `--once` exits
non-zero if any week was skipped. A click that lands while the app is still busy
is dropped silently by the page, which is the other thing the pressed-button
check catches.

**Event text parsing** (`apps/scraper/src/parser/`):

```
Line 0:         title
Lines 1..N-2:   rooms / teachers / groups (middle lines)
Line N-1:       hours  (format: "8h30 - 10h30")
```

Middle lines are categorized:

- **Teacher**: matches `UPPERCASE_LAST   TitleCase_First`, a 3-space separator after
  NBSP normalization. Regex:
  `/^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ' \-]*   [A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ' \-]*$/`
- **Path line**: contains `/`. Building hierarchy, discarded
- **Room**: lines before the first teacher that are not path lines
- **Group**: lines after the last teacher that are not path lines

The site does not always emit a path line per room. When an event has no teacher, the
boundary is the last path line, so a trailing room with no path of its own reads as a
group. That is how `Salle 007` became a student group. With `scrape.strictGroups`
enabled, only names already in `student_groups` are accepted, and an unknown name
reads as a room instead, since that is what it usually is. Run once without it to
discover the real groups, purge the bogus rows, then turn it on. It is ignored while
the table is empty, so a fresh database still bootstraps.

---

## apps/api

Hono server on Bun, port 3000.

**Config** env vars: `PORT`, `DATABASE_URL`, `CORS_ORIGIN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `JWT_SECRET` (≥32 chars). The `iut` block (`IUT_DISPLAY_NAME`, `IUT_ISSUER_URL`, `IUT_CLIENT_ID`, `IUT_CLIENT_SECRET`, `IUT_REDIRECT_URI`) is optional. Leave it out and the api boots with the IUT routes answering 503. The `push` block (`PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_VAPID_SUBJECT`) is optional the same way, and so is the `bot` block (`BOT_API_KEYS`, comma-separated). See [Discord bot access](#discord-bot-access).

### Route table

| Method | Path                                        | Auth  | Description                                                          |
| ------ | ------------------------------------------- | ----- | -------------------------------------------------------------------- |
| GET    | `/api/health`                               | none  | Health check                                                         |
| GET    | `/api/config`                               | none  | Login providers, their labels, and the push public key               |
| GET    | `/api/auth/discord`                         | none  | Redirect to Discord OAuth2 (`identify guilds guilds.members.read`)   |
| GET    | `/api/auth/discord/callback`                | none  | Exchange code, upsert user, issue JWT                                |
| GET    | `/api/auth/discord/my-guilds`               | user  | User's guilds + roles from stored Discord token                      |
| GET    | `/api/auth/iut`                             | none  | Redirect to the IUT bridge (PKCE); `?token=` links instead           |
| GET    | `/api/auth/iut/callback`                    | none  | Verify the ID token, upsert or link the identity, issue JWT          |
| GET    | `/api/auth/me`                              | user  | Refresh JWT and return user DTO                                      |
| GET    | `/api/events/week`                          | none  | Events for a week (`?date=`)                                         |
| GET    | `/api/events/day`                           | none  | Events for a day (`?date=`)                                          |
| GET    | `/api/events/upcoming`                      | none  | Next N events (`?limit=`)                                            |
| GET    | `/api/events`                               | none  | Filtered events (`?from=&to=&teacherId=&roomId=&groupId=`)           |
| GET    | `/api/events/:id`                           | none  | Single event                                                         |
| GET    | `/api/calendar.ics`                         | none  | iCal feed (`?groupId=&teacherId=&roomId=&from=&to=`)                 |
| PUT    | `/api/push/subscriptions`                   | opt.  | Register this browser for course reminders                           |
| GET    | `/api/push/subscriptions`                   | opt.  | Read back what a browser is registered for (`?endpoint=`)            |
| DELETE | `/api/push/subscriptions`                   | opt.  | Unregister a browser (`?endpoint=`)                                  |
| POST   | `/api/push/test`                            | opt.  | Push a notification to a browser now (`?endpoint=`)                  |
| GET    | `/api/bot/guilds/:discordGuildId/mappings`  | bot   | A server's Discord role → student group mappings                     |
| GET    | `/api/bot/assignments`                      | bot   | Homework of some groups and their ancestors (`?groupIds=&from=&to=`) |
| GET    | `/api/teachers`                             | none  | All teachers                                                         |
| GET    | `/api/rooms`                                | none  | All rooms                                                            |
| GET    | `/api/groups`                               | none  | All groups with parent/child hierarchy                               |
| GET    | `/api/groups/:id`                           | none  | Single group with hierarchy                                          |
| GET    | `/api/groups/:id/events`                    | none  | Events for a group                                                   |
| POST   | `/api/groups/:id/parents`                   | none  | Add parent relation                                                  |
| DELETE | `/api/groups/:id/parents/:parentId`         | none  | Remove parent relation                                               |
| GET    | `/api/admin/users`                          | admin | List all users                                                       |
| PATCH  | `/api/admin/users/:id`                      | admin | Update user (status, role, group, isAdmin)                           |
| GET    | `/api/admin/guilds`                         | admin | List guilds with nested role mappings                                |
| POST   | `/api/admin/guilds`                         | admin | Create guild                                                         |
| DELETE | `/api/admin/guilds/:id`                     | admin | Delete guild                                                         |
| POST   | `/api/admin/guilds/:id/mappings`            | admin | Add role→group mapping                                               |
| DELETE | `/api/admin/guilds/:id/mappings/:mappingId` | admin | Remove mapping                                                       |
| GET    | `/api/admin/iut-mappings`                   | admin | List IUT directory group mappings                                    |
| POST   | `/api/admin/iut-mappings`                   | admin | Map an IUT group to a role and a class                               |
| DELETE | `/api/admin/iut-mappings/:id`               | admin | Remove an IUT group mapping                                          |

### iCal feed

`GET /api/calendar.ics` returns an RFC 5545 document for calendar clients to subscribe to. Same filters as `GET /api/events` (`groupId`, `teacherId`, `roomId`, `from`, `to`); without `from` it reaches 60 days back, so the payload does not grow forever. No auth, like the rest of the event routes.

`lib/ical.ts` emits `DTSTART;TZID=Europe/Paris` and ships a `VTIMEZONE`, rather than `Z` instants, so a calendar client keeps a course at its Paris hour.

### Group filters include ancestors

A course is tagged with the widest group it is for: a promo-wide lecture carries
the promo, a semester meeting the semester, never each TD group underneath. A
filter on one TD group alone therefore misses them, and `Q3`'s feed had no
"Réunion d'information" addressed to `A2-Semestre-3`.

So every route that filters by group also matches the group's ancestors, at any
depth, unless told `includeAncestorGroups=false`: `/api/events` (`groupId`),
`/api/events/upcoming` and `/api/events/changes` (`groupIds`),
`/api/calendar.ics` (`groupId`), `/api/groups/:id/events` and
`/api/bot/assignments`. `expandGroupIds()` (`lib/group-ancestors.ts`) does it;
the walk itself lives in `lib/ancestor-walk.ts`, free of the database so it can
be tested. The param is an enum of `true`/`false`/`1`/`0` rather than
`z.coerce.boolean()`, which reads the string `"false"` as true.

On is the default because the exact group is almost never what a caller wants,
and one iCal subscription should be a student's whole timetable. The web app
still sends the ancestors itself (`groups.withAncestors`), which is now
redundant and harmless. `GET /api/assignments` is not concerned: its groups are
an access check, not a filter. Nor is `PUT /api/push/subscriptions`, whose
`groupIds` are stored as sent.

### Hidden courses

A student can hide a course they do not attend. The list is per browser
(`stores/hidden-courses.ts`, localStorage), by exact title, and the api does
the filtering: `/api/events`, `/week`, `/day`, `/upcoming` and
`/api/calendar.ics` take a repeated `excludeTitle` param. Repeated rather than
comma-separated because a title may hold a comma. On `/upcoming` it applies
before the limit, which is why it is not done client-side.

The web app only sends it for the student's own planning. A teacher's
timetable, a room, or a class looked up with `?group=` is shown whole. Push
reminders are sent server-side, so the subscription carries its own copy
(`push_subscriptions.excluded_titles`), re-synced whenever the list changes.

### Course reminders: Web Push

A student who opts in gets a notification a configurable number of minutes
before each of their courses, whether or not the app is open.

**Why it needs a server at all.** The browser has no way to schedule a
notification for later on its own: Notification Triggers (`showTrigger`) was an
origin trial that Chrome removed, and Periodic Background Sync fires when the
browser feels like it, roughly twice a day, never at a time you ask for. Push is
the only mechanism that hits T-15 minutes with the tab closed, and push needs
something to do the sending.

`web-push` does the two parts worth not hand-rolling: the RFC 8292 VAPID header
(an ES256 JWT per push service origin) and the RFC 8291 payload encryption
(aes128gcm, keyed by the subscription's own P-256 key). The payload is opaque to
Google, Apple and Mozilla. They route a blob they cannot read. It runs fine under
Bun.

**Where the sender lives.** `lib/reminder-tick.ts`, on a 60-second
`setInterval` started from `index.ts`. In the api rather than a service of its
own because it needs exactly what the api already has: the database, and a route
off the host. The `frontend` network is deliberately not `internal`, which is
what lets the Discord and IUT token exchanges work.

Three things about it are not obvious:

- **The tick claims before it sends.** `push_reminder_sends` has a unique
  `(subscription_id, event_id)`, and the tick inserts with
  `ON CONFLICT DO NOTHING ... RETURNING`, pushing only the rows it actually
  created. That is what makes it idempotent: an api restart mid-minute, or a
  second replica, claims nothing and sends nothing. Without it, "notify once"
  would depend on the process never being interrupted.
- **The window is one-sided.** A course is due when `start - lead <= now < start`.
  Never early, and still true if a tick was missed, so a restart or a slow query
  delays a reminder instead of losing it. The claim table is what makes that safe
  to repeat.

`lib/reminder-match.ts` holds the matching free of the database and the config
so it can be tested.

**Configuration.** Optional, like `iut`: with no keypair the routes answer 503,
the ticker never starts, and `GET /api/config` reports `push.enabled: false` so
the web app hides the toggle entirely. Generate one with
`pnpm -F @studysuite/api exec web-push generate-vapid-keys`. The pair is an
identity, not a rotating secret. Every subscription is bound to the public key it
was created with, so replacing it silently stops delivery to everyone already
subscribed. The block is `.nullish()` rather than `.optional()` because a
`config.yaml` copied from the example has `push:` present with every key
commented out, and YAML parses that as null.

**No account required.** `push_subscriptions.user_id` is nullable. The event
routes are public and `/profile` already serves visitors who picked their groups
locally, so reminders would otherwise be the one feature that demands an
account. A subscription belongs to a _browser_, not a user: a phone and a laptop
are two rows, and `POST`ing with a token merely links one to the account so it
dies with it.

**JWT**: HS256, 7-day expiry. Claims: `sub` (user UUID), `isAdmin`, `status`, `role`. `requireAuth` re-reads `status` and `isAdmin` from the database on every request, so a rejection takes effect before the token expires.

**Discord OAuth flow**:

1. `/api/auth/discord` → encodes optional `clientRedirectUri` in base64url `state` param
2. `/api/auth/discord/callback` → exchanges code, fetches `@me` + member roles across all configured guilds in parallel
3. If any guild role matches a `discord_role_mappings` entry → auto-approve user, assign `studentGroupId`
4. Issues JWT; redirects to `clientRedirectUri?token=...` if provided

### Discord bot access

A Discord bot (EliteBatKBot) reads and writes on its members' behalf with no
JWT. It sends `Authorization: Bot <key>`, where the key is one of
`bot.apiKeys`, in two ways:

- **As a member**, on the ordinary user routes, adding
  `X-Acting-Discord-User: <snowflake>`. `requireAuth` resolves the snowflake
  through `user_identities` (`provider = 'discord'`) and runs the request as
  that account: its group, its status, its `completedByMe`, and `createdBy`
  on what it creates. A snowflake that no account is linked to gets
  **`403 NOT_LINKED`**, so the bot can tell the member to sign in once on the
  site. Nothing else changes for the routes themselves.
- **As itself**, on `/api/bot/*` (`requireBot`), for what serves a whole
  channel rather than one member: a server's role mappings, and a class's
  homework for reminders.

Things that are not obvious:

- **An acting request is never admin**, even when the account is: the payload
  is built with `isAdmin: false`. The bot has no admin routes of its own, and a
  leaked key must not reach `/api/admin` through whichever admin it names.
- **Every key is a skeleton key** for all accounts with a linked Discord
  identity. There are several so each bot, or each rotation, has its own and
  can be revoked alone by removing it. `matchesBotKey` hashes before
  `timingSafeEqual` and checks every key rather than stopping at the first
  match, so the timing leaks neither a key's length nor which one matched.
- **`optionalAuth` ignores `Bot`**: the push routes stay browser-only.
- **The change feed cursor.** `GET /api/events/changes?since=` returns the
  changes detected strictly after an instant, oldest first, for a poller to
  advance to the last `detectedAt` it handled. The comparison truncates
  `detected_at` to milliseconds: Postgres stores microseconds and the DTO
  carries milliseconds, so a raw `>` returns the cursor's own row forever.
  One scraper run shares a single `detected_at`, so a run larger than `limit`
  is cut short. Pollers should keep `groupIds` narrow.

---

## Identity: two providers, one account

`users` used to be the Discord identity itself, with `discord_id NOT NULL UNIQUE`,
which left no room for a second provider. `user_identities` holds one row per external
account instead, unique on `(provider, subject)`; `users` keeps only status, role
and admin flag. The `users.discord_*` columns are still written on every Discord
login so a rollback works, and migration `0013` backfilled an identity row for
every existing user. **Drop those columns in a separate change once that has
settled.** Nothing reads them any more except the transitional lookup in the
Discord callback.

The display name is no longer a column. `pickDisplay()` (`lib/identity-display.ts`)
picks the Discord name first, then the IUT one, and the DTO hands out
`displayName` / `avatarUrl` / `identities` where it used to hand out
`discordUsername` / `discordAvatar` / `discordId`.

### IUT: the department's LDAP/OIDC bridge

Authorization Code + PKCE against a bridge a classmate runs on `webinfo`, which
fronts the department's LDAP directory. `/api/auth/iut` → `/api/auth/iut/callback`,
mirroring the Discord pair, with `groups` claims matched against
`iut_group_mappings` for auto-approval.

Three things about it are not obvious:

- **`sub` is the raw LDAP DN** (`uid=lubenb,ou=Ann3,...`), so it carries the year
  and changes at every rollover. Keying accounts on it would orphan most of them
  each September. `iutSubject()` keys on `preferred_username` instead and parks
  the DN in `provider_sub_raw` for diagnostics. Swap it back only if the bridge
  ever emits a genuinely stable `sub`.
- **PKCE is not stateless.** Discord's `state` is a plain base64 blob, but the
  code verifier must never reach the browser's URL, so it rides in a signed
  HttpOnly `SameSite=Lax` cookie (`iut_oidc`, 10 min) along with the nonce, the
  state and the client redirect. Lax is enough: the bridge returns the user with
  a top-level GET.
- **Its TLS chain does not validate.** The server sends the wrong intermediate
  for its leaf, so `curl`, Node and Bun all fail with
  `unable to get local issuer certificate`. `apps/api/certs/` carries the
  intermediate the leaf's AIA extension points at, and the Dockerfile sets
  `NODE_EXTRA_CA_CERTS`. Never reach for `NODE_TLS_REJECT_UNAUTHORIZED=0`. It
  disables verification process-wide, Discord and Postgres included.

The directory carries the population and the year (`etudiants`, `ann3`) but not
the TD group, so a mapping's class is an anchor: the student narrows it down
through `PATCH /api/auth/me/student-group`, the same path a Discord role already
takes. The access token is discarded: 900 s, no refresh, and userinfo returns
nothing the ID token does not.

**Naming it.** `iut` is an internal identifier, used for the provider enum, the
table and the routes, and it stays that way. What a user sees comes from
`iut.displayName` (default `IUT`) via `GET /api/config`, which lists the
providers this deployment actually has. The login page renders one button per
entry, so an instance with no `iut` block shows no button rather than one that
answers 503, and another department sets its own name without rebuilding the
image. `stores/providers.ts` seeds the defaults the static build bakes into
`login/index.html`, which cannot fetch, and replaces them on hydration.

**Linking.** A Discord account and an IUT account are two accounts unless the
user links them, and there is no email to match on (the Discord flow only asks
for `identify`). `/api/auth/iut?token=<app jwt>` attaches the identity to the
session that started the flow instead of creating a user, and the profile page
exposes it. The token travels in the query because a redirect cannot carry an
Authorization header, which is the same reason it comes back that way.

---

## apps/web

Vue 3 + Vuetify 3 + Pinia SPA.

**Icon setup**: both `mdi` (default) and `fa` iconsets registered. Use `mdi-*` for standard icons, `fa:fab fa-*` for brand icons (e.g. Discord: `fa:fab fa-discord`).

**Route structure**:
| Path | Auth | Component |
|---|---|---|
| `/login` | none | LoginView |
| `/pending` | none | PendingView |
| `/auth/callback` | none | AuthCallbackView |
| `/` | none | HomeView |
| `/planning` | none | PlanningView |
| `/planning/compare` | none | PlanningComparisonView |
| `/teachers` | none | TeachersView |
| `/rooms` | none | RoomsView |
| `/profile` | user | ProfileView |
| `/admin/*` | admin | AdminLayout → groups / users / discord-mappings / iut-mappings / changes |

**Route guard logic**:

- Authenticated + approved → skip `/login`
- Pending (non-admin) → redirect to `/pending` on any non-exempt route
- `requiresAdmin` → redirect to `/` if not admin

**Stores**: `auth` (JWT decode + login/logout), `events`, `groups`, `notifications`
(the Vuetify snackbars, not push), `providers`, `reminders`.

**API client** (`src/lib/api.ts`): typed Hono client via `hono/client` using `AppType` exported from `apps/api`.

### The push service worker

`public/sw.js` handles `push` and `notificationclick`, and nothing else. It is
**not** a caching worker and must not become one: nginx substitutes the real
origin into a fresh copy of `dist` at every container start (see below), and a
Workbox-style precache would keep serving the previous one. It registers no
`fetch` handler at all, which is the cheapest way to guarantee that.

It lives in `public/`, so it is copied verbatim and never bundled. That makes it
plain JS, unable to import from `src/`. eslint needs the `self` global declared
for it explicitly (`eslint.config.js`), since typescript-eslint's blanket
`no-undef` suppression only covers TS files.

`lib/push.ts` owns the browser side: registration, `pushManager.subscribe`, and
keeping the api's row in step. Two things it has to get right. A real click has to
drive the permission prompt, or every browser drops it. And `applicationServerKey`
gets the decoded 65 bytes rather than the base64url string, which browsers accept
less uniformly than the spec suggests.

`stores/reminders.ts` drives the settings card on `/profile`. The subscription
belongs to the browser, so the toggle is per-install, and `App.vue` re-syncs the
group ids whenever they change. A student moved to another class would otherwise
keep being reminded of their old timetable.

**The card has three states, and `/profile` gates its whole `v-col` on
`reminders.shown`:**

- `visible`: the working toggle. Everywhere push works in an ordinary tab.
- `installPrompt`: the feature pitched, with no toggle and the steps to add the
  app to the home screen. iOS only, and it is why the iOS case is not simply
  hidden. Safari grants push to a standalone PWA alone, so a plain tab has no
  `PushManager` at all, and hiding the card there would tell an iPhone student
  the app has no reminders when they are one "Sur l'écran d'accueil" away.
  Nowhere else needs installing, so nowhere else sees this.
- neither: nothing rendered, because nothing on that screen would help. That is a
  browser without push, or a deployment with no keypair.

What the student can act on stays inside the card: a permission blocked in site
settings, and no group picked.

`needsInstall` is set in `init()` **before** the `!supported` early return. On iOS
`supported` is false, so setting it after would leave the prompt dead. Both flags
start false and settle after mount, so the static render and the first client
frame agree. The card is client-only by construction, which is fine on a
`noindex` page.

### Head tags and static rendering

Every page's title, description and Open Graph tags come from one table,
`src/lib/pages.ts`. `usePageSeo()`, called once in `App.vue`, feeds it to unhead,
so the head follows the route. The views themselves carry no head code.

`pnpm build` runs vite-ssg, which renders each route to its own HTML file
(`dist/planning/index.html` and so on) with those tags already in it. A crawler
does not run JavaScript and would otherwise see the same tags on every URL.
nginx's `try_files $uri $uri/ /index.html` serves them before the SPA fallback.

Consequences to keep in mind:

- `main.ts` exports `createApp = ViteSSG(...)` instead of mounting: vite-ssg owns
  the app, router and head instances. `router.ts` therefore exports `routes` and
  `registerGuards` rather than a router.
- The route guard is skipped under `import.meta.env.SSR`. It answers for a
  visitor with no account, which would give every protected route the login
  page's head.
- The static render runs under jsdom (`ssgOptions.mock`), so Vuetify takes its
  browser path and needs `ResizeObserver` and friends. `main.ts` stubs them for SSR.
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
the sitemap are built from, because crawlers do not resolve relative URLs. A
local build takes it from the environment and falls back to the dev server.

**The image does not bake it in.** The docker build sets it to the sentinel
`__SITE_URL__`, and `docker-entrypoint.sh` (installed into nginx's
`/docker-entrypoint.d/`) substitutes the real origin from `$SITE_URL` at
container start, so one image serves any origin and a restart is enough to
change it. `dist` is kept pristine at `/usr/share/nginx/template` and copied to
`/usr/share/nginx/html` on every start. Substituting in place would consume the
sentinel on the first boot and leave nothing for the second to replace. Only text
formats are rewritten, since the icons and the og image are binary. The served
root is therefore mutable at boot and cannot be a read-only mount.

nginx serves `$uri/index.html` rather than `$uri/`: matching the directory makes
it 301 to `/planning/`, away from the URL the router and the canonical tag use,
and it builds that redirect from its own scheme and host. Behind a
TLS-terminating proxy it would point back at `http://`.

`public/og-image.png` (1200×630) is generated from `public/og-image.svg` with
`rsvg-convert -w 1200 -h 630 public/og-image.svg -o public/og-image.png`.

---

## Deploying

`.github/workflows/build.yaml` builds the five images on every push to `main`
(`:latest`) and `staging` (`:staging`), each labelled with its commit
(`org.opencontainers.image.revision`), which is how to tell what a host runs.

**Staging deploys itself.** After a push to `staging` builds, the
`deploy-staging` job opens an SSH connection to the host and the preview stack
pulls and restarts. **Production does not**: someone runs
`docker compose pull && docker compose stop api scraper scraper-ade && docker compose up -d`
in its directory.

The `stop` is not optional, and `deploy/staging.sh` does the same. `up -d` alone
leaves the old api and scrapers running until `migrate` has finished, and an old
scraper reconciling against data newer than itself rewrites every event, which
also nulls every homework's link to its course.

The job's key is a dedicated one whose line in root's `authorized_keys` carries
a forced command, `deploy/staging.sh` (installed on the host as
`stacks/study_staging/deploy.sh`). The host runs that script whatever the
client asks for, and the script reads nothing from the connection. That is the
whole security model: the key is root's, on the host production shares, and it
can do exactly one thing. Do not make the script take a tag, a branch or a
compose file from the caller. The consequence is that `compose.staging.yml` and
the script itself are not synced by a deploy and are copied over by hand.

Secrets, on the repository: `STAGING_DEPLOY_SSH_KEY`, `_HOST`, `_PORT`, `_USER`
and `_KNOWN_HOSTS` (the host's pinned public key, one `known_hosts` line).
Without the key the job warns and passes, so a fork still builds.

A token pushing over HTTPS needs the `workflow` scope to change that file.
Pushing over SSH does not.

---

## Commit convention

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <description>`.
Common types: `feat`, `fix`, `chore`, `refactor`, `docs`, `build`, `ci`, `test`.

---

## Key constraints

- **The app is in production and the database holds real data.** Migrations must be
  additive and backward compatible: a new column is nullable or carries a `DEFAULT`,
  and a `DROP`/`RENAME` needs a backfill plan. A change to what identifies an event
  (its title, the timestamp format) makes the next reconcile emit a wave of bogus
  `removed`+`added` rows into `event_changes`, which users now see on
  `/planning/changes`. Say so before making one.
- The web app never imports `@studysuite/db`. DB access is server-side only.
- `drizzle.config.ts` is excluded from `packages/db/tsconfig.json` (drizzle-kit bundles it itself; including it breaks `rootDir`).
- `schema/index.ts` must always have at least `export {}` to be a valid TS module.
- pnpm 11 ignores the `pnpm` field of `package.json`: `allowBuilds` (esbuild's postinstall, without which vite cannot start) and `overrides` live in `pnpm-workspace.yaml`. The version is pinned by `packageManager` and by `npm install -g pnpm@11.21.0` in
  each Dockerfile. **The two must be the same exact version.** A range (`pnpm@11`)
  drifts to whatever is latest at build time, and pnpm then honours `packageManager`
  by fetching the pinned build over the network on every invocation. The migrate
  container sits on the `internal: true` `backend` network, so that fetch cannot
  resolve and blocks ~86 s before falling back to the store copy. A 1.7 s job took
  87 s. Bump both together.
- `ALTER TYPE ... ADD VALUE` (Postgres enum extension) cannot run inside a
  transaction. drizzle-kit handles this with migration breakpoints.
- **A migration is the `.sql` file, its snapshot and its entry in
  `migrations/meta/_journal.json`.** `drizzle-kit migrate` reads the journal, not
  the directory: a migration missing from it is silently skipped, the run exits 0,
  and the only symptom is a column that never appears. Check the journal's last
  entry after generating, and never `git checkout --` that file to undo unrelated
  churn, because it takes the new entry with it.
  `pnpm -F @studysuite/db exec drizzle-kit check` verifies the chain.
- `pnpm format` reformats the whole repo, which is not prettier-clean. It rewrites
  files no one touched, `pnpm-lock.yaml` and the drizzle snapshots included. Run
  `pnpm exec prettier --write <the files you changed>` instead. Reverting the
  collateral afterwards is what loses generated content.
- Cross-week move detection works because `insertAllChanges` sees all weeks' diffs at once. Adding per-week change insertion would regress this.
- The push service worker must stay cache-free. See
  [The push service worker](#the-push-service-worker). Adding Workbox precaching
  would serve the pre-substitution `__SITE_URL__` build.
- Never read an event timestamp's day or hour with the `Date` getters. See
  [Time](#time-the-calendar-is-pariss).
