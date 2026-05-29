(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};
  var canonicalizedNickPair = api.canonicalizedNickPair;
  var escapeHtml = api.escapeHtml;
  var fetchLeagueMatchHistory = api.fetchLeagueMatchHistory;
  var findMatchRecordForSubmittedPair = api.findMatchRecordForSubmittedPair;
  var humanDetailFromHttpBody = api.humanDetailFromHttpBody;
  var isMatchCreationCall = api.isMatchCreationCall;
  var leagueApiJsonErrorCode = api.leagueApiJsonErrorCode;
  var normalizeMatchNickname = api.normalizeMatchNickname;
  var renderReadPanel = api.renderReadPanel;
  var rosterCanonicalNormMap = api.rosterCanonicalNormMap;
  var tr = api.tr;
  var tryParseJson = api.tryParseJson;

  function createWriteErrorHandler(ctx) {
    ctx = ctx || {};
    var route = ctx.route || {};
    var conversationHistory = ctx.conversationHistory || [];
    var appendAssistant = ctx.appendAssistant;
    var appendErrorTechnical = ctx.appendErrorTechnical;
    var ensureLeagueRosterForRematchConfirmation =
      ctx.ensureLeagueRosterForRematchConfirmation;
    var openPlayersPanelWithNicknames = ctx.openPlayersPanelWithNicknames;
    var bindMatchDateGroupToggles = ctx.bindMatchDateGroupToggles;
    var bindMatchRowUpdateButtons = ctx.bindMatchRowUpdateButtons;
    var bindMatchRowDeleteButtons = ctx.bindMatchRowDeleteButtons;

    function technicalLine(res, text) {
      var errLine = humanDetailFromHttpBody(text);
      return (
        "[League API " +
        res.status +
        "] " +
        (errLine || "(no detail in body)") +
        (text && text.length
          ? " | body: " + (text.length > 800 ? text.slice(0, 800) + "\u2026" : text)
          : "")
      );
    }

    function rosterMembershipRecovery(method, url, res, text) {
      if (!(isMatchCreationCall(method, url) && res.status === 422)) {
        return { isRosterMembershipRequired: false };
      }
      var ufe = window.TLCHAT_USER_FACING_ERRORS;
      if (ufe && typeof ufe.fromMatchSubmissionError === "function") {
        return ufe.fromMatchSubmissionError(res.status, tryParseJson(text));
      }
      return { isRosterMembershipRequired: false };
    }

    function handleRosterMembershipRequired(result) {
      var missing = result.missing_nicknames || [];
      var calloutHtml =
        '<div class="response-callout response-callout-clarify">' +
        escapeHtml(result.headline || "") +
        "</div>";
      if (route.hostToken && missing.length) {
        var addBtnLabel = tr("rosterMembershipAddButton") || "+ Add to roster";
        calloutHtml +=
          '<button type="button" class="btn-secondary roster-admin-add-missing" style="margin-top:0.5rem">' +
          escapeHtml(addBtnLabel) +
          "</button>";
      }
      var rosterErrWrap = appendAssistant(calloutHtml, "msg-error");
      if (route.hostToken && missing.length) {
        var addMissingBtn =
          rosterErrWrap && rosterErrWrap.querySelector(".roster-admin-add-missing");
        if (addMissingBtn) {
          addMissingBtn.addEventListener("click", function () {
            openPlayersPanelWithNicknames(missing);
          });
        }
      }
      conversationHistory.push({
        role: "assistant",
        content: result.headline || "",
      });
    }

    function handleWindowExpired(text) {
      var code = leagueApiJsonErrorCode(text);
      if (code === "MatchEditWindowExpiredError") {
        var expiredMsg =
          tr("matchEditWindowExpired") ||
          "This match can no longer be edited (window expired).";
        appendAssistant(
          '<div class="response-callout response-callout-clarify"><strong>' +
            escapeHtml(expiredMsg) +
            "</strong></div>",
          "msg-error"
        );
        conversationHistory.push({
          role: "assistant",
          content: expiredMsg,
        });
        return true;
      }
      if (code === "MatchDeleteWindowExpiredError") {
        var deleteExpiredMsg =
          tr("matchDeleteWindowExpired") ||
          "This match can no longer be deleted (window expired).";
        appendAssistant(
          '<div class="response-callout response-callout-clarify"><strong>' +
            escapeHtml(deleteExpiredMsg) +
            "</strong></div>",
          "msg-error"
        );
        conversationHistory.push({
          role: "assistant",
          content: deleteExpiredMsg,
        });
        return true;
      }
      return false;
    }

    async function handleDuplicateMatch(payload, text) {
      var hist = await fetchLeagueMatchHistory(route.leagueId);
      var pt1 = Array.isArray(payload.team1_nicknames) ? payload.team1_nicknames : [];
      var pt2 = Array.isArray(payload.team2_nicknames) ? payload.team2_nicknames : [];
      var rosterStateForDuplicate = await ensureLeagueRosterForRematchConfirmation();
      var duplicateCanonicalMap = rosterCanonicalNormMap(rosterStateForDuplicate.players);
      var t1n = canonicalizedNickPair(
        [normalizeMatchNickname(pt1[0]), normalizeMatchNickname(pt1[1])],
        duplicateCanonicalMap
      );
      var t2n = canonicalizedNickPair(
        [normalizeMatchNickname(pt2[0]), normalizeMatchNickname(pt2[1])],
        duplicateCanonicalMap
      );
      var existingRow = hist.ok
        ? findMatchRecordForSubmittedPair(hist.matches, t1n, t2n)
        : null;
      var duplicateText = String(text || "").toLowerCase();
      var shortMsg =
        duplicateText.indexOf("already exists today") !== -1
          ? tr("matchAlreadyExistsToday")
          : tr("matchAlreadyExistsInLeague");
      if (!shortMsg) {
        shortMsg = tr("matchAlreadyExists") || "Match already exists. Record not saved.";
      }
      var calloutHtml =
        '<div class="response-callout response-callout-clarify"><strong>' +
        escapeHtml(shortMsg) +
        "</strong></div>";
      if (!hist.ok) {
        console.warn("[TLCHAT] Duplicate match \u2014 match history fetch failed", hist);
      } else if (!existingRow) {
        console.warn("[TLCHAT] Duplicate match \u2014 no matching row in history (unexpected)");
      }
      if (existingRow) {
        var dupWrap = appendAssistant(
          calloutHtml +
            renderReadPanel("GET_MATCH_HISTORY", { matches: [existingRow] }, !!route.hostToken)
        );
        bindMatchDateGroupToggles(dupWrap);
        bindMatchRowUpdateButtons(dupWrap);
        bindMatchRowDeleteButtons(dupWrap);
      } else {
        appendAssistant(calloutHtml);
      }
      conversationHistory.push({
        role: "assistant",
        content: shortMsg,
      });
    }

    async function handleWriteError(method, url, payload, res, text) {
      var rosterMembershipResult = rosterMembershipRecovery(method, url, res, text);
      if (rosterMembershipResult.isRosterMembershipRequired) {
        handleRosterMembershipRequired(rosterMembershipResult);
        return;
      }
      if (res.status === 422 && handleWindowExpired(text)) {
        return;
      }
      var failedMatchCreate =
        isMatchCreationCall(method, url) &&
        res.status === 409 &&
        leagueApiJsonErrorCode(text) === "DuplicateTeamPairMatchError";
      if (failedMatchCreate) {
        await handleDuplicateMatch(payload, text);
        return;
      }
      appendErrorTechnical(technicalLine(res, text), "League API error");
    }

    return { handleWriteError: handleWriteError };
  }

  api.createWriteErrorHandler = createWriteErrorHandler;
})(typeof window !== "undefined" ? window : this);
