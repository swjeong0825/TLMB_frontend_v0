(function (global) {
  "use strict";
  var api = global.TLCHAT_PLAN = global.TLCHAT_PLAN || {};

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
          response.status === 422 ? "uploadRejected" : "uploadFailed";
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

  api.uploadMatches = uploadMatches;
})(typeof window !== "undefined" ? window : this);
