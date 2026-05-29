(function (global) {
  "use strict";

  var api = global.TLCHAT_CREATE_LEAGUE = global.TLCHAT_CREATE_LEAGUE || {};

  async function postCreateLeague(base, payload) {
    if (!base) {
      return { ok: false, error: "missing_config" };
    }
    try {
      var res = await fetch(base + "/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      var text = await res.text();
      if (!res.ok) {
        return { ok: false, error: "http", status: res.status, body: text };
      }
      var data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        return { ok: false, error: "parse", err: parseErr };
      }
      if (!data.league_id || !data.host_token) {
        return { ok: false, error: "missing_ids", data: data };
      }
      return { ok: true, data: data };
    } catch (err) {
      return { ok: false, error: "network", err: err };
    }
  }

  api.postCreateLeague = postCreateLeague;
})(window);
