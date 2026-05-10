# TLM Frontend (Vanilla)

Static, no-build-step browser client for the **Tennis League Manager (TLM)** system. Plain HTML, CSS, and JavaScript — no framework, no bundler, no `npm install`. Each page is a `<page>/index.html` plus a single per-page entry script under `js/`, sharing a common `js/i18n.js`, `js/config.js`, `js/site-header.js`, and `js/user-facing-errors.js`.

**Live service:** [https://tlmb.swjapps.com](https://tlmb.swjapps.com)

## Related Projects

| Project | Role |
|---|---|
| **[TLMB_backend_main](https://github.com/swjeong0825/TLMB_backend_main)** | Domain logic, PostgreSQL persistence, and REST API. Called directly from the browser for league creation, league lookup, and confirmed write submissions. |
| **[TLMB_chat_to_intent](https://github.com/swjeong0825/TLMB_chat_to_intent)** | LLM-powered intermediary. Called from the chat page (`/league`, `/demo`) to classify natural-language messages into intents and to fetch reshaped read data or pre-filled write form payloads. |
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
│   /league?league_id=...    ──► Chat-to-Intent Server  (POST /chat)
│   /demo                    ──► Chat-to-Intent Server  (POST /chat)
│                                                                  │
│   Confirmed write forms    ──► TLM Backend Main                  │
│   (built from intent       (POST/PATCH/DELETE; X-Host-Token       │
│    response)                attached client-side for admin ops)   │
└──────────────────────────────────────────────────────────────────┘
```

The chat page never writes through the Chat-to-Intent Server. When the chat returns a write intent, the browser renders the pre-filled form, the user confirms, and the page submits the request directly to the TLM Backend Main.

## Pages

| Path | Purpose | Talks to |
|---|---|---|
| `/` | Landing page with links to the other pages. | — |
| `/create-league/` | Form to create a new league; returns the secret `host_token` and shareable player/admin URLs. | TLM Backend Main |
| `/find-league/` | Search leagues by title prefix and open the player chat for a result. | TLM Backend Main |
| `/find-league-prefix/?prefix=...` | URL-driven variant of `find-league` that auto-runs the search from the `prefix` query param. | TLM Backend Main |
| `/league?league_id={id}[&host_token={token}]` | Per-league chat UI. Player mode without `host_token`; admin mode with it. | Chat-to-Intent Server (+ Backend Main for confirmed writes) |
| `/demo` | Same chat UI as `/league`, hard-coded to a sample league so visitors can try it without creating one. | Chat-to-Intent Server |

### Theming and locale

- Locale: `en` (default) and `ko`. Picker lives in the shared site header. Persisted in `localStorage` under `tlchat-locale`; can be forced with `?lang=en|ko`.
- Theme: light / dark. Persisted in `localStorage` under `tlchat-theme`; defaults to the system `prefers-color-scheme` on first visit.

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
├── league/index.html          # Per-league chat (player / admin)
├── demo/index.html            # Pre-wired chat for a sample league
├── css/styles.css             # Single shared stylesheet
└── js/
    ├── config.js              # Backend URLs + ?chatApi / ?backendApi overrides
    ├── i18n.js                # Locale dictionary, t(), initPage(), language picker
    ├── site-header.js         # Shared site header (locale dropdown)
    ├── user-facing-errors.js  # Maps technical errors to short, localised copy
    ├── create-league.js       # Entry script for /create-league/
    ├── find-league.js         # Entry script for /find-league/
    ├── find-league-prefix.js  # Entry script for /find-league-prefix/
    └── chat.js                # Entry script for /league and /demo
```

Per-page HTML loads its scripts in this order: `js/i18n.js` → `js/site-header.js` (where present) → `js/config.js` → `js/user-facing-errors.js` → the page-specific entry script. `TLCHAT_I18N.initPage()` is called inline at the end of `<body>` to apply translations to the rendered DOM.
