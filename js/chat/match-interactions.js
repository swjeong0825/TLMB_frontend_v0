(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};
  var escapeHtml = api.escapeHtml;
  var escapeAttr = api.escapeAttr;
  var tr = api.tr;
  var needsHostTokenForUrl = api.needsHostTokenForUrl;
  var backendMainBase = api.backendMainBase;
  var renderEditMatchScorePicker = api.renderEditMatchScorePicker;
  var renderWriteForm = api.renderWriteForm;
  var cssEscapeAttrValue = api.cssEscapeAttrValue;
  var positionDisabledTip = api.positionDisabledTip;

  function createMatchInteractionController(ctx) {
    ctx = ctx || {};
    var route = ctx.route || {};
    var appendAssistant = ctx.appendAssistant;
    var submitBackendAction = ctx.submitBackendAction;
    var bindActionCardAutocomplete = ctx.bindActionCardAutocomplete;

    var deleteConfirmModalEl = null;
    var deleteConfirmPending = null;

    function toggleEditMatchScoreForm(panel, matchId, match, url, method, bodySchema, colspan) {
      var existing = panel.querySelector(".match-picker-edit-row[data-edit-row-id]");
      if (existing) {
        var existingId = existing.getAttribute("data-edit-row-id");
        existing.parentNode.removeChild(existing);
        if (existingId === matchId) return;
      }
      if (!match) return;
      var anchor = panel.querySelector(
        '[data-match-row-id="' + cssEscapeAttrValue(matchId) + '"]'
      );
      if (!anchor) return;

      var initialValues = {
        team1_score: match.team1_score == null ? "" : String(match.team1_score),
        team2_score: match.team2_score == null ? "" : String(match.team2_score),
      };
      var bodySpec = {};
      Object.keys(bodySchema || {}).forEach(function (key) {
        var meta = bodySchema[key] || {};
        bodySpec[key] = {
          type: meta.type || "string",
          required: !!meta.required,
          value: Object.prototype.hasOwnProperty.call(initialValues, key)
            ? initialValues[key]
            : "",
        };
      });

      var cs = typeof colspan === "number" && colspan > 0 ? colspan : 4;
      var formRow = document.createElement("tr");
      formRow.className = "match-picker-edit-row";
      formRow.setAttribute("data-edit-row-id", matchId);
      formRow.innerHTML =
        '<td colspan="' + cs + '">' +
        '<div class="action-card match-picker-edit-card">' +
        renderWriteForm(bodySpec) +
        '<button type="button" class="btn-secondary" data-submit-write>' +
        escapeHtml(tr("submitToLeague") || "Submit to league API") +
        "</button>" +
        "</div>" +
        "</td>";
      anchor.parentNode.insertBefore(formRow, anchor.nextSibling);

      var card = formRow.querySelector(".match-picker-edit-card");
      var submitBtn = card.querySelector("[data-submit-write]");
      submitBtn.addEventListener("click", function () {
        submitBackendAction(card, method, url, bodySpec);
      });
      bindActionCardAutocomplete(card);
    }

    function renderEditMatchScorePickerMessage(resp) {
      var d = resp.data || {};
      var matches = Array.isArray(d.matches) ? d.matches : [];
      var matchById = {};
      matches.forEach(function (m) {
        if (m && m.match_id) matchById[String(m.match_id)] = m;
      });
      var urlTemplate = d.url_template || "";
      var method = d.method || "PATCH";
      var bodySchema = (d.body_schema && typeof d.body_schema === "object") ? d.body_schema : {};

      var parts = [];
      if (resp.server_message && resp.server_message.trim()) {
        parts.push(
          '<div class="server-message">' +
            escapeHtml(resp.server_message.trim()) +
            "</div>"
        );
      }
      if (needsHostTokenForUrl(urlTemplate) && !route.hostToken) {
        parts.push(
          '<p class="hint" style="color:var(--warn)">' +
            (tr("adminUrlWarn") ||
              "This write targets an admin endpoint. Use the Admin URL with <code>X-Host-Token</code>.") +
            "</p>"
        );
      }
      parts.push(renderEditMatchScorePicker(d));

      var wrap = appendAssistant(parts.join(""));
      var panel = wrap.querySelector(".match-picker");
      if (!panel) return;

      panel.querySelectorAll("[data-edit-match-id]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-edit-match-id");
          var url = urlTemplate.replace(
            "{match_id}",
            encodeURIComponent(String(id))
          );
          toggleEditMatchScoreForm(
            panel,
            id,
            matchById[id],
            url,
            method,
            bodySchema,
            4
          );
        });
      });
    }

    var DEFAULT_EDIT_MATCH_SCORE_BODY_SCHEMA = {
      team1_score: { type: "string", required: true },
      team2_score: { type: "string", required: true },
    };

    function bindMatchRowUpdateButtons(wrap) {
      if (!wrap) return;
      var panel = wrap.querySelector(".data-panel") || wrap;
      var btns = panel.querySelectorAll(".btn-match-update[data-update-match-id]");
      if (!btns.length) return;

      function rowDataForMatchId(id) {
        var row = panel.querySelector(
          '.match-row[data-match-row-id="' + cssEscapeAttrValue(id) + '"]'
        );
        if (!row) return null;
        var scoreCell = row.querySelectorAll("td")[1];
        if (!scoreCell) return null;
        var parts = scoreCell.textContent.split("\u2013");
        if (parts.length !== 2) parts = scoreCell.textContent.split("-");
        return {
          team1_score: (parts[0] || "").trim(),
          team2_score: (parts[1] || "").trim(),
        };
      }

      var leagueId = route.leagueId;
      var base = backendMainBase();
      var isAdminSession = !!route.hostToken;
      var matchEditPrefix = isAdminSession ? "/admin/leagues/" : "/leagues/";

      btns.forEach(function (btn) {
        if (btn.disabled) return;
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-update-match-id");
          if (!id) return;
          var match = rowDataForMatchId(id);
          if (!match) return;
          var url =
            base +
            matchEditPrefix +
            encodeURIComponent(leagueId) +
            "/matches/" +
            encodeURIComponent(id);
          toggleEditMatchScoreForm(
            panel.querySelector("table.data") || panel,
            id,
            match,
            url,
            "PATCH",
            DEFAULT_EDIT_MATCH_SCORE_BODY_SCHEMA,
            4
          );
        });
      });

      panel.querySelectorAll(".match-update-wrap--disabled").forEach(function (w) {
        w.addEventListener("click", function (e) {
          e.stopPropagation();
          panel
            .querySelectorAll(".match-update-wrap--tip-open")
            .forEach(function (other) {
              if (other !== w)
                other.classList.remove("match-update-wrap--tip-open");
            });
          w.classList.toggle("match-update-wrap--tip-open");
          if (w.classList.contains("match-update-wrap--tip-open")) {
            positionDisabledTip(w);
          }
        });
      });
    }

    function ensureDeleteConfirmModal() {
      if (deleteConfirmModalEl) return deleteConfirmModalEl;

      var modal = document.createElement("div");
      modal.id = "match-delete-confirm-modal";
      modal.className = "help-modal match-delete-modal";
      modal.hidden = true;
      modal.innerHTML =
        '<div class="help-modal-backdrop" tabindex="-1" aria-hidden="true"></div>' +
        '<div class="help-modal-card" role="dialog" aria-modal="true"' +
        ' aria-labelledby="match-delete-modal-title">' +
        '<div class="help-modal-header">' +
        '<h2 id="match-delete-modal-title" class="help-modal-title"></h2>' +
        '<button type="button" class="help-modal-close match-delete-modal-close"' +
        ' aria-label="' +
        escapeAttr(tr("deleteConfirmModalCloseAria") || "Close") +
        '">&times;</button>' +
        "</div>" +
        '<div class="help-modal-body">' +
        '<p class="match-delete-modal-warning"></p>' +
        "</div>" +
        '<div class="match-delete-modal-actions">' +
        '<button type="button" class="btn-secondary match-delete-modal-cancel">' +
        escapeHtml(tr("cancel") || "Cancel") +
        "</button>" +
        '<button type="button" class="btn-secondary match-delete-modal-confirm">' +
        escapeHtml(tr("deleteConfirmAction") || "Confirm delete") +
        "</button>" +
        "</div>" +
        "</div>";
      document.body.appendChild(modal);

      var backdrop = modal.querySelector(".help-modal-backdrop");
      var closeBtn = modal.querySelector(".match-delete-modal-close");
      var cancelBtn = modal.querySelector(".match-delete-modal-cancel");
      var confirmBtn = modal.querySelector(".match-delete-modal-confirm");

      function closeDeleteConfirmModal() {
        if (!modal || modal.hidden) return;
        modal.hidden = true;
        document.body.style.overflow = "";
        var focusEl =
          deleteConfirmPending && deleteConfirmPending.returnFocus
            ? deleteConfirmPending.returnFocus
            : null;
        deleteConfirmPending = null;
        if (focusEl && typeof focusEl.focus === "function") {
          try {
            focusEl.focus();
          } catch (_e) {
            /* ignore */
          }
        }
      }

      function refreshDeleteConfirmModalCopy() {
        var titleEl = modal.querySelector("#match-delete-modal-title");
        var warningEl = modal.querySelector(".match-delete-modal-warning");
        if (titleEl) {
          titleEl.textContent =
            tr("deleteConfirmModalTitle") || "Delete this match?";
        }
        if (warningEl) {
          warningEl.textContent =
            tr("deleteConfirmModalWarning") ||
            "This action cannot be undone. The match will be permanently removed from league history and standings.";
        }
        if (closeBtn) {
          closeBtn.setAttribute(
            "aria-label",
            tr("deleteConfirmModalCloseAria") || "Close"
          );
        }
        if (cancelBtn) {
          cancelBtn.textContent = tr("cancel") || "Cancel";
        }
        if (confirmBtn) {
          confirmBtn.textContent =
            tr("deleteConfirmAction") || "Confirm delete";
        }
      }

      function openDeleteConfirmModal(deleteBtn, url) {
        refreshDeleteConfirmModalCopy();
        var cellWrap = deleteBtn.closest(".match-delete-wrap");
        deleteConfirmPending = {
          url: url,
          anchorEl: cellWrap || deleteBtn,
          returnFocus: deleteBtn,
        };
        modal.hidden = false;
        document.body.style.overflow = "hidden";
        if (cancelBtn && typeof cancelBtn.focus === "function") {
          cancelBtn.focus();
        }
      }

      backdrop.addEventListener("click", closeDeleteConfirmModal);
      closeBtn.addEventListener("click", closeDeleteConfirmModal);
      cancelBtn.addEventListener("click", closeDeleteConfirmModal);
      confirmBtn.addEventListener("click", function () {
        var pending = deleteConfirmPending;
        if (!pending || !pending.url) return;
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        closeDeleteConfirmModal();
        submitBackendAction(pending.anchorEl, "DELETE", pending.url, {});
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
      });

      document.addEventListener("keydown", function (ev) {
        if (!modal.hidden && ev.key === "Escape") {
          ev.preventDefault();
          closeDeleteConfirmModal();
        }
      });

      deleteConfirmModalEl = modal;
      deleteConfirmModalEl._openDeleteConfirmModal = openDeleteConfirmModal;
      return deleteConfirmModalEl;
    }

    function bindMatchRowDeleteButtons(wrap) {
      if (!wrap) return;
      var panel = wrap.querySelector(".data-panel") || wrap;
      var btns = panel.querySelectorAll(".btn-match-delete[data-delete-match-id]");
      if (!btns.length && !panel.querySelectorAll(".match-delete-wrap--disabled").length) {
        return;
      }

      var leagueId = route.leagueId;
      var base = backendMainBase();
      var isAdminSession = !!route.hostToken;
      var matchDeletePrefix = isAdminSession ? "/admin/leagues/" : "/leagues/";
      var modalApi = ensureDeleteConfirmModal();
      var openDeleteConfirmModal = modalApi._openDeleteConfirmModal;

      function attachDeleteClick(deleteBtn) {
        if (!deleteBtn || deleteBtn.disabled) return;
        deleteBtn.addEventListener("click", function () {
          var id = deleteBtn.getAttribute("data-delete-match-id");
          if (!id) return;
          var url =
            base +
            matchDeletePrefix +
            encodeURIComponent(leagueId) +
            "/matches/" +
            encodeURIComponent(id);
          openDeleteConfirmModal(deleteBtn, url);
        });
      }

      btns.forEach(attachDeleteClick);

      panel.querySelectorAll(".match-delete-wrap--disabled").forEach(function (w) {
        w.addEventListener("click", function (e) {
          e.stopPropagation();
          panel
            .querySelectorAll(".match-delete-wrap--tip-open")
            .forEach(function (other) {
              if (other !== w)
                other.classList.remove("match-delete-wrap--tip-open");
            });
          w.classList.toggle("match-delete-wrap--tip-open");
          if (w.classList.contains("match-delete-wrap--tip-open")) {
            positionDisabledTip(w);
          }
        });
      });
    }

    return {
      bindMatchRowDeleteButtons: bindMatchRowDeleteButtons,
      bindMatchRowUpdateButtons: bindMatchRowUpdateButtons,
      renderEditMatchScorePickerMessage: renderEditMatchScorePickerMessage,
      toggleEditMatchScoreForm: toggleEditMatchScoreForm,
    };
  }

  api.createMatchInteractionController = createMatchInteractionController;
})(typeof window !== "undefined" ? window : this);
