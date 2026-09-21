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
    var format = ""; // Creation is independent of the card being edited.
    var editing = null; // {kind, id, format, element, saving}
    var slot = document.getElementById("plan-form-slot");
    var list = document.getElementById("plan-list");
    var savedList = document.getElementById("plan-server-list");
    var serverStatus = document.getElementById("plan-server-status");
    var upload = document.getElementById("plan-upload");
    var refresh = document.getElementById("plan-refresh");
    var manager = api.createPlanManager({ leagueId: route.leagueId,
      newId: function () { return window.crypto.randomUUID(); }, onChange: renderLists });

    function status(key, params) { document.getElementById("plan-status").textContent = key ? t(key, params) : ""; }
    function formError(host, message) {
      var node = host.querySelector("[data-plan-form-error]");
      if (node) { node.textContent = message || ""; node.hidden = !message; }
    }
    function sidesFromForm(host, selectedFormat) {
      var payload = chat.collectWriteForm(host, api.bodySpec(selectedFormat));
      return selectedFormat === "singles" ? [[payload.player1_nickname], [payload.player2_nickname]] : [payload.pair1_nicknames, payload.pair2_nicknames];
    }
    function updateWarning(host, selectedFormat) {
      var node = host.querySelector("[data-plan-roster-warning]");
      if (!node) return;
      var message = "";
      try { message = api.warningText(api.serialize(selectedFormat, sidesFromForm(host, selectedFormat)), roster); } catch (_e) {
        if (roster.status !== "ok" || !roster.rules || typeof roster.rules.auto_register_players_on_match !== "boolean") {
          message = t("registrationUnavailable");
        }
      }
      node.textContent = message;
      node.hidden = !message;
    }
    function sameId(first, second) { return first.toLowerCase() === second.toLowerCase(); }
    function editorCard(target) {
      var parent = target.kind === "saved" ? savedList : list;
      return Array.from(parent.querySelectorAll("[data-plan-id]")).find(function (card) {
        return sameId(card.getAttribute("data-plan-id"), target.id);
      });
    }
    function closeEditing(restoreFocus) {
      if (!editing) return;
      var previous = editing;
      editing = null;
      previous.element.remove();
      var card = editorCard(previous);
      var trigger = card && card.querySelector("[data-plan-edit], [data-saved-edit]");
      if (trigger) {
        trigger.setAttribute("aria-expanded", "false");
        trigger.removeAttribute("aria-controls");
        if (restoreFocus && !trigger.disabled) trigger.focus({ preventScroll: true });
      }
    }
    function syncEditor(state) {
      if (!editing) return;
      var busy = editing.saving || state.writing === "edit" || (editing.kind === "saved" && (!!state.writing || state.deleteNeedsRefresh));
      editing.element.querySelectorAll("input, select, button").forEach(function (control) { control.disabled = !!busy; });
      var label = t(editing.kind === "saved" ? "editingSaved" : "editingDraft");
      editing.element.setAttribute("aria-label", label);
      editing.element.querySelector("[data-plan-editor-context]").textContent = label;
      var submit = editing.element.querySelector('[type="submit"]');
      submit.textContent = t(editing.saving ? "saving" : "saveChanges");
      submit.setAttribute("aria-busy", String(!!editing.saving));
    }
    function renderLists(state) {
      if (disposed) return;
      var action = document.activeElement;
      var actionCard = action && action.closest("[data-plan-id]");
      var actionAttr = actionCard && ["data-plan-edit", "data-plan-remove", "data-saved-edit", "data-saved-delete"].find(function (attr) {
        return action.hasAttribute(attr);
      });
      var actionTarget = actionAttr && { id: actionCard.getAttribute("data-plan-id"), kind: savedList.contains(actionCard) ? "saved" : "draft" };
      var focused = editing && editing.element.contains(document.activeElement) ? document.activeElement : null;
      var selection = focused && typeof focused.selectionStart === "number" ? [focused.selectionStart, focused.selectionEnd] : null;
      // Preserve the editor DOM, its input values, validation, and autocomplete bindings.
      if (editing) editing.element.remove();
      list.innerHTML = api.renderList(state.drafts, roster, false, state.writing === "edit");
      savedList.innerHTML = state.loaded || state.saved.length ? api.renderList(state.saved, roster, true, !!state.writing || state.deleteNeedsRefresh) : "";
      savedList.setAttribute("aria-busy", String(state.writing === "delete"));
      if (editing) {
        if (editing.kind === "draft" && !state.drafts.some(function (record) { return sameId(record.id, editing.id); }) &&
            state.saved.some(function (record) { return sameId(record.id, editing.id); })) editing.kind = "saved";
        var card = editorCard(editing);
        if (card) {
          card.appendChild(editing.element);
          var trigger = card.querySelector("[data-plan-edit], [data-saved-edit]");
          trigger.setAttribute("aria-expanded", "true");
          trigger.setAttribute("aria-controls", editing.element.id);
        } else {
          closeEditing(false);
          status("planMissing");
        }
      }
      upload.textContent = state.writing === "upload" ? t("uploading") : t("upload", { count: state.drafts.length });
      upload.disabled = !!state.writing || state.deleteNeedsRefresh || !state.drafts.length;
      upload.setAttribute("aria-busy", String(state.writing === "upload"));
      refresh.disabled = state.loading || !!state.writing;
      refresh.setAttribute("aria-busy", String(state.loading));
      serverStatus.textContent = state.loading ? chat.tr("plannedLoading") : state.loadError ? chat.tr(state.loadError) :
        state.invalidCount ? chat.tr("plannedInvalidRows", { count: state.invalidCount }) : state.loaded ? "" : t("loadPrompt");
      syncEditor(state);
      if (focused && focused.isConnected && !focused.disabled) {
        focused.focus({ preventScroll: true });
        if (selection) focused.setSelectionRange(selection[0], selection[1]);
      } else if (actionTarget) {
        var replacementCard = editorCard(actionTarget);
        var replacement = replacementCard && replacementCard.querySelector("[" + actionAttr + "]");
        if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
      }
    }
    function focusNickname(host) {
      var input = host.querySelector("input");
      if (input) input.focus({ preventScroll: true });
    }
    function bindForm(host, target) {
      var selectedFormat = target ? target.format : format;
      autocomplete.bindActionCardAutocomplete(host);
      var form = host.querySelector("form");
      form.addEventListener("input", function () { formError(host, ""); updateWarning(host, selectedFormat); });
      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (disposed || (target && (editing !== target || target.saving || manager.view().writing === "edit" ||
            (target.kind === "saved" && manager.view().writing)))) return;
        var sides = sidesFromForm(host, selectedFormat);
        if (!sides[0].concat(sides[1]).every(names.isValid)) { formError(host, names.message()); return; }
        var value = api.serialize(selectedFormat, sides);
        var savedEdit = target && target.kind === "saved";
        if (target) target.saving = true;
        var result = savedEdit ? await manager.updateSaved({ id: target.id, value: value }) :
          manager.saveDraft(value, target && target.id);
        if (target) target.saving = false;
        if (disposed) return;
        if (!result.ok) {
          if (!target || editing === target) {
            formError(host, t(result.error));
            syncEditor(manager.view());
            if (target && document.activeElement === document.body) form.querySelector('[type="submit"]').focus({ preventScroll: true });
          }
          else status(result.error === "uploadUnconfirmed" ? "editUnconfirmed" : "saveFailed");
          return;
        }
        if (target) {
          // A dismissed request must never close a different editor opened later.
          if (editing === target) closeEditing(true);
        } else {
          renderCreation();
          focusNickname(slot);
        }
        status(target ? savedEdit ? "savedUpdated" : "updated" : "saved");
      });
      var cancel = host.querySelector("[data-plan-cancel]");
      if (cancel) cancel.addEventListener("click", function () { closeEditing(true); });
      updateWarning(host, selectedFormat);
    }
    function renderCreation() {
      root.querySelectorAll("[data-plan-format]").forEach(function (button) {
        var active = button.getAttribute("data-plan-format") === format;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      slot.innerHTML = api.renderForm(format);
      bindForm(slot, null);
    }
    function renderInlineForm(target, sides) {
      target.element.innerHTML = api.renderFormatChooser(target.format, true) + api.renderForm(target.format, sides, target.kind);
      target.element.querySelectorAll("[data-plan-edit-format]").forEach(function (button) {
        button.addEventListener("click", function () {
          var next = button.getAttribute("data-plan-edit-format");
          if (editing !== target || next === target.format || target.saving) return;
          target.format = next;
          renderInlineForm(target);
          focusNickname(target.element);
        });
      });
      bindForm(target.element, target);
      syncEditor(manager.view());
    }
    function startEditing(record, kind) {
      if (!api.isValidRecord(record)) return;
      closeEditing(false);
      var parsed = api.parseValue(record.value);
      var element = document.createElement("section");
      element.id = "plan-inline-editor";
      element.className = "plan-inline-editor";
      editing = { kind: kind, id: record.id, format: parsed.format, element: element, saving: false };
      var card = editorCard(editing);
      if (!card) { closeEditing(false); return; }
      card.appendChild(element);
      var trigger = card.querySelector("[data-plan-edit], [data-saved-edit]");
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("aria-controls", element.id);
      renderInlineForm(editing, parsed.sides);
      status("");
      focusNickname(element);
    }

    root.querySelectorAll("[data-plan-format]").forEach(function (button) {
      button.addEventListener("click", function () {
        var next = button.getAttribute("data-plan-format");
        if (next === format) return;
        format = next;
        renderCreation();
        status("");
        focusNickname(slot);
      });
    });
    list.addEventListener("click", function (event) {
      var edit = event.target.closest("[data-plan-edit]");
      var remove = event.target.closest("[data-plan-remove]");
      if ((!edit && !remove) || manager.view().writing === "edit") return;
      var index = Number((edit || remove).getAttribute(edit ? "data-plan-edit" : "data-plan-remove"));
      var record = manager.view().drafts[index];
      if (edit) startEditing(record, "draft");
      else {
        var result = manager.removeDraft(index, record);
        status(result.ok ? "removed" : result.error);
      }
    });
    savedList.addEventListener("click", async function (event) {
      var edit = event.target.closest("[data-saved-edit]");
      var remove = event.target.closest("[data-saved-delete]");
      if ((!edit && !remove) || manager.view().writing || manager.view().deleteNeedsRefresh) return;
      var index = Number((edit || remove).getAttribute(edit ? "data-saved-edit" : "data-saved-delete"));
      var record = manager.view().saved[index];
      if (edit) startEditing(record, "saved");
      else {
        status("deleting");
        var result = await manager.deleteSaved(record);
        if (!disposed) status(result.ok ? "deleted" : result.error);
      }
    });
    upload.addEventListener("click", async function () {
      if (manager.view().writing) return;
      status("uploading");
      var result = await manager.uploadDrafts();
      if (disposed) return;
      status(result.ok ? "uploaded" : result.error, result.ok ? { count: result.matches.length } : undefined);
    });
    refresh.addEventListener("click", function () { manager.loadSaved(); });
    function dismissOutside(event) {
      if (editing && !editing.element.contains(event.target)) closeEditing(false);
    }
    function dismissWithEscape(event) {
      if (editing && event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); closeEditing(true); }
    }
    document.addEventListener("click", dismissOutside, true);
    document.addEventListener("keydown", dismissWithEscape);

    disposePage = function () {
      disposed = true;
      document.removeEventListener("click", dismissOutside, true);
      document.removeEventListener("keydown", dismissWithEscape);
      closeEditing(false);
      manager.dispose();
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
      updateWarning(slot, format);
      if (editing) updateWarning(editing.element, editing.format);
      renderLists(manager.view());
    });
  }

  window.addEventListener("pagehide", function () { disposePage(); });
  window.addEventListener("pageshow", function (event) { if (event.persisted) boot(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
