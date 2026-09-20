(function () {
  "use strict";
  var api = window.TLCHAT_PLAN;
  var chat = window.TLCHAT_CHAT;
  var names = window.TLCHAT_NICKNAMES;
  var t = api.t;
  var disposePage = function () {};

  function boot() {
    disposePage();
    var params = new URLSearchParams(window.location.search);
    var route = { leagueId: params.get("league_id"), hostToken: params.get("host_token") };
    var root = document.getElementById("app-root");
    if (!route.leagueId) {
      root.innerHTML = '<main class="landing"><p>' + chat.escapeHtml(t("missingLeague")) + '</p><a href="/">' +
        chat.escapeHtml(window.TLCHAT_I18N.t("common.homeLink")) + '</a></main>';
      return;
    }
    root.innerHTML = api.renderShell(route, window.TLCHAT_NAVIGATION.leagueUrl("/league/", window.location.search, route.leagueId));
    window.TLCHAT_I18N.syncLocaleDropdown(root);
    chat.applyTheme(document.documentElement.getAttribute("data-theme") || "light");
    document.getElementById("theme-toggle-btn").addEventListener("click", function () {
      chat.applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
    });
    api.clearLegacyDrafts(function () { return window.localStorage; }, chat.backendMainBase(), route.leagueId);

    var disposed = false;
    var roster = { status: "loading", players: [], rules: null };
    var autocomplete = chat.createNicknameAutocomplete({ leagueRoster: roster });
    var format = "";
    var editing = null; // {kind: "draft" | "saved", id}
    var slot = document.getElementById("plan-form-slot");
    var list = document.getElementById("plan-list");
    var savedList = document.getElementById("plan-server-list");
    var serverStatus = document.getElementById("plan-server-status");
    var upload = document.getElementById("plan-upload");
    var refresh = document.getElementById("plan-refresh");
    var manager = api.createPlanManager({ leagueId: route.leagueId,
      newId: function () { return window.crypto.randomUUID(); }, onChange: renderLists });

    function status(key, params) { document.getElementById("plan-status").textContent = key ? t(key, params) : ""; }
    function formError(message) {
      var node = document.getElementById("plan-form-error");
      if (node) { node.textContent = message || ""; node.hidden = !message; }
    }
    function sidesFromForm() {
      var payload = chat.collectWriteForm(slot, api.bodySpec(format));
      return format === "singles" ? [[payload.player1_nickname], [payload.player2_nickname]] : [payload.pair1_nicknames, payload.pair2_nicknames];
    }
    function updateWarning() {
      var node = document.getElementById("plan-roster-warning");
      if (!node) return;
      var message = "";
      try { message = api.warningText(api.serialize(format, sidesFromForm()), roster); } catch (_e) {
        if (roster.status !== "ok" || !roster.rules || typeof roster.rules.auto_register_players_on_match !== "boolean") {
          message = t("registrationUnavailable");
        }
      }
      node.textContent = message;
      node.hidden = !message;
    }
    function syncEditor(state) {
      var busy = state.writing === "edit" || (editing && editing.kind === "saved" && !!state.writing);
      root.querySelectorAll("[data-plan-format]").forEach(function (button) { button.disabled = !!busy; });
      slot.querySelectorAll("input, select, button").forEach(function (control) { control.disabled = !!busy; });
      var context = document.getElementById("plan-editor-context");
      if (context) context.textContent = t(editing ? editing.kind === "saved" ? "editingSaved" : "editingDraft" : "editor");
      var submit = slot.querySelector('[type="submit"]');
      if (submit) {
        submit.textContent = t(state.writing === "edit" ? "saving" : editing ? "saveChanges" : "save");
        submit.setAttribute("aria-busy", String(state.writing === "edit"));
      }
    }
    function renderLists(state) {
      if (disposed) return;
      list.innerHTML = api.renderList(state.drafts, roster, false, state.writing === "edit");
      savedList.innerHTML = state.loaded || state.saved.length ? api.renderList(state.saved, roster, true, !!state.writing) : "";
      upload.textContent = state.writing === "upload" ? t("uploading") : t("upload", { count: state.drafts.length });
      upload.disabled = !!state.writing || !state.drafts.length;
      upload.setAttribute("aria-busy", String(state.writing === "upload"));
      refresh.disabled = state.loading || !!state.writing;
      refresh.setAttribute("aria-busy", String(state.loading));
      serverStatus.textContent = state.loading ? chat.tr("plannedLoading") : state.loadError ? chat.tr(state.loadError) :
        state.invalidCount ? chat.tr("plannedInvalidRows", { count: state.invalidCount }) : state.loaded ? "" : t("loadPrompt");
      syncEditor(state);
    }
    function focusNickname() {
      var input = slot.querySelector("input");
      if (input) input.focus();
    }
    function renderEditor(sides) {
      root.querySelectorAll("[data-plan-format]").forEach(function (button) {
        var active = button.getAttribute("data-plan-format") === format;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      slot.innerHTML = api.renderForm(format, sides, editing && editing.kind);
      autocomplete.bindActionCardAutocomplete(slot);
      var form = document.getElementById("plan-form");
      form.addEventListener("input", function () { formError(""); updateWarning(); });
      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (disposed || manager.view().writing === "edit" || (editing && editing.kind === "saved" && manager.view().writing)) return;
        var sides = sidesFromForm();
        if (!sides[0].concat(sides[1]).every(names.isValid)) { formError(names.message()); return; }
        var value = api.serialize(format, sides);
        var target = editing;
        var result = target && target.kind === "saved" ? await manager.updateSaved({ id: target.id, value: value }) :
          manager.saveDraft(value, target && target.id);
        if (disposed) return;
        if (!result.ok) { formError(t(result.error)); return; }
        editing = null;
        renderEditor();
        status(target ? target.kind === "saved" ? "savedUpdated" : "updated" : "saved");
        focusNickname();
      });
      var cancel = slot.querySelector("[data-plan-cancel]");
      if (cancel) cancel.addEventListener("click", function () {
        editing = null;
        renderEditor();
        status("");
        focusNickname();
      });
      syncEditor(manager.view());
      updateWarning();
    }
    function startEditing(record, kind) {
      if (!api.isValidRecord(record)) return;
      var parsed = api.parseValue(record.value);
      editing = { kind: kind, id: record.id };
      format = parsed.format;
      renderEditor(parsed.sides);
      status("");
      focusNickname();
    }

    root.querySelectorAll("[data-plan-format]").forEach(function (button) {
      button.addEventListener("click", function () {
        var next = button.getAttribute("data-plan-format");
        if (next === format) return;
        format = next;
        renderEditor();
        status("");
        focusNickname();
      });
    });
    list.addEventListener("click", function (event) {
      var edit = event.target.closest("[data-plan-edit]");
      var remove = event.target.closest("[data-plan-remove]");
      if (!edit && !remove) return;
      var index = Number((edit || remove).getAttribute(edit ? "data-plan-edit" : "data-plan-remove"));
      var record = manager.view().drafts[index];
      if (edit) startEditing(record, "draft");
      else {
        var result = manager.removeDraft(index, record);
        if (result.ok && editing && editing.kind === "draft" && record.id === editing.id) { editing = null; renderEditor(); }
        status(result.ok ? "removed" : result.error);
      }
    });
    savedList.addEventListener("click", async function (event) {
      var edit = event.target.closest("[data-saved-edit]");
      var remove = event.target.closest("[data-saved-delete]");
      if ((!edit && !remove) || manager.view().writing) return;
      var index = Number((edit || remove).getAttribute(edit ? "data-saved-edit" : "data-saved-delete"));
      var record = manager.view().saved[index];
      if (edit) startEditing(record, "saved");
      else {
        var note = remove.closest(".plan-item").querySelector(".plan-item-status");
        var result = await api.deleteMatch(route.leagueId, record);
        if (!disposed && note.isConnected) { note.textContent = t(result.error); note.hidden = false; }
      }
    });
    upload.addEventListener("click", async function () {
      if (manager.view().writing) return;
      status("uploading");
      var result = await manager.uploadDrafts();
      if (disposed) return;
      // An unfinished edit of a just-uploaded draft becomes an edit of that saved plan.
      if (result.ok && editing && editing.kind === "draft" &&
          !manager.view().drafts.some(function (record) { return record.id === editing.id; })) {
        editing.kind = "saved";
        syncEditor(manager.view());
      }
      status(result.ok ? "uploaded" : result.error, result.ok ? { count: result.matches.length } : undefined);
    });
    refresh.addEventListener("click", function () { manager.loadSaved(); });

    disposePage = function () {
      disposed = true;
      manager.dispose();
      editing = null;
      slot.innerHTML = "";
      list.innerHTML = "";
    };
    renderLists(manager.view());
    manager.loadSaved();
    chat.fetchLeagueRoster(route.leagueId).then(function (result) {
      if (disposed) return;
      roster.status = result.ok ? "ok" : "error";
      roster.players = result.players || [];
      roster.rules = result.rules || null;
      if (result.ok && result.title) document.getElementById("chat-header-title").textContent = result.title;
    }).catch(function () { if (!disposed) roster.status = "error"; }).finally(function () {
      if (disposed) return;
      updateWarning();
      renderLists(manager.view());
    });
  }

  window.addEventListener("pagehide", function () { disposePage(); });
  window.addEventListener("pageshow", function (event) { if (event.persisted) boot(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
