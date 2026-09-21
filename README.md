# TLM Frontend (Vanilla)

deploy with 
`npx wrangler login`
`npx wrangler deploy`

Static, no-build-step browser client for the **Tennis League Manager (TLM)** system. Plain HTML, CSS, and JavaScript — no framework, no bundler, no `npm install`. Each page is a `<page>/index.html` plus a single per-page boot script under `js/`, sharing a common `js/i18n.js` registry, `js/i18n/*.js` locale dictionaries, `js/config.js`, `js/site-header.js`, and `js/user-facing-errors.js`. Complex pages may also load ordered no-boot support modules from `js/<page>/*.js` before the boot script.

**Live service:** [https://tlmb.swjapps.com](https://tlmb.swjapps.com)

## Related Projects

| Project | Role |
|---|---|
| **[TLMB_backend_main](https://github.com/swjeong0825/TLMB_backend_main)** | Domain logic, PostgreSQL persistence, and REST API. Called directly from the browser for league creation, league lookup, match history, and confirmed write submissions. |
| **[TLMB_chat_to_intent](https://github.com/swjeong0825/TLMB_chat_to_intent)** | Legacy LLM-powered intermediary. Current league buttons use Backend Main or local frontend actions. |
| **[ai-agent-guidelines](https://github.com/swjeong0825/ai-agent-guidelines)** | AI agent coding guidelines used during development. |

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       Frontend (this repo)                       │
│                                                                  │
│   /create-league/          ──► TLM Backend Main  (POST /leagues) │
│   /find-league/            ──► TLM Backend Main  (GET  /leagues) │
│   /find-league-prefix/     ──► TLM Backend Main  (GET  /leagues) │
│                                                                  │
│   /league?league_id=...    ──► TLM Backend Main                 │
│   /demo                    ──► TLM Backend Main                 │
│   /league/plan/            ──► Local drafts + Backend Main       │
│   Match history controls   ──► TLM Backend Main  (GET /matches)  │
│                                                                  │
│   Confirmed write forms    ──► TLM Backend Main                  │
│   (built from intent       (POST/PATCH/DELETE; X-Host-Token       │
│    response)                attached client-side for admin ops)   │
└──────────────────────────────────────────────────────────────────┘
```

The league page is driven by buttons. The header shortcuts, starter tiles, and persistent bottom actions share the same handlers. Record Match, Standings, and Match History replace the chat composer. Selecting an action clears the previous panel; only assistant forms, results, and feedback are shown. Match forms retain nickname autocomplete and submit directly to TLM Backend Main through `js/chat/write-actions.js`.

“Show Match History” loads directly from Backend Main. The format and player filters call `GET /leagues/{id}/matches` or `GET /leagues/{id}/matches/by-player` with the selected `scope` and optional `player_name`. Standings and player controls also use Backend Main directly. Plan Match replaces the former command-help shortcut; there is no free-form message input.

## Pages

| Path | Purpose | Talks to |
|---|---|---|
| `/` | Landing page with links to the other pages. | — |
| `/create-league/` | Form to create a new league; returns the secret `host_token` and shareable player/admin URLs. | TLM Backend Main |
| `/find-league/` | Search leagues by title prefix and open the league page for a result. | TLM Backend Main |
| `/find-league-prefix/?prefix=...` | URL-driven variant of `find-league` that auto-runs the search from the `prefix` query param. | TLM Backend Main |
| `/league?league_id={id}[&host_token={token}]` | Button-driven league UI. Player mode without `host_token`; admin mode with it. | Backend Main |
| `/league/plan/?league_id={id}` | Local singles/doubles plans, editing/removal, and batch upload. | Backend Main roster and planned-matches API |
| `/demo` | Same league UI as `/league`, hard-coded to a sample league so visitors can try it without creating one. | Backend Main |

### Theming and locale

- Locale: `en` (default) and `ko`. Picker lives in the shared site header. Persisted in `localStorage` under `tlchat-locale`; can be forced with `?lang=en|ko`.
- Theme: light / dark. Persisted in `localStorage` under `tlchat-theme`; defaults to the system `prefers-color-scheme` on first visit.

### Custom standings formulas

Player and pair standings include a **Stats formula** section, collapsed by default. Click its heading to expand the formula box. Use `{W}`, `{Won}`, `{L}`, `{D}`, `{Played}`, `{GamesWon}`, `{GamesLost}`, `{MatchDiff}`, and `{GamesDiff}` with numeric constants, `+`, `-`, `*`, `/`, and parentheses. Whitespace and letter case are ignored. For example:

```text
({GamesWon} - {GamesLost}) / {Played} + 3 * {W}
```

**Apply Formula** calculates a **User Metric** column locally and ranks higher values first. Equal values share ranks (1, 2, 2, 4), retaining backend order within ties. Invalid formulas leave the previous ranking intact. **Reset** restores the current backend ranking without a request. The formula survives action navigation and date/format changes until page reload; it is neither stored nor sent to the API. If new stats make the formula invalid, the table temporarily uses backend ranking and shows the formula error until valid data or a new formula is available.

`Win %` remains visible but cannot be used in formulas. The pure parser/evaluator and page-lifetime state live in `js/chat/standings-formula.js`, which is loaded before the standings renderer on both league and demo pages.

Run formula, ranking, state, and rendering tests with:

```bash
node --test tests/standings-formula.test.js
```

### Planned matches

**Plan Match** in the header and starter tiles opens `/league/plan/` in the same tab,
preserving the league, language, host token, and API overrides. Select singles or
doubles, enter names, and **Save** to add a temporary draft. Drafts can be edited or removed. There are
no score, date, time, or court fields on the planning page.

Drafts exist only in the current page's memory. Reloading, navigating away, or changing
language discards drafts and unfinished edits. Returning through browser history starts
fresh. Legacy storage for the current league/backend is cleared on a best-effort basis;
unavailable browser storage does not block planning. Theme/language settings are retained.
Each record contains only `{id, value}`: singles use `Alice Bob`, doubles use
`Alice,Bob Charlie,Diana`. IDs stay stable through editing. Tokens are not stored.
`js/plan/model.js` handles strict parsing/serialization, `storage.js` holds temporary
drafts, `controller.js` coordinates server state, and `js/plan.js` controls the page.

Unknown players are allowed. Closed-roster leagues show a warning that recording
will fail unless those players are registered first. Alias matching follows the
existing roster rules. **Upload matches** sends one batch to Backend Main's
`POST /leagues/{league_id}/planned-matches`, without a host token or cookies.
The adapter in `js/plan/api.js` confirms the returned IDs and values before reporting
success. Requests time out after 30 seconds. Review saved plans and match history
before retrying uncertain uploads: an upload can recreate a consumed UUID. The button remains disabled while a request is running.
Confirmed uploads move from **Drafts** to **Saved plans**. Only unchanged submitted
ID/value pairs leave Drafts; new or edited drafts remain for another upload. Failed or
uncertain uploads keep drafts until the page is left. Saved plans load automatically
and offer Refresh and Edit. **Edit** opens an inline form beneath the selected draft
or saved matchup; the separate creation form and its entered names stay unchanged.
Clicking outside the editor, pressing Escape, or choosing Cancel dismisses unsaved
edits without sending a request. Saved **Save changes** uses a single-item batch upsert,
retaining the ID. Confirmed saves close the editor; failed saves keep its values while
it is open. Dismissing an editor during a submitted save does not cancel that request.
Refresh failures preserve the displayed list; malformed entries produce a warning.

Saved **Delete** calls Backend Main's public
`DELETE /leagues/{league_id}/planned-matches/{planned_match_id}` with no body or host
token. An empty **204** removes that saved card and refreshes the list, preserving
local drafts. A missing-plan response refreshes the list without claiming deletion
succeeded. Failed requests keep the row; uncertain responses refresh before another
write is allowed. If that refresh fails, use **Refresh** to reconcile before retrying.
Deletion never records or removes a match result. The
[saved-plan CRUD contract](docs/planned-match-crud-api-request.md) documents the
implemented endpoint and its acceptance tests.
The original [backend API request](docs/planned-matches-api-request.md) specifies
minimal batch upsert/read support and the backend acceptance tests.

**Record Match** first asks **Scheduled Match?**, with **Yes** for a planned match
and **No** for manual entry.
The planned path loads the shared list directly from Backend Main's
`GET /leagues/{league_id}/planned-matches`. It shows fixed singles/doubles participants
and two score selectors per plan, without editing controls. Refresh retains entered
scores for unchanged plans; unreadable entries are skipped with a warning. Scores
remain only in the league page session and are not persisted.

Planned **Record result** sends the saved `planned_match_id`, fixed participants, and
string scores to the existing singles/doubles result endpoint. The backend records
and removes the plan in one transaction. Confirmed results keep their card in place
with plain-text scores and a disabled **Recorded** button, then refresh plans, history,
roster state, and visible standings.
Completed cards remain through list refreshes and action navigation for the current
page session; leaving or reloading the page clears them. The server still consumes
the plan atomically. Rejections retain applicable scores;
uncertain results require refreshed plans/history before an explicit retry. No result
POST is retried automatically, and there is no follow-up DELETE or re-upload.

`js/plan/record.js` validates the response and first checks the configured backend's
`/openapi.json` for support, preventing older deployments from recording a manual
result while ignoring the plan ID. An unavailable/outdated schema prevents submission.
`record-session.js` keeps requests/drafts consistent across action navigation and ignores
stale responses. See the [implemented recording contract](docs/record-planned-match-api-request.md)
for deployment prerequisites and recovery behavior. The manual path retains existing
recording behavior. Saved-plan deletion uses its independent DELETE endpoint.

`js/nicknames.js` validates all newly submitted nicknames and aliases. Surrounding
whitespace is trimmed, then empty names, internal whitespace, and commas are rejected.
Bulk registration still accepts comma/newline-separated names. Existing names remain
readable and can be identified for renaming; no automatic migration is performed.

Run all frontend tests with `node --test tests/*.test.js`.

## Configuration

Backend URLs are set in [`js/config.js`](js/config.js):

```js
const CHAT_API_BASE_URL    = "https://tlmbchattointent-production.up.railway.app";
const BACKEND_MAIN_BASE_URL = "https://tlmbbackendmain-production.up.railway.app";
```

Both can be overridden per-request via query string — useful for pointing a deployed page at a local backend:

| Query param | Overrides | Example |
|---|---|---|
| `?chatApi=...`    | `chatApiBaseUrl` (Chat-to-Intent Server)     | `?chatApi=http://127.0.0.1:8000` |
| `?backendApi=...` | `backendMainBaseUrl` (TLM Backend Main)      | `?backendApi=http://127.0.0.1:8001` |

Both must be absolute origins (include `https://` or `http://`). The values are read into `window.TLCHAT_CONFIG` by `js/config.js`.

## Setup

**Prerequisites:** Node.js (only to get a static file server such as `npx serve`). No `npm install` is required — there are no dependencies to install.

```bash
# 1. Clone and enter the project
git clone https://github.com/swjeong0825/TLMB_frontend_v0.git
cd TLMB_frontend_v0

# 2. (Optional) Edit js/config.js if you want different backend URLs as defaults

# 3. Serve the directory on http://localhost:3000
npx serve . -l 3000
```

Then open one of the pages, for example:

- `http://localhost:3000/`
- `http://localhost:3000/create-league/`
- `http://localhost:3000/find-league/`
- `http://localhost:3000/demo`

To point a locally served page at a locally running backend pair without editing `js/config.js`:

```
http://localhost:3000/demo?chatApi=http://127.0.0.1:8000&backendApi=http://127.0.0.1:8001
```

Any other static file server (`python -m http.server`, Caddy, nginx, etc.) works equally well — the site is fully static.

## Project Structure

```
.
├── index.html                 # Landing page
├── create-league/index.html   # Create-a-league form
├── find-league/index.html     # Search leagues by title prefix
├── find-league-prefix/index.html  # URL-driven prefix search
├── league/index.html          # Per-league actions (player / admin)
├── demo/index.html            # Pre-wired page for a sample league
├── css/styles.css             # Ordered stylesheet manifest
├── css/base.css               # Design tokens, resets, shared base layout
├── css/chat.css               # Ordered chat stylesheet manifest
├── css/chat-*.css             # Focused chat shell/panel/roster/table/form modules
├── css/shell.css              # Shared footer/header/locale shell
├── css/chat-intents.css       # Chat quick-command helper and HELP accordion
├── css/theme-toggle.css       # Theme toggle button
├── css/create-league.css      # Ordered create-league stylesheet manifest
├── css/create-league-*.css    # Focused create-league form/roster/action modules
├── css/find-league.css        # Find-league pages
└── js/
    ├── config.js              # Backend URLs + ?chatApi / ?backendApi overrides
    ├── i18n.js                # Locale registry, t(), initPage(), language picker
    ├── i18n/                  # Locale dictionaries registered with TLCHAT_I18N
    ├── site-header.js         # Shared site header (locale dropdown)
    ├── user-facing-errors.js  # Maps technical errors to short, localised copy
    ├── create-league/         # Ordered no-boot create-league support modules
    ├── create-league.js       # Entry script for /create-league/
    ├── find-league/           # Ordered no-boot support shared by find-league pages
    ├── find-league.js         # Entry script for /find-league/
    ├── find-league-prefix.js  # Entry script for /find-league-prefix/
    ├── chat/                  # Ordered no-boot chat support modules
    └── chat.js                # Entry/controller script for /league and /demo
```

Per-page HTML still links only `/css/styles.css`; that file is an ordered `@import` manifest. Keep CSS imports in manifest order so the cascade stays stable: `base.css`, `chat.css`, `shell.css`, `chat-intents.css`, `theme-toggle.css`, `create-league.css`, `find-league.css`. `chat.css` is itself an ordered manifest for chat surface modules: `chat-shell.css`, `chat-panels.css`, `chat-roster.css`, `chat-tables.css`, `chat-forms.css`, `chat-composer.css`, and `chat-match-actions.css`. `create-league.css` is also a manifest: `create-league-form.css`, `create-league-roster.css`, `create-league-actions.css`, `create-league-success.css`, and `create-league-help.css`.

Per-page HTML loads its scripts in this order: `js/i18n.js` → `js/i18n/en.js` → `js/i18n/ko.js` → `js/site-header.js` (where present) → `js/config.js` → `js/user-facing-errors.js` → optional no-boot support modules → the page-specific entry script. Add user-visible strings to both locale dictionary files, not the registry. `/create-league/` loads `js/create-league/*.js` before `js/create-league.js`; payload/rule helpers live in `model.js`, chips/help/timezone widgets in `widgets.js`, the backend adapter in `api.js`, and success rendering in `render.js`. `/find-league/` and `/find-league-prefix/` load `js/find-league/*.js` before their boot scripts; shared prefix-search helpers live in `core.js`, the backend adapter in `api.js`, and result rendering in `render.js`. `/league` and `/demo` load `js/chat/*.js` in dependency order, then `js/chat.js` boots the chat controller. Help-command intent catalog rendering lives in `js/chat/render-intents.js`; quick-action tile data/rendering lives in `js/chat/render-quick-actions.js`; header/action-bar/footer shell rendering plus theme/title helpers live in `js/chat/render-shell.js`. Roster-backed nickname candidate filtering and write-form nickname autocomplete live in `js/chat/composer-autocomplete.js`; the legacy chat composer in `js/chat/composer.js` is no longer loaded; assistant panel DOM helpers live in `js/chat/message-thread.js`; standings date filters live in `js/chat/standings-interactions.js`; shared tooltip wiring lives in `js/chat/interactions.js`; roster admin HTTP calls live in `js/chat/roster-actions.js`; Get Players panel filtering/add/refresh behavior lives in `js/chat/players-panel-interactions.js`; delegated roster/alias message actions live in `js/chat/roster-interactions.js`; match-history Update/Delete actions live in `js/chat/match-interactions.js`; match-submit confirmation helpers live in `js/chat/match-submit-interactions.js`; confirmed backend write submission lives in `js/chat/write-actions.js`, with success rendering in `js/chat/write-success.js` and write-error recovery in `js/chat/write-errors.js`. `TLCHAT_I18N.initPage()` is called inline at the end of `<body>` to apply translations to the rendered DOM.
