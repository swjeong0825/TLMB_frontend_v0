# Backend handoff: planned-match recording blocked by deployed API schema

## Diagnosis

The configured production backend responds successfully, but its published singles
and doubles result request schemas do not include `planned_match_id`. The frontend
therefore stops before submitting a result. This is a **backend deployment/API-schema
mismatch**, not a frontend connection failure or an incorrectly mapped request field.

The local backend already implements the field and planned-match consumption. Determine
why the running production service does not expose that implementation, then correct
the deployment or schema generation. A new endpoint or frontend bypass is not needed.

Evidence was collected on **2026-09-20 at 23:42–23:43 UTC**. Production checks were
read-only; no real result was submitted, and no plan was deleted. The deployed runtime
revision and transaction behavior have not been verified. An older deployment is
the likely cause; a stale/custom OpenAPI schema or a different deployed service remains
possible until the backend deployment is inspected.

## Verified evidence

The public frontend configuration at
<https://tlmb.swjapps.com/js/config.js> defaults to:

```text
https://tlmbbackendmain-production.up.railway.app
```

The `backendApi` query parameter can override this. The user's Network screenshot
does not show full request URLs; if reproducing with an override, inspect that exact
backend too. The findings below apply to the verified production default.

Two fresh reads of
<https://tlmbbackendmain-production.up.railway.app/openapi.json> returned HTTP **200**
and `Content-Type: application/json`. A request including
`Origin: https://tlmb.swjapps.com` also returned:

```http
access-control-allow-origin: https://tlmb.swjapps.com
vary: Origin
```

This confirms that the frontend origin is permitted to read the schema. The missing
capability is not explained by the service being unreachable or by absent CORS access
for that origin.

The schema uses ordinary, resolvable component references:

| POST endpoint | JSON request schema | Published properties |
| --- | --- | --- |
| `/leagues/{league_id}/matches` | `#/components/schemas/SubmitMatchResultRequest` | `pair1_nicknames`, `pair2_nicknames`, `pair1_score`, `pair2_score` |
| `/leagues/{league_id}/singles-matches` | `#/components/schemas/SubmitSinglesMatchResultRequest` | `player1_nickname`, `player2_nickname`, `player1_score`, `player2_score` |

**Neither schema includes `planned_match_id`.** The downloaded schema's SHA-256 was
`f4a6a1524a10e4747b0468cafeadd3b639d50b9a02c1b8b76c6fef924b602962`.
Treat this as a dated snapshot, not a required hash after deployment.

The user reported this Network sequence:

1. `roster`: 200.
2. `planned-matches`: 200.
3. Clicking **Record result** requests `openapi.json`: 200, initiated by `record.js`.
4. No result POST follows; the UI reports backend support could not be verified.

HTTP 200 confirms the schema was downloaded; it does not mean the schema advertises
planned recording. Successful fetches also do not automatically produce Console logs.

## Frontend verification

In frontend `js/plan/record.js`, the compatibility check resolves the selected result
endpoint's JSON schema and tests for `properties.planned_match_id`. With the actual
production document, the references resolve correctly and that property is absent.
The resulting block matches the published contract; it is not a parser failure.

The current frontend adapter was exercised with intercepted fetches, using the
downloaded production schema and then a copy with the missing property added:

| Schema supplied to adapter | Checks for singles/doubles | Result POSTs |
| --- | --- | --- |
| Actual downloaded production schema | Both blocked | 0 |
| Same schema with `planned_match_id` added to both request models | Both accepted | 2 simulated POSTs, each including its saved plan ID |

These simulated POSTs never accessed a backend. All **144 frontend tests passed**,
including payload mapping, string zero scores, compatibility blocking, success/error
handling, and uncertain-result recovery. No frontend runtime changes were made during
this diagnosis. The current generic message combines unsupported and unreadable schema
cases, but its imprecision is not the cause of the blocked submission.

Do not remove the compatibility check to work around this incident. An older result
endpoint may ignore an unknown `planned_match_id` field, record a manual match, and
leave the plan pending, violating the required atomic behavior.

## Existing local backend implementation

The inspected backend checkout is `TLMB_backend_main`, with HEAD
`f8448f7` (`add the feature of recording the planned match`). This is a local revision;
it has not been confirmed as the revision serving the production domain.

Relevant existing files, relative to that backend repository:

- `app/api/schemas/league_schemas.py`: both `SubmitMatchResultRequest` and
  `SubmitSinglesMatchResultRequest` declare `planned_match_id: UUID | None = None`.
- `app/api/routers/league_router.py`: both result routes pass
  `body.planned_match_id` into their submission commands.
- `app/application/use_cases/submit_match_result_use_case.py` and
  `submit_singles_match_result_use_case.py`: lock the league and selected plan,
  validate the saved sides, record the result, and delete the pending plan in the
  recording unit of work.
- `docs/planned-match-recording-frontend-guide.md`: documents this implemented
  contract and supersedes the earlier dedicated-route/receipt proposal.

## Requested backend work

1. Identify the service, environment, active revision/image, startup module, and
   traffic routing behind `tlmbbackendmain-production.up.railway.app`. Compare the
   running code against the implementation above; verify deployment logs and all
   active replicas. Do not assume a local commit is already deployed.
2. Deploy the correct implementation through the normal release process if it is
   missing. If the runtime already has it, inspect custom/stale OpenAPI generation,
   imported request models, cached schema state, or mixed old/new workers. Restart
   or replace stale workers as appropriate.
3. Ensure both JSON request schemas publish optional, nullable UUID
   `planned_match_id`. A typical generated property is:

   ```json
   {
     "anyOf": [{"type": "string", "format": "uuid"}, {"type": "null"}],
     "default": null,
     "title": "Planned Match Id"
   }
   ```

   Equivalent valid OpenAPI UUID/null representation is fine. Existing participant
   and string-score fields remain required; `planned_match_id` remains optional for
   manual recording. Do not merely patch the schema if the runtime lacks the feature.
4. Verify the existing transaction really records the result and hard-deletes the
   league-scoped plan together. Preserve validation, rollback, locking, roster/pair
   rules, and the documented 201 `{match_id, created_at}` response. No host token,
   separate `/planned-matches/{id}/record` endpoint, follow-up DELETE, or receipt
   table is requested. The implemented contract has no success replay for consumed IDs.
5. Recheck the public schema from the frontend origin after rollout and report the
   deployed revision plus test results. Keep `/openapi.json` accessible with the same
   CORS support; the frontend checks it again on each explicit submission attempt.

## Read-only reproduction after deployment

```sh
curl --fail --silent --show-error \
  -H 'Origin: https://tlmb.swjapps.com' \
  -H 'Cache-Control: no-cache' \
  https://tlmbbackendmain-production.up.railway.app/openapi.json \
  -o /tmp/tlmb-planned-schema.json

python3 - <<'PY'
import json
with open('/tmp/tlmb-planned-schema.json') as file:
    spec = json.load(file)
for endpoint in ('matches', 'singles-matches'):
    path = '/leagues/{league_id}/' + endpoint
    request = spec['paths'][path]['post']['requestBody']
    schema = request['content']['application/json']['schema']
    if '$ref' in schema:
        schema = spec['components']['schemas'][schema['$ref'].split('/')[-1]]
    supported = 'planned_match_id' in schema.get('properties', {})
    print(path, 'planned_match_id:', supported)
PY
```

Observed during diagnosis: `False` for both endpoints. Required after correction:
`True` for both. This check performs no recording.

## Acceptance tests

Use automated tests or an explicitly designated test league for write checks, not
the user's existing planned matches. Existing backend coverage is in:

- `tests/api/test_record_planned_matches.py`
- `tests/application/test_record_planned_matches.py`
- `tests/e2e/test_record_planned_matches.py`

Verify both formats: a saved UUID plus the fixed participant names and string scores
returns 201, creates exactly one result, and removes the plan from GET in one
transaction. Verify zero scores, changed-side rejection, missing-plan rejection,
league isolation, rule failures, rollback, and concurrent consumption. A repeat
submission after consumption must not create another result. Manual submission
without a plan ID must retain its prior behavior.

Finally, verify the real browser proceeds from schema GET to the correct result POST
and then refreshes plans/history after confirmed success. The backend agent should
report the actual deployed revision, schema check output, and transaction-test results
before declaring this incident resolved.
