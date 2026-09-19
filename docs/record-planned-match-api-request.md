# Backend request: record a planned match and consume its plan atomically

## Current frontend and required behavior

Record Match now first asks **Scheduled Match?**, with **Yes** for a planned match
and **No** for manual entry.
The planned path reads `GET /leagues/{league_id}/planned-matches`, parses each `{id,
value}`, and shows fixed sides plus two score selectors. It does not edit teams.
The recording adapter in `js/plan/record.js` is intentionally a no-write stub.
Implement the endpoint below in Backend Main so that a future frontend change can
enable recording with one request. Keep existing manual recording APIs working.

**One committed transaction must create the actual result and physically DELETE the
pending planned-match row.** Any validation, persistence, deletion, or commit failure
must leave the plan intact and roll back all result-related changes. Do not use two
HTTP requests, a background deletion, or an independent commit in each use case.

## Endpoint and input

`POST /leagues/{league_id}/planned-matches/{planned_match_id}/record`

Public league-link access, consistent with the existing match-result endpoints;
no host token required. Apply the existing result submission rate-limit policy.
Both path identifiers must be UUIDs, and the plan must belong to the specified league.

```json
{
  "expected_value": "Alice,Bob Charlie,Diana",
  "side1_score": "6",
  "side2_score": "3"
}
```

Singles use the identical request shape, for example `expected_value: "Alice Bob"`.
All three body fields are required strings.
Scores are strings to match existing result contracts. Use existing score-domain
validation; the current frontend offers whole-number score selectors from 0 to 21,
including zero. Do not introduce new win/draw rules in this endpoint.

`expected_value` is the exact value the user saw when entering scores. Under lock,
compare it byte-for-byte with the stored plan; return **409 PlanChanged** if it has
changed. This prevents scores being assigned to different teams after someone else
edits/uploads a plan. It is a precondition, not authority to override the stored plan.

Never accept replacement participant names or a format from this request. Derive
them from the stored value using the existing grammar:

- `Alice Bob`: singles; side 1 = Alice, side 2 = Bob.
- `Alice,Bob Charlie,Diana`: doubles; side 1 = Alice + Bob, side 2 = Charlie + Diana.

Require exactly one ASCII space between sides and one comma between doubles
teammates. Both sides must contain the same number of names, either one or two.
Each nickname must be nonempty and contain no whitespace (including Unicode
whitespace) or commas. Preserve spelling/case; do not trim or repair stored values.
Malformed stored plans fail validation and remain pending.

Preserve side order. Map `side1_score`/`side2_score` to `player1_score`/`player2_score`
or `pair1_score`/`pair2_score` accordingly. Reject unexpected request fields.

## Transaction and concurrency

1. Begin one application Unit of Work with all repositories sharing its session.
2. Lock the league first, then resolve/lock the pending plan or its prior consumption
   receipt. Use this lock order consistently with planned-match uploads.
3. Verify league membership, plan existence, the expected value, and valid grammar.
4. Reuse the normal singles/doubles recording domain operations: nickname/alias
   resolution, roster restrictions, permitted automatic registration, pair membership,
   duplicate/rematch restrictions, score validation, and league activity updates.
   Unknown names allowed during planning can fail here in a closed-roster league.
5. Persist the match result, any allowed player/pair changes, and league activity
   changes in this same transaction. Capture the database-authoritative result time.
6. Store a durable consumption receipt, then physically delete exactly the pending
   `(league_id, planned_match_id)` row. Commit once, after all steps succeed.

The current `SubmitMatchResultUseCase` and `SubmitSinglesMatchResultUseCase` each open
and commit their own Unit of Work. Extract/reuse their domain workflow inside the new
transaction; do not call those independently committing entry points and then delete
the plan. If any recording rule fails, including duplicate-match checks, keep the plan.

### Safe retries and preventing plan recreation

Local planning copies currently survive uploads. Without a consumed-ID check, the next
batch upload of those copies would recreate a plan whose result was already recorded.
Keep a small durable receipt outside `planned_matches`, unique on
`(league_id, planned_match_id)`, containing the created result's ID/format/time and a
fingerprint of the recording request. This is provenance for the recorded result;
the pending planned-match row must still be hard-deleted.

- An identical retry returns the same recorded result with **200**, without creating
  another match. A different recording request for a consumed ID returns **409**.
- Concurrent requests for one plan must produce at most one result; the other request
  gets the existing result for identical input, or a conflict for different input.
- Update planned-match batch upsert to reject consumed IDs with **409**, rolling back
  the entire batch. Acquire the same league lock before this check/upsert so a request
  queued behind recording cannot recreate the just-consumed plan.
- Keep receipts even if the actual result is later deleted; a consumed plan ID must
  not silently become reusable. A new planned rematch gets a new plan ID.

Keep league scoping on both receipts and plans. Do not make IDs from another league
accessible through this endpoint. Retain the minimal three-column pending-plan table;
no soft-delete/status column is requested there.

## Success and errors

Return **201** for the first successful recording, **200** for an identical retry:

```json
{
  "planned_match_id": "719e28b2-bce7-4e48-92a7-204711504dc8",
  "match_id": "3e846a0f-6ef1-42f6-971b-45e2fa920697",
  "match_format": "doubles",
  "created_at": "2026-09-19T21:00:00Z"
}
```

`match_format` is `singles` or `doubles`. The ID and timestamp come from the committed
result; retries return the same values. Do not return success before commit.

Use the backend's normal error envelope, with distinguishable machine-readable codes:

- **404**: unknown league or plan, where no prior consumption receipt exists.
- **409 PlanChanged**: expected value no longer matches the pending plan.
- **409 PlannedMatchAlreadyRecorded**: consumed ID with a different recording request;
  also use this conflict for attempted re-upload of a consumed ID.
- **422**: malformed identifiers/body/value/scores.
- Existing result-domain errors: preserve existing statuses/codes for roster,
  pairing, participant, and duplicate-match restrictions.
- **5xx**: unexpected storage/commit failure with all uncommitted changes rolled back.

No request may delete a pending plan when the corresponding result failed to commit.

## Backend acceptance tests

1. Singles/doubles create correctly ordered results, delete the pending row, remove it
   from GET planned matches, and expose the normal match history/standings effects.
2. Verify zero scores, invalid scores, aliases, repeated-player errors, closed/open
   roster behavior, pair membership, and each rematch policy through existing rules.
3. Changed values and foreign/missing league/plan IDs cannot record or delete anything.
4. Force errors after registration, match insertion, receipt insertion, plan deletion,
   and during commit: verify complete rollback, including all players/pairs/activity.
5. Race identical and different requests for the same plan: exactly one result and
   deletion; stable retry responses or conflicts as specified.
6. Retry after a simulated lost success response: return the original ID/time without
   duplicate matches or standings effects.
7. Re-upload a consumed ID, including concurrently with recording and in a mixed batch:
   return 409 and preserve all prior data without resurrecting the plan.
8. The same UUID in a different league remains isolated. Result deletion does not make
   its consumed plan ID reusable. Manual recording remains unaffected.

## Frontend integration after this backend work

This request does not enable the frontend stub. A later change will call the new
endpoint with the selected ID, loaded value, and two scores. Only after acknowledged
success should it remove that plan from the displayed list and the matching local
planning copy, then refresh result data. On errors keep scores and the plan visible;
on a changed-plan conflict reload it before allowing another attempt. Never implement
client-side POST-result followed by DELETE-plan as a substitute for this transaction.
