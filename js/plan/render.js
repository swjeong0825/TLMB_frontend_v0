(function (global) {
  "use strict";
  var api = global.TLCHAT_PLAN = global.TLCHAT_PLAN || {};
  var chat = global.TLCHAT_CHAT;
  var escape = chat.escapeHtml;

  function t(key, params) { return global.TLCHAT_I18N.t("plan." + key, params); }

  function bodySpec(format, sides) {
    sides = sides || [[], []];
    if (format === "singles") return {
      player1_nickname: { type: "string", required: true, value: sides[0][0] || "" },
      player2_nickname: { type: "string", required: true, value: sides[1][0] || "" },
    };
    return {
      pair1_nicknames: { type: "array[string]", required: true, value: sides[0] },
      pair2_nicknames: { type: "array[string]", required: true, value: sides[1] },
    };
  }

  function warningText(value, roster) {
    var warning = api.registrationWarning(value, roster);
    if (warning.kind === "unregistered") return t("unregistered", { names: warning.names.join(", ") });
    if (warning.kind === "unavailable") return t("registrationUnavailable");
    return "";
  }

  function renderShell(route, backUrl) {
    return chat.renderHeader(route, t("title")) +
      '<main class="plan-main"><a class="plan-back" href="' + chat.escapeAttr(backUrl) + '">' +
      escape(t("back")) + '</a><h2>' + escape(t("title")) + '</h2>' +
      '<p class="hint">' + escape(t("intro")) + '</p>' +
      '<p class="plan-error" id="plan-storage-error" role="alert" hidden></p>' +
      '<section class="plan-editor" aria-label="' + chat.escapeAttr(t("editor")) + '">' +
      '<div class="match-format-options" role="group" aria-label="' + chat.escapeAttr(chat.tr("matchFormatChooserLabel")) + '">' +
      ["doubles", "singles"].map(function (format) {
        return '<button type="button" class="btn-secondary match-format-option" data-plan-format="' + format +
          '" aria-pressed="false">' + escape(t(format)) + '</button>';
      }).join("") + '</div><div id="plan-form-slot"><p class="hint">' + escape(t("chooseFormat")) + '</p></div></section>' +
      '<p id="plan-status" role="status" class="hint"></p>' +
      '<section class="plan-saved" aria-labelledby="plan-list-title"><div class="plan-list-heading">' +
      '<h2 id="plan-list-title">' + escape(t("savedPlans")) + '</h2>' +
      '<button class="btn-secondary" type="button" id="plan-upload" disabled>' + escape(t("upload", { count: 0 })) +
      '</button></div><div id="plan-list"></div></section></main>';
  }

  function renderForm(format, sides, editing) {
    return '<form id="plan-form">' + chat.renderWriteForm(bodySpec(format, sides)) +
      '<p class="hint">' + escape(global.TLCHAT_NICKNAMES.message()) + '</p>' +
      '<p class="plan-warning" id="plan-roster-warning" role="status" hidden></p>' +
      '<p class="plan-error" id="plan-form-error" role="alert" hidden></p>' +
      '<div class="plan-form-actions"><button class="btn-secondary" type="submit">' + escape(t(editing ? "saveChanges" : "save")) + '</button>' +
      (editing ? '<button class="btn-secondary" type="button" data-plan-cancel>' + escape(t("cancel")) + '</button>' : "") +
      '</div></form>';
  }

  function renderList(records, roster) {
    if (!records.length) return '<p class="hint">' + escape(t("empty")) + '</p>';
    return '<ol class="plan-list">' + records.map(function (record, index) {
      var valid = api.isValidRecord(record);
      var parsed = valid && api.parseValue(record.value);
      var warning = valid ? warningText(record.value, roster) : "";
      return '<li class="plan-item"><div class="plan-item-info">' +
        (valid ? '<span class="plan-format">' + escape(t(parsed.format)) + '</span>' +
          '<p class="plan-matchup">' + escape(parsed.sides[0].join(" + ")) +
          ' <span class="hint">' + escape(chat.tr("vs")) + '</span> ' + escape(parsed.sides[1].join(" + ")) + '</p>' :
          '<p class="plan-error">' + escape(t("invalidPlan")) + '</p>') +
        (warning ? '<p class="plan-warning">' + escape(warning) + '</p>' : "") + '</div>' +
        '<div class="plan-item-actions">' + (valid ? '<button type="button" class="btn-secondary" data-plan-edit="' + index + '">' + escape(t("edit")) + '</button>' : "") +
        '<button type="button" class="btn-secondary" data-plan-remove="' + index + '">' + escape(t("remove")) + '</button></div></li>';
    }).join("") + '</ol>';
  }

  api.t = t;
  api.bodySpec = bodySpec;
  api.warningText = warningText;
  api.renderShell = renderShell;
  api.renderForm = renderForm;
  api.renderList = renderList;
})(typeof window !== "undefined" ? window : this);
