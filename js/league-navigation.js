(function (global) {
  "use strict";

  function leagueUrl(path, search, leagueId) {
    var source = new URLSearchParams(search || "");
    var params = new URLSearchParams();
    params.set("league_id", leagueId || source.get("league_id") || "");
    ["host_token", "lang", "backendApi", "chatApi"].forEach(function (key) {
      if (source.has(key)) params.set(key, source.get(key));
    });
    return path + "?" + params.toString();
  }

  global.TLCHAT_NAVIGATION = { leagueUrl: leagueUrl };
})(typeof window !== "undefined" ? window : this);
