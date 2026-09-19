(function (global) {
  "use strict";
  var api = global.TLCHAT_PLAN = global.TLCHAT_PLAN || {};

  // Replace this adapter when Backend Main implements docs/planned-matches-api-request.md.
  async function uploadMatches(payload) {
    api.uploadPayload(payload && payload.matches);
    return { ok: false, error: "uploadUnavailable" };
  }

  api.uploadMatches = uploadMatches;
})(typeof window !== "undefined" ? window : this);
