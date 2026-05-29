(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  function tr() { return api.tr.apply(api, arguments); }
  function escapeHtml() { return api.escapeHtml.apply(api, arguments); }
  function escapeAttr() { return api.escapeAttr.apply(api, arguments); }

  /**
   * Quick-action tiles shown in the empty chat state. Each tile usually
   * sends a canned natural-language message to the chat-to-intent server.
   * Tiles with `mode` short-circuit that round trip in `mountChat()`.
   */
  function getQuickActionTiles() {
    return [
      {
        message: "record a match",
        mode: "local-submit-match",
        title: tr("quickActionRecordMatchTitle") || "Record Match Result",
        desc: tr("quickActionRecordMatchDesc") || "Log a doubles match score",
        icon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true">' +
          '<path d="M9 4h6a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1V6a2 2 0 0 1 2-2z"/>' +
          '<path d="M9 4h6v3H9z"/>' +
          '<path d="m9 14 2 2 4-4"/>' +
          "</svg>",
      },
      {
        message: "show me the standings",
        mode: "local-standings-choice",
        title: tr("quickActionShowStandingsTitle") || "Show Current Standings",
        desc: tr("quickActionShowStandingsDesc") || "See the league leaderboard",
        icon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true">' +
          '<path d="M4 20h16"/>' +
          '<rect x="6" y="12" width="3" height="8" rx="0.5"/>' +
          '<rect x="10.5" y="7" width="3" height="13" rx="0.5"/>' +
          '<rect x="15" y="3" width="3" height="17" rx="0.5"/>' +
          "</svg>",
      },
      {
        message: "show me all the matches",
        title: tr("quickActionShowMatchHistoryTitle") || "Show Match History",
        desc: tr("quickActionShowMatchHistoryDesc") || "Browse all recent matches",
        icon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true">' +
          '<circle cx="12" cy="12" r="9"/>' +
          '<path d="M12 7v5l3 2"/>' +
          "</svg>",
      },
      {
        message: "show me all the players",
        mode: "local-get-players",
        title: tr("quickActionGetPlayersTitle") || "Get Players",
        desc: tr("quickActionGetPlayersDesc") || "Search and add players",
        icon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true">' +
          '<circle cx="9" cy="8" r="3.25"/>' +
          '<path d="M3.5 19c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5"/>' +
          '<path d="M17 7v6"/>' +
          '<path d="M14 10h6"/>' +
          "</svg>",
      },
      {
        message: "help",
        title: tr("quickActionShowMoreCommandsTitle") || "Show More Commands",
        desc: tr("quickActionShowMoreCommandsDesc") || "See everything I can do",
        icon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true">' +
          '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/>' +
          '<rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/>' +
          '<rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/>' +
          '<rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>' +
          "</svg>",
      },
    ];
  }

  /** Persistent shortcut icons (same actions as empty-state quick-action tiles). */
  function renderIntentHelper(_isAdmin) {
    var shortcutsAria = escapeAttr(tr("quickActionsHeading") || "Get started with a quick action");
    var shortcutsHtml = '<div class="intent-helper-shortcuts" role="group" aria-label="' + shortcutsAria + '">';
    getQuickActionTiles().forEach(function (tile) {
      var modeAttr = tile.mode
        ? ' data-quick-action-mode="' + escapeAttr(tile.mode) + '"'
        : "";
      shortcutsHtml +=
        '<button type="button" class="intent-helper-quick-btn quick-action-trigger" data-quick-action="' +
        escapeAttr(tile.message) +
        '"' +
        modeAttr +
        ' aria-label="' +
        escapeAttr(tile.title + " \u2014 " + tile.desc) +
        '">' +
        '<span class="intent-helper-quick-icon" aria-hidden="true">' +
        tile.icon +
        "</span></button>";
    });
    shortcutsHtml += "</div>";
    return '<div class="intent-helper">' + shortcutsHtml + "</div>";
  }

  function renderQuickActions() {
    var tiles = getQuickActionTiles();
    var heading = tr("quickActionsHeading") || "Get started with a quick action";
    var html =
      '<div class="quick-actions" id="quick-actions">' +
      '<div class="quick-actions-heading">' +
      escapeHtml(heading) +
      "</div>" +
      '<div class="quick-actions-grid" role="group" aria-label="' +
      escapeAttr(heading) +
      '">';
    tiles.forEach(function (tile) {
      var modeAttr = tile.mode
        ? ' data-quick-action-mode="' + escapeAttr(tile.mode) + '"'
        : "";
      html +=
        '<button type="button" class="quick-action-tile quick-action-trigger" data-quick-action="' +
        escapeAttr(tile.message) +
        '"' +
        modeAttr +
        ' aria-label="' +
        escapeAttr(tile.title + " \u2014 " + tile.desc) +
        '">' +
        '<span class="quick-action-icon" aria-hidden="true">' +
        tile.icon +
        "</span>" +
        '<span class="quick-action-text">' +
        '<span class="quick-action-title">' +
        escapeHtml(tile.title) +
        "</span>" +
        '<span class="quick-action-desc">' +
        escapeHtml(tile.desc) +
        "</span>" +
        "</span>" +
        "</button>";
    });
    html += "</div></div>";
    return html;
  }

  api.getQuickActionTiles = getQuickActionTiles;
  api.renderIntentHelper = renderIntentHelper;
  api.renderQuickActions = renderQuickActions;
})(typeof window !== "undefined" ? window : this);
