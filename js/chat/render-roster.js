(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  function tr() { return api.tr.apply(api, arguments); }
  function escapeHtml() { return api.escapeHtml.apply(api, arguments); }
  function escapeAttr() { return api.escapeAttr.apply(api, arguments); }
  function normalizeMatchNickname() { return api.normalizeMatchNickname.apply(api, arguments); }
  function rosterPlayerCanRemove() { return api.rosterPlayerCanRemove.apply(api, arguments); }
  function rosterPlayerRemoveDisableReason() { return api.rosterPlayerRemoveDisableReason.apply(api, arguments); }
  function playerCanonicalNickname() { return api.playerCanonicalNickname.apply(api, arguments); }
  function playerAliases() { return api.playerAliases.apply(api, arguments); }
  function playerNicknameSearchNorms() { return api.playerNicknameSearchNorms.apply(api, arguments); }

  function renderRosterPlayerRemoveButton(player, opts) {
    opts = opts || {};
    var isAdmin = !!opts.isAdmin;
    var teams = opts.teams || [];
    var canRemove = isAdmin && rosterPlayerCanRemove(player, teams);
    var disabled = !canRemove;
    var reason = disabled ? rosterPlayerRemoveDisableReason(isAdmin, player, teams) : "";
    var btnLabel = tr("rosterRemoveButton") || "Remove";
    var playerId = player && player.player_id ? String(player.player_id) : "";
    var nickname = player && player.nickname ? String(player.nickname) : "";
    var tipId = playerId ? "roster-remove-tip-" + playerId : "";
    var wrapClass =
      "roster-remove-wrap" + (disabled ? " roster-remove-wrap--disabled" : "");
    var wrapAttrs =
      disabled && reason
        ? ' tabindex="0"' +
          (tipId ? ' aria-describedby="' + escapeAttr(tipId) + '"' : "")
        : "";
    var btnAttrs =
      ' type="button" class="btn-secondary btn-roster-remove"' +
      (canRemove
        ? ' data-player-id="' +
          escapeAttr(playerId) +
          '" data-player-nickname="' +
          escapeAttr(nickname) +
          '" aria-label="' +
          escapeAttr(btnLabel + " " + nickname) +
          '"'
        : " disabled");
    var tipHtml =
      disabled && reason
        ? '<span class="roster-remove-tip"' +
          (tipId ? ' id="' + escapeAttr(tipId) + '"' : "") +
          ' role="tooltip">' +
          escapeHtml(reason) +
          "</span>"
        : "";
    return (
      '<span class="' +
      wrapClass +
      '"' +
      wrapAttrs +
      ">" +
      "<button" +
      btnAttrs +
      ">" +
      escapeHtml(btnLabel) +
      "</button>" +
      tipHtml +
      "</span>"
    );
  }

  function renderPlayerAliasChips(player, opts) {
    opts = opts || {};
    var isAdmin = !!opts.isAdmin;
    var aliases = playerAliases(player);
    if (!aliases.length) return "";
    var playerId = player && player.player_id ? String(player.player_id) : "";
    var nickname = playerCanonicalNickname(player);
    var disabledTip =
      tr("aliasRemoveDisabledAdminOnly") ||
      "Removing aliases is available only in Admin mode.";
    var removeText = tr("aliasRemoveButton") || "Remove alias";
    var chips = aliases
      .map(function (alias) {
        var aliasNorm = normalizeMatchNickname(alias);
        var aria =
          tr("aliasChipRemoveAria", { alias: alias, name: nickname }) ||
          "Remove alias " + alias + " from " + nickname;
        var removeHtml;
        if (isAdmin && playerId) {
          removeHtml =
            '<button type="button" class="alias-chip-remove btn-alias-remove"' +
            ' data-player-id="' +
            escapeAttr(playerId) +
            '" data-player-nickname="' +
            escapeAttr(nickname) +
            '" data-alias="' +
            escapeAttr(alias) +
            '" aria-label="' +
            escapeAttr(aria) +
            '" title="' +
            escapeAttr(removeText) +
            '">×</button>';
        } else {
          var tipId =
            "alias-remove-tip-" + (playerId || "player") + "-" + (aliasNorm || "alias");
          removeHtml =
            '<span class="alias-remove-wrap alias-remove-wrap--disabled" tabindex="0" aria-describedby="' +
            escapeAttr(tipId) +
            '">' +
            '<button type="button" class="alias-chip-remove btn-alias-remove" disabled aria-label="' +
            escapeAttr(aria) +
            '">×</button>' +
            '<span class="alias-tip" id="' +
            escapeAttr(tipId) +
            '" role="tooltip">' +
            escapeHtml(disabledTip) +
            "</span>" +
            "</span>";
        }
        return (
          '<span class="alias-chip">' +
          '<span class="alias-chip-text">' +
          escapeHtml(alias) +
          "</span>" +
          removeHtml +
          "</span>"
        );
      })
      .join("");
    return '<span class="alias-chip-list">' + chips + "</span>";
  }

  function renderRosterPlayerName(player, opts) {
    return (
      '<span class="roster-player-name">' +
      '<span class="roster-player-canonical">' +
      escapeHtml(playerCanonicalNickname(player)) +
      "</span>" +
      renderPlayerAliasChips(player, opts) +
      "</span>"
    );
  }

  function renderRosterAliasAddButton(player, opts) {
    opts = opts || {};
    var isAdmin = !!opts.isAdmin;
    var playerId = player && player.player_id ? String(player.player_id) : "";
    var nickname = playerCanonicalNickname(player);
    var label = tr("aliasAddButton") || "+ Alias";
    var disabled = !isAdmin || !playerId;
    var reason =
      tr("aliasAddDisabledAdminOnly") ||
      "Adding aliases is available only in Admin mode.";
    var tipId = playerId ? "alias-add-tip-" + playerId : "alias-add-tip";
    var wrapClass = "alias-add-wrap" + (disabled ? " alias-add-wrap--disabled" : "");
    var wrapAttrs =
      disabled && reason
        ? ' tabindex="0" aria-describedby="' + escapeAttr(tipId) + '"'
        : "";
    var btnAttrs =
      ' type="button" class="btn-secondary btn-alias-add"' +
      (disabled
        ? " disabled"
        : ' data-player-id="' +
          escapeAttr(playerId) +
          '" data-player-nickname="' +
          escapeAttr(nickname) +
          '" aria-label="' +
          escapeAttr(label + " " + nickname) +
          '"');
    var tipHtml =
      disabled && reason
        ? '<span class="alias-tip" id="' +
          escapeAttr(tipId) +
          '" role="tooltip">' +
          escapeHtml(reason) +
          "</span>"
        : "";
    return (
      '<span class="' +
      wrapClass +
      '"' +
      wrapAttrs +
      "><button" +
      btnAttrs +
      ">" +
      escapeHtml(label) +
      "</button>" +
      tipHtml +
      "</span>"
    );
  }

  function renderRosterPlayerActions(player, opts) {
    return (
      '<span class="roster-player-actions">' +
      renderRosterAliasAddButton(player, opts) +
      renderRosterPlayerRemoveButton(player, opts) +
      "</span>"
    );
  }

  /**
   * Returns the inner HTML for a "Get Players" panel body — the
   * search-and-add roster surface used by the `local-get-players`
   * quick action and by the post-match-submit "Add to roster" recovery
   * affordance.
   *
   * Renders only players (no teams), in three regions:
   *  1. A combined search / add input + Add button.
   *     - Admin (`isAdmin === true`): Add button is enabled and posts
   *       `POST /admin/leagues/{lid}/players` on click.
   *     - Non-admin: Add button is disabled and the surrounding wrap
   *       carries a hover/focus/touch tooltip explaining that adding
   *       players is admin-only. The same input still drives the
   *       live-filter — non-admins can search but not write.
   *  2. The player list with per-row Remove buttons (only enabled for
   *     admins; gated by `renderRosterPlayerRemoveButton`).
   *  3. An inline-message slot for transient success / error messages.
   *
   * Wrapped in a `.players-panel` div so `bindPlayersPanelEvents` and
   * `refreshAllPlayersPanels` can find it inside `#messages`. The
   * caller is expected to wrap this body in a `.data-panel` with the
   * "Players" title — done by `deliverPlayersPanel` so the panel
   * reads as another `data-panel` alongside `GET_ROSTER` etc.
   */
  function renderPlayersPanelBody(state, isAdmin) {
    var entries = (state && state.players) || [];
    var isLoading = state && state.loading;
    var errorMsg = state && state.error;

    var bodyHtml;
    if (isLoading) {
      bodyHtml =
        '<p class="hint">' +
        escapeHtml(tr("playersPanelLoading") || "Loading players\u2026") +
        "</p>";
    } else if (errorMsg) {
      bodyHtml =
        '<p class="hint roster-admin-error">' +
        escapeHtml(tr("playersPanelError") || "Could not load players.") +
        "</p>";
    } else if (!entries.length) {
      bodyHtml =
        '<p class="hint">' +
        escapeHtml(tr("playersPanelEmpty") || "No players on the roster yet.") +
        "</p>";
    } else {
      var teams = (state && state.teams) || [];
      var rows = entries
        .map(function (entry) {
          var nick = entry.nickname || "";
          var searchNorms = playerNicknameSearchNorms(entry);
          return (
            '<li class="roster-admin-item roster-item-with-action" data-nick-norm="' +
            escapeAttr(normalizeMatchNickname(nick)) +
            '" data-aliases-norm="' +
            escapeAttr(searchNorms.slice(1).join(" ")) +
            '" data-player-id="' +
            escapeAttr(entry && entry.player_id ? String(entry.player_id) : "") +
            '" data-player-nickname="' +
            escapeAttr(nick) +
            '">' +
            renderRosterPlayerName(entry, { isAdmin: !!isAdmin }) +
            renderRosterPlayerActions(entry, { isAdmin: !!isAdmin, teams: teams }) +
            "</li>"
          );
        })
        .join("");
      bodyHtml =
        '<ul class="roster-admin-list roster-list roster-list-players">' +
        rows +
        "</ul>" +
        '<p class="hint roster-admin-no-matches" hidden>' +
        escapeHtml(tr("playersPanelNoMatches") || "No matching players.") +
        "</p>";
    }

    var inputPlaceholder = isAdmin
      ? tr("playersPanelAddPlaceholder") || "e.g. alice, bob, charlie"
      : tr("playersPanelSearchPlaceholder") || "Search players\u2026";
    var addBtnLabel = tr("playersPanelAddButton") || "Add";
    var addDisabledTip =
      tr("playersPanelAddDisabledAdminOnly") ||
      "Adding players is available only in Admin mode.";

    var addBtnAttrs = isAdmin
      ? ' type="button" class="btn-secondary roster-admin-add-btn"'
      : ' type="button" class="btn-secondary roster-admin-add-btn" disabled aria-describedby="players-add-tip"';
    var addWrapClass =
      "players-add-btn-wrap" + (isAdmin ? "" : " players-add-btn-wrap--disabled");
    var addWrapAttrs = isAdmin
      ? ""
      : ' tabindex="0" aria-describedby="players-add-tip"';
    var tipHtml = isAdmin
      ? ""
      : '<span class="players-add-tip" id="players-add-tip" role="tooltip">' +
        escapeHtml(addDisabledTip) +
        "</span>";

    var addRow =
      '<div class="roster-admin-add-row">' +
      '<input type="text" class="roster-admin-add-input" placeholder="' +
      escapeAttr(inputPlaceholder) +
      '" />' +
      '<span class="' +
      addWrapClass +
      '"' +
      addWrapAttrs +
      ">" +
      "<button" +
      addBtnAttrs +
      ">" +
      escapeHtml(addBtnLabel) +
      "</button>" +
      tipHtml +
      "</span>" +
      "</div>" +
      '<div class="roster-admin-inline-msg" hidden></div>';

    return (
      '<div class="players-panel" data-is-admin="' +
      (isAdmin ? "1" : "0") +
      '">' +
      '<div class="roster-admin-body">' +
      addRow +
      bodyHtml +
      "</div>" +
      "</div>"
    );
  }

  function renderRoster(data, isAdmin) {
    var players = data.players || [];
    var teams = data.teams || [];
    var h = "";
    if (teams.length) {
      h +=
        '<div class="roster-block"><h4 class="roster-heading">' +
        escapeHtml(tr("rosterHeadingTeams") || "Teams") +
        "</h4><ul class=\"roster-list\">";
      teams.forEach(function (t) {
        h +=
          "<li class=\"roster-item\"><span class=\"roster-pair\">" +
          escapeHtml(t.player1_nickname) +
          " <span class=\"roster-plus\">+</span> " +
          escapeHtml(t.player2_nickname) +
          "</span></li>";
      });
      h += "</ul></div>";
    }
    if (players.length) {
      h +=
        '<div class="roster-block"><h4 class="roster-heading">' +
        escapeHtml(tr("rosterHeadingPlayers") || "Players") +
        "</h4><ul class=\"roster-list roster-list-players\">";
      players.forEach(function (p) {
        var nick = p.nickname || "";
        var searchNorms = playerNicknameSearchNorms(p);
        h +=
          '<li class="roster-item roster-item-with-action" data-nick-norm="' +
          escapeAttr(normalizeMatchNickname(nick)) +
          '" data-aliases-norm="' +
          escapeAttr(searchNorms.slice(1).join(" ")) +
          '" data-player-id="' +
          escapeAttr(p && p.player_id ? String(p.player_id) : "") +
          '" data-player-nickname="' +
          escapeAttr(nick) +
          '">' +
          renderRosterPlayerName(p, { isAdmin: !!isAdmin }) +
          renderRosterPlayerActions(p, { isAdmin: !!isAdmin, teams: teams }) +
          "</li>";
      });
      h += "</ul></div>";
    }
    if (!h) return "<p class=\"hint\">" + escapeHtml(tr("rosterEmpty") || "Roster is empty.") + "</p>";
    return h;
  }

  api.renderRosterPlayerRemoveButton = renderRosterPlayerRemoveButton;
  api.renderPlayerAliasChips = renderPlayerAliasChips;
  api.renderRosterPlayerName = renderRosterPlayerName;
  api.renderRosterAliasAddButton = renderRosterAliasAddButton;
  api.renderRosterPlayerActions = renderRosterPlayerActions;
  api.renderPlayersPanelBody = renderPlayersPanelBody;
  api.renderRoster = renderRoster;
})(typeof window !== "undefined" ? window : this);
