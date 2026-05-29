(function () {
  "use strict";

  var api = window.TLCHAT_FIND_LEAGUE || {};
  var appendLeagueCards = api.appendLeagueCards;
  var backendBase = api.backendBase;
  var clampLimit = api.clampLimit;
  var clearOutlet = api.clearOutlet;
  var fetchLeaguesByPrefix = api.fetchLeaguesByPrefix;
  var showMessage = api.showMessage;
  var t = api.t;
  var userMessageFromError = api.userMessageFromError;
  var userMessageFromResponse = api.userMessageFromResponse;

  document.addEventListener("DOMContentLoaded", async function () {
    var outlet = document.getElementById("find-league-prefix-outlet");
    if (!outlet) return;

    var params = new URLSearchParams(window.location.search);
    var prefix = (params.get("prefix") || "").trim();
    var limit = clampLimit(params.get("limit"));

    if (!prefix) {
      showMessage(
        outlet,
        t("addPrefixHint"),
        "find-league-prefix-message find-league-prefix-message-muted"
      );
      return;
    }

    var base = backendBase();
    if (!base) {
      showMessage(outlet, t("backendNotConfigured"), "find-league-prefix-message");
      return;
    }

    try {
      var result = await fetchLeaguesByPrefix(base, prefix, limit);
      if (result.ok) {
        if (result.leagues.length === 0) {
          clearOutlet(outlet);
          return;
        }
        appendLeagueCards(outlet, result.leagues);
        return;
      }
      if (result.kind === "parse") {
        showMessage(outlet, t("unexpectedResponseShort"), "find-league-prefix-message");
      } else if (result.kind === "missing_leagues") {
        showMessage(outlet, t("invalidMissingLeagues"), "find-league-prefix-message");
      } else {
        showMessage(
          outlet,
          userMessageFromResponse(result.status, result.text),
          "find-league-prefix-message"
        );
      }
    } catch (err) {
      showMessage(outlet, userMessageFromError(err), "find-league-prefix-message");
    }
  });
})();
