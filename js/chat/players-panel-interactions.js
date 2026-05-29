(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};
  var escapeHtml = api.escapeHtml;
  var fetchLeagueRoster = api.fetchLeagueRoster;
  var normalizeMatchNickname = api.normalizeMatchNickname;
  var panelTitleForDataType = api.panelTitleForDataType;
  var renderPlayersPanelBody = api.renderPlayersPanelBody;
  var renderReadPanelBody = api.renderReadPanelBody;
  var tr = api.tr;

  function createPlayersPanelController(ctx) {
    ctx = ctx || {};
    var route = ctx.route || {};
    var messagesEl = ctx.messagesEl || null;
    var appendAssistant = ctx.appendAssistant;
    var applyLeagueRosterResult = ctx.applyLeagueRosterResult;
    var addPlayersToRoster = ctx.addPlayersToRoster;

    function rosterStateFromResult(result) {
      return result && result.ok
        ? { players: result.players, pairs: result.pairs }
        : { players: [], pairs: [], error: true };
    }

    function rerenderPlayersPanels(state) {
      if (!messagesEl) return;
      var panels = messagesEl.querySelectorAll(".players-panel");
      if (!panels.length) return;
      panels.forEach(function (panel) {
        var isAdmin = panel.getAttribute("data-is-admin") === "1";
        var prevInput = panel.querySelector(".roster-admin-add-input");
        var savedValue = prevInput ? prevInput.value : "";
        var dataPanel = panel.parentNode;
        if (!dataPanel) return;
        dataPanel.innerHTML =
          "<h3>" +
          escapeHtml(panelTitleForDataType("GET_PLAYERS")) +
          "</h3>" +
          renderPlayersPanelBody(state, isAdmin);
        var freshPanel = dataPanel.querySelector(".players-panel");
        if (freshPanel) {
          var freshInput = freshPanel.querySelector(".roster-admin-add-input");
          if (freshInput && savedValue) {
            freshInput.value = savedValue;
            freshInput.dispatchEvent(new Event("input"));
          }
          bindPlayersPanelEvents(freshPanel, isAdmin);
        }
      });
    }

    function rerenderRosterReadPanels(state) {
      if (!messagesEl) return;
      var panels = messagesEl.querySelectorAll('.data-panel[data-read-type="GET_ROSTER"]');
      if (!panels.length) return;
      panels.forEach(function (dataPanel) {
        dataPanel.innerHTML = renderReadPanelBody("GET_ROSTER", state, !!route.hostToken);
      });
    }

    function refreshRosterSurfaces() {
      if (!messagesEl) return;
      fetchLeagueRoster(route.leagueId).then(function (result) {
        if (!result.ok) {
          console.warn("[TLCHAT] Roster surface refresh failed:", result);
          return;
        }
        applyLeagueRosterResult(result);
        var state = rosterStateFromResult(result);
        rerenderPlayersPanels(state);
        rerenderRosterReadPanels(state);
      });
    }

    function refreshAllPlayersPanels() {
      if (!messagesEl) return;
      var panels = messagesEl.querySelectorAll(".players-panel");
      if (!panels.length) return;
      fetchLeagueRoster(route.leagueId).then(function (result) {
        if (result.ok) applyLeagueRosterResult(result);
        rerenderPlayersPanels(rosterStateFromResult(result));
      });
    }

    function showPlayersPanelMessage(panel, text, isError) {
      var inlineMsg = panel && panel.querySelector(".roster-admin-inline-msg");
      if (!inlineMsg) return false;
      inlineMsg.textContent = text;
      inlineMsg.hidden = false;
      inlineMsg.className =
        "roster-admin-inline-msg" +
        (isError ? " roster-admin-msg-error" : " roster-admin-msg-ok");
      setTimeout(function () {
        inlineMsg.hidden = true;
      }, 4000);
      return true;
    }

    /**
     * Wires up search filter + Add button on a freshly rendered
     * `.players-panel` root. Per-row Remove buttons are intentionally
     * delegated by `roster-interactions.js`, so this module owns only
     * the panel-local input and add-button behavior.
     */
    function bindPlayersPanelEvents(panel, isAdmin) {
      if (!panel) return;

      function showMsg(text, isError) {
        showPlayersPanelMessage(panel, text, isError);
      }

      var addBtn = panel.querySelector(".roster-admin-add-btn");
      var addInput = panel.querySelector(".roster-admin-add-input");

      if (addInput) {
        var rosterListEl = panel.querySelector(".roster-admin-list");
        var noMatchesEl = panel.querySelector(".roster-admin-no-matches");
        var applyRosterFilter = function () {
          if (!rosterListEl) return;
          var raw = addInput.value || "";
          var lastToken = raw.split(",").pop();
          var query = normalizeMatchNickname(lastToken);
          var items = rosterListEl.querySelectorAll(".roster-admin-item");
          var anyVisible = false;
          items.forEach(function (li) {
            var nick = li.getAttribute("data-nick-norm") || "";
            var aliases = li.getAttribute("data-aliases-norm") || "";
            var visible =
              !query ||
              nick.indexOf(query) !== -1 ||
              aliases.indexOf(query) !== -1;
            li.hidden = !visible;
            if (visible) anyVisible = true;
          });
          if (noMatchesEl) {
            noMatchesEl.hidden = !(query && !anyVisible);
          }
        };
        addInput.addEventListener("input", applyRosterFilter);
      }

      if (isAdmin && addBtn && addInput) {
        addBtn.addEventListener("click", async function () {
          var raw = (addInput.value || "").trim();
          if (!raw) return;
          var nicknames = raw
            .split(",")
            .map(function (n) { return n.trim(); })
            .filter(Boolean);
          if (!nicknames.length) return;

          addBtn.disabled = true;
          addBtn.textContent = tr("playersPanelAddingButton") || "Adding\u2026";

          try {
            await addPlayersToRoster(nicknames);
            addInput.value = "";
            showMsg(tr("playersPanelAddSuccess") || "Added to roster.", false);
            refreshRosterSurfaces();
          } catch (e) {
            showMsg(
              e && e.message ? e.message : tr("playersPanelError") || "Could not update roster.",
              true
            );
            addBtn.disabled = false;
            addBtn.textContent = tr("playersPanelAddButton") || "Add";
          }
        });
      }
    }

    /**
     * Append a new "Get Players" panel as an assistant bubble. Renders
     * the loading state immediately, then re-renders with the loaded
     * roster (or an error state) when the fetch resolves.
     */
    function deliverPlayersPanel(opts) {
      var prefill = (opts && opts.prefillNicknames) || null;
      var isAdmin = !!route.hostToken;
      var initialHtml =
        '<div class="data-panel" data-read-type="GET_PLAYERS">' +
        "<h3>" +
        escapeHtml(panelTitleForDataType("GET_PLAYERS")) +
        "</h3>" +
        renderPlayersPanelBody({ loading: true }, isAdmin) +
        "</div>";
      var bubble = appendAssistant(initialHtml);
      var dataPanel = bubble.querySelector('.data-panel[data-read-type="GET_PLAYERS"]');
      fetchLeagueRoster(route.leagueId).then(function (result) {
        var state = result.ok
          ? { players: result.players, pairs: result.pairs }
          : { players: [], error: true };
        if (!dataPanel) return;
        dataPanel.innerHTML =
          "<h3>" +
          escapeHtml(panelTitleForDataType("GET_PLAYERS")) +
          "</h3>" +
          renderPlayersPanelBody(state, isAdmin);
        var freshPanel = dataPanel.querySelector(".players-panel");
        if (freshPanel) {
          bindPlayersPanelEvents(freshPanel, isAdmin);
          if (prefill && prefill.length && isAdmin) {
            var addInput = freshPanel.querySelector(".roster-admin-add-input");
            if (addInput) {
              addInput.value = prefill.join(", ");
              addInput.focus();
              addInput.dispatchEvent(new Event("input"));
            }
          }
        }
      });
    }

    function openPlayersPanelWithNicknames(nicknames) {
      deliverPlayersPanel({ prefillNicknames: nicknames || [] });
    }

    return {
      bindPlayersPanelEvents: bindPlayersPanelEvents,
      deliverPlayersPanel: deliverPlayersPanel,
      openPlayersPanelWithNicknames: openPlayersPanelWithNicknames,
      refreshAllPlayersPanels: refreshAllPlayersPanels,
      refreshRosterSurfaces: refreshRosterSurfaces,
      showPlayersPanelMessage: showPlayersPanelMessage,
    };
  }

  api.createPlayersPanelController = createPlayersPanelController;
})(typeof window !== "undefined" ? window : this);
