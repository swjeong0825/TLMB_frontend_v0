(function (global) {
  "use strict";
  var api = global.TLCHAT_PLAN = global.TLCHAT_PLAN || {};

  function score(value) {
    var text = typeof value === "string" ? value : String(value == null ? "" : value);
    if (!/^(?:[0-9]|1[0-9]|2[01])$/.test(text)) throw new Error("plannedScoreRequired");
    return text;
  }

  function recordPayload(record, side1Score, side2Score) {
    if (!api.isValidRecord(record)) throw new Error("plannedLoadFailed");
    var parsed = api.parseValue(record.value);
    var first = score(side1Score);
    var second = score(side2Score);
    if (parsed.format === "singles") return {
      player1_nickname: parsed.sides[0][0], player2_nickname: parsed.sides[1][0],
      player1_score: first, player2_score: second, planned_match_id: record.id,
    };
    return { pair1_nicknames: parsed.sides[0].slice(), pair2_nicknames: parsed.sides[1].slice(),
      pair1_score: first, pair2_score: second, planned_match_id: record.id };
  }

  function recordError(status, data) {
    var code = data && typeof data.error === "string" ? data.error : "";
    var keys = {
      LeagueNotFoundError: "plannedLeagueMissing", PlannedMatchNotFoundError: "plannedMissing",
      PlannedMatchMismatchError: "plannedMismatch", InvalidPlannedMatchError: "plannedInvalidMatch",
      InvalidPlayerNicknameError: "plannedInvalidNickname", InvalidSetScoreError: "plannedScoreRequired",
      SamePlayerWithinSinglePairError: "plannedRepeatedPlayer", SamePlayerOnBothPairsError: "plannedRepeatedPlayer",
      SamePlayerOnBothSidesError: "plannedRepeatedPlayer", RosterMembershipRequiredError: "plannedRosterRequired",
      PairConflictError: "plannedRuleConflict", SamePairOnBothSidesError: "plannedRuleConflict",
      DuplicatePairMatchupMatchError: "plannedRematchConflict", DuplicateSinglesMatchupMatchError: "plannedRematchConflict",
    };
    var unconfirmed = !status || status >= 500 || (status >= 200 && status < 300);
    var error = unconfirmed ? "plannedUnconfirmed" : status === 429 ? "plannedRateLimited" :
      Object.prototype.hasOwnProperty.call(keys, code) ? keys[code] : status === 409 ? "plannedRuleConflict" : "plannedRejected";
    return { ok: false, error: error, status: status, code: code,
      detail: data && typeof data.detail === "string" ? data.detail.slice(0, 600) : "",
      missing: data && Array.isArray(data.missing_nicknames) ? data.missing_nicknames.filter(function (name) { return typeof name === "string"; }) : [],
      unconfirmed: unconfirmed,
      reconcile: unconfirmed || ["plannedMissing", "plannedMismatch", "plannedInvalidMatch", "plannedRematchConflict", "plannedLeagueMissing"].indexOf(error) !== -1,
      review: unconfirmed || ["plannedMissing", "plannedMismatch", "plannedInvalidMatch"].indexOf(error) !== -1,
    };
  }

  // Older deployments can ignore unknown body fields and record a manual result.
  // Fail closed unless the configured backend advertises the planned ID field.
  async function supportsPlannedRecording(base, endpoint, signal) {
    try {
      var response = await fetch(base.replace(/\/+$/, "") + "/openapi.json", {
        method: "GET", credentials: "omit", cache: "no-store", signal: signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return false;
      var spec = await response.json();
      var operation = spec.paths["/leagues/{league_id}/" + endpoint].post;
      var schema = operation.requestBody.content["application/json"].schema;
      if (schema.$ref && schema.$ref.indexOf("#/components/schemas/") === 0) {
        schema = spec.components.schemas[schema.$ref.slice("#/components/schemas/".length)];
      }
      return !!(schema && schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, "planned_match_id"));
    } catch (_err) { return false; }
  }

  // One POST records the result and consumes the plan atomically. Never retry automatically.
  async function recordMatch(leagueId, record, side1Score, side2Score) {
    var body;
    try { body = recordPayload(record, side1Score, side2Score); }
    catch (error) { return { ok: false, error: error.message }; }
    var base = global.TLCHAT_CHAT.backendMainBase();
    if (!base || !leagueId) return { ok: false, error: "plannedLoadFailed" };
    var endpoint = api.parseValue(record.value).format === "singles" ? "singles-matches" : "matches";
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 30000);
    try {
      if (!await supportsPlannedRecording(base, endpoint, controller.signal)) {
        return { ok: false, error: "plannedBackendUnavailable" };
      }
      var response = await fetch(base.replace(/\/+$/, "") + "/leagues/" + encodeURIComponent(leagueId) + "/" + endpoint, {
        method: "POST", credentials: "omit", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body),
      });
      var data;
      try { data = await response.json(); } catch (_err) { data = null; }
      if (response.status === 201 && data && typeof data.match_id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.match_id) &&
          typeof data.created_at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(data.created_at) && Number.isFinite(Date.parse(data.created_at))) {
        return { ok: true, match_id: data.match_id, created_at: data.created_at };
      }
      return recordError(response.status, data);
    } catch (_err) { return recordError(0, null); }
    finally { clearTimeout(timer); }
  }

  api.recordPayload = recordPayload;
  api.recordMatch = recordMatch;
})(typeof window !== "undefined" ? window : this);
