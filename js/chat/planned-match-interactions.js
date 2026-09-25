(function (global) {
  "use strict";
  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};
  var plans = global.TLCHAT_PLAN;
  function tr(key, params) { return api.tr(key, params); }
  function esc(value) { return api.escapeHtml(value); }
  function errorText(error) {
    if (!error) return "";
    var text = tr(error.error);
    if (error.missing && error.missing.length) text += " " + error.missing.join(", ");
    else if (error.detail) text += " " + error.detail;
    return text;
  }

  function renderPlannedScoreList(records, drafts, query) {
    if (!records.length) return '<p class="hint">' + esc(tr("plannedEmpty")) + '</p>';
    var nickname = api.normalizeMatchNickname(query);
    if (nickname) records = records.filter(function (record) {
      var sides = plans.parseValue(record.value).sides;
      return sides[0].concat(sides[1]).some(function (name) {
        return api.normalizeMatchNickname(name).indexOf(nickname) !== -1;
      });
    });
    if (!records.length) return '<p class="hint" role="status">' + esc(tr("plannedNoMatches")) + '</p>';
    return '<ul class="planned-score-list" role="list">' + records.map(function (record, index) {
      var parsed = plans.parseValue(record.value);
      var draft = drafts[record.id];
      var scores = draft && draft.value === record.value ? draft.scores : ["", ""];
      var recorded = !!(draft && draft.value === record.value && draft.recorded);
      var label = parsed.sides.map(function (side) { return side.join(" + "); }).join(" " + tr("vs") + " ");
      return '<li><form class="planned-score-row' + (recorded ? ' is-recorded' : '') + '" data-planned-recorded="' +
        recorded + '" data-planned-score-index="' + index + '" aria-label="' +
        api.escapeAttr(label) + '" data-planned-id="' + api.escapeAttr(record.id) + '" aria-busy="' +
        !!(draft && draft.pending) + '"><span class="planned-score-format">' +
        esc(tr(parsed.format === "singles" ? "matchFormatSingles" : "matchFormatDoubles")) + '</span>' +
        '<div class="planned-score-sides">' + parsed.sides.map(function (side, sideIndex) {
          var tag = recorded ? 'div' : 'label';
          return '<' + tag + ' class="planned-score-side"><span class="planned-score-team">' + esc(side.join(" + ")) + '</span>' +
            '<span class="hint">' + esc(tr("plannedSideScore", { side: sideIndex + 1 })) + '</span>' +
            (recorded ? '<span class="planned-score-value">' + esc(scores[sideIndex]) + '</span>' :
              api.renderScorePicker("side" + (sideIndex + 1) + "_score", scores[sideIndex])
                .replace('<select ', '<select ' + (draft && draft.pending ? 'disabled ' : ''))) + '</' + tag + '>';
        }).join('') + '</div><button type="' + (recorded ? 'button' : 'submit') + '" class="btn-secondary"' +
        (recorded || draft && draft.disabled ? ' disabled' : '') + '>' +
        esc(tr(recorded ? "plannedRecordedButton" : draft && draft.pending ? "plannedRecording" : draft && draft.error && draft.error.unconfirmed ?
          "plannedRetry" : "plannedRecordButton")) + '</button>' +
        '<p class="hint planned-row-status" role="status"' + (draft && draft.error ? '' : ' hidden') + '>' +
        esc(errorText(draft && draft.error)) + '</p></form></li>';
    }).join('') + '</ul>';
  }

  function mountPlannedMatchResults(container, route, session) {
    container.innerHTML = '<section class="planned-results" aria-label="' + api.escapeAttr(tr("plannedTitle")) + '">' +
      '<div class="planned-results-heading"><h3>' + esc(tr("plannedTitle")) + '</h3>' +
      '<button type="button" class="btn-secondary" data-planned-refresh>' + esc(tr("plannedRefresh")) + '</button></div>' +
      '<p class="hint">' + esc(tr("plannedRecordHint")) + '</p>' +
      '<label class="planned-player-filter"><span>' + esc(tr("plannedSearchLabel")) + '</span>' +
      '<input type="search" data-planned-search placeholder="' + api.escapeAttr(tr("plannedSearchPlaceholder")) +
      '" autocomplete="off"></label>' +
      '<p class="hint" data-planned-notice role="status" hidden></p>' +
      '<p class="hint" data-planned-status role="status"></p><div data-planned-list></div></section>';
    var section = container.querySelector(".planned-results");
    var refresh = section.querySelector("[data-planned-refresh]");
    var status = section.querySelector("[data-planned-status]");
    var list = section.querySelector("[data-planned-list]");
    var notice = section.querySelector("[data-planned-notice]");
    var search = section.querySelector("[data-planned-search]");

    function renderList(state) {
      list.innerHTML = renderPlannedScoreList(state.records, state.drafts, search.value);
    }

    session.subscribe(function (state) {
      // A pending request belongs to the page session, never to a detached form.
      if (!section.isConnected) return false;
      var focused = list.contains(document.activeElement) ? document.activeElement : null;
      var focusedForm = focused && focused.closest("[data-planned-id]");
      var focusedId = focusedForm && focusedForm.getAttribute("data-planned-id");
      var field = focused && focused.getAttribute("data-field");
      refresh.disabled = state.loading;
      section.setAttribute("aria-busy", String(state.loading));
      status.textContent = state.loading ? tr("plannedLoading") : state.loadError ? tr(state.loadError) :
        state.invalidCount ? tr("plannedInvalidRows", { count: state.invalidCount }) : "";
      notice.hidden = !state.notice;
      if (state.notice) {
        var item = state.notice;
        var sides = plans.parseValue(item.record.value).sides;
        notice.textContent = sides[0].join(" + ") + " " + item.scores[0] + " : " + item.scores[1] + " " +
          sides[1].join(" + ") + " — " + tr(item.key);
      }
      renderList(state);
      if (focusedId) {
        var newForm = Array.from(list.querySelectorAll("[data-planned-id]")).find(function (form) {
          return form.getAttribute("data-planned-id") === focusedId;
        });
        var target = newForm && newForm.querySelector(field ? '[data-field="' + field + '"]' : '[type="submit"]');
        if (target && !target.disabled) target.focus({ preventScroll: true });
        else if (!newForm) refresh.focus({ preventScroll: true });
      }
    });

    search.addEventListener("input", function () { renderList(session.view()); });
    refresh.addEventListener("click", function () { session.refresh(); });
    list.addEventListener("submit", function (event) {
      var form = event.target.closest("[data-planned-id]");
      if (!form) return;
      event.preventDefault();
      if (form.getAttribute("data-planned-recorded") === "true") return;
      session.submit(form.getAttribute("data-planned-id"),
        form.querySelector('[data-field="side1_score"]').value,
        form.querySelector('[data-field="side2_score"]').value);
    });
    list.addEventListener("change", function (event) {
      var form = event.target.closest("[data-planned-id]");
      if (form && form.getAttribute("data-planned-recorded") !== "true") session.setScores(form.getAttribute("data-planned-id"),
        form.querySelector('[data-field="side1_score"]').value,
        form.querySelector('[data-field="side2_score"]').value);
    });
    session.refresh();
  }

  api.renderPlannedScoreList = renderPlannedScoreList;
  api.mountPlannedMatchResults = mountPlannedMatchResults;
})(typeof window !== "undefined" ? window : this);
