(function (global) {
  "use strict";

  var api = global.TLCHAT_FIND_LEAGUE = global.TLCHAT_FIND_LEAGUE || {};
  var playerChatUrl = api.playerChatUrl;
  var t = api.t;

  var CHAT_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  function clearOutlet(outlet) {
    while (outlet.firstChild) outlet.removeChild(outlet.firstChild);
  }

  function showMessage(outlet, text, className) {
    clearOutlet(outlet);
    var p = document.createElement("p");
    p.className = className || "find-league-prefix-message";
    p.textContent = text;
    outlet.appendChild(p);
  }

  function createLeagueCard(row) {
    if (!row || typeof row.league_id !== "string" || typeof row.title !== "string") {
      return null;
    }

    var card = document.createElement("article");
    card.className = "find-league-card find-league-card--prefix";
    card.setAttribute("role", "listitem");

    var inner = document.createElement("div");
    inner.className = "find-league-card-row";

    var h3 = document.createElement("h3");
    h3.className = "find-league-card-title";
    h3.textContent = row.title;

    var a = document.createElement("a");
    a.className = "find-league-card-icon-link";
    a.href = playerChatUrl(row.league_id);
    a.setAttribute("aria-label", t("openPlayerChat"));
    a.setAttribute("title", t("chatTitle"));
    a.innerHTML = CHAT_ICON_SVG;

    inner.appendChild(h3);
    inner.appendChild(a);
    card.appendChild(inner);
    return card;
  }

  function appendLeagueCards(outlet, leagues) {
    clearOutlet(outlet);
    var list = document.createElement("div");
    list.className = "find-league-results find-league-prefix-results";
    list.setAttribute("role", "list");

    leagues.forEach(function (row) {
      var card = createLeagueCard(row);
      if (card) list.appendChild(card);
    });

    outlet.appendChild(list);
  }

  function renderLeagueCardsIntoList(listEl, leagues) {
    clearOutlet(listEl);
    leagues.forEach(function (row) {
      var card = createLeagueCard(row);
      if (card) listEl.appendChild(card);
    });
  }

  function resultSummary(leagues) {
    if (leagues.length === 0) return t("noMatch");
    if (leagues.length === 1) return t("oneMatch");
    return t("manyMatches", { n: leagues.length });
  }

  api.clearOutlet = clearOutlet;
  api.showMessage = showMessage;
  api.createLeagueCard = createLeagueCard;
  api.appendLeagueCards = appendLeagueCards;
  api.renderLeagueCardsIntoList = renderLeagueCardsIntoList;
  api.resultSummary = resultSummary;
})(typeof window !== "undefined" ? window : this);
