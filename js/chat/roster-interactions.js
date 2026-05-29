(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};
  var createPlayersPanelController = api.createPlayersPanelController;
  var createRosterActionApi = api.createRosterActionApi;
  var escapeAttr = api.escapeAttr;
  var escapeHtml = api.escapeHtml;
  var friendlyMessageFromTechnicalError = api.friendlyMessageFromTechnicalError;
  var positionDisabledTip = api.positionDisabledTip;
  var tr = api.tr;

  function createRosterInteractionController(ctx) {
    ctx = ctx || {};
    var route = ctx.route || {};
    var root = ctx.root || null;
    var messagesEl = ctx.messagesEl || null;
    var appendAssistant = ctx.appendAssistant;
    var appendErrorPlain = ctx.appendErrorPlain;
    var applyLeagueRosterResult = ctx.applyLeagueRosterResult;

    var rosterActions = createRosterActionApi({ route: route });
    var playersPanel = createPlayersPanelController({
      route: route,
      messagesEl: messagesEl,
      appendAssistant: appendAssistant,
      applyLeagueRosterResult: applyLeagueRosterResult,
      addPlayersToRoster: rosterActions.addPlayers,
    });

    function showRosterWriteMessage(anchor, text, isError) {
      var panel = anchor && anchor.closest && anchor.closest(".players-panel");
      if (playersPanel.showPlayersPanelMessage(panel, text, isError)) return;
      if (isError) {
        appendErrorPlain(text);
        return;
      }
      appendAssistant(
        '<div class="response-callout response-callout-success"><strong>' +
          escapeHtml(tr("done") || "Done.") +
          "</strong> " +
          escapeHtml(text) +
          "</div>"
      );
    }

    async function removePlayerFromRoster(playerId, nickname, btn) {
      if (!playerId || !route.hostToken) return false;
      if (btn) {
        btn.disabled = true;
        btn.textContent = tr("playersPanelRemovingButton") || "Removing\u2026";
      }
      try {
        var ok = await rosterActions.removePlayer(playerId, nickname);
        if (ok) playersPanel.refreshRosterSurfaces();
        return ok;
      } catch (e) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = tr("rosterRemoveButton") || "Remove";
        }
        throw e;
      }
    }

    function toggleAliasAddForm(row, playerId, nickname) {
      if (!row || !playerId) return;
      var next = row.nextElementSibling;
      if (next && next.classList.contains("alias-add-form-row")) {
        next.parentNode.removeChild(next);
        return;
      }
      var scope = row.closest(".data-panel") || messagesEl;
      if (scope) {
        scope.querySelectorAll(".alias-add-form-row").forEach(function (el) {
          el.parentNode.removeChild(el);
        });
      }
      var formRow = document.createElement("li");
      formRow.className = "alias-add-form-row";
      formRow.innerHTML =
        '<form class="alias-add-form">' +
        '<input type="text" class="alias-add-input" placeholder="' +
        escapeAttr(
          tr("aliasAddInputPlaceholder", { name: nickname }) || "Alias nickname"
        ) +
        '" aria-label="' +
        escapeAttr(
          tr("aliasAddInputAria", { name: nickname }) || "Alias nickname"
        ) +
        '" />' +
        '<button type="submit" class="btn-secondary alias-add-submit">' +
        escapeHtml(tr("playersPanelAddButton") || "Add") +
        "</button>" +
        '<button type="button" class="btn-secondary alias-add-cancel">' +
        escapeHtml(tr("aliasAddCancel") || "Cancel") +
        "</button>" +
        '<div class="alias-add-inline-msg" hidden></div>' +
        "</form>";
      row.parentNode.insertBefore(formRow, row.nextSibling);
      var form = formRow.querySelector(".alias-add-form");
      var inputEl = formRow.querySelector(".alias-add-input");
      var submitBtn = formRow.querySelector(".alias-add-submit");
      var cancelBtn = formRow.querySelector(".alias-add-cancel");
      if (inputEl) inputEl.focus();
      if (cancelBtn) {
        cancelBtn.addEventListener("click", function () {
          if (formRow.parentNode) formRow.parentNode.removeChild(formRow);
        });
      }
      if (form) {
        form.addEventListener("submit", async function (ev) {
          ev.preventDefault();
          var alias = inputEl ? String(inputEl.value || "").trim() : "";
          if (!alias) return;
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = tr("aliasAddingButton") || "Adding\u2026";
          }
          try {
            await rosterActions.addAlias(playerId, alias);
            if (formRow.parentNode) formRow.parentNode.removeChild(formRow);
            showRosterWriteMessage(
              row,
              tr("aliasAddSuccess", { alias: alias, name: nickname }) || "Alias added.",
              false
            );
            playersPanel.refreshRosterSurfaces();
          } catch (err) {
            var msg =
              err && err.message
                ? err.message
                : friendlyMessageFromTechnicalError(String(err));
            var inline = formRow.querySelector(".alias-add-inline-msg");
            if (inline) {
              inline.textContent = msg;
              inline.hidden = false;
              inline.className = "alias-add-inline-msg roster-admin-msg-error";
            } else {
              showRosterWriteMessage(row, msg, true);
            }
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = tr("playersPanelAddButton") || "Add";
            }
          }
        });
      }
    }

    function bindRosterMessageActions() {
      if (!messagesEl || !messagesEl.addEventListener) return;
      messagesEl.addEventListener("click", async function (e) {
        var aliasAddBtn =
          e.target.closest && e.target.closest(".btn-alias-add:not(:disabled)");
        if (aliasAddBtn && messagesEl.contains(aliasAddBtn)) {
          var aliasRow = aliasAddBtn.closest(".roster-item, .roster-admin-item");
          toggleAliasAddForm(
            aliasRow,
            aliasAddBtn.getAttribute("data-player-id"),
            aliasAddBtn.getAttribute("data-player-nickname") || ""
          );
          return;
        }

        var aliasRemoveBtn =
          e.target.closest && e.target.closest(".btn-alias-remove:not(:disabled)");
        if (aliasRemoveBtn && messagesEl.contains(aliasRemoveBtn)) {
          var alias = aliasRemoveBtn.getAttribute("data-alias") || "";
          var playerIdForAlias = aliasRemoveBtn.getAttribute("data-player-id");
          var nicknameForAlias =
            aliasRemoveBtn.getAttribute("data-player-nickname") || "";
          if (!playerIdForAlias || !alias) return;
          var confirmText =
            tr("aliasRemoveConfirm", { alias: alias, name: nicknameForAlias }) ||
            "Remove this alias?";
          if (!window.confirm(confirmText)) return;
          aliasRemoveBtn.disabled = true;
          aliasRemoveBtn.textContent = "\u2026";
          try {
            await rosterActions.removeAlias(playerIdForAlias, alias);
            showRosterWriteMessage(
              aliasRemoveBtn,
              tr("aliasRemoveSuccess", { alias: alias, name: nicknameForAlias }) ||
                "Alias removed.",
              false
            );
            playersPanel.refreshRosterSurfaces();
          } catch (err) {
            aliasRemoveBtn.disabled = false;
            aliasRemoveBtn.textContent = "\u00D7";
            showRosterWriteMessage(
              aliasRemoveBtn,
              err && err.message
                ? err.message
                : friendlyMessageFromTechnicalError(String(err)),
              true
            );
          }
          return;
        }

        var btn = e.target.closest && e.target.closest(".btn-roster-remove:not(:disabled)");
        if (!btn || !messagesEl.contains(btn)) return;
        var playerId = btn.getAttribute("data-player-id");
        var nickname = btn.getAttribute("data-player-nickname") || "";
        if (!playerId) return;
        try {
          var ok = await removePlayerFromRoster(playerId, nickname, btn);
          if (ok) {
            appendAssistant(
              '<div class="response-callout response-callout-success"><strong>' +
                escapeHtml(tr("done") || "Done.") +
                "</strong> " +
                escapeHtml(tr("playersPanelRemoveSuccess") || "Removed from roster.") +
                "</div>"
            );
          }
        } catch (err) {
          appendErrorPlain(
            err && err.message ? err.message : friendlyMessageFromTechnicalError(String(err))
          );
        }
      });
    }

    function bindRosterDisabledTouchTooltips() {
      if (!root || !root.addEventListener) return;
      root.addEventListener(
        "touchstart",
        function (e) {
          var removeWrap =
            e.target.closest && e.target.closest(".roster-remove-wrap--disabled");
          var addWrap =
            e.target.closest && e.target.closest(".players-add-btn-wrap--disabled");
          var aliasAddWrap =
            e.target.closest && e.target.closest(".alias-add-wrap--disabled");
          var aliasRemoveWrap =
            e.target.closest && e.target.closest(".alias-remove-wrap--disabled");
          root.querySelectorAll(".roster-remove-wrap--tip-open").forEach(function (el) {
            if (el !== removeWrap) el.classList.remove("roster-remove-wrap--tip-open");
          });
          root.querySelectorAll(".players-add-btn-wrap--tip-open").forEach(function (el) {
            if (el !== addWrap) el.classList.remove("players-add-btn-wrap--tip-open");
          });
          root.querySelectorAll(".alias-add-wrap--tip-open").forEach(function (el) {
            if (el !== aliasAddWrap) el.classList.remove("alias-add-wrap--tip-open");
          });
          root.querySelectorAll(".alias-remove-wrap--tip-open").forEach(function (el) {
            if (el !== aliasRemoveWrap) el.classList.remove("alias-remove-wrap--tip-open");
          });
          if (removeWrap) {
            removeWrap.classList.add("roster-remove-wrap--tip-open");
            positionDisabledTip(removeWrap);
          }
          if (addWrap) {
            addWrap.classList.add("players-add-btn-wrap--tip-open");
          }
          if (aliasAddWrap) {
            aliasAddWrap.classList.add("alias-add-wrap--tip-open");
            positionDisabledTip(aliasAddWrap);
          }
          if (aliasRemoveWrap) {
            aliasRemoveWrap.classList.add("alias-remove-wrap--tip-open");
            positionDisabledTip(aliasRemoveWrap);
          }
        },
        { passive: true }
      );
    }

    return {
      bindPlayersPanelEvents: playersPanel.bindPlayersPanelEvents,
      bindRosterDisabledTouchTooltips: bindRosterDisabledTouchTooltips,
      bindRosterMessageActions: bindRosterMessageActions,
      deliverPlayersPanel: playersPanel.deliverPlayersPanel,
      openPlayersPanelWithNicknames: playersPanel.openPlayersPanelWithNicknames,
      refreshAllPlayersPanels: playersPanel.refreshAllPlayersPanels,
      refreshRosterSurfaces: playersPanel.refreshRosterSurfaces,
    };
  }

  api.createRosterInteractionController = createRosterInteractionController;
})(typeof window !== "undefined" ? window : this);
