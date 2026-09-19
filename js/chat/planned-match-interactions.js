(function (global) {
  "use strict";
  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};
  var plans = global.TLCHAT_PLAN;
  function tr(key, params) { return api.tr(key, params); }
  function esc(value) { return api.escapeHtml(value); }

  function renderPlannedScoreList(records, drafts) {
    if (!records.length) return '<p class="hint">' + esc(tr("plannedEmpty")) + '</p>';
    return '<ul class="planned-score-list" role="list">' + records.map(function (record, index) {
      var parsed = plans.parseValue(record.value);
      var draft = drafts[record.id];
      var scores = draft && draft.value === record.value ? draft.scores : ["", ""];
      var label = parsed.sides.map(function (side) { return side.join(" + "); }).join(" " + tr("vs") + " ");
      return '<li><form class="planned-score-row" data-planned-score-index="' + index + '" aria-label="' +
        api.escapeAttr(label) + '"><span class="planned-score-format">' +
        esc(tr(parsed.format === "singles" ? "matchFormatSingles" : "matchFormatDoubles")) + '</span>' +
        '<div class="planned-score-sides">' + parsed.sides.map(function (side, sideIndex) {
          return '<label><span class="planned-score-team">' + esc(side.join(" + ")) + '</span>' +
            '<span class="hint">' + esc(tr("plannedSideScore", { side: sideIndex + 1 })) + '</span>' +
            api.renderScorePicker("side" + (sideIndex + 1) + "_score", scores[sideIndex]) + '</label>';
        }).join('') + '</div><button type="submit" class="btn-secondary">' + esc(tr("plannedRecordButton")) + '</button>' +
        '<p class="hint planned-row-status" role="status" hidden></p></form></li>';
    }).join('') + '</ul>';
  }

  function mountPlannedMatchResults(container, route) {
    container.innerHTML = '<section class="planned-results" aria-label="' + api.escapeAttr(tr("plannedTitle")) + '">' +
      '<div class="planned-results-heading"><h3>' + esc(tr("plannedTitle")) + '</h3>' +
      '<button type="button" class="btn-secondary" data-planned-refresh>' + esc(tr("plannedRefresh")) + '</button></div>' +
      '<p class="hint">' + esc(tr("plannedStubHint")) + '</p>' +
      '<p class="hint" data-planned-status role="status"></p><div data-planned-list></div></section>';
    var section = container.querySelector(".planned-results");
    var refresh = section.querySelector("[data-planned-refresh]");
    var status = section.querySelector("[data-planned-status]");
    var list = section.querySelector("[data-planned-list]");
    var records = [];
    var drafts = Object.create(null);
    var loading = false;

    function rememberScores() {
      list.querySelectorAll("[data-planned-score-index]").forEach(function (form) {
        var record = records[Number(form.getAttribute("data-planned-score-index"))];
        if (record) drafts[record.id] = { value: record.value, scores: [
          form.querySelector('[data-field="side1_score"]').value,
          form.querySelector('[data-field="side2_score"]').value,
        ] };
      });
    }

    async function load() {
      if (loading) return;
      loading = true;
      refresh.disabled = true;
      section.setAttribute("aria-busy", "true");
      status.textContent = tr("plannedLoading");
      var result;
      try { result = await plans.loadMatches(route.leagueId); }
      catch (_err) { result = { ok: false, error: "plannedLoadFailed" }; }
      loading = false;
      // Navigating away or switching to manual entry must not resurrect this panel.
      if (!section.isConnected) return;
      refresh.disabled = false;
      section.setAttribute("aria-busy", "false");
      if (!result.ok) { status.textContent = tr(result.error); return; }
      rememberScores();
      records = result.matches;
      var retained = Object.create(null);
      records.forEach(function (record) {
        if (drafts[record.id] && drafts[record.id].value === record.value) retained[record.id] = drafts[record.id];
      });
      drafts = retained;
      list.innerHTML = renderPlannedScoreList(records, drafts);
      status.textContent = result.invalidCount ? tr("plannedInvalidRows", { count: result.invalidCount }) : "";
    }

    refresh.addEventListener("click", load);
    list.addEventListener("submit", async function (event) {
      var form = event.target.closest("[data-planned-score-index]");
      if (!form) return;
      event.preventDefault();
      var record = records[Number(form.getAttribute("data-planned-score-index"))];
      var result = await plans.recordMatch(route.leagueId, record,
        form.querySelector('[data-field="side1_score"]').value,
        form.querySelector('[data-field="side2_score"]').value);
      var note = form.querySelector(".planned-row-status");
      note.textContent = tr(result.error);
      note.hidden = false;
    });
    list.addEventListener("change", function (event) {
      var form = event.target.closest("[data-planned-score-index]");
      if (form) form.querySelector(".planned-row-status").hidden = true;
    });
    load();
  }

  api.renderPlannedScoreList = renderPlannedScoreList;
  api.mountPlannedMatchResults = mountPlannedMatchResults;
})(typeof window !== "undefined" ? window : this);
