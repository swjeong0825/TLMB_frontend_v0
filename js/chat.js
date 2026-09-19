(function () {
  "use strict";

  var api = window.TLCHAT_CHAT || {};
  var READ_TYPES = api.READ_TYPES;
  var WRITE_TYPES = api.WRITE_TYPES;
  var escapeHtml = api.escapeHtml;
  var escapeAttr = api.escapeAttr;
  var setPlayerEditWindowSeconds = api.setPlayerEditWindowSeconds;
  var setPlayerMatchDeleteWindowSeconds = api.setPlayerMatchDeleteWindowSeconds;
  var tr = api.tr;
  var sanitizeForDisplay = api.sanitizeForDisplay;
  var renderFallbackData = api.renderFallbackData;
  var backendMainBase = api.backendMainBase;
  var dateOnlyOrNull = api.dateOnlyOrNull;
  var needsHostTokenForUrl = api.needsHostTokenForUrl;
  var fetchLeagueRoster = api.fetchLeagueRoster;
  var fetchLeagueAdminInfo = api.fetchLeagueAdminInfo;
  var fetchLeagueMatchHistory = api.fetchLeagueMatchHistory;
  var humanDetailFromHttpBody = api.humanDetailFromHttpBody;
  var renderMatchSubmitRosterNotes = api.renderMatchSubmitRosterNotes;
  var renderWriteForm = api.renderWriteForm;
  var bindMatchDateGroupToggles = api.bindMatchDateGroupToggles;
  var getCachedLeagueTitle = api.getCachedLeagueTitle;
  var rememberLeagueTitle = api.rememberLeagueTitle;
  var applyChatHeaderTitle = api.applyChatHeaderTitle;
  var renderChatShell = api.renderChatShell;
  var applyTheme = api.applyTheme;
  var assistantContentFromResponse = api.assistantContentFromResponse;
  var renderReadPanel = api.renderReadPanel;
  var normalizePlusForIntentServer = api.normalizePlusForIntentServer;
  var bindDisabledTipPositioning = api.bindDisabledTipPositioning;
  var createMessageThread = api.createMessageThread;
  var createRosterInteractionController = api.createRosterInteractionController;
  var createNicknameAutocomplete = api.createNicknameAutocomplete;
  var createStandingsInteractionController = api.createStandingsInteractionController;
  var createMatchSubmitInteractionController = api.createMatchSubmitInteractionController;
  var createMatchInteractionController = api.createMatchInteractionController;
  var createWriteActionController = api.createWriteActionController;
  var postChat = api.postChat;

  function mountChat(route) {
    var root = document.getElementById("app-root");
    root.innerHTML = renderChatShell(route, getCachedLeagueTitle(route.leagueId));
    if (window.TLCHAT_I18N && typeof window.TLCHAT_I18N.applyDom === "function") {
      window.TLCHAT_I18N.applyDom(root);
    }
    if (window.TLCHAT_I18N && typeof window.TLCHAT_I18N.syncLocaleDropdown === "function") {
      window.TLCHAT_I18N.syncLocaleDropdown(root);
    }

    applyTheme(localStorage.getItem("tlchat-theme") || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

    var themeBtn = document.getElementById("theme-toggle-btn");
    if (themeBtn) {
      themeBtn.addEventListener("click", function () {
        var current = document.documentElement.getAttribute("data-theme") || "dark";
        applyTheme(current === "light" ? "dark" : "light");
      });
    }

    var messagesEl = document.getElementById("messages");
    var actionBusy = false;

    var conversationHistory = [];
    var messageThread = createMessageThread({ messagesEl: messagesEl });
    var appendLoadingBubble = messageThread.appendLoadingBubble;
    var removeLoadingBubble = messageThread.removeLoadingBubble;
    var appendAssistant = messageThread.appendAssistant;
    var appendErrorPlain = messageThread.appendErrorPlain;
    var appendErrorTechnical = messageThread.appendErrorTechnical;

    /** Latest roster from main API; refreshed when this chat view mounts.
     * `rules` is the LeagueRules config returned by GET /roster — used by
     * `renderMatchSubmitRosterNotes` to suppress the partner-conflict
     * warning when `one_pair_per_player === false`. In v6 the roster IS
     * the player list (the `allowlist_entries` side table was retired);
     * the same `players` array already includes pre-registered nicknames
     * that have not yet played, so there is no separate fetch / union. */
    var leagueRoster = {
      status: "loading",
      players: [],
      pairs: [],
      rules: null,
      league_timezone: "America/Los_Angeles",
      latest_match_date: null,
      latest_match_date_single: null,
      latest_activity_date: null,
      fetchedAt: null,
    };

    function applyLeagueRosterResult(result) {
      leagueRoster.players = result.players;
      leagueRoster.pairs = result.pairs;
      leagueRoster.rules = result.rules || null;
      leagueRoster.league_timezone =
        result.league_timezone || "America/Los_Angeles";
      leagueRoster.latest_match_date =
        dateOnlyOrNull(result.latest_match_date) || null;
      leagueRoster.latest_match_date_single =
        dateOnlyOrNull(result.latest_match_date_single) || null;
      leagueRoster.latest_activity_date =
        dateOnlyOrNull(result.latest_activity_date) ||
        leagueRoster.latest_match_date ||
        leagueRoster.latest_match_date_single ||
        null;
      leagueRoster.status = "ok";
      leagueRoster.fetchedAt = Date.now();
      // Cache the server-config player-edit window for the
      // per-row Update button gate. Surfaced via GET /roster
      // (not LeagueRules) since it's a deployment knob, not a
      // per-league rule.
      setPlayerEditWindowSeconds(result.player_score_edit_window_seconds);
      // Same idea for the per-row Delete button. Tuned
      // independently of the edit window because deletes are
      // irreversible.
      setPlayerMatchDeleteWindowSeconds(
        result.player_match_delete_window_seconds
      );
      if (result.title != null && String(result.title).trim() !== "") {
        rememberLeagueTitle(route.leagueId, result.title);
      }
      applyChatHeaderTitle(
        document.getElementById("chat-header-title"),
        result.title,
        route.leagueId
      );
    }

    function markLeagueRosterError(result) {
      leagueRoster.status = "error";
      console.warn("[TLCHAT] League roster fetch failed:", result);
      applyChatHeaderTitle(
        document.getElementById("chat-header-title"),
        null,
        route.leagueId
      );
    }

    function refreshLeagueRoster() {
      leagueRoster.status = "loading";
      fetchLeagueRoster(route.leagueId)
        .then(function (result) {
          if (result.ok) {
            applyLeagueRosterResult(result);
          } else {
            markLeagueRosterError(result);
          }
        })
        .catch(function (err) {
          markLeagueRosterError(err);
        });
    }

    refreshLeagueRoster();

    function refreshAdminHostEmail() {
      if (!route.hostToken) return;
      fetchLeagueAdminInfo(route.leagueId, route.hostToken)
        .then(function (result) {
          var row = document.getElementById("chat-host-email-row");
          var valueEl = document.getElementById("chat-host-email-value");
          if (!row || !valueEl) return;
          if (result.ok && result.host_email) {
            valueEl.textContent = result.host_email;
            row.hidden = false;
          } else {
            console.warn("[TLCHAT] Host email fetch failed:", result);
          }
        })
        .catch(function (err) {
          console.warn("[TLCHAT] Host email fetch threw:", err);
        });
    }

    refreshAdminHostEmail();

    var rosterInteractions = createRosterInteractionController({
      route: route,
      root: root,
      messagesEl: messagesEl,
      appendAssistant: appendAssistant,
      appendErrorPlain: appendErrorPlain,
      applyLeagueRosterResult: applyLeagueRosterResult,
    });
    var deliverPlayersPanel = rosterInteractions.deliverPlayersPanel;
    var openPlayersPanelWithNicknames = rosterInteractions.openPlayersPanelWithNicknames;

    var nicknameAutocomplete = createNicknameAutocomplete({ leagueRoster: leagueRoster });
    var bindActionCardAutocomplete = nicknameAutocomplete.bindActionCardAutocomplete;

    function setActionBusy(busy) {
      actionBusy = busy;
      root.querySelectorAll(".quick-action-trigger").forEach(function (button) {
        button.setAttribute("aria-disabled", busy ? "true" : "false");
      });
      messagesEl.setAttribute("aria-busy", busy ? "true" : "false");
    }

    var standingsInteractions = createStandingsInteractionController({
      route: route,
      leagueRoster: leagueRoster,
      applyLeagueRosterResult: applyLeagueRosterResult,
      messagesEl: messagesEl,
    });
    var bindStandingsSubjectChooserActions =
      standingsInteractions.bindStandingsSubjectChooserActions;
    var isStandingsDataType = standingsInteractions.isStandingsDataType;
    var resolveInitialStandingsData = standingsInteractions.resolveInitialStandingsData;

    var matchSubmitInteractions = createMatchSubmitInteractionController({
      route: route,
      leagueRoster: leagueRoster,
      applyLeagueRosterResult: applyLeagueRosterResult,
    });
    var confirmAllowedSameDayRematchIfNeeded =
      matchSubmitInteractions.confirmAllowedSameDayRematchIfNeeded;
    var ensureLeagueRosterForRematchConfirmation =
      matchSubmitInteractions.ensureLeagueRosterForRematchConfirmation;

    var writeActions = null;
    async function submitBackendAction(cardEl, method, url, bodySpec) {
      if (actionBusy) return;
      setActionBusy(true);
      try {
        return await writeActions.submitBackendAction(cardEl, method, url, bodySpec);
      } finally {
        setActionBusy(false);
      }
    }

    var matchInteractions = createMatchInteractionController({
      route: route,
      appendAssistant: appendAssistant,
      submitBackendAction: submitBackendAction,
      bindActionCardAutocomplete: bindActionCardAutocomplete,
    });
    var renderEditMatchScorePickerMessage = matchInteractions.renderEditMatchScorePickerMessage;
    var bindHistoryScopeControls = matchInteractions.bindHistoryScopeControls;
    var bindMatchRowUpdateButtons = matchInteractions.bindMatchRowUpdateButtons;
    var bindMatchRowDeleteButtons = matchInteractions.bindMatchRowDeleteButtons;

    writeActions = createWriteActionController({
      route: route,
      leagueRoster: leagueRoster,
      conversationHistory: conversationHistory,
      appendAssistant: appendAssistant,
      appendErrorPlain: appendErrorPlain,
      appendErrorTechnical: appendErrorTechnical,
      appendLoadingBubble: appendLoadingBubble,
      removeLoadingBubble: removeLoadingBubble,
      refreshLeagueRoster: refreshLeagueRoster,
      confirmAllowedSameDayRematchIfNeeded: confirmAllowedSameDayRematchIfNeeded,
      ensureLeagueRosterForRematchConfirmation: ensureLeagueRosterForRematchConfirmation,
      openPlayersPanelWithNicknames: openPlayersPanelWithNicknames,
      bindMatchDateGroupToggles: bindMatchDateGroupToggles,
      bindHistoryScopeControls: bindHistoryScopeControls,
      bindMatchRowUpdateButtons: bindMatchRowUpdateButtons,
      bindMatchRowDeleteButtons: bindMatchRowDeleteButtons,
    });

    async function renderResponse(resp) {

      if (resp.data_type === "ERROR") {
        var em = (resp.data && resp.data.error_message) || "";
        var sc = resp.data && resp.data.status_code;
        var technical =
          (sc != null ? "[Chat error status_code=" + sc + "] " : "[Chat error] ") + (em || "(no message)");
        appendErrorTechnical(technical, "Chat server ERROR response");
        return;
      }

      if (resp.data_type === "CLARIFICATION_QUESTION") {
        var q = (resp.data && resp.data.question) || tr("clarifyFallback") || "Could you clarify?";
        appendAssistant(
          '<div class="response-callout response-callout-clarify">' + escapeHtml(q) + "</div>"
        );
        return;
      }

      var parts = [];
      if (resp.server_message && resp.server_message.trim()) {
        parts.push(
          '<div class="server-message">' + escapeHtml(resp.server_message.trim()) + "</div>"
        );
      }

      if (READ_TYPES[resp.data_type]) {
        if (resp.data_type === "GET_STANDINGS") {
          parts.push(
            renderReadPanel(
              resp.data_type,
              { _standings_show_subject_chooser: true },
              !!route.hostToken
            )
          );
          appendAssistant(parts.join(""));
          return;
        }
        if (
          resp.data_type === "GET_MATCH_HISTORY" ||
          resp.data_type === "GET_MATCH_HISTORY_BY_PLAYER"
        ) {
          var playerName = resp.data_type === "GET_MATCH_HISTORY_BY_PLAYER"
            ? String((resp.data && resp.data.player_name) || "").trim()
            : "";
          var historyScope = resp.data && (resp.data._history_scope || resp.data.scope);
          if (historyScope !== "doubles" && historyScope !== "singles") historyScope = "both";
          await deliverMatchHistory(resp.data_type, playerName, historyScope, parts.join(""));
          return;
        }
        var readData = await resolveInitialStandingsData(
          resp.data_type,
          resp.data || {}
        );
        parts.push(renderReadPanel(resp.data_type, readData, !!route.hostToken));
        var readWrap = appendAssistant(parts.join(""));
        if (isStandingsDataType(resp.data_type)) {
          standingsInteractions.renderStandingsPanelInto(
            readWrap, resp.data_type, readData, !!route.hostToken
          );
        }
        return;
      }

      if (WRITE_TYPES[resp.data_type]) {
        if (
          resp.data_type === "EDIT_MATCH_SCORE" &&
          resp.data &&
          Array.isArray(resp.data.matches)
        ) {
          renderEditMatchScorePickerMessage(resp);
          return;
        }
        parts = [];
        var d = resp.data || {};
        var method = d.method || "POST";
        var bUrl = d.url || "";
        var bodySpec = d.body || {};
        var warn = "";
        if (needsHostTokenForUrl(bUrl) && !route.hostToken) {
          warn =
            "<p class=\"hint\" style=\"color:var(--warn)\">" +
            (tr("adminUrlWarn") ||
              "This write targets an admin endpoint. Use the Admin URL with <code>X-Host-Token</code>.") +
            "</p>";
        }
        parts.push(warn);
        if (resp.data_type === "SUBMIT_MATCH_RESULT") {
          parts.push(renderMatchSubmitRosterNotes(bodySpec, leagueRoster));
        }
        parts.push(
            "<div class=\"action-card\">" +
            renderWriteForm(bodySpec) +
            "<button type=\"button\" class=\"btn-secondary\" data-submit-write>" +
            escapeHtml(tr("submitToLeague") || "Submit to league API") +
            "</button>" +
            "</div>"
        );
        var wrap = appendAssistant(parts.join(""));
        var card = wrap.querySelector(".action-card");
        if (card) {
          var submitBtn = card.querySelector("[data-submit-write]");
          submitBtn.addEventListener("click", function () {
            submitBackendAction(card, method, bUrl, bodySpec);
          });
          bindActionCardAutocomplete(card);
        }
        return;
      }

      var unkParts = [];
      if (resp.server_message && resp.server_message.trim()) {
        unkParts.push(
          '<div class="server-message">' + escapeHtml(resp.server_message.trim()) + "</div>"
        );
      }
      var rawData = resp.data != null ? resp.data : {};
      var cleaned = sanitizeForDisplay(rawData);
      var hasKeys = cleaned && typeof cleaned === "object" && Object.keys(cleaned).length > 0;
      if (hasKeys) {
        unkParts.push(renderFallbackData(rawData));
      } else if (!unkParts.length) {
        unkParts.push(
          "<p class=\"hint\">" +
            escapeHtml(
              tr("unknownResponseHint") ||
                "No details available for this response. Try asking in another way."
            ) +
            "</p>"
        );
      }
      appendAssistant('<div class="data-panel unknown-response">' + unkParts.join("") + "</div>");
    }

    /** Run the existing header help shortcut without adding a user message. */
    async function deliverShortcutMessage(rawMessage) {
      var trimmed = String(rawMessage || "").trim();
      if (!trimmed) return;
      var submittedText = normalizePlusForIntentServer(trimmed);
      var loadingNode = null;
      try {
        loadingNode = appendLoadingBubble();
        var resp = await postChat(route, submittedText, conversationHistory);
        removeLoadingBubble(loadingNode);
        loadingNode = null;
        await renderResponse(resp);
        conversationHistory.push({ role: "user", content: submittedText });
        var assistantContent = assistantContentFromResponse(resp);
        if (assistantContent) {
          conversationHistory.push({ role: "assistant", content: assistantContent });
        }
      } catch (err) {
        removeLoadingBubble(loadingNode);
        loadingNode = null;
        appendErrorTechnical(err.message || String(err), "Chat request failed");
      } finally {
        removeLoadingBubble(loadingNode);
      }
    }

    function deliverStandingsSubjectChooser() {
      appendAssistant(
        renderReadPanel(
          "GET_STANDINGS",
          { _standings_show_subject_chooser: true },
          !!route.hostToken
        )
      );
    }

    async function deliverMatchHistory(dataType, playerName, scope, prefixHtml) {
      var isByPlayer = dataType === "GET_MATCH_HISTORY_BY_PLAYER";
      var loadingNode = appendLoadingBubble();
      try {
        var result = await fetchLeagueMatchHistory(
          route.leagueId,
          dataType,
          playerName,
          scope
        );
        if (!result.ok) {
          var detail = result.body ? humanDetailFromHttpBody(result.body) : "";
          throw new Error(
            "Could not fetch match history" +
            (isByPlayer ? " for player" : "") +
            ": " + (result.status || result.error || "unknown error") +
            (detail ? " " + detail : "")
          );
        }
        var data = { matches: result.matches, _history_scope: scope };
        if (isByPlayer) data.player_name = playerName;
        var wrap = appendAssistant(
          (prefixHtml || "") + renderReadPanel(dataType, data, !!route.hostToken)
        );
        bindHistoryScopeControls(wrap);
        bindMatchDateGroupToggles(wrap);
        bindMatchRowUpdateButtons(wrap);
        bindMatchRowDeleteButtons(wrap);
      } catch (err) {
        appendErrorTechnical(err.message || String(err), "Match history fetch failed");
      } finally {
        removeLoadingBubble(loadingNode);
      }
    }

    // Match forms are built locally and submit directly to Backend Main.
    function doublesMatchBodySpec() {
      return {
        pair1_nicknames: { type: "array[string]", required: true, value: null },
        pair2_nicknames: { type: "array[string]", required: true, value: null },
        pair1_score: { type: "string", required: true, value: null },
        pair2_score: { type: "string", required: true, value: null },
      };
    }

    function singlesMatchBodySpec() {
      return {
        player1_nickname: { type: "string", required: true, value: null },
        player2_nickname: { type: "string", required: true, value: null },
        player1_score: { type: "string", required: true, value: null },
        player2_score: { type: "string", required: true, value: null },
      };
    }

    function renderLocalMatchSubmitForm(container, format) {
      var base = backendMainBase();
      if (!base) {
        appendErrorPlain(tr("requestFailed") || "Request failed.");
        return;
      }
      var isSingles = format === "singles";
      var url =
        base +
        "/leagues/" +
        encodeURIComponent(route.leagueId) +
        (isSingles ? "/singles-matches" : "/matches");
      var method = "POST";
      var bodySpec = isSingles ? singlesMatchBodySpec() : doublesMatchBodySpec();
      var html = "";
      if (!isSingles) {
        html += renderMatchSubmitRosterNotes(bodySpec, leagueRoster);
      }
      html +=
        '<div class="match-format-submit">' +
        renderWriteForm(bodySpec) +
        '<button type="button" class="btn-secondary" data-submit-write>' +
        escapeHtml(tr("submitToLeague") || "Submit to league API") +
        "</button>" +
        "</div>";
      container.innerHTML = html;
      var card = container.querySelector(".match-format-submit");
      if (card) {
        var submitBtn = card.querySelector("[data-submit-write]");
        submitBtn.addEventListener("click", function () {
          submitBackendAction(card, method, url, bodySpec);
        });
        bindActionCardAutocomplete(card);
      }
    }

    function deliverEmptyMatchSubmitForm() {
      var wrap = appendAssistant('<div class="record-source-choice"><h3>' +
        escapeHtml(tr("recordSourceTitle")) + '</h3><div class="match-format-options" role="group" aria-label="' +
        escapeAttr(tr("recordSourceTitle")) + '">' +
        '<button type="button" class="btn-secondary match-format-option" data-record-source="planned" aria-pressed="false">' +
        escapeHtml(tr("recordPlannedChoice")) + '</button>' +
        '<button type="button" class="btn-secondary match-format-option" data-record-source="manual" aria-pressed="false">' +
        escapeHtml(tr("recordManualChoice")) + '</button></div><div data-record-source-slot></div></div>');
      var sourceSlot = wrap.querySelector("[data-record-source-slot]");
      var selectedSource = "";
      wrap.querySelectorAll("[data-record-source]").forEach(function (button) {
        button.addEventListener("click", function () {
          var source = button.getAttribute("data-record-source");
          if (source === selectedSource) return;
          selectedSource = source;
          wrap.querySelectorAll("[data-record-source]").forEach(function (other) {
            other.setAttribute("aria-pressed", String(other === button));
            other.classList.toggle("is-active", other === button);
          });
          if (source === "planned") api.mountPlannedMatchResults(sourceSlot, route);
          else renderUnplannedMatchChooser(sourceSlot);
        });
      });
    }

    function renderUnplannedMatchChooser(container) {
      var base = backendMainBase();
      if (!base) {
        appendErrorPlain(tr("requestFailed") || "Request failed.");
        return;
      }
      var wrap = container;
      wrap.innerHTML =
        '<div class="match-format-card">' +
          '<div class="match-format-options" role="group" aria-label="' +
          escapeAttr(tr("matchFormatChooserLabel") || "Choose match format") +
          '">' +
          '<button type="button" class="btn-secondary match-format-option" data-local-match-format="doubles">' +
          escapeHtml(tr("matchFormatDoubles") || "Doubles") +
          "</button>" +
          '<button type="button" class="btn-secondary match-format-option" data-local-match-format="singles">' +
          escapeHtml(tr("matchFormatSingles") || "Singles") +
          "</button>" +
          "</div>" +
          '<div class="match-format-form-slot" data-match-format-form-slot></div>' +
          "</div>";
      var slot = wrap.querySelector("[data-match-format-form-slot]");
      wrap.querySelectorAll("[data-local-match-format]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var format = btn.getAttribute("data-local-match-format") || "doubles";
          wrap.querySelectorAll("[data-local-match-format]").forEach(function (other) {
            other.classList.toggle("is-active", other === btn);
          });
          renderLocalMatchSubmitForm(slot, format);
        });
      });
    }

    rosterInteractions.bindRosterMessageActions();
    rosterInteractions.bindRosterDisabledTouchTooltips();
    bindStandingsSubjectChooserActions();
    bindDisabledTipPositioning(root);

    // Header, starter tiles, and bottom navigation all use the same handlers.
    root.addEventListener("click", async function (e) {
      var tile = e.target.closest && e.target.closest(".quick-action-trigger");
      if (!tile || !root.contains(tile) || actionBusy) return;
      var mode = tile.getAttribute("data-quick-action-mode") || "";
      var message = tile.getAttribute("data-quick-action") || "";
      if (!mode && !message) return;

      if (mode === "local-plan-match") {
        window.location.assign(window.TLCHAT_NAVIGATION.leagueUrl("/league/plan/", window.location.search, route.leagueId));
        return;
      }

      messageThread.reset();
      root.querySelectorAll(".quick-action-trigger").forEach(function (button) {
        var selected = mode
          ? button.getAttribute("data-quick-action-mode") === mode
          : button.getAttribute("data-quick-action") === message;
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      setActionBusy(true);
      try {
        if (mode === "local-submit-match") {
          deliverEmptyMatchSubmitForm();
        } else if (mode === "local-get-players") {
          deliverPlayersPanel();
        } else if (mode === "local-standings-choice") {
          deliverStandingsSubjectChooser();
        } else if (mode === "local-match-history") {
          await deliverMatchHistory("GET_MATCH_HISTORY", "", "both");
        } else {
          await deliverShortcutMessage(message);
        }
      } catch (err) {
        appendErrorTechnical(err.message || String(err), "League action failed");
      } finally {
        setActionBusy(false);
      }
    });
  }

  function boot() {
    var stored = localStorage.getItem("tlchat-theme");
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(stored || (prefersDark ? "dark" : "light"));

    var route = window.TLCHAT_ROUTE;
    if (!route || !route.leagueId) {
      var I = window.TLCHAT_I18N;
      var noLeague =
        I && I.t
          ? I.t("chat.noLeagueHtml")
          : 'No league specified. <a href="/">Go to home</a>.';
      document.getElementById("app-root").innerHTML =
        '<main class="landing"><p class="hint">' + noLeague + "</p></main>";
      return;
    }
    mountChat(route);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
