# Saved planned-match CRUD: implemented contract

## Current behavior and scope

The Plan Match frontend now separates temporary **Drafts** from **Saved plans**.
Drafts exist only in page memory and disappear on reload, navigation, or language
change. Successful uploads move confirmed drafts into the saved list. Failed or
uncertain uploads retain drafts until the page is left. Saved plans come from
Backend Main and can be edited without copying them back into drafts.

Creation, reading, editing, and deletion use the APIs below. The frontend delete
adapter in `js/plan/api.js` is connected through the saved-plan controller. The
backend must be deployed with this endpoint. This document reflects the implemented
backend contract, including 404 for repeated deletion, replacing the original
proposal for idempotent 204 responses. Planned-result recording uses the existing result
endpoints with `planned_match_id`; this DELETE endpoint must never record a result.

## Existing create/read/update contract

Anyone with a league link can use these APIs without a host token or cookies.
Each pending plan has only its league association, frontend-generated UUID `id`,
and text `value`; keep the unique key `(league_id, id)` and require no new columns.

`POST /leagues/{league_id}/planned-matches` accepts a nonempty batch:

```json
{
  "matches": [
    {"id": "d315f636-10e5-4265-9b19-fc260e1ed224", "value": "Alice Bob"},
    {"id": "719e28b2-bce7-4e48-92a7-204711504dc8", "value": "Alice,민수 Bob,Guest"}
  ]
}
```

Return **200** with the accepted `{matches: [{id, value}, ...]}` records. New IDs
insert; existing IDs update their value. Editing sends a batch containing just the
selected ID and its new value. Commit each batch atomically, preserve omitted plans,
and retain the implemented upsert behavior: there are no consumed-ID receipts, so a
later upload can recreate a consumed UUID. Retrying an upload uses the same IDs. No additional PUT/PATCH endpoint is requested.

`GET /leagues/{league_id}/planned-matches` returns **200** with the same envelope,
containing the complete shared list in ascending UUID order. An empty league returns
`{"matches": []}`. The frontend parses participants and format from `value`:

- Singles: `Alice Bob` — one name per side.
- Doubles: `Alice,민수 Bob,Guest` — two names per side.
- Exactly one ASCII space separates sides; exactly one comma separates doubles
  teammates. Names are nonempty and contain neither commas nor whitespace, including
  Unicode whitespace. Preserve spelling, case, side order, and exact stored value.
- Reject malformed or unequal sides. Do not resolve players, create pairs, or apply
  recording/registration rules to planned-match create/update operations.

## Delete endpoint

```http
DELETE /leagues/2166134f-934b-4f59-af2b-bdb1cb1b49db/planned-matches/d315f636-10e5-4265-9b19-fc260e1ed224
Accept: application/json
```

No request body and no `X-Host-Token` are required. Anyone with the league link may
delete a saved plan, consistent with existing public upload/edit access. Retain normal
CORS settings. Validate both path parameters as UUIDs.

Within one transaction:

1. Resolve and lock the league using the same league lock/order as batch upsert and
   atomic planned-match recording. A missing league returns 404.
2. Physically delete the pending row scoped to **both** `league_id` and
   `planned_match_id`, if present. Never delete by ID alone. An absent plan returns
   404 with `PlannedMatchNotFoundError`.
3. Commit, then return **204 No Content**, with no JSON body. The frontend must not
   parse this response as JSON.

Do not soft-delete, create a cancellation receipt, or add status/timestamp columns.
Do not change league activity, players, aliases, pairs, recorded matches, or standings.
Deleting an absent, already-consumed plan ID returns 404 and must not delete its
recorded result. No recording receipts exist or are requested. Roll back on any storage/commit failure.

Use the backend's normal error envelope:

| Status | Meaning |
| --- | --- |
| 204 | Deleted; empty response body |
| 404 `LeagueNotFoundError` | League does not exist |
| 404 `PlannedMatchNotFoundError` | Plan does not exist in this league, including after deletion or recording |
| Generic 404 or 405 | Route unavailable or wrong backend URL; not proof that the plan is absent |
| 422 | Malformed league or planned-match UUID |
| 429 | Rate limited (60 requests/minute when enabled); wait before explicitly retrying |
| 5xx | Unexpected storage/commit failure; no partial changes |

Existing upsert semantics stay unchanged: a later upload of a manually deleted or consumed
ID can create a plan again. The league lock orders concurrent operations;
this request adds no revision checks, receipts, or tombstones. If recording commits
first and no intervening upload recreates the plan, deletion returns
404; if deletion commits first, recording must find the plan missing and must
not create a result from its request payload alone.

## Acceptance tests

1. Anonymous deletion works for singles/doubles plans and they disappear from GET.
2. Repeated deletion returns 404 `PlannedMatchNotFoundError` with no duplicate side effects.
3. Unknown plan in an existing league returns 404 `PlannedMatchNotFoundError`; missing
   league returns 404 `LeagueNotFoundError`; invalid UUIDs return 422.
4. The same plan UUID in another league is untouched. A foreign plan ID is treated as
   absent in the requested league; do not disclose or delete the other league's row.
5. Force delete and commit failures: the plan remains and all changes roll back.
6. Race deletion with upload and with planned-result recording; verify the common
   league lock produces the ordered behavior described above and no partial results.
7. Verify exact preservation of all unrelated plans, stored values, players, aliases,
   pairs, activity, recorded results, and standings.
8. Confirm existing batch insertion, single-item update, idempotent upload retries,
   atomic mixed-batch rejection, and uploads recreating absent IDs remain unchanged.

The frontend removes a displayed plan after acknowledged 204 and then refreshes.
Failed refreshes do not undo confirmed deletion. Ordinary errors retain the card.
A missing-plan domain error or uncertain response triggers a fresh GET; only that
successful read may reconcile the row or unlock another write. If the read fails,
keep the displayed rows and disable saved-plan writes/upload until Refresh succeeds.
Never retry DELETE automatically or recreate plans to undo an uncertain deletion.
Local drafts remain editable. Older GET responses cannot restore deleted rows, and
navigation discards late completion callbacks. No standings refresh or extra DELETE
is part of planned-result recording.
