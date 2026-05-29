(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};
  var escapeHtml = api.escapeHtml;
  var escapeAttr = api.escapeAttr;
  var tr = api.tr;
  var formatWhenPlain = api.formatWhenPlain;
  var fetchLeagueRoster = api.fetchLeagueRoster;
  var fetchLeagueMatchHistory = api.fetchLeagueMatchHistory;
  var isMatchCreationCall = api.isMatchCreationCall;
  var normalizeMatchNickname = api.normalizeMatchNickname;
  var rosterCanonicalNormMap = api.rosterCanonicalNormMap;
  var canonicalizedNickPair = api.canonicalizedNickPair;
  var findSameDayMatchRecordForSubmittedPair = api.findSameDayMatchRecordForSubmittedPair;

  function createMatchSubmitInteractionController(ctx) {
    ctx = ctx || {};
    var route = ctx.route || {};
    var leagueRoster = ctx.leagueRoster || {};
    var applyLeagueRosterResult = ctx.applyLeagueRosterResult;

    function leagueAllowsUnrestrictedRematches(rosterState) {
      return !!(
        rosterState &&
        rosterState.rules &&
        rosterState.rules.pair_matchup_idempotency === "none"
      );
    }

    async function ensureLeagueRosterForRematchConfirmation() {
      if (leagueRoster.status === "ok") return leagueRoster;
      try {
        var result = await fetchLeagueRoster(route.leagueId);
        if (result.ok) {
          applyLeagueRosterResult(result);
        } else {
          console.warn("[TLCHAT] Rematch confirmation roster fetch failed:", result);
        }
      } catch (err) {
        console.warn("[TLCHAT] Rematch confirmation roster fetch failed:", err);
      }
      return leagueRoster;
    }

    function matchSummaryForConfirmation(match) {
      var pair1 =
        String(match.pair1_player1_nickname || "") +
        " + " +
        String(match.pair1_player2_nickname || "");
      var pair2 =
        String(match.pair2_player1_nickname || "") +
        " + " +
        String(match.pair2_player2_nickname || "");
      return {
        pairs: pair1 + " " + (tr("vs") || "vs") + " " + pair2,
        score:
          String(match.pair1_score == null ? "" : match.pair1_score) +
          " - " +
          String(match.pair2_score == null ? "" : match.pair2_score),
        when: formatWhenPlain(match.created_at),
      };
    }

    var sameDayRematchConfirmModalEl = null;
    var sameDayRematchConfirmPending = null;

    function ensureSameDayRematchConfirmModal() {
      if (sameDayRematchConfirmModalEl) return sameDayRematchConfirmModalEl;

      var modal = document.createElement("div");
      modal.id = "same-day-rematch-confirm-modal";
      modal.className = "help-modal same-day-rematch-modal";
      modal.hidden = true;
      modal.innerHTML =
        '<div class="help-modal-backdrop" tabindex="-1" aria-hidden="true"></div>' +
        '<div class="help-modal-card" role="dialog" aria-modal="true"' +
        ' aria-labelledby="same-day-rematch-modal-title">' +
        '<div class="help-modal-header">' +
        '<h2 id="same-day-rematch-modal-title" class="help-modal-title"></h2>' +
        '<button type="button" class="help-modal-close same-day-rematch-modal-close"' +
        ' aria-label="' +
        escapeAttr(tr("rematchConfirmModalCloseAria") || "Close") +
        '">&times;</button>' +
        "</div>" +
        '<div class="help-modal-body">' +
        '<p class="same-day-rematch-modal-warning"></p>' +
        '<p class="same-day-rematch-modal-detail"></p>' +
        "</div>" +
        '<div class="same-day-rematch-modal-actions">' +
        '<button type="button" class="btn-secondary same-day-rematch-modal-cancel">' +
        escapeHtml(tr("cancel") || "Cancel") +
        "</button>" +
        '<button type="button" class="btn-secondary same-day-rematch-modal-confirm">' +
        escapeHtml(tr("rematchConfirmAction") || "Record rematch") +
        "</button>" +
        "</div>" +
        "</div>";
      document.body.appendChild(modal);

      var backdrop = modal.querySelector(".help-modal-backdrop");
      var closeBtn = modal.querySelector(".same-day-rematch-modal-close");
      var cancelBtn = modal.querySelector(".same-day-rematch-modal-cancel");
      var confirmBtn = modal.querySelector(".same-day-rematch-modal-confirm");

      function refreshSameDayRematchConfirmModalCopy() {
        var titleEl = modal.querySelector("#same-day-rematch-modal-title");
        var warningEl = modal.querySelector(".same-day-rematch-modal-warning");
        var detailEl = modal.querySelector(".same-day-rematch-modal-detail");
        var existing =
          sameDayRematchConfirmPending &&
          sameDayRematchConfirmPending.existingMatch
            ? sameDayRematchConfirmPending.existingMatch
            : null;
        if (titleEl) {
          titleEl.textContent =
            tr("rematchConfirmModalTitle") || "Record another match today?";
        }
        if (warningEl) {
          warningEl.textContent =
            tr("rematchConfirmModalWarning") ||
            "These two pairs already have a match recorded today. Continue only if this is a separate rematch.";
        }
        if (detailEl && existing) {
          var summary = matchSummaryForConfirmation(existing);
          detailEl.textContent =
            tr("rematchConfirmModalExisting", summary) ||
            "Existing result: " +
              summary.pairs +
              " · " +
              summary.score +
              " · " +
              summary.when;
        }
        if (closeBtn) {
          closeBtn.setAttribute(
            "aria-label",
            tr("rematchConfirmModalCloseAria") || "Close"
          );
        }
        if (cancelBtn) {
          cancelBtn.textContent = tr("cancel") || "Cancel";
        }
        if (confirmBtn) {
          confirmBtn.textContent =
            tr("rematchConfirmAction") || "Record rematch";
        }
      }

      function closeSameDayRematchConfirmModal(confirmed) {
        if (!modal || modal.hidden) return;
        modal.hidden = true;
        document.body.style.overflow = "";
        var pending = sameDayRematchConfirmPending;
        var focusEl =
          pending && pending.returnFocus ? pending.returnFocus : null;
        sameDayRematchConfirmPending = null;
        if (pending && typeof pending.resolve === "function") {
          pending.resolve(!!confirmed);
        }
        if (focusEl && typeof focusEl.focus === "function") {
          try {
            focusEl.focus();
          } catch (_e) {
            /* ignore */
          }
        }
      }

      function openSameDayRematchConfirmModal(existingMatch, returnFocus) {
        if (
          sameDayRematchConfirmPending &&
          typeof sameDayRematchConfirmPending.resolve === "function"
        ) {
          sameDayRematchConfirmPending.resolve(false);
        }
        return new Promise(function (resolve) {
          sameDayRematchConfirmPending = {
            existingMatch: existingMatch,
            returnFocus: returnFocus || null,
            resolve: resolve,
          };
          refreshSameDayRematchConfirmModalCopy();
          modal.hidden = false;
          document.body.style.overflow = "hidden";
          if (cancelBtn && typeof cancelBtn.focus === "function") {
            cancelBtn.focus();
          }
        });
      }

      backdrop.addEventListener("click", function () {
        closeSameDayRematchConfirmModal(false);
      });
      closeBtn.addEventListener("click", function () {
        closeSameDayRematchConfirmModal(false);
      });
      cancelBtn.addEventListener("click", function () {
        closeSameDayRematchConfirmModal(false);
      });
      confirmBtn.addEventListener("click", function () {
        closeSameDayRematchConfirmModal(true);
      });

      document.addEventListener("keydown", function (ev) {
        if (!modal.hidden && ev.key === "Escape") {
          ev.preventDefault();
          closeSameDayRematchConfirmModal(false);
        }
      });

      sameDayRematchConfirmModalEl = modal;
      sameDayRematchConfirmModalEl._openSameDayRematchConfirmModal =
        openSameDayRematchConfirmModal;
      return sameDayRematchConfirmModalEl;
    }

    async function confirmAllowedSameDayRematchIfNeeded(method, url, payload, submitBtn) {
      if (!isMatchCreationCall(method, url)) return true;

      var pt1 = Array.isArray(payload.pair1_nicknames)
        ? payload.pair1_nicknames
        : [];
      var pt2 = Array.isArray(payload.pair2_nicknames)
        ? payload.pair2_nicknames
        : [];
      var t1RawNorm = [normalizeMatchNickname(pt1[0]), normalizeMatchNickname(pt1[1])];
      var t2RawNorm = [normalizeMatchNickname(pt2[0]), normalizeMatchNickname(pt2[1])];
      if (!t1RawNorm[0] || !t1RawNorm[1] || !t2RawNorm[0] || !t2RawNorm[1]) return true;

      var rosterState = await ensureLeagueRosterForRematchConfirmation();
      if (!leagueAllowsUnrestrictedRematches(rosterState)) return true;
      var canonicalMap = rosterCanonicalNormMap(rosterState.players);
      var t1n = canonicalizedNickPair(t1RawNorm, canonicalMap);
      var t2n = canonicalizedNickPair(t2RawNorm, canonicalMap);

      var hist = await fetchLeagueMatchHistory(route.leagueId);
      if (!hist.ok) {
        console.warn("[TLCHAT] Same-day rematch check skipped; match history fetch failed", hist);
        return true;
      }

      var existingRow = findSameDayMatchRecordForSubmittedPair(
        hist.matches,
        t1n,
        t2n,
        rosterState.league_timezone || "America/Los_Angeles"
      );
      if (!existingRow) return true;

      var modalApi = ensureSameDayRematchConfirmModal();
      return modalApi._openSameDayRematchConfirmModal(existingRow, submitBtn);
    }

    return {
      confirmAllowedSameDayRematchIfNeeded: confirmAllowedSameDayRematchIfNeeded,
      ensureLeagueRosterForRematchConfirmation: ensureLeagueRosterForRematchConfirmation,
    };
  }

  api.createMatchSubmitInteractionController = createMatchSubmitInteractionController;
})(typeof window !== "undefined" ? window : this);
