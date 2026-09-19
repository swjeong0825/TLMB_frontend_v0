(function () {
  "use strict";
  var api = window.TLCHAT_PLAN;
  var chat = window.TLCHAT_CHAT;
  var names = window.TLCHAT_NICKNAMES;
  var t = api.t;

  function boot() {
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
    var theme = document.documentElement.getAttribute("data-theme") || "light";
    chat.applyTheme(theme);
    document.getElementById("theme-toggle-btn").addEventListener("click", function () {
      chat.applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
    });

    var store = api.createDraftStore(function () { return window.localStorage; }, chat.backendMainBase(), route.leagueId,
      function () { return window.crypto.randomUUID(); });
    var roster = { status: "loading", players: [], rules: null };
    var autocomplete = chat.createNicknameAutocomplete({ leagueRoster: roster });
    var format = "";
    var editingId = null;
    var snapshot = { ok: true, records: [] };
    var slot = document.getElementById("plan-form-slot");
    var list = document.getElementById("plan-list");
    var upload = document.getElementById("plan-upload");
    var storageError = document.getElementById("plan-storage-error");

    function status(key) { document.getElementById("plan-status").textContent = key ? t(key) : ""; }
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
    function renderSaved() {
      snapshot = store.read();
      storageError.textContent = snapshot.ok ? "" : t(snapshot.error);
      storageError.hidden = snapshot.ok;
      list.innerHTML = api.renderList(snapshot.records, roster);
      upload.textContent = t("upload", { count: snapshot.records.length });
      upload.disabled = !snapshot.ok || !snapshot.records.length;
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
      slot.innerHTML = api.renderForm(format, sides, !!editingId);
      autocomplete.bindActionCardAutocomplete(slot);
      var form = document.getElementById("plan-form");
      form.addEventListener("input", function () { formError(""); updateWarning(); });
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var sides = sidesFromForm();
        if (!sides[0].concat(sides[1]).every(names.isValid)) {
          formError(names.message());
          return;
        }
        var result = store.save(api.serialize(format, sides), editingId);
        if (!result.ok) { formError(t(result.error)); return; }
        var wasEditing = !!editingId;
        editingId = null;
        renderSaved();
        renderEditor();
        status(wasEditing ? "updated" : "saved");
        focusNickname();
      });
      var cancel = slot.querySelector("[data-plan-cancel]");
      if (cancel) cancel.addEventListener("click", function () {
        editingId = null;
        renderEditor();
        status("");
        focusNickname();
      });
      updateWarning();
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
      var record = snapshot.records[index];
      if (edit && api.isValidRecord(record)) {
        var parsed = api.parseValue(record.value);
        editingId = record.id;
        format = parsed.format;
        renderEditor(parsed.sides);
        status("");
        focusNickname();
      } else if (remove) {
        var result = store.remove(index, record);
        if (result.ok && record && record.id === editingId) { editingId = null; renderEditor(); }
        renderSaved();
        status(result.ok ? "removed" : result.error);
      }
    });
    upload.addEventListener("click", async function () {
      var state = store.read();
      if (!state.ok) { renderSaved(); return; }
      upload.disabled = true;
      try {
        var result = await api.uploadMatches(api.uploadPayload(state.records));
        status(result.error);
      } catch (_err) {
        status("invalidUpload");
      } finally { renderSaved(); }
    });
    window.addEventListener("storage", function (event) {
      if (event.key === store.key || event.key === null) renderSaved();
    });
    renderSaved();
    chat.fetchLeagueRoster(route.leagueId).then(function (result) {
      roster.status = result.ok ? "ok" : "error";
      roster.players = result.players || [];
      roster.rules = result.rules || null;
      if (result.ok && result.title) document.getElementById("chat-header-title").textContent = result.title;
    }).catch(function () { roster.status = "error"; }).finally(function () {
      updateWarning();
      renderSaved();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
