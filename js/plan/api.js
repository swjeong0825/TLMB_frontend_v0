(function (global) {
  "use strict";
  var api = global.TLCHAT_PLAN = global.TLCHAT_PLAN || {};

  async function loadMatches(leagueId) {
    var base = global.TLCHAT_CHAT.backendMainBase();
    if (!base || !leagueId) return { ok: false, error: "plannedLoadFailed" };
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 30000);
    try {
      var response = await fetch(base.replace(/\/+$/, "") + "/leagues/" + encodeURIComponent(leagueId) + "/planned-matches", {
        method: "GET", credentials: "omit", headers: { Accept: "application/json" },
        cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) return { ok: false, error: response.status === 404 ? "plannedLeagueMissing" : "plannedLoadFailed" };
      var data = await response.json();
      if (!data || !Array.isArray(data.matches)) return { ok: false, error: "plannedLoadFailed" };
      var seen = Object.create(null);
      var invalidCount = 0;
      var matches = [];
      data.matches.forEach(function (record) {
        if (!api.isValidRecord(record)) { invalidCount++; return; }
        var key = record.id.toLowerCase();
        if (seen[key]) { invalidCount++; return; }
        seen[key] = true;
        matches.push({ id: record.id, value: record.value });
      });
      return { ok: true, matches: matches, invalidCount: invalidCount };
    } catch (_err) {
      return { ok: false, error: "plannedLoadFailed" };
    } finally { clearTimeout(timeout); }
  }

  // Public batch upsert: stable IDs make retries safe, including uncertain responses.
  async function uploadMatches(leagueId, payload) {
    var request;
    try { request = api.uploadPayload(payload && payload.matches); }
    catch (_err) { return { ok: false, error: "invalidUpload" }; }
    var base = global.TLCHAT_CHAT.backendMainBase();
    if (!base || !leagueId) return { ok: false, error: "uploadConfigError" };
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 30000);
    try {
      var response = await fetch(base.replace(/\/+$/, "") + "/leagues/" + encodeURIComponent(leagueId) + "/planned-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        signal: controller.signal,
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        var error = response.status === 404 ? "uploadLeagueMissing" :
          response.status === 409 ? "uploadConflict" : response.status === 422 ? "uploadRejected" : "uploadFailed";
        return { ok: false, error: error, status: response.status };
      }
      var data;
      try { data = await response.json(); }
      catch (_err) { return { ok: false, error: "uploadUnconfirmed" }; }
      // Confirm the entire submitted batch; never report success for a partial response.
      var expected = Object.create(null);
      request.matches.forEach(function (match) { expected[match.id.toLowerCase()] = match.value; });
      var valid = data && Array.isArray(data.matches) && data.matches.length === request.matches.length &&
        data.matches.every(function (match) {
          if (!api.isValidRecord(match)) return false;
          var id = match.id.toLowerCase();
          if (!Object.prototype.hasOwnProperty.call(expected, id) || expected[id] !== match.value) return false;
          delete expected[id];
          return true;
        });
      if (!valid) return { ok: false, error: "uploadUnconfirmed" };
      return { ok: true, matches: data.matches.map(function (match) { return { id: match.id, value: match.value }; }) };
    } catch (_err) {
      return { ok: false, error: "uploadUnconfirmed" };
    } finally { clearTimeout(timeout); }
  }

  async function deleteMatch(leagueId, record) {
    var id = record && record.id;
    // Deletion targets the ID, even if the saved value cannot be parsed.
    if (!api.isValidId(id)) return { ok: false, error: "deleteRejected" };
    var base = global.TLCHAT_CHAT.backendMainBase();
    if (!base || !leagueId) return { ok: false, error: "deleteConfigError" };
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 30000);
    try {
      var response = await fetch(base.replace(/\/+$/, "") + "/leagues/" + encodeURIComponent(leagueId) +
        "/planned-matches/" + encodeURIComponent(id), {
        method: "DELETE", credentials: "omit", headers: { Accept: "application/json" }, signal: controller.signal,
      });
      // The successful response has no body.
      if (response.status === 204) return { ok: true };
      var data;
      try { data = await response.json(); } catch (_err) { data = null; }
      var code = data && typeof data.error === "string" ? data.error : "";
      var unconfirmed = response.status >= 500 || response.ok;
      var error = unconfirmed ? "deleteUnconfirmed" :
        response.status === 404 && code === "LeagueNotFoundError" ? "deleteLeagueMissing" :
        response.status === 404 && code === "PlannedMatchNotFoundError" ? "deletePlanMissing" :
        response.status === 404 || response.status === 405 ? "deleteUnavailable" :
        response.status === 422 ? "deleteRejected" : response.status === 429 ? "deleteRateLimited" : "deleteFailed";
      return { ok: false, error: error, status: response.status, unconfirmed: !!unconfirmed };
    } catch (_err) {
      return { ok: false, error: "deleteUnconfirmed", unconfirmed: true };
    } finally { clearTimeout(timeout); }
  }

  api.deleteMatch = deleteMatch;
  api.uploadMatches = uploadMatches;
  api.loadMatches = loadMatches;
})(typeof window !== "undefined" ? window : this);
