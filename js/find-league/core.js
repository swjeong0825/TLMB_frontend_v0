(function (global) {
  "use strict";

  var api = global.TLCHAT_FIND_LEAGUE = global.TLCHAT_FIND_LEAGUE || {};

  function t(key, params) {
    var I = global.TLCHAT_I18N;
    if (!I || typeof I.t !== "function") return "";
    return I.t("findLeagueJs." + key, params);
  }

  function backendBase() {
    var c = global.TLCHAT_CONFIG || {};
    var u = c.backendMainBaseUrl;
    if (!u || typeof u !== "string") {
      console.error("TLCHAT_CONFIG.backendMainBaseUrl missing; set in js/config.js");
      return "";
    }
    return u.replace(/\/$/, "");
  }

  function technicalFromResponse(status, bodyText) {
    var line = String(status || "") + " " + String(bodyText || "");
    try {
      var j = JSON.parse(bodyText);
      if (j && j.error) line += " " + String(j.error);
      if (j && j.detail !== undefined) line += " " + JSON.stringify(j.detail);
    } catch (_e) {
      /* ignore */
    }
    return line;
  }

  function userMessageFromResponse(status, bodyText) {
    var ufe = global.TLCHAT_USER_FACING_ERRORS;
    if (ufe && typeof ufe.fromTechnical === "function") {
      return ufe.fromTechnical(technicalFromResponse(status, bodyText));
    }
    return t("genericError") || "Something went wrong. Please try again.";
  }

  function userMessageFromError(err) {
    var ufe = global.TLCHAT_USER_FACING_ERRORS;
    if (ufe && typeof ufe.fromTechnical === "function") {
      return ufe.fromTechnical(String(err && err.message ? err.message : err));
    }
    return t("networkError");
  }

  function setHidden(el, hidden) {
    el.hidden = !!hidden;
    if (hidden) el.setAttribute("aria-hidden", "true");
    else el.removeAttribute("aria-hidden");
  }

  function clampLimit(raw) {
    var n = parseInt(String(raw), 10);
    if (isNaN(n) || n < 1) return 50;
    return Math.min(n, 100);
  }

  function playerChatUrl(leagueId) {
    return "/league/?" + new URLSearchParams({ league_id: leagueId }).toString();
  }

  function prefixPageUrl(prefix, limit) {
    var params = new URLSearchParams({ prefix: prefix, limit: String(limit) });
    var current = new URLSearchParams(global.location.search);
    ["backendApi", "chatApi", "lang"].forEach(function (key) {
      var value = current.get(key);
      if (value) params.set(key, value);
    });
    return "/find-league-prefix/?" + params.toString();
  }

  api.t = t;
  api.backendBase = backendBase;
  api.technicalFromResponse = technicalFromResponse;
  api.userMessageFromResponse = userMessageFromResponse;
  api.userMessageFromError = userMessageFromError;
  api.setHidden = setHidden;
  api.clampLimit = clampLimit;
  api.playerChatUrl = playerChatUrl;
  api.prefixPageUrl = prefixPageUrl;
})(typeof window !== "undefined" ? window : this);
