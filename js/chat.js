(function () {
  "use strict";

  var api = window.TLCHAT_CHAT || {};
  var READ_TYPES = api.READ_TYPES;
  var WRITE_TYPES = api.WRITE_TYPES;
  var escapeHtml = api.escapeHtml;
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
  var createComposerController = api.createComposerController;
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
    var form = document.getElementById("chat-form");
    var mentionPopover = document.getElementById("chat-mention-popover");
    var input = document.getElementById("chat-input");
    var sendBtn = document.getElementById("send-btn");
    if (input && mentionPopover) {
      input.setAttribute("aria-controls", "chat-mention-popover");
    }

    var conversationHistory = [];
    var messageThread = createMessageThread({ messagesEl: messagesEl });
    var appendUser = messageThread.appendUser;
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
      updateMentionUI();
    }

    function markLeagueRosterError(result) {
      leagueRoster.status = "error";
      console.warn("[TLCHAT] League roster fetch failed:", result);
      applyChatHeaderTitle(
        document.getElementById("chat-header-title"),
        null,
        route.leagueId
      );
      updateMentionUI();
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

    var composer = createComposerController({
      input: input,
      form: form,
      mentionPopover: mentionPopover,
      leagueRoster: leagueRoster,
    });
    var updateMentionUI = composer.updateMentionUI;
    var bindActionCardAutocomplete = composer.bindActionCardAutocomplete;

    var standingsInteractions = createStandingsInteractionController({
      route: route,
      leagueRoster: leagueRoster,
      applyLeagueRosterResult: applyLeagueRosterResult,
    });
    var bindStandingsDateControls = standingsInteractions.bindStandingsDateControls;
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
    function submitBackendAction(cardEl, method, url, bodySpec) {
      return writeActions.submitBackendAction(cardEl, method, url, bodySpec);
    }

    var matchInteractions = createMatchInteractionController({
      route: route,
      appendAssistant: appendAssistant,
      submitBackendAction: submitBackendAction,
      bindActionCardAutocomplete: bindActionCardAutocomplete,
    });
    var renderEditMatchScorePickerMessage = matchInteractions.renderEditMatchScorePickerMessage;
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
        var readData = await resolveInitialStandingsData(
          resp.data_type,
          resp.data || {}
        );
        parts.push(renderReadPanel(resp.data_type, readData, !!route.hostToken));
        var readWrap = appendAssistant(parts.join(""));
        if (isStandingsDataType(resp.data_type)) {
          bindStandingsDateControls(readWrap, resp.data_type, !!route.hostToken);
        }
        if (
          resp.data_type === "GET_MATCH_HISTORY" ||
          resp.data_type === "GET_MATCH_HISTORY_BY_PLAYER"
        ) {
          bindMatchDateGroupToggles(readWrap);
          bindMatchRowUpdateButtons(readWrap);
          bindMatchRowDeleteButtons(readWrap);
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

    /**
     * @param {string} rawMessage trimmed user text (e.g. "help")
     * @param {{ silent?: boolean }} opts when silent, no user bubble (used for auto help on open)
     */
    async function deliverChatMessage(rawMessage, opts) {
      var silent = opts && opts.silent;
      var trimmed = String(rawMessage || "").trim();
      if (!trimmed) return;
      var submittedText = normalizePlusForIntentServer(trimmed);
      sendBtn.disabled = true;
      var loadingNode = null;
      try {
        if (!silent) {
          appendUser(trimmed);
        }
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
        sendBtn.disabled = false;
        input.focus();
      }
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = (input.value || "").trim();
      if (!text) return;
      input.value = "";
      input.style.height = "auto";
      deliverChatMessage(text, { silent: false });
    });

    /**
     * Renders the empty SUBMIT_MATCH_RESULT action card without calling
     * the chat-to-intent server. This is the local short-circuit used by
     * the "Record Match Result" quick-action tile.
     *
     * Why: the upstream LLM extractor (currently `llama-3.1-8b-instant`)
     * hallucinates placeholder nicknames such as "john_doe" / "alice_smith"
     * when the prompt is a bare phrase like "record a match" — there is no
     * real data to extract, but JSON mode forces the model to produce a
     * value for every key. Rendering the card locally guarantees an empty
     * form regardless of what the LLM would have done.
     *
     * We mirror the exact bodySpec shape the SubmitMatchResultHandler
     * would have returned for an all-null extraction, then reuse the
     * same `renderWriteForm` + `submitBackendAction` pipeline so the
     * submission flow downstream is identical to a server-mediated turn.
     * The synthetic [SUBMIT_MATCH_RESULT] assistant turn is pushed into
     * `conversationHistory` so any subsequent composer messages still
     * carry the same context the LLM would otherwise have seen.
     */
    function deliverEmptyMatchSubmitForm() {
      var base = backendMainBase();
      if (!base) {
        appendErrorPlain(tr("requestFailed") || "Request failed.");
        return;
      }
      var prompt = "record a match";
      appendUser(prompt);
      var url = base + "/leagues/" + encodeURIComponent(route.leagueId) + "/matches";
      var method = "POST";
      var bodySpec = {
        pair1_nicknames: { type: "array[string]", required: true, value: null },
        pair2_nicknames: { type: "array[string]", required: true, value: null },
        pair1_score:     { type: "string",        required: true, value: null },
        pair2_score:     { type: "string",        required: true, value: null },
      };
      var parts = [];
      parts.push(renderMatchSubmitRosterNotes(bodySpec, leagueRoster));
      parts.push(
        '<div class="action-card">' +
          renderWriteForm(bodySpec) +
          '<button type="button" class="btn-secondary" data-submit-write>' +
          escapeHtml(tr("submitToLeague") || "Submit to league API") +
          "</button>" +
          "</div>"
      );
      var wrap = appendAssistant(parts.join(""));
      var card = wrap.querySelector(".action-card");
      if (card) {
        var submitBtn = card.querySelector("[data-submit-write]");
        submitBtn.addEventListener("click", function () {
          submitBackendAction(card, method, url, bodySpec);
        });
        bindActionCardAutocomplete(card);
      }
      conversationHistory.push({ role: "user", content: prompt });
      conversationHistory.push({ role: "assistant", content: "[SUBMIT_MATCH_RESULT]" });
    }

    rosterInteractions.bindRosterMessageActions();
    rosterInteractions.bindRosterDisabledTouchTooltips();
    bindDisabledTipPositioning(root);

    /* Quick-action triggers (grid tiles plus sticky intent-helper bar):
       delegated from `app-root` via `.quick-action-trigger`. Sends the canned
       prompt through the chat pipeline unless `data-quick-action-mode`
       short-circuits (see deliverEmptyMatchSubmitForm above). Once any message
       lands, `chat-main` loses `is-empty` and the grid hides via CSS;
       shortcuts in the bar remain available. Guard in-flight sends with
       `sendBtn.disabled`. */
    root.addEventListener("click", function (e) {
      var tile = e.target.closest && e.target.closest(".quick-action-trigger");
      if (!tile || !root.contains(tile)) return;
      if (sendBtn.disabled) return;
      var mode = tile.getAttribute("data-quick-action-mode") || "";
      if (mode === "local-submit-match") {
        deliverEmptyMatchSubmitForm();
        return;
      }
      if (mode === "local-get-players") {
        var prompt = tile.getAttribute("data-quick-action") || "show me all the players";
        appendUser(prompt);
        deliverPlayersPanel();
        conversationHistory.push({ role: "user", content: prompt });
        conversationHistory.push({ role: "assistant", content: "[GET_PLAYERS]" });
        return;
      }
      var message = tile.getAttribute("data-quick-action") || "";
      if (!message) return;
      deliverChatMessage(message, { silent: false });
    });

    input.focus();
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
