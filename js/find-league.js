(function () {
  "use strict";

  var api = window.TLCHAT_FIND_LEAGUE || {};
  var backendBase = api.backendBase;
  var clampLimit = api.clampLimit;
  var fetchLeaguesByPrefix = api.fetchLeaguesByPrefix;
  var prefixPageUrl = api.prefixPageUrl;
  var renderLeagueCardsIntoList = api.renderLeagueCardsIntoList;
  var resultSummary = api.resultSummary;
  var setHidden = api.setHidden;
  var t = api.t;
  var userMessageFromError = api.userMessageFromError;
  var userMessageFromResponse = api.userMessageFromResponse;

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

    form.addEventListener("submit", async function (e) {
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

      submitBtn.disabled = true;
      try {
        var result = await fetchLeaguesByPrefix(base, prefix, limit);
        if (result.ok) {
          summaryEl.textContent = resultSummary(result.leagues);
          renderLeagueCardsIntoList(listEl, result.leagues);
          setHidden(wrapEl, false);
          wrapEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return;
        }
        if (result.kind === "parse") {
          errEl.textContent = t("unexpectedResponse");
        } else if (result.kind === "missing_leagues") {
          errEl.textContent = t("missingLeaguesList");
        } else {
          errEl.textContent = userMessageFromResponse(result.status, result.text);
        }
        setHidden(errEl, false);
      } catch (err) {
        errEl.textContent = userMessageFromError(err);
        setHidden(errEl, false);
      } finally {
        submitBtn.disabled = false;
      }
    });
  });
})();
