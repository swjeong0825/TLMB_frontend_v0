# Planned-match recording: implemented frontend integration

This document replaces the earlier proposal for a dedicated recording endpoint and
consumption receipts. The implemented contract is described by Backend Main's
`docs/planned-match-recording-frontend-guide.md`. Recording uses the existing result
endpoints with an optional `planned_match_id`, not a separate plan-record route.

## Requests

Send directly to the configured Backend Main URL. Use JSON `Content-Type`, JSON
`Accept`, and `credentials: "omit"`; no host token is required. Parse the saved
`{id, value}` with `TLCHAT_PLAN.parseValue`. Keep the saved UUID, exact nickname/alias
spelling, side order, and score association. Never generate a replacement ID.

Singles, for saved value `Alice Bob`:

```http
POST /leagues/2166134f-934b-4f59-af2b-bdb1cb1b49db/singles-matches
Content-Type: application/json
Accept: application/json
```

```json
{
  "player1_nickname": "Alice",
  "player2_nickname": "Bob",
  "player1_score": "6",
  "player2_score": "0",
  "planned_match_id": "d315f636-10e5-4265-9b19-fc260e1ed224"
}
```

Doubles, for saved value `Alice,민수 Bob,Guest`:

```http
POST /leagues/2166134f-934b-4f59-af2b-bdb1cb1b49db/matches
Content-Type: application/json
Accept: application/json
```

```json
{
  "pair1_nicknames": ["Alice", "민수"],
  "pair2_nicknames": ["Bob", "Guest"],
  "pair1_score": "6",
  "pair2_score": "3",
  "planned_match_id": "719e28b2-bce7-4e48-92a7-204711504dc8"
}
```

Scores are strings, including zero. The UI retains its 0–21 selectors and allows
draws. There are no `expected_value`, `side1_score`, `side2_score`, or `match_format`
fields on the wire. The backend compares the submitted participants against the
saved sides, then applies normal recording rules. A different alias cannot replace
a saved name even when it identifies the same player.

A committed transaction creates the result, applies permitted roster/pair/activity
changes, and hard-deletes the pending plan. It returns **201**:

```json
{
  "match_id": "3e846a0f-6ef1-42f6-971b-45e2fa920697",
  "created_at": "2026-09-20T12:34:56.123456Z"
}
```

The frontend validates that acknowledgement before reporting success, removes the
submitted row/draft, and refreshes plans, history, roster state, and visible standings.
Existing standings filters and custom formulas are retained. A failed follow-up GET
is a refresh failure; it never changes confirmed recording into a failed recording.
There is no second DELETE request. Manual result entry remains unchanged.

## Compatibility and deployment

Older deployments can silently ignore `planned_match_id` and record a manual result
without consuming the plan. Before each planned result POST, `js/plan/record.js`
reads the configured backend's `/openapi.json` with `cache: "no-store"` and verifies
that the selected result endpoint's JSON request schema exposes `planned_match_id`.
An unavailable, unreadable, or outdated schema prevents the POST and shows a localized
backend-unavailable message. Deployments must serve that schema with the same CORS
access as their result APIs. Local API-prefix fixtures must expose it under that prefix.
The check and POST share a 30-second abort timer. No automatic POST retry occurs.

On 2026-09-20, a read-only check of the configured production backend's OpenAPI schema
found neither result request schema advertising `planned_match_id`. The implementation
is verified with local fixtures; deploying the updated backend is a prerequisite for
production recording. This frontend task does not deploy either repository.

## Errors and recovery

Backend domain errors usually return `{ "error": "ErrorName", "detail": "…" }`.
Request validation can return an array in `detail`, and proxies may return non-JSON.
The adapter handles these variations; rendered details and missing names are escaped.

| Response | UI behavior |
| --- | --- |
| 404 `LeagueNotFoundError` | Stop submission until the league can be refreshed successfully. |
| 404 `PlannedMatchNotFoundError` | Refresh plans/history. Explain that the plan is no longer pending; do not claim recording succeeded. |
| 409 `PlannedMatchMismatchError` | Refresh the matchup and clear scores before another explicit submission. |
| 422 `InvalidPlannedMatchError` | Refresh/rebuild from the saved format; never fall back to manual recording. |
| 422 nickname, score, repeated-player errors | Show the relevant message and retain applicable scores. |
| 422 `RosterMembershipRequiredError` | Display missing nicknames when provided; registration is required first. |
| 409 pair/player rule conflicts | Explain the rule conflict; retain scores. |
| 409 duplicate matchup/rematch errors | Refresh history and explain the rematch restriction. |
| 429 | Ask the user to wait before retrying. |
| 5xx, timeout, network failure, malformed/unreadable 201 | Treat the result as unconfirmed, retain its context, and reconcile plans/history before enabling an explicit retry. |

There are **no consumption receipts or success replays**. A retry after consumption
returns 404, and a later upload can recreate a consumed UUID. Never automatically
retry, re-upload a stale plan, drop `planned_match_id`, or infer successful recording
solely from an absent plan. Review history before deciding whether to retry a plan
that remains pending. Confirmed/absent-after-review rows are not resurrected by stale
reads in the current page session.

`js/plan/record-session.js` owns pending requests and score drafts across action
navigation on the league page. It guards duplicate submission per ID, pins the submitted
teams during refresh, ignores stale GETs, and retains scores only for an unchanged
saved value. Detached panels unsubscribe; full page navigation discards the session.
The independent saved-plan Delete action remains its existing no-request stub.

## Verification

Run `node --test tests/*.test.js`. Adapter tests cover endpoint/payload mapping,
string zero scores, compatibility checks, error envelopes, timeouts, and no automatic
retries. Session tests cover duplicate clicks/action navigation, concurrent rows,
changed plans, uncertainty, failed follow-up reads, stale responses, disposal, and
preservation/removal of applicable drafts. Browser checks use local fixtures only;
production match results must not be created as an integration test.
