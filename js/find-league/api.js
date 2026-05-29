(function (global) {
  "use strict";

  var api = global.TLCHAT_FIND_LEAGUE = global.TLCHAT_FIND_LEAGUE || {};

  async function fetchLeaguesByPrefix(base, prefix, limit) {
    var params = new URLSearchParams({
      title_prefix: prefix,
      limit: String(limit),
    });
    var res = await fetch(base + "/leagues?" + params.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    var text = await res.text();
    if (!res.ok) {
      return { ok: false, kind: "http", status: res.status, text: text };
    }
    var data;
    try {
      data = JSON.parse(text);
    } catch (_e) {
      return { ok: false, kind: "parse", status: res.status, text: text };
    }
    var leagues = data && Array.isArray(data.leagues) ? data.leagues : null;
    if (!leagues) {
      return { ok: false, kind: "missing_leagues", status: res.status, text: text };
    }
    return { ok: true, leagues: leagues };
  }

  api.fetchLeaguesByPrefix = fetchLeaguesByPrefix;
})(typeof window !== "undefined" ? window : this);
