(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};
  var cssEscapeAttrValue = api.cssEscapeAttrValue;
  var escapeHtml = api.escapeHtml;
  var extractMatchIdFromEditUrl = api.extractMatchIdFromEditUrl;
  var humanSuccessFromHttpBody = api.humanSuccessFromHttpBody;
  var isMatchCreationCall = api.isMatchCreationCall;
  var isMatchDeleteCall = api.isMatchDeleteCall;
  var isMatchEditCall = api.isMatchEditCall;
  var leagueLocalDateKey = api.leagueLocalDateKey;
  var normalizeMatchNickname = api.normalizeMatchNickname;
  var removeEmptyMatchDateRows = api.removeEmptyMatchDateRows;
  var renderReadPanel = api.renderReadPanel;
  var tr = api.tr;
  var tryParseJson = api.tryParseJson;

  function createWriteSuccessHandler(ctx) {
    ctx = ctx || {};
    var route = ctx.route || {};
    var leagueRoster = ctx.leagueRoster || {};
    var conversationHistory = ctx.conversationHistory || [];
    var appendAssistant = ctx.appendAssistant;
    var refreshLeagueRoster = ctx.refreshLeagueRoster;
    var bindMatchDateGroupToggles = ctx.bindMatchDateGroupToggles;
    var bindMatchRowUpdateButtons = ctx.bindMatchRowUpdateButtons;
    var bindMatchRowDeleteButtons = ctx.bindMatchRowDeleteButtons;

    function bindMatchPanel(wrap) {
      bindMatchDateGroupToggles(wrap);
      bindMatchRowUpdateButtons(wrap);
      bindMatchRowDeleteButtons(wrap);
    }

    function appendMatchHistorySuccess(calloutHtml, matchRecord) {
      var wrap = appendAssistant(
        calloutHtml +
          renderReadPanel(
            "GET_MATCH_HISTORY",
            { matches: [matchRecord] },
            !!route.hostToken
          )
      );
      bindMatchPanel(wrap);
    }

    function handleMatchCreation(payload, text) {
      refreshLeagueRoster();
      var matchRecordedLine = tr("matchRecorded") || "Match recorded.";
      var calloutHtml =
        '<div class="response-callout response-callout-success"><strong>' +
        escapeHtml(tr("done") || "Done.") +
        "</strong> " +
        escapeHtml(matchRecordedLine) +
        "</div>";
      var serverResp = tryParseJson(text) || {};
      var recordedAt = serverResp.created_at || new Date().toISOString();
      var latestDate = leagueLocalDateKey(
        recordedAt,
        leagueRoster.league_timezone || "America/Los_Angeles"
      );
      if (latestDate) leagueRoster.latest_match_date = latestDate;
      var t1 = Array.isArray(payload.pair1_nicknames) ? payload.pair1_nicknames : [];
      var t2 = Array.isArray(payload.pair2_nicknames) ? payload.pair2_nicknames : [];
      appendMatchHistorySuccess(calloutHtml, {
        match_id: serverResp.match_id || null,
        pair1_player1_nickname: normalizeMatchNickname(t1[0]),
        pair1_player2_nickname: normalizeMatchNickname(t1[1]),
        pair2_player1_nickname: normalizeMatchNickname(t2[0]),
        pair2_player2_nickname: normalizeMatchNickname(t2[1]),
        pair1_score: payload.pair1_score,
        pair2_score: payload.pair2_score,
        created_at: recordedAt,
      });
      conversationHistory.push({
        role: "assistant",
        content: matchRecordedLine,
      });
    }

    function handleMatchEdit(method, url, payload, text) {
      var editServerResp = tryParseJson(text) || {};
      var editedMatchId =
        extractMatchIdFromEditUrl(url) ||
        (editServerResp.match_id ? String(editServerResp.match_id) : "");
      var newT1Score =
        editServerResp.pair1_score != null
          ? String(editServerResp.pair1_score)
          : String(payload.pair1_score == null ? "" : payload.pair1_score);
      var newT2Score =
        editServerResp.pair2_score != null
          ? String(editServerResp.pair2_score)
          : String(payload.pair2_score == null ? "" : payload.pair2_score);
      var origRow = editedMatchId
        ? document.querySelector(
            '#messages [data-match-row-id="' +
              cssEscapeAttrValue(editedMatchId) +
              '"]'
          )
        : null;
      var editedMatchRecord = {
        match_id: editedMatchId || null,
        pair1_player1_nickname: origRow
          ? origRow.getAttribute("data-pair1-p1") || ""
          : "",
        pair1_player2_nickname: origRow
          ? origRow.getAttribute("data-pair1-p2") || ""
          : "",
        pair2_player1_nickname: origRow
          ? origRow.getAttribute("data-pair2-p1") || ""
          : "",
        pair2_player2_nickname: origRow
          ? origRow.getAttribute("data-pair2-p2") || ""
          : "",
        pair1_score: newT1Score,
        pair2_score: newT2Score,
        created_at:
          (origRow && origRow.getAttribute("data-match-created-at")) ||
          new Date().toISOString(),
      };
      var matchUpdatedLine = tr("matchScoreUpdated") || "Match score updated.";
      appendMatchHistorySuccess(
        '<div class="response-callout response-callout-success"><strong>' +
          escapeHtml(tr("done") || "Done.") +
          "</strong> " +
          escapeHtml(matchUpdatedLine) +
          "</div>",
        editedMatchRecord
      );
      conversationHistory.push({
        role: "assistant",
        content: matchUpdatedLine,
      });
    }

    function handleMatchDelete(url) {
      var deletedMatchId = extractMatchIdFromEditUrl(url);
      if (deletedMatchId) {
        var allRows = document.querySelectorAll(
          '#messages [data-match-row-id="' +
            cssEscapeAttrValue(deletedMatchId) +
            '"]'
        );
        var affectedBodies = [];
        allRows.forEach(function (row) {
          if (row && row.parentNode) {
            var parent = row.parentNode;
            affectedBodies.push(parent);
            parent.removeChild(row);
          }
        });
        affectedBodies.forEach(function (tbody) {
          removeEmptyMatchDateRows(tbody);
        });
      }
      var matchDeletedLine = tr("matchDeleted") || "Match deleted.";
      refreshLeagueRoster();
      appendAssistant(
        '<div class="response-callout response-callout-success"><strong>' +
          escapeHtml(tr("done") || "Done.") +
          "</strong> " +
          escapeHtml(matchDeletedLine) +
          "</div>"
      );
      conversationHistory.push({
        role: "assistant",
        content: matchDeletedLine,
      });
    }

    function handleGenericSuccess(text) {
      var successLine = humanSuccessFromHttpBody(text);
      appendAssistant(
        '<div class="response-callout response-callout-success"><strong>' +
          escapeHtml(tr("done") || "Done.") +
          "</strong> " +
          escapeHtml(successLine) +
          "</div>"
      );
      conversationHistory.push({
        role: "assistant",
        content: (tr("actionCompleted") || "Action completed: ") + successLine,
      });
    }

    function handleWriteSuccess(method, url, payload, text) {
      var matchCreation = isMatchCreationCall(method, url);
      var matchEdit = !matchCreation && isMatchEditCall(method, url);
      var matchDelete = !matchCreation && !matchEdit && isMatchDeleteCall(method, url);
      if (matchCreation) {
        handleMatchCreation(payload, text);
        return;
      }
      if (matchEdit) {
        handleMatchEdit(method, url, payload, text);
        return;
      }
      if (matchDelete) {
        handleMatchDelete(url);
        return;
      }
      handleGenericSuccess(text);
    }

    return { handleWriteSuccess: handleWriteSuccess };
  }

  api.createWriteSuccessHandler = createWriteSuccessHandler;
})(typeof window !== "undefined" ? window : this);
