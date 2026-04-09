(function () {
  "use strict";

  function backendBase() {
    var c = window.TLCHAT_CONFIG || {};
    var u = c.backendMainBaseUrl;
    if (!u || typeof u !== "string") {
      console.error("TLCHAT_CONFIG.backendMainBaseUrl missing; set in js/config.js");
      return "";
    }
    return u.replace(/\/$/, "");
  }

  function technicalFromResponse(status, bodyText) {
    var t = String(status || "") + " " + String(bodyText || "");
    try {
      var j = JSON.parse(bodyText);
      if (j && j.error) t += " " + String(j.error);
      if (j && j.detail !== undefined) t += " " + JSON.stringify(j.detail);
    } catch (_e) {
      /* ignore */
    }
    return t;
  }

  function userMessageFromResponse(status, bodyText) {
    var ufe = window.TLCHAT_USER_FACING_ERRORS;
    if (ufe && typeof ufe.fromTechnical === "function") {
      return ufe.fromTechnical(technicalFromResponse(status, bodyText));
    }
    return "Something went wrong. Please try again.";
  }

  function clampLimit(raw) {
    var n = parseInt(String(raw), 10);
    if (isNaN(n) || n < 1) return 50;
    return Math.min(n, 100);
  }

  function playerChatUrl(leagueId) {
    return "/league/?" + new URLSearchParams({ league_id: leagueId }).toString();
  }

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

  function appendLeagueCards(outlet, leagues) {
    clearOutlet(outlet);
    var list = document.createElement("div");
    list.className = "find-league-results find-league-prefix-results";
    list.setAttribute("role", "list");

    var chatIconSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    leagues.forEach(function (row) {
      if (!row || typeof row.league_id !== "string" || typeof row.title !== "string") return;

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
      a.setAttribute("aria-label", "Open player chat");
      a.setAttribute("title", "Chat");
      a.innerHTML = chatIconSvg;

      inner.appendChild(h3);
      inner.appendChild(a);
      card.appendChild(inner);
      list.appendChild(card);
    });

    outlet.appendChild(list);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var outlet = document.getElementById("find-league-prefix-outlet");
    if (!outlet) return;

    var params = new URLSearchParams(window.location.search);
    var prefix = (params.get("prefix") || "").trim();
    var limit = clampLimit(params.get("limit"));

    if (!prefix) {
      showMessage(
        outlet,
        "Add a search prefix to the URL, for example ?prefix=MTB",
        "find-league-prefix-message find-league-prefix-message-muted"
      );
      return;
    }

    var base = backendBase();
    if (!base) {
      showMessage(outlet, "Backend URL is not configured.", "find-league-prefix-message");
      return;
    }

    var q = new URLSearchParams({ title_prefix: prefix, limit: String(limit) });

    fetch(base + "/leagues?" + q.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.text().then(function (text) {
          return { res: res, text: text };
        });
      })
      .then(function (_ref) {
        var res = _ref.res;
        var text = _ref.text;
        if (res.ok) {
          var data;
          try {
            data = JSON.parse(text);
          } catch (parseErr) {
            showMessage(outlet, "Unexpected response from server.", "find-league-prefix-message");
            return;
          }
          var leagues = data && Array.isArray(data.leagues) ? data.leagues : null;
          if (!leagues) {
            showMessage(outlet, "Invalid response: missing leagues list.", "find-league-prefix-message");
            return;
          }
          if (leagues.length === 0) {
            clearOutlet(outlet);
            return;
          }
          appendLeagueCards(outlet, leagues);
          return;
        }
        showMessage(outlet, userMessageFromResponse(res.status, text), "find-league-prefix-message");
      })
      .catch(function (err) {
        var ufe = window.TLCHAT_USER_FACING_ERRORS;
        var msg =
          ufe && typeof ufe.fromTechnical === "function"
            ? ufe.fromTechnical(String(err && err.message ? err.message : err))
            : "We couldn’t reach the server.";
        showMessage(outlet, msg, "find-league-prefix-message");
      });
  });
})();
