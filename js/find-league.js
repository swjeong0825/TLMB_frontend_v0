(function () {
  "use strict";

  function t(key, params) {
    var I = window.TLCHAT_I18N;
    if (!I || typeof I.t !== "function") return "";
    return I.t("findLeagueJs." + key, params);
  }

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
    return t("genericError") || "Something went wrong. Please try again.";
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
    var current = new URLSearchParams(window.location.search);
    ["backendApi", "chatApi", "lang"].forEach(function (key) {
      var value = current.get(key);
      if (value) params.set(key, value);
    });
    return "/find-league-prefix/?" + params.toString();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("find-league-form");
    var submitBtn = document.getElementById("find-league-submit");
    var prefixLinkBtn = document.getElementById("find-league-prefix-link");
    var errEl = document.getElementById("find-league-error");
    var wrapEl = document.getElementById("find-league-results-wrap");
    var summaryEl = document.getElementById("find-league-results-summary");
    var listEl = document.getElementById("find-league-results");
    if (!form || !submitBtn || !prefixLinkBtn || !errEl || !wrapEl || !summaryEl || !listEl) return;

    prefixLinkBtn.addEventListener("click", function () {
      setHidden(errEl, true);

      var prefix = (form.title_prefix.value || "").trim();
      if (!prefix) {
        errEl.textContent = t("enterPrefix");
        setHidden(errEl, false);
        form.title_prefix.focus();
        return;
      }

      var limit = clampLimit(form.limit.value);
      form.limit.value = String(limit);
      window.location.href = prefixPageUrl(prefix, limit);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      setHidden(errEl, true);
      setHidden(wrapEl, true);
      listEl.innerHTML = "";

      var base = backendBase();
      if (!base) {
        errEl.textContent = t("backendNotConfigured");
        setHidden(errEl, false);
        return;
      }

      var prefix = (form.title_prefix.value || "").trim();
      if (!prefix) {
        errEl.textContent = t("enterPrefix");
        setHidden(errEl, false);
        return;
      }

      var limit = clampLimit(form.limit.value);
      form.limit.value = String(limit);

      var params = new URLSearchParams({ title_prefix: prefix, limit: String(limit) });
      submitBtn.disabled = true;

      fetch(base + "/leagues?" + params.toString(), {
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
              errEl.textContent = t("unexpectedResponse");
              setHidden(errEl, false);
              return;
            }
            var leagues = data && Array.isArray(data.leagues) ? data.leagues : null;
            if (!leagues) {
              errEl.textContent = t("missingLeaguesList");
              setHidden(errEl, false);
              return;
            }

            summaryEl.textContent =
              leagues.length === 0
                ? t("noMatch")
                : leagues.length === 1
                  ? t("oneMatch")
                  : t("manyMatches", { n: leagues.length });

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
              a.setAttribute("aria-label", t("openPlayerChat"));
              a.setAttribute("title", t("chatTitle"));
              a.innerHTML = chatIconSvg;

              inner.appendChild(h3);
              inner.appendChild(a);
              card.appendChild(inner);
              listEl.appendChild(card);
            });

            setHidden(wrapEl, false);
            wrapEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
            return;
          }
          errEl.textContent = userMessageFromResponse(res.status, text);
          setHidden(errEl, false);
        })
        .catch(function (err) {
          var ufe = window.TLCHAT_USER_FACING_ERRORS;
          var msg =
            ufe && typeof ufe.fromTechnical === "function"
              ? ufe.fromTechnical(String(err && err.message ? err.message : err))
              : t("networkError");
          errEl.textContent = msg;
          setHidden(errEl, false);
        })
        .then(function () {
          submitBtn.disabled = false;
        });
    });
  });
})();
