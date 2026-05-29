(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  function tr() { return api.tr.apply(api, arguments); }
  function escapeHtml() { return api.escapeHtml.apply(api, arguments); }
  function escapeAttr() { return api.escapeAttr.apply(api, arguments); }

  var LEAGUE_TITLE_CACHE_KEY = "tlchat-league-titles";

  function getCachedLeagueTitle(leagueId) {
    if (!leagueId) return "";
    try {
      var raw = localStorage.getItem(LEAGUE_TITLE_CACHE_KEY);
      if (!raw) return "";
      var map = JSON.parse(raw);
      if (!map || typeof map !== "object" || Array.isArray(map)) return "";
      var t = map[String(leagueId)];
      return typeof t === "string" && t.trim() !== "" ? t.trim() : "";
    } catch (_e) {
      return "";
    }
  }

  function rememberLeagueTitle(leagueId, title) {
    if (!leagueId) return;
    var s = title != null ? String(title).trim() : "";
    if (!s) return;
    try {
      var raw = localStorage.getItem(LEAGUE_TITLE_CACHE_KEY);
      var map = {};
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          map = parsed;
        }
      }
      map[String(leagueId)] = s;
      localStorage.setItem(LEAGUE_TITLE_CACHE_KEY, JSON.stringify(map));
    } catch (_e) {
      /* ignore quota / private mode */
    }
  }

  function applyChatHeaderTitle(titleEl, rawTitle, leagueId) {
    if (!titleEl) return;
    var fromApi = rawTitle != null ? String(rawTitle).trim() : "";
    var text =
      fromApi !== ""
        ? fromApi
        : leagueId
          ? getCachedLeagueTitle(leagueId)
          : "";
    if (!text) {
      text = tr("h1") || "Tennis League Management Bot";
    }
    titleEl.classList.remove("chat-header-title--loading");
    titleEl.removeAttribute("aria-busy");
    titleEl.removeAttribute("aria-label");
    titleEl.textContent = text;
  }

  function renderHeader(route, cachedHeaderTitle) {
    var isAdmin = !!route.hostToken;
    var headerLang =
      window.TLCHAT_I18N && typeof window.TLCHAT_I18N.renderLocaleDropdown === "function"
        ? window.TLCHAT_I18N.renderLocaleDropdown({ compact: true })
        : "";
    var metaHtml = isAdmin
      ? '<div class="meta" id="chat-admin-meta">' +
        '<div class="meta-host-email" id="chat-host-email-row" hidden>' +
        '<span class="meta-host-email-label">' +
        escapeHtml(tr("metaHostEmailLabel") || "Host email:") +
        "</span> " +
        '<span class="meta-host-email-value" id="chat-host-email-value"></span>' +
        "</div>" +
        "</div>"
      : "";
    var cached =
      cachedHeaderTitle != null && String(cachedHeaderTitle).trim() !== ""
        ? String(cachedHeaderTitle).trim()
        : "";
    var titleH1Html;
    if (cached) {
      titleH1Html =
        '<h1 id="chat-header-title" class="chat-header-title">' +
        escapeHtml(cached) +
        "</h1>";
    } else {
      var loadingLabel =
        escapeAttr(tr("headerTitleLoading") || "Loading league title\u2026");
      titleH1Html =
        '<h1 id="chat-header-title" class="chat-header-title chat-header-title--loading" aria-busy="true" aria-label="' +
        loadingLabel +
        '">' +
        '<span class="chat-header-title-loader" aria-hidden="true">' +
        '<span class="chat-header-title-dot"></span>' +
        '<span class="chat-header-title-dot"></span>' +
        '<span class="chat-header-title-dot"></span>' +
        "</span>" +
        "</h1>";
    }
    var roleBadgeHtml = isAdmin
      ? '<span class="badge admin">' +
        escapeHtml(tr("badgeAdmin") || "Admin") +
        "</span>"
      : "";
    return (
      "<header class=\"app-header\">" +
      '<div class="chat-header-title-row">' +
      '<div class="chat-header-title-block">' +
      titleH1Html +
      "</div>" +
      roleBadgeHtml +
      "</div>" +
      metaHtml +
      '<div class="app-header-actions">' +
      headerLang +
      '<button id="theme-toggle-btn" class="theme-toggle" aria-label="' +
      escapeAttr(tr("themeToggle") || "Toggle light/dark mode") +
      '">' +
      '<span class="theme-icon" aria-hidden="true"></span>' +
      "</button>" +
      "</div>" +
      "</header>"
    );
  }

  function renderComposer() {
    var isMobile = window.innerWidth <= 520;
    var rawPlaceholder = isMobile
      ? tr("placeholderMobile") ||
        "Report Match Result, or Ask about standings, match history, or the roster."
      : tr("placeholderDesktop") ||
        "Report Match Result, or Ask about standings, match history, or the roster.\nUse the shortcuts above or type \"help\".";
    return (
      '<div class="composer">' +
      '<form id="chat-form">' +
      '<div class="composer-input-wrap">' +
      '<div id="chat-mention-popover" class="chat-mention-popover" hidden role="listbox" aria-label="' +
      escapeAttr(tr("mentionPopoverLabel") || "Mention a player") +
      '"></div>' +
      '<textarea id="chat-input" rows="2" placeholder="' +
      escapeAttr(rawPlaceholder) +
      '" autocomplete="off"></textarea>' +
      '<button type="submit" id="send-btn" aria-label="' +
      escapeAttr(tr("send") || "Send") +
      '">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>' +
      "</button>" +
      "</div>" +
      "</form>" +
      "</div>"
    );
  }

  function renderChatShell(route, cachedHeaderTitle) {
    return (
      renderHeader(route, cachedHeaderTitle) +
      api.renderIntentHelper(!!route.hostToken) +
      '<main class="chat-main is-empty">' +
      '<div id="messages" class="messages"></div>' +
      api.renderQuickActions() +
      renderComposer() +
      "</main>" +
      '<footer class="chat-footer">' +
      '<span data-i18n="footer.backendSource"></span>' +
      '<a href="https://github.com/swjeong0825/TLMB_backend_main" target="_blank" rel="noopener noreferrer">Backend Main</a>' +
      '<a href="https://github.com/swjeong0825/TLMB_chat_to_intent" target="_blank" rel="noopener noreferrer">Chat-to-Intent Server</a>' +
      "</footer>"
    );
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("tlchat-theme", theme);
    var btn = document.getElementById("theme-toggle-btn");
    if (!btn) return;
    var isLight = theme === "light";
    var icon = btn.querySelector(".theme-icon");
    if (icon) icon.textContent = isLight ? "\u2600\uFE0F" : "\uD83C\uDF19";
  }

  api.getCachedLeagueTitle = getCachedLeagueTitle;
  api.rememberLeagueTitle = rememberLeagueTitle;
  api.applyChatHeaderTitle = applyChatHeaderTitle;
  api.renderChatShell = renderChatShell;
  api.applyTheme = applyTheme;
})(typeof window !== "undefined" ? window : this);
