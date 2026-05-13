/**
 * Maps technical error strings (HTTP details, backend messages, browser errors)
 * to short copy for the chat UI. Full technical text is logged separately in chat.js.
 *
 * Requires window.TLCHAT_I18N (load i18n.js first).
 * Exposes window.TLCHAT_USER_FACING_ERRORS { GENERIC_MESSAGE, fromTechnical }
 */
(function (global) {
  "use strict";

  function t(key) {
    var I = global.TLCHAT_I18N;
    if (I && typeof I.t === "function") return I.t(key);
    return "";
  }

  function genericMessage() {
    var s = t("errors.generic");
    return s || "Something went wrong. Please try again in a moment, or rephrase your question.";
  }

  /**
   * @param {string} technical raw error text (logged to console elsewhere)
   * @returns {string} user-visible message
   */
  function fromTechnical(technical) {
    var low = String(technical || "").toLowerCase();
    if (!low.trim()) return genericMessage();

    if (
      low.indexOf("failed to fetch") !== -1 ||
      low.indexOf("networkerror") !== -1 ||
      low.indexOf("load failed") !== -1 ||
      low.indexOf("network request failed") !== -1
    ) {
      return t("errors.network") || genericMessage();
    }
    if (low.indexOf("cors") !== -1 || low.indexOf("access-control-allow-origin") !== -1) {
      return t("errors.cors") || genericMessage();
    }

    var MSG_LEAGUE_NOT_FOUND = t("errors.leagueNotFound") || genericMessage();
    var MSG_PLAYER_NOT_FOUND = t("errors.playerNotFound") || genericMessage();
    var MSG_TEAM_NOT_FOUND = t("errors.teamNotFound") || genericMessage();
    var MSG_MATCH_NOT_FOUND = t("errors.matchNotFound") || genericMessage();
    var MSG_NOT_FOUND_FALLBACK = t("errors.notFoundFallback") || genericMessage();

    if (low.indexOf("no match found for players") !== -1) {
      return MSG_MATCH_NOT_FOUND;
    }
    if (low.indexOf("matchnotfound") !== -1 || low.indexOf("match not found") !== -1) {
      return MSG_MATCH_NOT_FOUND;
    }

    if (low.indexOf("no team found with players") !== -1) {
      return MSG_TEAM_NOT_FOUND;
    }
    if (low.indexOf("teamnotfound") !== -1 || low.indexOf("team not found") !== -1) {
      return MSG_TEAM_NOT_FOUND;
    }

    if (
      low.indexOf("playernotfound") !== -1 ||
      low.indexOf("player not found") !== -1 ||
      low.indexOf("standings for player") !== -1 ||
      low.indexOf("match history for player") !== -1
    ) {
      return MSG_PLAYER_NOT_FOUND;
    }

    if (low.indexOf("leaguenotfound") !== -1 || low.indexOf("league not found") !== -1) {
      return MSG_LEAGUE_NOT_FOUND;
    }

    var is404 = /\b404\b/.test(low);
    if (
      is404 &&
      low.indexOf("could not fetch standings:") !== -1 &&
      low.indexOf("for player") === -1
    ) {
      return MSG_LEAGUE_NOT_FOUND;
    }
    if (
      is404 &&
      low.indexOf("could not fetch match history") !== -1 &&
      low.indexOf("for player") === -1
    ) {
      return MSG_LEAGUE_NOT_FOUND;
    }
    if (is404 && low.indexOf("could not fetch roster") !== -1) {
      return MSG_LEAGUE_NOT_FOUND;
    }

    if (
      low.indexOf("duplicateteampairmatcherror") !== -1 ||
      low.indexOf("a match between these two teams already exists") !== -1
    ) {
      return t("errors.duplicateMatch") || genericMessage();
    }

    if (
      low.indexOf("invalidleaguerules") !== -1 ||
      low.indexOf("ranking_subject='player' requires") !== -1 ||
      low.indexOf("ranking_subject=\"player\" requires") !== -1
    ) {
      return t("errors.invalidLeagueRules") || genericMessage();
    }

    if (
      /\b404\b/.test(low) ||
      low.indexOf("not found") !== -1 ||
      low.indexOf("couldn't find") !== -1 ||
      low.indexOf("could not find") !== -1
    ) {
      return MSG_NOT_FOUND_FALLBACK;
    }
    if (
      low.indexOf("leaguetitlealreadyexistserror") !== -1 ||
      low.indexOf("league title already exists") !== -1
    ) {
      return t("errors.titleExists") || genericMessage();
    }

    if (
      /\b401\b/.test(low) ||
      /\b403\b/.test(low) ||
      low.indexOf("forbidden") !== -1 ||
      low.indexOf("unauthorized") !== -1 ||
      low.indexOf("not allowed") !== -1
    ) {
      return t("errors.forbidden") || genericMessage();
    }
    if (/\b408\b/.test(low) || low.indexOf("timeout") !== -1 || low.indexOf("timed out") !== -1) {
      return t("errors.timeout") || genericMessage();
    }
    if (/\b429\b/.test(low) || low.indexOf("rate limit") !== -1 || low.indexOf("too many requests") !== -1) {
      return t("errors.rateLimit") || genericMessage();
    }
    if (
      /\b502\b/.test(low) ||
      /\b503\b/.test(low) ||
      /\b504\b/.test(low) ||
      low.indexOf("bad gateway") !== -1 ||
      low.indexOf("service unavailable") !== -1 ||
      low.indexOf("internal server") !== -1 ||
      low.indexOf("gateway timeout") !== -1
    ) {
      return t("errors.serviceUnavailable") || genericMessage();
    }
    if (
      /\b400\b/.test(low) ||
      /\b422\b/.test(low) ||
      low.indexOf("invalid json") !== -1 ||
      low.indexOf("bad request") !== -1 ||
      low.indexOf("validation error") !== -1 ||
      low.indexOf("unprocessable") !== -1
    ) {
      return t("errors.badRequest") || genericMessage();
    }
    if (/\b5\d\d\b/.test(low)) {
      return t("errors.serverError") || genericMessage();
    }

    if (low.indexOf("backend returned status") !== -1 || low.indexOf("could not fetch") !== -1) {
      return t("errors.loadInfo") || genericMessage();
    }
    if (low.indexOf("unexpected response") !== -1 || low.indexOf("chatapibaseurl") !== -1) {
      return t("errors.unexpectedChat") || genericMessage();
    }

    return genericMessage();
  }

  /**
   * Suggest an @-mention prefix from backend `missing_nicknames`
   * (first non-empty trimmed nickname becomes "@x" using its first character).
   */
  function mentionSearchPromptFromMissing(missingNicknames) {
    if (!Array.isArray(missingNicknames)) return "@";
    for (var i = 0; i < missingNicknames.length; i++) {
      var s = String(missingNicknames[i] == null ? "" : missingNicknames[i]).trim();
      if (!s.length) continue;
      var ch = s.charAt(0);
      if (ch) return "@" + ch;
    }
    return "@";
  }

  /**
   * Structured handler for HTTP 422 NotInAllowlistError from the backend.
   *
   * Returns { isNotInAllowlist: true, headline: string, missing_nicknames: string[] }
   * when the body matches, otherwise returns { isNotInAllowlist: false }.
   *
   * IMPORTANT: reads missing_nicknames from the structured JSON body — never
   * parses the `detail` string, per the backend contract in 20_allowlist.md.
   *
   * @param {number} status HTTP status code
   * @param {object|null} jsonBody parsed response body (or null)
   * @returns {{ isNotInAllowlist: boolean, headline?: string, missing_nicknames?: string[] }}
   */
  function fromMatchSubmissionError(status, jsonBody) {
    if (
      status !== 422 ||
      !jsonBody ||
      typeof jsonBody !== "object" ||
      jsonBody.error !== "NotInAllowlistError"
    ) {
      return { isNotInAllowlist: false };
    }

    var missing = Array.isArray(jsonBody.missing_nicknames)
      ? jsonBody.missing_nicknames.map(function (n) { return String(n); })
      : [];

    var names =
      missing.length > 0
        ? missing.join(", ")
        : (jsonBody.detail ? String(jsonBody.detail) : "some players");

    var atHint = mentionSearchPromptFromMissing(missing);

    var I = global.TLCHAT_I18N;
    var headline =
      I && typeof I.t === "function"
        ? I.t("chat.notInAllowlistHeadline", { names: names, atHint: atHint })
        : names +
          " are not in this league's allowlist. use \"" +
          atHint +
          '" to search the player.';

    if (!headline || headline === "chat.notInAllowlistHeadline") {
      headline =
        names +
        " are not in this league\u2019s allowlist. use \"" +
        atHint +
        '" to search the player.';
    }

    return { isNotInAllowlist: true, headline: headline, missing_nicknames: missing };
  }

  var api = { fromTechnical: fromTechnical, fromMatchSubmissionError: fromMatchSubmissionError };
  Object.defineProperty(api, "GENERIC_MESSAGE", {
    enumerable: true,
    get: genericMessage,
  });
  global.TLCHAT_USER_FACING_ERRORS = api;
})(typeof window !== "undefined" ? window : this);
