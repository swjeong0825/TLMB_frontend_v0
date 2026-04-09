/**
 * Maps technical error strings (HTTP details, backend messages, browser errors)
 * to short copy for the chat UI. Full technical text is logged separately in chat.js.
 *
 * Exposes window.TLCHAT_USER_FACING_ERRORS { GENERIC_MESSAGE, fromTechnical }
 */
(function (global) {
  "use strict";

  var GENERIC_MESSAGE =
    "Something went wrong. Please try again in a moment, or rephrase your question.";

  /**
   * @param {string} technical raw error text (logged to console elsewhere)
   * @returns {string} user-visible message
   */
  function fromTechnical(technical) {
    var t = String(technical || "").toLowerCase();
    if (!t.trim()) return GENERIC_MESSAGE;

    if (
      t.indexOf("failed to fetch") !== -1 ||
      t.indexOf("networkerror") !== -1 ||
      t.indexOf("load failed") !== -1 ||
      t.indexOf("network request failed") !== -1
    ) {
      return "We couldn’t reach the server. Check your internet connection and try again.";
    }
    if (t.indexOf("cors") !== -1 || t.indexOf("access-control-allow-origin") !== -1) {
      return "The browser blocked the connection to the chat service. If this keeps happening, contact your league admin.";
    }

    var MSG_LEAGUE_NOT_FOUND =
      "This league doesn’t exist or isn’t available from this link. Check the league ID or ask your organiser for the correct URL.";
    var MSG_PLAYER_NOT_FOUND =
      "We couldn’t find that player in this league. Check the spelling of their nickname.";
    var MSG_TEAM_NOT_FOUND =
      "We couldn’t find a team with those players in this league. Check both nicknames on the roster.";
    var MSG_MATCH_NOT_FOUND =
      "We couldn’t find a match between those teams. Check the four nicknames, or browse the full match list for this league.";
    var MSG_NOT_FOUND_FALLBACK =
      "We couldn’t find what you asked for. Double-check spelling and names, or try asking in another way.";

    // --- Not found: specific first (backend error field, then chat-server phrasing, then generic 404) ---

    if (t.indexOf("no match found for players") !== -1) {
      return MSG_MATCH_NOT_FOUND;
    }
    if (t.indexOf("matchnotfound") !== -1 || t.indexOf("match not found") !== -1) {
      return MSG_MATCH_NOT_FOUND;
    }

    if (t.indexOf("no team found with players") !== -1) {
      return MSG_TEAM_NOT_FOUND;
    }
    if (t.indexOf("teamnotfound") !== -1 || t.indexOf("team not found") !== -1) {
      return MSG_TEAM_NOT_FOUND;
    }

    if (
      t.indexOf("playernotfound") !== -1 ||
      t.indexOf("player not found") !== -1 ||
      t.indexOf("standings for player") !== -1 ||
      t.indexOf("match history for player") !== -1
    ) {
      return MSG_PLAYER_NOT_FOUND;
    }

    if (t.indexOf("leaguenotfound") !== -1 || t.indexOf("league not found") !== -1) {
      return MSG_LEAGUE_NOT_FOUND;
    }

    var is404 = /\b404\b/.test(t);
    if (
      is404 &&
      t.indexOf("could not fetch standings:") !== -1 &&
      t.indexOf("for player") === -1
    ) {
      return MSG_LEAGUE_NOT_FOUND;
    }
    if (
      is404 &&
      t.indexOf("could not fetch match history") !== -1 &&
      t.indexOf("for player") === -1
    ) {
      return MSG_LEAGUE_NOT_FOUND;
    }
    if (is404 && t.indexOf("could not fetch roster") !== -1) {
      return MSG_LEAGUE_NOT_FOUND;
    }

    // POST /matches when league rules use match_pair_idempotency once_per_league:
    // DuplicateTeamPairMatchError → 409 (body includes error + detail).
    if (
      t.indexOf("duplicateteampairmatcherror") !== -1 ||
      t.indexOf("a match between these two teams already exists") !== -1
    ) {
      return (
        "This league only allows one match per pair of teams, and those two teams already have a match. " +
        "Edit the existing result if you meant to change the score, or use different players if it was a new matchup."
      );
    }

    if (
      /\b404\b/.test(t) ||
      t.indexOf("not found") !== -1 ||
      t.indexOf("couldn't find") !== -1 ||
      t.indexOf("could not find") !== -1
    ) {
      return MSG_NOT_FOUND_FALLBACK;
    }
    if (
      /\b401\b/.test(t) ||
      /\b403\b/.test(t) ||
      t.indexOf("forbidden") !== -1 ||
      t.indexOf("unauthorized") !== -1 ||
      t.indexOf("not allowed") !== -1
    ) {
      return "You don’t have permission for that action. Admins should use the league link that includes the host token.";
    }
    if (/\b408\b/.test(t) || t.indexOf("timeout") !== -1 || t.indexOf("timed out") !== -1) {
      return "The request took too long. Please try again.";
    }
    if (/\b429\b/.test(t) || t.indexOf("rate limit") !== -1 || t.indexOf("too many requests") !== -1) {
      return "Too many requests right now. Wait a short while and try again.";
    }
    if (
      /\b502\b/.test(t) ||
      /\b503\b/.test(t) ||
      /\b504\b/.test(t) ||
      t.indexOf("bad gateway") !== -1 ||
      t.indexOf("service unavailable") !== -1 ||
      t.indexOf("internal server") !== -1 ||
      t.indexOf("gateway timeout") !== -1
    ) {
      return "The service is temporarily unavailable. Please try again in a little while.";
    }
    if (
      /\b400\b/.test(t) ||
      /\b422\b/.test(t) ||
      t.indexOf("invalid json") !== -1 ||
      t.indexOf("bad request") !== -1 ||
      t.indexOf("validation error") !== -1 ||
      t.indexOf("unprocessable") !== -1
    ) {
      return "We couldn’t process that request. Try rephrasing or check the details you entered.";
    }
    if (/\b5\d\d\b/.test(t)) {
      return "The service hit a problem. Please try again shortly.";
    }

    if (t.indexOf("backend returned status") !== -1 || t.indexOf("could not fetch") !== -1) {
      return "We couldn’t load that information right now. Try again in a moment, or ask for something else.";
    }
    if (t.indexOf("unexpected response") !== -1 || t.indexOf("chatapibaseurl") !== -1) {
      return "The chat service didn’t respond as expected. Check your setup or try again later.";
    }

    return GENERIC_MESSAGE;
  }

  global.TLCHAT_USER_FACING_ERRORS = {
    GENERIC_MESSAGE: GENERIC_MESSAGE,
    fromTechnical: fromTechnical,
  };
})(typeof window !== "undefined" ? window : this);
