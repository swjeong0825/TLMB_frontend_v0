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

  var api = { fromTechnical: fromTechnical };
  Object.defineProperty(api, "GENERIC_MESSAGE", {
    enumerable: true,
    get: genericMessage,
  });
  global.TLCHAT_USER_FACING_ERRORS = api;
})(typeof window !== "undefined" ? window : this);
