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
    return { expected_value: record.value, side1_score: score(side1Score), side2_score: score(side2Score) };
  }

  // Deliberately no HTTP or storage writes. Replace only when the atomic backend endpoint exists.
  async function recordMatch(leagueId, record, side1Score, side2Score) {
    if (!leagueId) return { ok: false, error: "plannedLoadFailed" };
    try { recordPayload(record, side1Score, side2Score); }
    catch (error) { return { ok: false, error: error.message }; }
    return { ok: false, error: "plannedRecordUnavailable" };
  }

  api.recordPayload = recordPayload;
  api.recordMatch = recordMatch;
})(typeof window !== "undefined" ? window : this);
