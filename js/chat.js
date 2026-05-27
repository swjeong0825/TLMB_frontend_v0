(function () {
  "use strict";

  var READ_TYPES = {
    GET_STANDINGS: true,
    GET_STANDINGS_BY_PLAYER: true,
    GET_MATCH_HISTORY: true,
    GET_MATCH_HISTORY_BY_PLAYER: true,
    GET_ROSTER: true,
    HELP: true,
  };

  var WRITE_TYPES = {
    SUBMIT_MATCH_RESULT: true,
    EDIT_PLAYER_NICKNAME: true,
    EDIT_MATCH_SCORE: true,
    DELETE_MATCH: true,
    DELETE_TEAM: true,
    ADD_PLAYERS_TO_ROSTER: true,
    REMOVE_PLAYER_FROM_ROSTER: true,
  };

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  /**
   * Module-scoped cache of the league's player-edit window (seconds).
   *
   * Surfaced by `GET /leagues/{id}/roster.player_score_edit_window_seconds`
   * and refreshed by `mountChat()` after the roster loads. Used by
   * `renderMatches()` to compute whether the per-row "Update" button is
   * still enabled for a non-admin caller. Defaults to null until the
   * roster comes back; treat null as "unknown → assume enabled" so we
   * don't flash a disabled button on slow networks (the backend still
   * enforces the gate authoritatively on submit).
   */
  var _playerEditWindowSeconds = null;
  function getPlayerEditWindowSeconds() {
    return _playerEditWindowSeconds;
  }
  function setPlayerEditWindowSeconds(secs) {
    _playerEditWindowSeconds =
      typeof secs === "number" && isFinite(secs) && secs >= 0 ? secs : null;
  }

  /**
   * Module-scoped cache of the league's player-delete window (seconds).
   *
   * Mirrors `_playerEditWindowSeconds`. Surfaced by
   * `GET /leagues/{id}/roster.player_match_delete_window_seconds` and
   * refreshed by `mountChat()` after the roster loads. Used by
   * `renderMatches()` to compute whether the per-row "Delete" button
   * is still enabled for a non-admin caller. Tuned independently
   * from the edit window because deletes are irreversible (default
   * 600s vs 3600s for edits). Defaults to null until the roster
   * comes back; treat null as "unknown -> assume enabled" so we
   * don't flash a disabled button on slow networks (the backend
   * still enforces the gate authoritatively on submit).
   */
  var _playerMatchDeleteWindowSeconds = null;
  function getPlayerMatchDeleteWindowSeconds() {
    return _playerMatchDeleteWindowSeconds;
  }
  function setPlayerMatchDeleteWindowSeconds(secs) {
    _playerMatchDeleteWindowSeconds =
      typeof secs === "number" && isFinite(secs) && secs >= 0 ? secs : null;
  }

  function tr(key, params) {
    var I = window.TLCHAT_I18N;
    if (!I || typeof I.t !== "function") return "";
    return I.t("chat." + key, params);
  }

  function panelTitleForDataType(dataType) {
    if (dataType === "GET_STANDINGS" || dataType === "GET_STANDINGS_BY_PLAYER") return tr("panelStandings");
    if (dataType === "GET_MATCH_HISTORY" || dataType === "GET_MATCH_HISTORY_BY_PLAYER") {
      return tr("panelMatchHistory");
    }
    if (dataType === "GET_ROSTER") return tr("panelRoster");
    if (dataType === "GET_PLAYERS") return tr("panelPlayers");
    if (dataType === "HELP") return tr("panelHelp");
    var human = String(dataType || "")
      .replace(/^GET_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      })
      .trim();
    return human || tr("panelDetails");
  }

  function labelForFormField(key) {
    var byKey = {
      team_id: tr("fieldTeamId"),
      match_id: tr("fieldMatchId"),
      player_id: tr("fieldPlayerId"),
      current_nickname: tr("fieldCurrentNickname"),
      new_nickname: tr("fieldNewNickname"),
      team1_player_nicknames: tr("fieldTeam1Players"),
      team2_player_nicknames: tr("fieldTeam2Players"),
      team1_nicknames: tr("fieldTeam1Nicknames"),
      team2_nicknames: tr("fieldTeam2Nicknames"),
      team1_score: tr("fieldTeam1Score"),
      team2_score: tr("fieldTeam2Score"),
      method: tr("fieldMethod"),
      url: tr("fieldUrl"),
      nicknames: tr("fieldNicknames") || "Player nicknames",
      nickname: tr("fieldNickname") || "Player nickname",
    };
    if (byKey[key]) return byKey[key];
    return key
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function formatWhenPlain(iso) {
    if (iso == null || iso === "") return tr("emDash") || "—";
    var t = Date.parse(String(iso));
    if (isNaN(t)) return String(iso);
    try {
      return new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch (e) {
      return String(iso);
    }
  }

  function formatWhen(iso) {
    if (iso == null || iso === "") return escapeHtml(tr("emDash") || "—");
    var t = Date.parse(String(iso));
    if (isNaN(t)) return escapeHtml(String(iso));
    var d = new Date(t);
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    var yyyy = d.getFullYear();
    var dateStr =
      (mm < 10 ? "0" : "") + String(mm) + "/" +
      (dd < 10 ? "0" : "") + String(dd) + "/" +
      String(yyyy);
    var timeStr;
    try {
      timeStr = d.toLocaleTimeString(undefined, { timeStyle: "short" });
    } catch (e) {
      timeStr = d.toTimeString().slice(0, 5);
    }
    return (
      '<span class="match-when">' +
      '<span class="match-when-date">' + escapeHtml(dateStr) + '</span>' +
      '<span class="match-when-time">' + escapeHtml(timeStr) + '</span>' +
      '</span>'
    );
  }

  function matchDateGroupForCreatedAt(iso) {
    if (iso == null || iso === "") {
      return {
        key: "missing",
        label: tr("emDash") || "—",
      };
    }
    var t = Date.parse(String(iso));
    if (isNaN(t)) {
      return {
        key: "raw:" + String(iso),
        label: String(iso),
      };
    }
    var d = new Date(t);
    var yyyy = String(d.getFullYear());
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    var mmText = (mm < 10 ? "0" : "") + String(mm);
    var ddText = (dd < 10 ? "0" : "") + String(dd);
    return {
      key: yyyy + "-" + mmText + "-" + ddText,
      label: mmText + "-" + ddText + "-" + yyyy,
    };
  }

  function tryParseJson(text) {
    if (text == null || String(text).trim() === "") return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function humanDetailFromHttpBody(text) {
    var o = tryParseJson(text);
    if (!o || typeof o !== "object") {
      var s = (text || "").trim();
      if (!s) return "";
      return s.length > 400 ? s.slice(0, 400) + "…" : s;
    }
    if (typeof o.detail === "string") return o.detail;
    if (Array.isArray(o.detail)) {
      return o.detail
        .map(function (d) {
          if (d == null) return "";
          if (typeof d === "string") return d;
          if (typeof d.msg === "string") return d.msg;
          if (typeof d.message === "string") return d.message;
          return JSON.stringify(d);
        })
        .filter(Boolean)
        .join(" ");
    }
    if (o.detail && typeof o.detail === "object") {
      if (typeof o.detail.msg === "string") return o.detail.msg;
      if (typeof o.detail.message === "string") return o.detail.message;
    }
    if (typeof o.message === "string") return o.message;
    if (typeof o.error_message === "string") return o.error_message;
    return "";
  }

  function humanSuccessFromHttpBody(text) {
    var o = tryParseJson(text);
    if (o && typeof o === "object") {
      if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
      var d = humanDetailFromHttpBody(text);
      if (d) return d;
      // Anti-leak: a JSON success body with no human-readable
      // `message` / `detail` field is almost always ID-shaped
      // (e.g. `{match_id, team_id}`). Returning the raw stringified
      // body would dump those IDs into a "Done." callout, which
      // violates the "Never surface technical IDs in user-visible
      // UI" rule in `frontend/AGENTS.md`. Fall back to the localised
      // generic success line instead. If a future endpoint genuinely
      // needs to show structured success data, route it through a
      // bespoke renderer (mirror `isMatchCreationCall` /
      // `isMatchEditCall`) — do **not** weaken this fallback.
      return tr("changesSaved") || "Changes were saved.";
    }
    var plain = (text || "").trim();
    if (!plain) return tr("changesSaved") || "Changes were saved.";
    if (plain.length > 280) return plain.slice(0, 280) + "…";
    return plain;
  }

  var INTERNAL_DISPLAY_KEYS = {
    team_id: true,
    match_id: true,
    player_id: true,
    league_id: true,
    status_code: true,
    error_code: true,
  };

  function isInternalDisplayKey(k) {
    if (INTERNAL_DISPLAY_KEYS[k]) return true;
    if (/_id$/i.test(k) && k !== "created_at") return true;
    return false;
  }

  function sanitizeForDisplay(value, depth) {
    depth = depth || 0;
    if (depth > 6) return value;
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      return value.map(function (item) {
        return sanitizeForDisplay(item, depth + 1);
      });
    }
    if (typeof value === "object") {
      var out = {};
      Object.keys(value).forEach(function (k) {
        if (isInternalDisplayKey(k)) return;
        out[k] = sanitizeForDisplay(value[k], depth + 1);
      });
      return out;
    }
    return value;
  }

  function renderFallbackData(data) {
    var cleaned = sanitizeForDisplay(data);
    var keys = cleaned && typeof cleaned === "object" ? Object.keys(cleaned) : [];
    if (!keys.length) {
      return "<p class=\"hint\">" + escapeHtml(tr("noDetails") || "No additional details to show.") + "</p>";
    }
    return "<pre class=\"hint response-json\">" + escapeHtml(JSON.stringify(cleaned, null, 2)) + "</pre>";
  }

  function friendlyMessageFromTechnicalError(technical) {
    var api = window.TLCHAT_USER_FACING_ERRORS;
    if (api && typeof api.fromTechnical === "function") {
      return api.fromTechnical(technical);
    }
    var I = window.TLCHAT_I18N;
    return (
      (api && api.GENERIC_MESSAGE) ||
      (I && I.t ? I.t("errors.generic") : "") ||
      "Something went wrong. Please try again in a moment, or rephrase your question."
    );
  }

  function normalizeChatApiBaseUrl(raw) {
    var s = String(raw == null ? "" : raw)
      .trim()
      .replace(/\/+$/, "");
    if (!s) return "http://127.0.0.1:8080";
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    return s;
  }

  function chatApiBase() {
    var fromConfig = window.TLCHAT_CONFIG && window.TLCHAT_CONFIG.chatApiBaseUrl;
    return normalizeChatApiBaseUrl(fromConfig || "http://127.0.0.1:8080");
  }

  function backendMainBase() {
    var c = window.TLCHAT_CONFIG || {};
    var u = c.backendMainBaseUrl;
    if (!u || typeof u !== "string") {
      console.error("TLCHAT_CONFIG.backendMainBaseUrl missing; set in js/config.js");
      return "";
    }
    return u.replace(/\/$/, "");
  }

  function dateOnlyOrNull(raw) {
    var s = String(raw == null ? "" : raw).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }

  /**
   * GET /leagues/{id}/roster — used on chat open; includes league title for
   * header, the active LeagueRules config (so we can gate UI hints like the
   * partner-conflict warning without a second round-trip), and the roster
   * cache used to power @-mention autocomplete and match-form previews.
   */
  async function fetchLeagueRoster(leagueId) {
    var base = backendMainBase();
    if (!base || !leagueId) {
      return { ok: false, error: "missing_config_or_league" };
    }
    var url = base + "/leagues/" + encodeURIComponent(leagueId) + "/roster";
    var res = await fetch(url);
    var text = await res.text();
    if (!res.ok) {
      return { ok: false, error: "http", status: res.status, body: text };
    }
    try {
      var data = JSON.parse(text);
      var leagueTitle =
        data && typeof data.title === "string" ? data.title.trim() : "";
      var windowSecs =
        data && typeof data.player_score_edit_window_seconds === "number"
          ? data.player_score_edit_window_seconds
          : null;
      var deleteWindowSecs =
        data && typeof data.player_match_delete_window_seconds === "number"
          ? data.player_match_delete_window_seconds
          : null;
      return {
        ok: true,
        title: leagueTitle,
        league_timezone:
          data && typeof data.league_timezone === "string"
            ? data.league_timezone
            : "America/Los_Angeles",
        latest_match_date:
          data && typeof data.latest_match_date === "string"
            ? dateOnlyOrNull(data.latest_match_date)
            : null,
        rules: data && typeof data.rules === "object" && data.rules !== null ? data.rules : null,
        players: Array.isArray(data.players) ? data.players : [],
        teams: Array.isArray(data.teams) ? data.teams : [],
        player_score_edit_window_seconds: windowSecs,
        player_match_delete_window_seconds: deleteWindowSecs,
      };
    } catch (e) {
      return { ok: false, error: "parse", message: e && e.message ? e.message : String(e) };
    }
  }

  /** GET /admin/leagues/{id} — host contact email (admin URL + token only). */
  async function fetchLeagueAdminInfo(leagueId, hostToken) {
    var base = backendMainBase();
    if (!base || !leagueId || !hostToken) {
      return { ok: false, error: "missing_config_or_auth" };
    }
    var url = base + "/admin/leagues/" + encodeURIComponent(leagueId);
    try {
      var res = await fetch(url, {
        headers: { Accept: "application/json", "X-Host-Token": hostToken },
      });
      var text = await res.text();
      if (!res.ok) {
        return { ok: false, error: "http", status: res.status, body: text };
      }
      var data = JSON.parse(text);
      var hostEmail =
        data && typeof data.host_email === "string" ? data.host_email.trim() : "";
      if (!hostEmail) {
        return { ok: false, error: "missing_host_email" };
      }
      return { ok: true, host_email: hostEmail };
    } catch (e) {
      return {
        ok: false,
        error: "parse",
        message: e && e.message ? e.message : String(e),
      };
    }
  }

  async function fetchLeagueStandings(
    leagueId,
    dataType,
    playerName,
    startDate,
    endDate
  ) {
    var base = backendMainBase();
    if (!base || !leagueId) {
      return { ok: false, error: "missing_config_or_league" };
    }
    var isByPlayer = dataType === "GET_STANDINGS_BY_PLAYER";
    var path =
      "/leagues/" +
      encodeURIComponent(leagueId) +
      "/standings" +
      (isByPlayer ? "/by-player" : "");
    var params = new URLSearchParams();
    if (isByPlayer) {
      var name = String(playerName == null ? "" : playerName).trim();
      if (!name) return { ok: false, error: "missing_player_name" };
      params.set("player_name", name);
    }
    if (dateOnlyOrNull(startDate)) params.set("start_date", startDate);
    if (dateOnlyOrNull(endDate)) params.set("end_date", endDate);

    try {
      var url = base + path + (params.toString() ? "?" + params.toString() : "");
      var res = await fetch(url);
      var text = await res.text();
      if (!res.ok) {
        return { ok: false, error: "http", status: res.status, body: text };
      }
      return { ok: true, data: JSON.parse(text) };
    } catch (e) {
      return { ok: false, error: "parse", message: e && e.message ? e.message : String(e) };
    }
  }

  /** GET /leagues/{id}/matches — full history, same origin as roster (no host token). */
  async function fetchLeagueMatchHistory(leagueId) {
    var base = backendMainBase();
    if (!base || !leagueId) {
      return { ok: false, error: "missing_config_or_league" };
    }
    var url = base + "/leagues/" + encodeURIComponent(leagueId) + "/matches";
    var res = await fetch(url);
    var text = await res.text();
    if (!res.ok) {
      return { ok: false, error: "http", status: res.status, body: text };
    }
    try {
      var data = JSON.parse(text);
      return {
        ok: true,
        matches: Array.isArray(data.matches) ? data.matches : [],
      };
    } catch (e) {
      return { ok: false, error: "parse", message: e && e.message ? e.message : String(e) };
    }
  }

  /** GET /leagues/{id}/roster — host-only panel data.
   *
   * In v6 the roster IS the player list (the `allowlist_entries` side table
   * was dropped). Pre-registered players that have not yet played show up
   * in the same `players` array — they simply do not appear in `teams`. */
  async function fetchRosterPlayersFromApi(leagueId) {
    var base = backendMainBase();
    if (!base || !leagueId) {
      return { ok: false, error: "missing_config_or_league" };
    }
    var url = base + "/leagues/" + encodeURIComponent(leagueId) + "/roster";
    try {
      var res = await fetch(url);
      var text = await res.text();
      if (!res.ok) {
        return { ok: false, error: "http", status: res.status, body: text };
      }
      var data = JSON.parse(text);
      return {
        ok: true,
        players: Array.isArray(data.players) ? data.players : [],
      };
    } catch (e) {
      return { ok: false, error: "parse", message: e && e.message ? e.message : String(e) };
    }
  }

  /** Participation counts for roster remove gating (API fields with teams fallback). */
  function rosterPlayerParticipationCounts(player, teams) {
    var teamsCount =
      player && typeof player.teams_count === "number" ? player.teams_count : 0;
    var matchesCount =
      player && typeof player.matches_count === "number" ? player.matches_count : 0;
    if (teamsCount === 0 && teams && teams.length && player && player.nickname) {
      var nick = String(player.nickname).toLowerCase();
      teams.forEach(function (t) {
        if (
          String(t.player1_nickname || "").toLowerCase() === nick ||
          String(t.player2_nickname || "").toLowerCase() === nick
        ) {
          teamsCount += 1;
        }
      });
    }
    return { teamsCount: teamsCount, matchesCount: matchesCount };
  }

  function rosterPlayerCanRemove(player, teams) {
    var c = rosterPlayerParticipationCounts(player, teams);
    return c.teamsCount === 0 && c.matchesCount === 0;
  }

  function rosterPlayerRemoveDisableReason(isAdmin, player, teams) {
    if (!isAdmin) {
      return tr("rosterRemoveAdminOnly") || "Remove is available only in Admin mode.";
    }
    var c = rosterPlayerParticipationCounts(player, teams);
    var name = (player && player.nickname) || "";
    if (c.teamsCount > 0 && c.matchesCount > 0) {
      return (
        tr("rosterRemoveBlockedTeamAndMatch", { name: name }) ||
        name +
          " belongs to a team and appears in a match. Delete those first."
      );
    }
    if (c.teamsCount > 0) {
      return (
        tr("rosterRemoveBlockedTeam", { name: name }) ||
        name + " belongs to a team. Delete the team first."
      );
    }
    if (c.matchesCount > 0) {
      return (
        tr("rosterRemoveBlockedMatch", { name: name }) ||
        name + " appears in a match. Delete the match first."
      );
    }
    return "";
  }

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

  function playerCanonicalNickname(player) {
    return String((player && player.nickname) || "");
  }

  function playerAliases(player) {
    var canonicalNorm = normalizeMatchNickname(playerCanonicalNickname(player));
    var raw = Array.isArray(player && player.aliases) ? player.aliases : [];
    var seen = {};
    return raw
      .map(function (a) { return String(a == null ? "" : a).trim(); })
      .filter(function (alias) {
        var norm = normalizeMatchNickname(alias);
        if (!alias || !norm || norm === canonicalNorm || seen[norm]) return false;
        seen[norm] = true;
        return true;
      });
  }

  function playerNicknameSearchNorms(player) {
    var seen = {};
    var out = [];
    [playerCanonicalNickname(player)].concat(playerAliases(player)).forEach(function (name) {
      var norm = normalizeMatchNickname(name);
      if (!norm || seen[norm]) return;
      seen[norm] = true;
      out.push(norm);
    });
    return out;
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

  function leagueApiJsonErrorCode(text) {
    var o = tryParseJson(text);
    if (o && typeof o === "object" && typeof o.error === "string") return o.error;
    return "";
  }

  function isMatchCreationCall(method, url) {
    if (method !== "POST" || typeof url !== "string") return false;
    var withoutQuery = url.split("?")[0].replace(/\/+$/, "");
    return /\/matches$/.test(withoutQuery);
  }

  /**
   * Match-score-edit PATCH detector. Covers both the player route
   * (`/leagues/{lid}/matches/{mid}`) and the admin route
   * (`/admin/leagues/{lid}/matches/{mid}`); both endpoints share
   * `EditMatchScoreResponse`, which is ID-shaped — see AGENTS.md
   * "Never surface technical IDs in user-visible UI". The submit
   * success branch keys off this helper to render a localised
   * callout + a synthetic single-row history panel instead of the
   * raw response body.
   */
  function isMatchEditCall(method, url) {
    if (method !== "PATCH" || typeof url !== "string") return false;
    var withoutQuery = url.split("?")[0].replace(/\/+$/, "");
    return /\/matches\/[^/]+$/.test(withoutQuery);
  }

  /**
   * Match DELETE detector. Mirrors `isMatchEditCall` but for the
   * per-row Delete button flow. Covers both the player route
   * (`DELETE /leagues/{lid}/matches/{mid}`) and the admin route
   * (`DELETE /admin/leagues/{lid}/matches/{mid}`). The 204 success
   * branch keys off this helper to remove the row in place and
   * render a localised "match deleted" callout rather than running
   * the generic `humanSuccessFromHttpBody` fallback.
   */
  function isMatchDeleteCall(method, url) {
    if (method !== "DELETE" || typeof url !== "string") return false;
    var withoutQuery = url.split("?")[0].replace(/\/+$/, "");
    return /\/matches\/[^/]+$/.test(withoutQuery);
  }

  function extractMatchIdFromEditUrl(url) {
    if (typeof url !== "string") return "";
    var withoutQuery = url.split("?")[0].replace(/\/+$/, "");
    var m = withoutQuery.match(/\/matches\/([^/]+)$/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function responseLooksLikeStaticHtml(text) {
    var t = (text || "").slice(0, 500);
    return /^\s*</.test(t) && (/<!DOCTYPE/i.test(t) || /<html[\s>]/i.test(t));
  }

  function isFieldSpec(o) {
    return (
      o &&
      typeof o === "object" &&
      Object.prototype.hasOwnProperty.call(o, "type") &&
      Object.prototype.hasOwnProperty.call(o, "required") &&
      Object.prototype.hasOwnProperty.call(o, "value")
    );
  }

  /**
   * Returns true when the request must require `X-Host-Token` —
   * i.e. the URL targets an `/admin/` route. The frontend will refuse
   * to submit these without a token in scope.
   */
  function needsHostTokenForUrl(url) {
    return typeof url === "string" && url.indexOf("/admin/") !== -1;
  }

  /**
   * Returns true when we *should attach* `X-Host-Token` to the
   * outgoing request.
   *
   * Contract: the token is attached iff the URL targets an `/admin/*`
   * route. Player routes never receive the token — by design, so the
   * "admin work hits admin URL, player work hits player URL" rule
   * stays crisp (no silently-promoted player requests). The frontend
   * is responsible for routing admin-page write actions to the
   * `/admin/` URL in the first place; this helper just decides
   * whether to add the header to a URL someone has already built.
   *
   * Kept as a separate function from `needsHostTokenForUrl` (which is
   * a guard that refuses to submit when the token is missing) because
   * "should attach" and "must have" are conceptually different — the
   * guard is enforced before submit, this helper runs at the moment
   * headers are built.
   */
  function shouldAttachHostTokenForUrl(url, hostToken) {
    if (!hostToken) return false;
    if (typeof url !== "string" || !url) return false;
    return url.indexOf("/admin/") !== -1;
  }

  /** Aligns with backend PlayerNickname: trim + lowercase. */
  function normalizeMatchNickname(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  function nickPairFromBodySpec(bodySpec, key) {
    var spec = bodySpec[key];
    if (!spec || !isFieldSpec(spec) || !spec.type || spec.type.indexOf("array") !== 0) {
      return { raw: ["", ""], norm: ["", ""] };
    }
    var v = Array.isArray(spec.value) ? spec.value : [];
    var r0 = v[0] == null ? "" : String(v[0]).trim();
    var r1 = v[1] == null ? "" : String(v[1]).trim();
    return {
      raw: [r0, r1],
      norm: [normalizeMatchNickname(r0), normalizeMatchNickname(r1)],
    };
  }

  function rosterPlayerNormSet(players) {
    var set = Object.create(null);
    (players || []).forEach(function (p) {
      playerNicknameSearchNorms(p).forEach(function (n) {
        if (n) set[n] = true;
      });
    });
    return set;
  }

  function rosterCanonicalNormMap(players) {
    var map = Object.create(null);
    (players || []).forEach(function (p) {
      var canonical = normalizeMatchNickname(p && p.nickname);
      if (!canonical) return;
      playerNicknameSearchNorms(p).forEach(function (n) {
        if (n) map[n] = canonical;
      });
    });
    return map;
  }

  function canonicalizeNicknameNorm(norm, canonicalMap) {
    if (!norm) return "";
    return (canonicalMap && canonicalMap[norm]) || norm;
  }

  function canonicalizedNickPair(normPair, canonicalMap) {
    return [
      canonicalizeNicknameNorm(normPair && normPair[0], canonicalMap),
      canonicalizeNicknameNorm(normPair && normPair[1], canonicalMap),
    ];
  }

  function rosterTeamPairKey(a, b) {
    if (!a || !b) return "";
    return a < b ? a + "\0" + b : b + "\0" + a;
  }

  function matchRecordTeamPairKeys(record) {
    if (!record) return ["", ""];
    var k1 = rosterTeamPairKey(
      normalizeMatchNickname(record.team1_player1_nickname),
      normalizeMatchNickname(record.team1_player2_nickname)
    );
    var k2 = rosterTeamPairKey(
      normalizeMatchNickname(record.team2_player1_nickname),
      normalizeMatchNickname(record.team2_player2_nickname)
    );
    return [k1, k2];
  }

  function matchRecordMatchesSubmittedPair(record, t1Norms, t2Norms) {
    var kA = rosterTeamPairKey(t1Norms[0], t1Norms[1]);
    var kB = rosterTeamPairKey(t2Norms[0], t2Norms[1]);
    if (!kA || !kB) return false;
    var sides = matchRecordTeamPairKeys(record);
    var s0 = sides[0];
    var s1 = sides[1];
    if (!s0 || !s1) return false;
    return (kA === s0 && kB === s1) || (kA === s1 && kB === s0);
  }

  function leagueLocalDateKey(value, leagueTimezone) {
    var date = value instanceof Date ? value : new Date(Date.parse(String(value)));
    if (!date || !isFinite(date.getTime())) return "";
    var tz =
      typeof leagueTimezone === "string" && leagueTimezone.trim()
        ? leagueTimezone.trim()
        : "America/Los_Angeles";
    try {
      if (typeof Intl === "undefined" || !Intl.DateTimeFormat) {
        return date.toISOString().slice(0, 10);
      }
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      var byType = {};
      parts.forEach(function (part) {
        byType[part.type] = part.value;
      });
      if (byType.year && byType.month && byType.day) {
        return byType.year + "-" + byType.month + "-" + byType.day;
      }
    } catch (_e) {
      return date.toISOString().slice(0, 10);
    }
    return date.toISOString().slice(0, 10);
  }

  /**
   * Find the league match row for the same unordered pair of teams (handles swapped sides).
   * t1Norms/t2Norms: two-element arrays of normalized nicknames per team.
   */
  function findMatchRecordForSubmittedPair(matches, t1Norms, t2Norms) {
    for (var i = 0; i < (matches || []).length; i++) {
      if (matchRecordMatchesSubmittedPair(matches[i], t1Norms, t2Norms)) {
        return matches[i];
      }
    }
    return null;
  }

  function findSameDayMatchRecordForSubmittedPair(matches, t1Norms, t2Norms, leagueTimezone) {
    var submittedDay = leagueLocalDateKey(new Date(), leagueTimezone);
    if (!submittedDay) return null;
    for (var i = 0; i < (matches || []).length; i++) {
      var match = matches[i];
      if (!matchRecordMatchesSubmittedPair(match, t1Norms, t2Norms)) continue;
      if (leagueLocalDateKey(match.created_at, leagueTimezone) === submittedDay) {
        return match;
      }
    }
    return null;
  }

  function rosterPairKeysFromTeams(teams) {
    var keys = Object.create(null);
    (teams || []).forEach(function (t) {
      var a = normalizeMatchNickname(t.player1_nickname);
      var b = normalizeMatchNickname(t.player2_nickname);
      if (a && b) keys[rosterTeamPairKey(a, b)] = true;
    });
    return keys;
  }

  function findRosterTeamForPlayer(playerNorm, teams) {
    if (!playerNorm) return null;
    for (var i = 0; i < (teams || []).length; i++) {
      var tm = teams[i];
      var a = normalizeMatchNickname(tm.player1_nickname);
      var b = normalizeMatchNickname(tm.player2_nickname);
      if (a === playerNorm) {
        return {
          player1_nickname: tm.player1_nickname,
          player2_nickname: tm.player2_nickname,
          partnerNorm: b,
        };
      }
      if (b === playerNorm) {
        return {
          player1_nickname: tm.player1_nickname,
          player2_nickname: tm.player2_nickname,
          partnerNorm: a,
        };
      }
    }
    return null;
  }

  function escapeTeamPairLabel(p1, p2) {
    return escapeHtml(p1) + " + " + escapeHtml(p2);
  }

  /**
   * Compares prefilled match form nicknames to cached GET /roster (same normalization as backend).
   *
   * The partner-conflict warning ("Player X is already in the following team:
   * ...") only makes sense under `LeagueRules.one_team_per_player = true`,
   * which is the backend-default but configurable since rules v3. When the
   * league explicitly allows a player to belong to multiple teams we skip the
   * warning entirely — the partnership is legitimately a new team, not a
   * conflict — and still surface the "new team registration" hint. If
   * `leagueRoster.rules` is missing (older response or fetch in progress) we
   * fall back to the conservative one-team-per-player assumption so existing
   * leagues don't lose the warning.
   */
  function renderMatchSubmitRosterNotes(bodySpec, leagueRoster) {
    if (!leagueRoster || leagueRoster.status !== "ok") {
      return (
        '<div class="match-form-roster-notes">' +
        '<p class="hint">' +
        escapeHtml(tr("rosterLoadingNotes") || "League roster is still loading or could not be loaded; registration previews are unavailable.") +
        "</p>" +
        "</div>"
      );
    }

    var players = leagueRoster.players || [];
    var teams = leagueRoster.teams || [];
    var known = rosterPlayerNormSet(players);
    var canonicalMap = rosterCanonicalNormMap(players);
    var pairKeys = rosterPairKeysFromTeams(teams);
    var allowMultipleTeamsPerPlayer =
      !!(leagueRoster.rules && leagueRoster.rules.one_team_per_player === false);

    var t1 = nickPairFromBodySpec(bodySpec, "team1_nicknames");
    var t2 = nickPairFromBodySpec(bodySpec, "team2_nicknames");
    var t1CanonicalNorm = canonicalizedNickPair(t1.norm, canonicalMap);
    var t2CanonicalNorm = canonicalizedNickPair(t2.norm, canonicalMap);

    var normToDisplay = Object.create(null);
    function rememberDisplay(norm, raw) {
      if (!norm || !raw) return;
      if (!(norm in normToDisplay)) normToDisplay[norm] = raw;
    }
    rememberDisplay(t1.norm[0], t1.raw[0]);
    rememberDisplay(t1.norm[1], t1.raw[1]);
    rememberDisplay(t2.norm[0], t2.raw[0]);
    rememberDisplay(t2.norm[1], t2.raw[1]);

    var newPlayerNormsOrder = [];
    function addNewPlayerNorm(n) {
      if (!n || known[n]) return;
      if (newPlayerNormsOrder.indexOf(n) === -1) newPlayerNormsOrder.push(n);
    }
    addNewPlayerNorm(t1.norm[0]);
    addNewPlayerNorm(t1.norm[1]);
    addNewPlayerNorm(t2.norm[0]);
    addNewPlayerNorm(t2.norm[1]);

    var warnings = [];
    var newTeams = [];

    function analyzeSide(raw, norm) {
      var n0 = norm[0];
      var n1 = norm[1];
      var r0 = raw[0];
      var r1 = raw[1];
      if (!n0 || !n1 || n0 === n1) return;
      if (pairKeys[rosterTeamPairKey(n0, n1)]) return;

      if (allowMultipleTeamsPerPlayer) {
        newTeams.push(escapeTeamPairLabel(r0, r1));
        return;
      }

      var sideConflict = false;
      var teamA = findRosterTeamForPlayer(n0, teams);
      if (teamA && teamA.partnerNorm !== n1) {
        warnings.push(
          tr("rosterWarnPlayerTeam", {
            player: escapeHtml(r0 || n0),
            team: escapeTeamPairLabel(teamA.player1_nickname, teamA.player2_nickname),
          }) ||
            "Player " +
              escapeHtml(r0 || n0) +
              " is already in the following team: <strong>" +
              escapeTeamPairLabel(teamA.player1_nickname, teamA.player2_nickname) +
              "</strong>"
        );
        sideConflict = true;
      }
      var teamB = findRosterTeamForPlayer(n1, teams);
      if (teamB && teamB.partnerNorm !== n0) {
        warnings.push(
          tr("rosterWarnPlayerTeam", {
            player: escapeHtml(r1 || n1),
            team: escapeTeamPairLabel(teamB.player1_nickname, teamB.player2_nickname),
          }) ||
            "Player " +
              escapeHtml(r1 || n1) +
              " is already in the following team: <strong>" +
              escapeTeamPairLabel(teamB.player1_nickname, teamB.player2_nickname) +
              "</strong>"
        );
        sideConflict = true;
      }
      if (!sideConflict) {
        newTeams.push(escapeTeamPairLabel(r0, r1));
      }
    }

    analyzeSide(t1.raw, t1CanonicalNorm);
    analyzeSide(t2.raw, t2CanonicalNorm);

    var chunks = [];
    if (newPlayerNormsOrder.length) {
      var labels = newPlayerNormsOrder.map(function (n) {
        return "<strong>" + escapeHtml(normToDisplay[n] || n) + "</strong>";
      });
      chunks.push(
        tr("newPlayerRegLine", { list: labels.join(", ") }) ||
          "<p class=\"hint roster-note-info\"><strong>New player registration:</strong> Following players will be registered: " +
            labels.join(", ") +
            "</p>"
      );
    }
    if (newTeams.length) {
      var boldTeams = newTeams.map(function (tm) {
        return "<strong>" + tm + "</strong>";
      });
      var teamLine =
        newTeams.length === 1
          ? tr("newTeamLineOne", { team: boldTeams[0] })
          : tr("newTeamLineMany", { teams: boldTeams.join("; ") });
      chunks.push(
        teamLine ||
          "<p class=\"hint roster-note-info\"><strong>New team registration:</strong> " +
            (newTeams.length === 1
              ? "Following team will be created: " + boldTeams[0]
              : "Following teams will be created: " + boldTeams.join("; ")) +
            "</p>"
      );
    }
    warnings.forEach(function (w) {
      chunks.push(
        '<p class="hint roster-note-warn"><strong>' +
          escapeHtml(tr("warning") || "Warning:") +
          "</strong> " +
          w +
          "</p>"
      );
    });

    if (!chunks.length) return "";
    return '<div class="match-form-roster-notes">' + chunks.join("") + "</div>";
  }

  function assistantContentFromResponse(resp) {
    if (resp.data_type === "CLARIFICATION_QUESTION") return resp.data.question || "";
    if (resp.data_type === "ERROR") return "";
    var sm = (resp.server_message || "").trim();
    if (sm) return sm;
    if (READ_TYPES[resp.data_type]) {
      var title = panelTitleForDataType(resp.data_type);
      var pn = resp.data && resp.data.player_name;
      if (pn) {
        return (
          tr("assistantForPlayer", { title: title, name: String(pn).trim() }) ||
          title + " for " + String(pn).trim()
        );
      }
      return title;
    }
    return "[" + resp.data_type + "]";
  }

  // Per-metric column: i18n header, accessor, signed formatting for differentials.
  // Keys mirror backend LeagueRules RankingMetric; `matches_played` is an extra
  // row field (not a ranking metric). See backend design doc 17.
  var METRIC_COLUMN = {
    matches_won: {
      headerKey: "tableMatchesWon",
      headerFallback: "Won",
      get: function (r) { return r.wins; },
      signed: false,
    },
    match_diff: {
      headerKey: "tableMatchDiff",
      headerFallback: "Match \u00B1",
      get: function (r) {
        var w = typeof r.wins === "number" ? r.wins : 0;
        var l = typeof r.losses === "number" ? r.losses : 0;
        return w - l;
      },
      signed: true,
    },
    games_won: {
      headerKey: "tableGamesWon",
      headerFallback: "Games won",
      get: function (r) { return r.games_won; },
      signed: false,
    },
    games_lost: {
      headerKey: "tableGamesLost",
      headerFallback: "Games lost",
      get: function (r) { return r.games_lost; },
      signed: false,
    },
    games_diff: {
      headerKey: "tableGamesDiff",
      headerFallback: "Games \u00B1",
      get: function (r) { return r.games_diff; },
      signed: true,
    },
    win_pct: {
      headerKey: "tableWinPct",
      headerFallback: "Win %",
      get: function (r) {
        var v = typeof r.win_pct === "number" ? r.win_pct : 0;
        return Math.round(v * 1000) / 10 + "%";
      },
      signed: false,
    },
    matches_played: {
      headerKey: "tableMatchesPlayed",
      headerFallback: "Played",
      get: function (r) { return r.matches_played; },
      signed: false,
    },
  };

  // Non-tie-breaker metrics follow W/L/D/Played; `matches_played` is rendered there.
  var STANDINGS_SUPPLEMENTARY_METRIC_ORDER = [
    "matches_won",
    "match_diff",
    "games_won",
    "games_lost",
    "games_diff",
    "win_pct",
  ];

  function partitionStandingsMetricKeys(tieBreakers) {
    var tb = Array.isArray(tieBreakers) ? tieBreakers : [];
    var rankKeys = [];
    var seen = {};
    var i;
    for (i = 0; i < tb.length; i++) {
      var m = tb[i];
      if (METRIC_COLUMN[m] && !seen[m]) {
        seen[m] = true;
        rankKeys.push(m);
      }
    }
    var suppKeys = [];
    for (i = 0; i < STANDINGS_SUPPLEMENTARY_METRIC_ORDER.length; i++) {
      var key = STANDINGS_SUPPLEMENTARY_METRIC_ORDER[i];
      if (!seen[key]) {
        seen[key] = true;
        suppKeys.push(key);
      }
    }
    return { rankKeys: rankKeys, suppKeys: suppKeys };
  }

  function rankingMetricSet(tieBreakers) {
    var s = {};
    if (Array.isArray(tieBreakers)) {
      var i;
      for (i = 0; i < tieBreakers.length; i++) {
        if (METRIC_COLUMN[tieBreakers[i]]) s[tieBreakers[i]] = true;
      }
    }
    return s;
  }

  function formatMetricValue(col, row) {
    var raw = col.get(row);
    if (raw === null || raw === undefined) return "";
    if (col.signed && typeof raw === "number") {
      return raw > 0 ? "+" + raw : String(raw);
    }
    return String(raw);
  }

  function cloneStandingsDataWithDateFilter(data, startDate, endDate) {
    var source = data && typeof data === "object" ? data : {};
    var next = {};
    Object.keys(source).forEach(function (key) {
      next[key] = source[key];
    });
    next.standings = Array.isArray(source.standings) ? source.standings : [];
    next.tie_breakers = Array.isArray(source.tie_breakers) ? source.tie_breakers : [];
    next._standings_filter_start_date = dateOnlyOrNull(startDate) || "";
    next._standings_filter_end_date = dateOnlyOrNull(endDate) || "";
    return next;
  }

  function renderStandingsDateControls(data, dataType) {
    var startDate = dateOnlyOrNull(data && data._standings_filter_start_date) || "";
    var endDate = dateOnlyOrNull(data && data._standings_filter_end_date) || "";
    var playerName =
      dataType === "GET_STANDINGS_BY_PLAYER" && data && data.player_name != null
        ? String(data.player_name).trim()
        : "";
    return (
      '<form class="standings-date-filter" data-standings-date-filter' +
      ' data-standings-type="' +
      escapeAttr(dataType || "") +
      '" data-player-name="' +
      escapeAttr(playerName) +
      '">' +
      '<div class="standings-date-fields">' +
      '<label class="standings-date-field">' +
      '<span>' +
      escapeHtml(tr("standingsStartDate") || "Start date") +
      "</span>" +
      '<input type="date" name="start_date" value="' +
      escapeAttr(startDate) +
      '">' +
      "</label>" +
      '<label class="standings-date-field">' +
      '<span>' +
      escapeHtml(tr("standingsEndDate") || "End date") +
      "</span>" +
      '<input type="date" name="end_date" value="' +
      escapeAttr(endDate) +
      '">' +
      "</label>" +
      '<div class="standings-date-actions">' +
      '<button type="submit" class="btn-secondary standings-date-apply">' +
      escapeHtml(tr("standingsApplyFilter") || "Apply") +
      "</button>" +
      '<button type="button" class="btn-secondary standings-date-clear" data-standings-clear>' +
      escapeHtml(tr("standingsClearFilter") || "Clear") +
      "</button>" +
      "</div>" +
      "</div>" +
      '<p class="standings-date-error" data-standings-date-error hidden></p>' +
      "</form>"
    );
  }

  function standingsRowsWithMatches(rows) {
    return (rows || []).filter(function (r) {
      return (Number(r.matches_played) || 0) > 0;
    });
  }

  function renderStandings(data) {
    var rows = standingsRowsWithMatches(data.standings);
    if (!rows.length) {
      return "<p class=\"hint\">" + escapeHtml(tr("standingsEmpty") || "No standings yet.") + "</p>";
    }
    var subjectKind = rows[0].subject_kind || "team";
    var subjectHeader =
      subjectKind === "player"
        ? escapeHtml(tr("tablePlayer") || "Player")
        : escapeHtml(tr("tableTeam") || "Team");
    var parts = partitionStandingsMetricKeys(data.tie_breakers);
    var rankKeys = parts.rankKeys;
    var suppKeys = parts.suppKeys;
    var rankMetrics = rankingMetricSet(data.tie_breakers);
    var showPlayedColumn = !rankMetrics.matches_played;
    var h =
      "<div class=\"standings-table-wrap\"><table class=\"data standings-table\"><thead><tr><th>" +
      escapeHtml(tr("tableRank") || "Rank") +
      "</th><th>" +
      subjectHeader +
      "</th>";
    var hi;
    for (hi = 0; hi < rankKeys.length; hi++) {
      var rk = rankKeys[hi];
      var rankColDef = METRIC_COLUMN[rk];
      var rankHdr = escapeHtml(tr(rankColDef.headerKey) || rankColDef.headerFallback);
      h += "<th class=\"standings-metric-rank\"><strong>" + rankHdr + "</strong></th>";
    }
    h +=
      "<th>" +
      escapeHtml(tr("tableW") || "W") +
      "</th><th>" +
      escapeHtml(tr("tableL") || "L") +
      "</th><th>" +
      escapeHtml(tr("tableD") || "D") +
      "</th>";
    if (showPlayedColumn) {
      var playedColDef = METRIC_COLUMN.matches_played;
      h +=
        "<th>" +
        escapeHtml(tr(playedColDef.headerKey) || playedColDef.headerFallback) +
        "</th>";
    }
    for (hi = 0; hi < suppKeys.length; hi++) {
      var sk = suppKeys[hi];
      var suppColDef = METRIC_COLUMN[sk];
      h +=
        "<th>" +
        escapeHtml(tr(suppColDef.headerKey) || suppColDef.headerFallback) +
        "</th>";
    }
    h += "</tr></thead><tbody>";
    rows.forEach(function (r) {
      var subjectLabel;
      if ((r.subject_kind || "team") === "player") {
        subjectLabel = escapeHtml(r.nickname);
      } else {
        subjectLabel =
          escapeHtml(r.player1_nickname) + " + " + escapeHtml(r.player2_nickname);
      }
      h +=
        "<tr><td>" +
        escapeHtml(r.rank) +
        "</td><td>" +
        subjectLabel +
        "</td>";
      var ci;
      for (ci = 0; ci < rankKeys.length; ci++) {
        var rck = rankKeys[ci];
        var rcdef = METRIC_COLUMN[rck];
        h +=
          "<td class=\"standings-metric-rank\"><strong>" +
          escapeHtml(formatMetricValue(rcdef, r)) +
          "</strong></td>";
      }
      h +=
        "<td>" +
        escapeHtml(r.wins) +
        "</td><td>" +
        escapeHtml(r.losses) +
        "</td><td>" +
        escapeHtml(r.draws == null ? 0 : r.draws) +
        "</td>";
      if (showPlayedColumn) {
        h +=
          "<td>" +
          escapeHtml(formatMetricValue(METRIC_COLUMN.matches_played, r)) +
          "</td>";
      }
      for (ci = 0; ci < suppKeys.length; ci++) {
        var sck = suppKeys[ci];
        var scdef = METRIC_COLUMN[sck];
        h += "<td>" + escapeHtml(formatMetricValue(scdef, r)) + "</td>";
      }
      h += "</tr>";
    });
    return h + "</tbody></table></div>";
  }

  /**
   * Returns the Actions-cell HTML for a single match row, OR an empty
   * string when no Update button should be rendered (e.g. the row has
   * no `match_id` so we can't build a PATCH URL).
   *
   * Behaviour matrix:
   *   admin  | within window | -> Update enabled
   *   admin  | past window   | -> Update enabled (admin bypasses)
   *   player | within window | -> Update enabled
   *   player | past window   | -> Update DISABLED + tooltip
   *   anyone | no created_at | -> Update DISABLED (server can't compute age,
   *                               so be conservative; admin would also need
   *                               created_at to confirm the row anyway)
   *   anyone | window unknown| -> Update enabled (server is the source of
   *                               truth on submit, so be permissive on UI
   *                               while the roster fetch is in flight)
   */
  function renderMatchRowUpdateAction(match, isAdmin) {
    if (!match || !match.match_id) return "";
    var btnLabel = tr("updateButton") || "Update";
    var matchId = String(match.match_id);
    var windowSecs = getPlayerEditWindowSeconds();

    var disabled = false;
    if (!isAdmin) {
      if (!match.created_at) {
        disabled = true;
      } else if (windowSecs != null) {
        var ageMs = Date.now() - Date.parse(String(match.created_at));
        if (!isFinite(ageMs) || ageMs / 1000 > windowSecs) {
          disabled = true;
        }
      }
    }

    if (!disabled) {
      return (
        '<span class="match-update-wrap">' +
        '<button type="button" class="btn-secondary btn-edit-row btn-match-update"' +
        ' data-update-match-id="' + escapeAttr(matchId) + '"' +
        ' aria-label="' + escapeAttr(btnLabel) + '">' +
        escapeHtml(btnLabel) +
        "</button>" +
        "</span>"
      );
    }

    // Disabled path: build the tooltip text from i18n + minutes derived
    // from windowSecs. The {minutes} template lets the locale string
    // place the number naturally in either language.
    var minutes =
      windowSecs != null ? Math.max(1, Math.round(windowSecs / 60)) : null;
    var tooltipMsg =
      minutes != null
        ? tr("updateButtonDisabledTooltip", { minutes: String(minutes) })
        : tr("updateButtonDisabledTooltipUnknownWindow") ||
          "This match can no longer be updated by players. Please ask your tennis group host.";
    if (!tooltipMsg) {
      tooltipMsg =
        "This match can no longer be updated by players. Please ask your tennis group host.";
    }

    return (
      '<span class="match-update-wrap match-update-wrap--disabled" tabindex="0">' +
      '<button type="button" class="btn-secondary btn-edit-row btn-match-update" disabled' +
      ' aria-label="' + escapeAttr(btnLabel) + '">' +
      escapeHtml(btnLabel) +
      "</button>" +
      '<span class="match-update-tip" role="tooltip">' +
      escapeHtml(tooltipMsg) +
      "</span>" +
      "</span>"
    );
  }

  /**
   * Returns the Delete-button HTML for a single match row, OR an empty
   * string when no Delete button should be rendered (e.g. the row has
   * no `match_id` so we can't build a DELETE URL).
   *
   * Mirrors `renderMatchRowUpdateAction` exactly — same behaviour
   * matrix, same disabled+tooltip pattern. The only differences are
   * the window value consulted (`getPlayerMatchDeleteWindowSeconds`)
   * and the wrapper / button CSS class so the click handler in
   * `bindMatchRowDeleteButtons` can find them independently of the
   * Update buttons.
   */
  function renderMatchRowDeleteAction(match, isAdmin) {
    if (!match || !match.match_id) return "";
    var btnLabel = tr("deleteButton") || "Delete";
    var matchId = String(match.match_id);
    var windowSecs = getPlayerMatchDeleteWindowSeconds();

    var disabled = false;
    if (!isAdmin) {
      if (!match.created_at) {
        disabled = true;
      } else if (windowSecs != null) {
        var ageMs = Date.now() - Date.parse(String(match.created_at));
        if (!isFinite(ageMs) || ageMs / 1000 > windowSecs) {
          disabled = true;
        }
      }
    }

    if (!disabled) {
      return (
        '<span class="match-delete-wrap">' +
        '<button type="button" class="btn-secondary btn-edit-row btn-match-delete"' +
        ' data-delete-match-id="' + escapeAttr(matchId) + '"' +
        ' aria-label="' + escapeAttr(btnLabel) + '">' +
        escapeHtml(btnLabel) +
        "</button>" +
        "</span>"
      );
    }

    var minutes =
      windowSecs != null ? Math.max(1, Math.round(windowSecs / 60)) : null;
    var tooltipMsg =
      minutes != null
        ? tr("deleteButtonDisabledTooltip", { minutes: String(minutes) })
        : tr("deleteButtonDisabledTooltipUnknownWindow") ||
          "This match can no longer be deleted by players. Please ask your tennis group host.";
    if (!tooltipMsg) {
      tooltipMsg =
        "This match can no longer be deleted by players. Please ask your tennis group host.";
    }

    return (
      '<span class="match-delete-wrap match-delete-wrap--disabled" tabindex="0">' +
      '<button type="button" class="btn-secondary btn-edit-row btn-match-delete" disabled' +
      ' aria-label="' + escapeAttr(btnLabel) + '">' +
      escapeHtml(btnLabel) +
      "</button>" +
      '<span class="match-delete-tip" role="tooltip">' +
      escapeHtml(tooltipMsg) +
      "</span>" +
      "</span>"
    );
  }

  function renderMatches(data, isAdmin) {
    var rows = data.matches || [];
    if (!rows.length) {
      return "<p class=\"hint\">" + escapeHtml(tr("matchesEmpty") || "No matches recorded.") + "</p>";
    }
    // We only render the Actions column when at least one row carries a
    // `match_id`. Older call sites that pass synthetic rows without ids
    // (e.g. the previous post-submit success branch) thus keep their
    // existing 3-column shape.
    var hasAnyId = rows.some(function (m) { return m && m.match_id; });
    var h =
      "<div class=\"match-history-table-wrap\"><table class=\"data match-history-table\"><thead><tr><th>" +
      escapeHtml(tr("tableTeams") || "Teams") +
      "</th><th>" +
      escapeHtml(tr("tableScore") || "Score") +
      "</th>" +
      (hasAnyId
        ? "<th class=\"col-actions\">" +
          escapeHtml(tr("tableActions") || "Actions") +
          "</th>"
        : "") +
      "<th class=\"col-when\">" +
      escapeHtml(tr("tableWhen") || "When") +
      "</th>" +
      "</tr></thead><tbody>";
    var colCount = hasAnyId ? 4 : 3;
    var lastDateGroupKey = null;
    rows.forEach(function (m) {
      var t1 =
        '<span class="match-team match-team--1">' +
        escapeHtml(m.team1_player1_nickname) +
        ' <span class="match-team-plus">+</span> ' +
        escapeHtml(m.team1_player2_nickname) +
        "</span>";
      var t2 =
        '<span class="match-team match-team--2">' +
        escapeHtml(m.team2_player1_nickname) +
        ' <span class="match-team-plus">+</span> ' +
        escapeHtml(m.team2_player2_nickname) +
        "</span>";
      var when = m.created_at ? formatWhen(m.created_at) : escapeHtml(tr("emDash") || "—");
      var matchId = m.match_id ? String(m.match_id) : "";
      var dateGroup = matchDateGroupForCreatedAt(m.created_at);
      if (dateGroup.key !== lastDateGroupKey) {
        h +=
          '<tr class="match-date-row" data-date-group-key="' +
          escapeAttr(dateGroup.key) +
          '"><th scope="rowgroup" colspan="' +
          String(colCount) +
          '"><button type="button" class="match-date-toggle" aria-expanded="true" data-date-label="' +
          escapeAttr(dateGroup.label) +
          '"><span class="match-date-chevron" aria-hidden="true"></span><span class="match-date-heading">' +
          escapeHtml(dateGroup.label) +
          "</span></button></th></tr>";
        lastDateGroupKey = dateGroup.key;
      }
      // Stash the row's domain payload as data-* so a successful
      // PATCH can rebuild the row's synthetic match record without
      // re-fetching history or surfacing the response body (which is
      // ID-shaped — see AGENTS.md "Never surface technical IDs in
      // user-visible UI"). Only attached when we have a match_id;
      // synthetic rows without ids stay 3-column and never offer
      // Update, so they don't need the metadata.
      var rowDataAttrs = matchId
        ? " data-match-row-id=\"" + escapeAttr(matchId) + "\"" +
          (m.created_at
            ? " data-match-created-at=\"" + escapeAttr(String(m.created_at)) + "\""
            : "") +
          " data-team1-p1=\"" + escapeAttr(m.team1_player1_nickname || "") + "\"" +
          " data-team1-p2=\"" + escapeAttr(m.team1_player2_nickname || "") + "\"" +
          " data-team2-p1=\"" + escapeAttr(m.team2_player1_nickname || "") + "\"" +
          " data-team2-p2=\"" + escapeAttr(m.team2_player2_nickname || "") + "\""
        : "";
      h +=
        "<tr class=\"match-row\"" +
        rowDataAttrs +
        "><td class=\"col-teams\"><span class=\"match-teams\">" +
        t1 +
        '<span class="match-vs">' +
        escapeHtml(tr("vs") || "vs") +
        "</span>" +
        t2 +
        "</span></td><td>" +
        escapeHtml(m.team1_score) +
        " – " +
        escapeHtml(m.team2_score) +
        "</td>" +
        (hasAnyId
          ? "<td class=\"col-actions match-row-actions\">" +
            renderMatchRowUpdateAction(m, !!isAdmin) +
            renderMatchRowDeleteAction(m, !!isAdmin) +
            "</td>"
          : "") +
        "<td class=\"col-when\">" +
        when +
        "</td>" +
        "</tr>";
    });
    return h + "</tbody></table></div>";
  }

  function removeEmptyMatchDateRows(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll(".match-date-row").forEach(function (dateRow) {
      var node = dateRow.nextElementSibling;
      var hasMatchInGroup = false;
      while (node && !node.classList.contains("match-date-row")) {
        if (node.classList.contains("match-row")) {
          hasMatchInGroup = true;
          break;
        }
        node = node.nextElementSibling;
      }
      if (!hasMatchInGroup && dateRow.parentNode) {
        dateRow.parentNode.removeChild(dateRow);
      }
    });
  }

  function matchDateToggleAriaLabel(dateLabel, collapsed) {
    if (collapsed) {
      return tr("matchDateShow", { date: dateLabel }) || "Show matches for " + dateLabel;
    }
    return tr("matchDateHide", { date: dateLabel }) || "Hide matches for " + dateLabel;
  }

  function setMatchDateGroupCollapsed(dateRow, collapsed) {
    if (!dateRow) return;
    dateRow.classList.toggle("match-date-row--collapsed", collapsed);
    var btn = dateRow.querySelector(".match-date-toggle");
    var dateLabel =
      (btn && btn.getAttribute("data-date-label")) ||
      (dateRow.querySelector(".match-date-heading") &&
        dateRow.querySelector(".match-date-heading").textContent) ||
      "";
    if (btn) {
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      btn.setAttribute("aria-label", matchDateToggleAriaLabel(dateLabel, collapsed));
    }
    var node = dateRow.nextElementSibling;
    while (node && !node.classList.contains("match-date-row")) {
      node.classList.toggle("match-date-group-hidden", collapsed);
      node = node.nextElementSibling;
    }
  }

  function bindMatchDateGroupToggles(wrap) {
    if (!wrap) return;
    var panel = wrap.querySelector(".data-panel") || wrap;
    var dateRows = panel.querySelectorAll(".match-date-row");
    if (!dateRows.length) return;
    dateRows.forEach(function (dateRow, idx) {
      setMatchDateGroupCollapsed(dateRow, idx > 0);
      var btn = dateRow.querySelector(".match-date-toggle");
      if (!btn || btn.getAttribute("data-date-bound") === "1") return;
      btn.setAttribute("data-date-bound", "1");
      btn.addEventListener("click", function () {
        setMatchDateGroupCollapsed(
          dateRow,
          !dateRow.classList.contains("match-date-row--collapsed")
        );
      });
    });
  }

  /**
   * Edit-match-score picker:
   *   - renders the candidate matches table with a per-row "Edit" button
   *   - empty matches → friendly hint instead of a table
   *   - the inline edit form per row is created lazily in
   *     bindEditMatchScorePicker when the user clicks "Edit"
   */
  function renderEditMatchScorePicker(data) {
    var matches = Array.isArray(data && data.matches) ? data.matches : [];
    var filters = Array.isArray(data && data.player_filters) ? data.player_filters : [];

    var filterChips = filters
      .map(function (n) {
        return '<span class="match-picker-filter">' + escapeHtml(n) + "</span>";
      })
      .join("");
    var heading =
      '<div class="match-picker-heading">' +
      '<span class="match-picker-heading-label">' +
      escapeHtml(
        tr("editMatchPickerLabel") || "Showing matches that contain ALL of:"
      ) +
      "</span>" +
      filterChips +
      "</div>";

    var title =
      "<h3>" +
      escapeHtml(tr("editMatchPickerTitle") || "Pick a match to edit") +
      "</h3>";

    if (!matches.length) {
      return (
        '<div class="data-panel match-picker">' +
        title +
        heading +
        '<p class="hint match-picker-empty">' +
        escapeHtml(
          tr("editMatchPickerEmpty") ||
            "No recorded match contains ALL of those players. Try mentioning fewer or different nicknames."
        ) +
        "</p>" +
        "</div>"
      );
    }

    var rowsHtml = matches
      .map(function (m) {
        var t1 =
          '<span class="match-team match-team--1">' +
          escapeHtml(m.team1_player1_nickname) +
          ' <span class="match-team-plus">+</span> ' +
          escapeHtml(m.team1_player2_nickname) +
          "</span>";
        var t2 =
          '<span class="match-team match-team--2">' +
          escapeHtml(m.team2_player1_nickname) +
          ' <span class="match-team-plus">+</span> ' +
          escapeHtml(m.team2_player2_nickname) +
          "</span>";
        var when = m.created_at
          ? formatWhen(m.created_at)
          : escapeHtml(tr("emDash") || "—");
        var matchId = m.match_id || "";
        // Same row-payload attrs as renderMatches so a post-PATCH
        // success can reconstruct the row from this picker without
        // surfacing IDs from the response. See "No technical IDs in
        // user-visible UI" in AGENTS.md.
        var pickerRowAttrs =
          ' data-match-row-id="' + escapeAttr(matchId) + '"' +
          (m.created_at
            ? ' data-match-created-at="' + escapeAttr(String(m.created_at)) + '"'
            : "") +
          ' data-team1-p1="' + escapeAttr(m.team1_player1_nickname || "") + '"' +
          ' data-team1-p2="' + escapeAttr(m.team1_player2_nickname || "") + '"' +
          ' data-team2-p1="' + escapeAttr(m.team2_player1_nickname || "") + '"' +
          ' data-team2-p2="' + escapeAttr(m.team2_player2_nickname || "") + '"';
        return (
          '<tr class="match-picker-row"' +
          pickerRowAttrs +
          ">" +
          '<td class="col-teams"><span class="match-teams">' +
          t1 +
          '<span class="match-vs">' +
          escapeHtml(tr("vs") || "vs") +
          "</span>" +
          t2 +
          "</span></td>" +
          "<td>" +
          escapeHtml(m.team1_score) +
          " – " +
          escapeHtml(m.team2_score) +
          "</td>" +
          '<td class="col-when">' +
          when +
          "</td>" +
          '<td class="match-picker-actions">' +
          '<button type="button" class="btn-edit-row" data-edit-match-id="' +
          escapeAttr(matchId) +
          '">' +
          escapeHtml(tr("editButton") || "Edit") +
          "</button>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    return (
      '<div class="data-panel match-picker">' +
      title +
      heading +
      '<table class="data match-picker-table">' +
      "<thead><tr>" +
      "<th>" +
      escapeHtml(tr("tableTeams") || "Teams") +
      "</th>" +
      "<th>" +
      escapeHtml(tr("tableScore") || "Score") +
      "</th>" +
      "<th>" +
      escapeHtml(tr("tableWhen") || "When") +
      "</th>" +
      "<th></th>" +
      "</tr></thead>" +
      "<tbody>" +
      rowsHtml +
      "</tbody>" +
      "</table>" +
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

  function renderReadPanelFilterNote(data) {
    var name = data && data.player_name;
    if (name == null || String(name).trim() === "") return "";
    return (
      '<p class="read-panel-filter hint">' +
      escapeHtml(tr("filterFor", { name: String(name).trim() }) || "Showing results for " + String(name).trim() + ".") +
      "</p>"
    );
  }

  /** Match HELP payload ordering to the shell intent helper (getUserIntents / getAdminIntents). */
  function orderIntentsByCanonical(intents, canonical) {
    var rank = {};
    canonical.forEach(function (c, idx) {
      rank[c.name] = idx;
    });
    return intents.slice().sort(function (a, b) {
      var fa = rank[a.name];
      var fb = rank[b.name];
      var ia = fa === undefined ? Number.MAX_SAFE_INTEGER : fa;
      var ib = fb === undefined ? Number.MAX_SAFE_INTEGER : fb;
      if (ia !== ib) return ia - ib;
      return String(a.name).localeCompare(String(b.name));
    });
  }

  function renderHelpPanel(data, isAdmin) {
    var intents = (data && Array.isArray(data.intents)) ? data.intents : [];
    if (!intents.length) {
      return "<p class=\"hint\">" + escapeHtml(tr("helpEmpty") || "No commands available.") + "</p>";
    }

    var userIntents = [];
    var adminIntents = [];
    intents.forEach(function (intent) {
      if (!intent || typeof intent !== "object") return;
      // Admin commands are only relevant on the admin (host-token) URL.
      // Drop them on the public/player URL so the help panel matches what
      // the viewer can actually do.
      if (intent.requires_admin && !isAdmin) return;
      var item = {
        name: String(intent.name || ""),
        desc: String(intent.description || ""),
        examples: Array.isArray(intent.example_messages)
          ? intent.example_messages.map(function (e) { return String(e == null ? "" : e); })
          : [],
      };
      if (intent.requires_admin) adminIntents.push(item);
      else userIntents.push(item);
    });

    userIntents = orderIntentsByCanonical(userIntents, getUserIntents());
    adminIntents = orderIntentsByCanonical(adminIntents, getAdminIntents());

    var body = "";
    if (userIntents.length) {
      body += renderIntentGroup(
        adminIntents.length ? (tr("groupPlayerCommands") || "Player commands") : "",
        userIntents,
        "user-intents"
      );
    }
    if (adminIntents.length) {
      body += renderIntentGroup(
        tr("groupAdminCommands") || "Admin commands",
        adminIntents,
        "admin-intents"
      );
    }
    return "<div class=\"help-panel\">" + "" + "<div class=\"intent-helper-body help-panel-body\">" + body + "</div></div>";
  }

  function renderReadPanelBody(dataType, data, isAdmin) {
    var inner = "";
    var filterNote = "";
    if (dataType === "GET_STANDINGS" || dataType === "GET_STANDINGS_BY_PLAYER") {
      filterNote = dataType === "GET_STANDINGS_BY_PLAYER" ? renderReadPanelFilterNote(data) : "";
      inner = renderStandingsDateControls(data, dataType) + renderStandings(data);
    } else if (dataType === "GET_MATCH_HISTORY" || dataType === "GET_MATCH_HISTORY_BY_PLAYER") {
      filterNote = dataType === "GET_MATCH_HISTORY_BY_PLAYER" ? renderReadPanelFilterNote(data) : "";
      inner = renderMatches(data, !!isAdmin);
    } else if (dataType === "GET_ROSTER") inner = renderRoster(data, !!isAdmin);
    else if (dataType === "HELP") inner = renderHelpPanel(data, !!isAdmin);
    else inner = renderFallbackData(data);
    return (
      "<h3>" +
      escapeHtml(panelTitleForDataType(dataType)) +
      "</h3>" +
      filterNote +
      inner
    );
  }

  function renderReadPanel(dataType, data, isAdmin) {
    return (
      '<div class="data-panel" data-read-type="' +
      escapeAttr(dataType || "") +
      '">' +
      renderReadPanelBody(dataType, data, isAdmin) +
      "</div>"
    );
  }

  /**
   * Module-scoped sequence used to give each nickname autocomplete
   * popover a unique DOM id, since arrayToInputs() is called once per
   * write-form mount and there can be multiple mounted at the same time
   * (each chat turn appends another action-card to #messages).
   */
  var NICK_AC_SEQ = 0;
  function nextNickAcId() {
    NICK_AC_SEQ += 1;
    return "nick-ac-" + NICK_AC_SEQ;
  }

  function arrayToInputs(name, arr) {
    var a = Array.isArray(arr) ? arr : [null, null];
    var popId0 = nextNickAcId();
    var popId1 = nextNickAcId();
    var ariaLabel = escapeAttr(tr("nickAcPopoverLabel") || "Pick a player");
    function renderSlot(idx, val, popId) {
      return (
        "<label>" +
        escapeHtml(idx === 0 ? (tr("formP1") || "P1") : (tr("formP2") || "P2")) +
        " <div class=\"nick-input-wrap\">" +
        "<input type=\"text\" data-array-index=\"" + idx + "\" value=\"" +
        escapeHtml(val || "") +
        "\" autocomplete=\"off\"" +
        " aria-controls=\"" + popId + "\"" +
        " aria-autocomplete=\"list\"" +
        " aria-expanded=\"false\" />" +
        "<div id=\"" + popId + "\" class=\"nick-ac-popover\" hidden" +
        " role=\"listbox\" aria-label=\"" + ariaLabel + "\"></div>" +
        "</div></label>"
      );
    }
    return (
      "<div class=\"nick-pair\" data-array-field=\"" +
      escapeHtml(name) +
      "\">" +
      renderSlot(0, a[0], popId0) +
      renderSlot(1, a[1], popId1) +
      "</div>"
    );
  }

  function isScorePairBodyFields(bodySpec) {
    var s1 = bodySpec.team1_score;
    var s2 = bodySpec.team2_score;
    if (!isFieldSpec(s1) || !isFieldSpec(s2)) return false;
    if (s1.type && s1.type.indexOf("array") === 0) return false;
    if (s2.type && s2.type.indexOf("array") === 0) return false;
    return true;
  }

  var SCORE_PICKER_MAX = 21;

  /**
   * Render a <select> as the score picker. iOS shows it as a native wheel,
   * Android shows a list picker, desktop shows a dropdown — all of which
   * prevent typos and avoid the keyboard layout shift on phones.
   */
  function renderScorePicker(fieldName, value) {
    var current = value == null ? "" : String(value).trim();
    var opts = [
      '<option value="" disabled' + (current === "" ? " selected" : "") + ">\u2014</option>",
    ];
    for (var i = 0; i <= SCORE_PICKER_MAX; i++) {
      var s = String(i);
      var sel = s === current ? " selected" : "";
      opts.push('<option value="' + s + '"' + sel + ">" + s + "</option>");
    }
    return (
      '<select class="form-score-input form-score-select" data-field="' +
      escapeAttr(fieldName) +
      '">' +
      opts.join("") +
      "</select>"
    );
  }

  function renderWriteForm(bodySpec) {
    if (!bodySpec || typeof bodySpec !== "object" || !Object.keys(bodySpec).length) {
      return (
        "<p class=\"hint\">" + escapeHtml(tr("noBodyHint") || "No request body. Confirm to send.") + "</p>"
      );
    }
    var parts = ['<div class="form-grid">'];
    var keys = Object.keys(bodySpec);
    var handled = Object.create(null);
    for (var ki = 0; ki < keys.length; ki++) {
      var key = keys[ki];
      if (handled[key]) continue;
      var spec = bodySpec[key];
      if (!isFieldSpec(spec)) continue;

      if (
        (key === "team1_score" || key === "team2_score") &&
        isScorePairBodyFields(bodySpec) &&
        !handled.team1_score &&
        !handled.team2_score
      ) {
        var sc1 = bodySpec.team1_score;
        var sc2 = bodySpec.team2_score;
        var req1 = sc1.required ? " *" : "";
        var req2 = sc2.required ? " *" : "";
        var v1 = sc1.value == null ? "" : String(sc1.value);
        var v2 = sc2.value == null ? "" : String(sc2.value);
        parts.push(
          '<div class="form-scores-group">' +
            '<div class="form-scores-heading">' +
            escapeHtml(tr("formScoresHeading") || "Scores") +
            "</div>" +
            '<div class="form-scores-row">' +
            "<label><span>" +
            escapeHtml(tr("formScoreTeam1") || "Team 1") +
            req1 +
            "</span>" +
            renderScorePicker("team1_score", v1) +
            "</label>" +
            "<label><span>" +
            escapeHtml(tr("formScoreTeam2") || "Team 2") +
            req2 +
            "</span>" +
            renderScorePicker("team2_score", v2) +
            "</label>" +
            "</div></div>"
        );
        handled.team1_score = true;
        handled.team2_score = true;
        continue;
      }

      var req = spec.required ? " *" : "";
      if (spec.type && spec.type.indexOf("array") === 0) {
        parts.push(
          "<label><span>" + escapeHtml(labelForFormField(key)) + req + "</span>"
        );
        parts.push(arrayToInputs(key, spec.value));
        parts.push("</label>");
      } else {
        var val = spec.value == null ? "" : String(spec.value);
        parts.push(
          "<label><span>" +
            escapeHtml(labelForFormField(key)) +
            req +
            "</span><input type=\"text\" data-field=\"" +
            escapeHtml(key) +
            "\" value=\"" +
            escapeHtml(val) +
            "\" /></label>"
        );
      }
    }
    parts.push("</div>");
    return parts.join("");
  }

  function collectWriteForm(root, bodySpec) {
    var out = {};
    if (!bodySpec) return out;
    Object.keys(bodySpec).forEach(function (key) {
      var spec = bodySpec[key];
      if (!isFieldSpec(spec)) return;
      if (spec.type && spec.type.indexOf("array") === 0) {
        var wrap = root.querySelector('[data-array-field="' + key.replace(/"/g, "\\\"") + '"]');
        if (!wrap) {
          out[key] = spec.value;
          return;
        }
        var inputs = wrap.querySelectorAll("input[data-array-index]");
        var arr = [];
        inputs.forEach(function (inp) {
          arr.push(inp.value.trim());
        });
        out[key] = arr;
      } else {
        var sel = '[data-field="' + key.replace(/"/g, "\\\"") + '"]';
        var inp = root.querySelector(sel);
        out[key] = inp ? String(inp.value == null ? "" : inp.value).trim() : spec.value;
      }
    });
    return out;
  }

  function validateWriteBody(bodySpec, payload) {
    var missing = [];
    if (!bodySpec) return missing;
    Object.keys(bodySpec).forEach(function (key) {
      var spec = bodySpec[key];
      if (!isFieldSpec(spec) || !spec.required) return;
      var v = payload[key];
      if (v == null || v === "") {
        missing.push(key);
        return;
      }
      if (Array.isArray(v)) {
        if (v.some(function (x) { return !x; })) missing.push(key);
      }
    });
    return missing;
  }

  function getUserIntents() {
    return [
      {
        name: "SUBMIT_MATCH_RESULT",
        desc:
          tr("intentSubmitMatchDesc") ||
          "Record a doubles match result.",
        examples: [
          tr("intentSubmitMatchEx1") || "record a match",
          tr("intentSubmitMatchEx2") || "Jae + Jazz 6:4 DK + Casper",
          tr("intentSubmitMatchEx3") || "Alice and Bob beat Charlie and Diana 6 to 3",
        ],
      },
      {
        name: "GET_STANDINGS",
        desc:
          tr("intentGetStandingsDesc") ||
          "League leaderboard (teams or players).",
        examples: [
          tr("intentGetStandingsEx1") || "show me the standings",
          tr("intentGetStandingsEx2") || "who's winning the league?",
          tr("intentGetStandingsEx3") || "what's the current leaderboard?",
        ],
      },
      {
        name: "GET_STANDINGS_BY_PLAYER",
        desc:
          tr("intentGetStandingsByPlayerDesc") ||
          "One player's standings row.",
        examples: [
          tr("intentGetStandingsByPlayerEx1") || "what's Alice's rank in the league?",
          tr("intentGetStandingsByPlayerEx2") || "where does Bob's team stand?",
          tr("intentGetStandingsByPlayerEx3") || "show me Charlie's standing",
        ],
      },
      {
        name: "GET_MATCH_HISTORY",
        desc: tr("intentGetMatchHistoryDesc") || "All match results, newest first.",
        examples: [
          tr("intentGetMatchHistoryEx1") || "show me all the matches",
          tr("intentGetMatchHistoryEx2") || "what matches have been played?",
          tr("intentGetMatchHistoryEx3") || "what were the recent results?",
        ],
      },
      {
        name: "GET_MATCH_HISTORY_BY_PLAYER",
        desc:
          tr("intentGetMatchHistoryByPlayerDesc") ||
          "One player's match history.",
        examples: [
          tr("intentGetMatchHistoryByPlayerEx1") || "show me Alice's match history",
          tr("intentGetMatchHistoryByPlayerEx2") || "what matches has Bob played?",
          tr("intentGetMatchHistoryByPlayerEx3") || "matches involving Charlie",
        ],
      },
      {
        name: "GET_ROSTER",
        desc: tr("intentGetRosterDesc") || "All registered players and teams.",
        examples: [
          tr("intentGetRosterEx1") || "show me all the players",
          tr("intentGetRosterEx2") || "who's in the league?",
          tr("intentGetRosterEx3") || "list all teams",
        ],
      },
    ];
  }

  function getAdminIntents() {
    return [
      {
        name: "EDIT_PLAYER_NICKNAME",
        desc: tr("intentEditNickDesc") || "Change a player's nickname.",
        examples: [
          tr("intentEditNickEx1") || "rename Alice to Alicia",
          tr("intentEditNickEx2") || "change John's nickname to Johnny",
        ],
      },
      {
        name: "EDIT_MATCH_SCORE",
        desc:
          tr("intentEditScoreDesc") ||
          "Fix a logged match score (via form).",
        examples: [
          tr("intentEditScoreEx1") || "edit match score for Alice",
          tr("intentEditScoreEx2") || "fix a match score involving Alice and Bob",
          tr("intentEditScoreEx3") || "correct the score of the match Alice and Bob vs Charlie and Diana",
        ],
      },
      {
        name: "DELETE_MATCH",
        desc: tr("intentDeleteMatchDesc") || "Delete a match (four nicknames).",
        examples: [tr("intentDeleteMatchEx1") || "delete the match between Alice/Bob and Charlie/Diana"],
      },
      {
        name: "DELETE_TEAM",
        desc: tr("intentDeleteTeamDesc") || "Delete a team with no matches.",
        examples: [tr("intentDeleteTeamEx1") || "delete the team Alice and Bob"],
      },
      {
        name: "ADD_PLAYERS_TO_ROSTER",
        desc:
          tr("intentAddPlayersToRosterDesc") ||
          "Pre-register one or more players on the roster.",
        examples: [
          tr("intentAddPlayersToRosterEx1") || "add Alex and Daniel to the roster",
          tr("intentAddPlayersToRosterEx2") || "allow Jason to play",
        ],
      },
      {
        name: "REMOVE_PLAYER_FROM_ROSTER",
        desc:
          tr("intentRemovePlayerFromRosterDesc") ||
          "Remove one pre-registered player from the roster.",
        examples: [
          tr("intentRemovePlayerFromRosterEx1") || "remove Michael from the roster",
          tr("intentRemovePlayerFromRosterEx2") || "drop Ryan from the roster",
        ],
      },
    ];
  }

  function renderIntentGroup(title, intents, groupClass) {
    var h = '<div class="intent-group ' + escapeHtml(groupClass) + '">';
    if (title) {
      h += '<div class="intent-group-title">' + escapeHtml(title) + "</div>";
    }
    intents.forEach(function (intent) {
      var exHtml = "";
      intent.examples.forEach(function (ex) {
        exHtml += '<span class="intent-ex">&ldquo;' + escapeHtml(ex) + "&rdquo;</span>";
      });
      h += '<details class="intent-item intent-accordion">';
      h += '<summary class="intent-item-summary">';
      h += '<span class="intent-chevron" aria-hidden="true"></span>';
      h += '<span class="intent-name">' + escapeHtml(intent.name) + "</span>";
      h += "</summary>";
      h += '<div class="intent-item-details">';
      h += '<div class="intent-desc">' + escapeHtml(intent.desc) + "</div>";
      h += '<div class="intent-examples">' + exHtml + "</div>";
      h += "</div>";
      h += "</details>";
    });
    h += "</div>";
    return h;
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
        escapeAttr(tile.title + " — " + tile.desc) +
        '">' +
        '<span class="intent-helper-quick-icon" aria-hidden="true">' +
        tile.icon +
        "</span></button>";
    });
    shortcutsHtml += "</div>";
    return '<div class="intent-helper">' + shortcutsHtml + "</div>";
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

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

  /**
   * Quick-action tiles shown in the empty chat state. Each tile usually
   * sends a canned natural-language message to the chat-to-intent server
   * when clicked, so the LLM produces the same response as if the user
   * had typed the prompt themselves. Some tiles set `mode` to short-
   * circuit the LLM round-trip entirely — see the click handler in
   * mountChat() for the supported modes. Inline SVGs use currentColor so
   * they pick up theme tokens automatically.
   */
  function getQuickActionTiles() {
    return [
      {
        message: "record a match",
        /* `local-submit-match` skips the chat-to-intent server and renders
           the empty SUBMIT_MATCH_RESULT action card locally. This avoids
           the small-LLM first-turn hallucination problem where the
           extractor fills nicknames with placeholder names like
           "john_doe"/"alice_smith" when the prompt carries no real data. */
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
        /* `local-get-players` skips the chat-to-intent server and opens
           the search-and-add players panel directly. The panel itself
           still hits backend_main directly for add/remove, so the
           short-circuit is purely a UI affordance: any visitor (admin
           or player) can open the panel; the Add button is disabled
           with a tooltip in non-admin mode and the per-row Remove
           buttons remain admin-only via the shared
           `renderRosterPlayerRemoveButton` gate. */
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
        escapeAttr(tile.title + " — " + tile.desc) +
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

  function renderChatShell(route, cachedHeaderTitle) {
    var isAdmin = !!route.hostToken;
    var isMobile = window.innerWidth <= 520;
    var rawPlaceholder = isMobile
      ? tr("placeholderMobile") ||
        "Report Match Result, or Ask about standings, match history, or the roster."
      : tr("placeholderDesktop") ||
        "Report Match Result, or Ask about standings, match history, or the roster.\nUse the shortcuts above or type \"help\".";
    var inputPlaceholder = escapeAttr(rawPlaceholder);
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
        escapeAttr(tr("headerTitleLoading") || "Loading league title…");
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
      "</header>" +
      renderIntentHelper(isAdmin) +
      '<main class="chat-main is-empty">' +
      '<div id="messages" class="messages">' +
      "</div>" +
      renderQuickActions() +
      '<div class="composer">' +
      '<form id="chat-form">' +
      '<div class="composer-input-wrap">' +
      '<div id="chat-mention-popover" class="chat-mention-popover" hidden role="listbox" aria-label="' +
      escapeAttr(tr("mentionPopoverLabel") || "Mention a player") +
      '"></div>' +
      '<textarea id="chat-input" rows="2" placeholder="' +
      inputPlaceholder +
      '" autocomplete="off"></textarea>' +
      '<button type="submit" id="send-btn" aria-label="' +
      escapeAttr(tr("send") || "Send") +
      '">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>' +
      "</button>" +
      "</div>" +
      "</form>" +
      "</div></main>" +
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
    if (icon) icon.textContent = isLight ? "☀️" : "🌙";
  }

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
    var emptyRemoved = false;

    /** Latest roster from main API; refreshed when this chat view mounts.
     * `rules` is the LeagueRules config returned by GET /roster — used by
     * `renderMatchSubmitRosterNotes` to suppress the partner-conflict
     * warning when `one_team_per_player === false`. In v6 the roster IS
     * the player list (the `allowlist_entries` side table was retired);
     * the same `players` array already includes pre-registered nicknames
     * that have not yet played, so there is no separate fetch / union. */
    var leagueRoster = {
      status: "loading",
      players: [],
      teams: [],
      rules: null,
      league_timezone: "America/Los_Angeles",
      latest_match_date: null,
      fetchedAt: null,
    };

    function applyLeagueRosterResult(result) {
      leagueRoster.players = result.players;
      leagueRoster.teams = result.teams;
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

    // ── Players panel (Get Players quick action) ─────────────────────
    //
    // Replaces the host-only `<details id="roster-admin-panel">` slab
    // that used to live above the chat thread. The same search +
    // add-by-nickname surface now ships as an in-thread assistant
    // bubble that any visitor can open via the "Get Players" quick
    // action. Reuses the same `GET /leagues/{id}/roster` read endpoint
    // and the same `POST` / `DELETE /admin/leagues/{id}/players` write
    // endpoints — admin-mode only. Non-admins still get the read +
    // search affordance; the Add button is rendered disabled with a
    // hover/focus tooltip explaining that adding is admin-only. Per-
    // row Remove buttons reuse the existing `renderRosterPlayerRemove
    // Button` admin-gate, so non-admins never see an enabled Remove
    // either. Hard-deleting a player who has matches still surfaces
    // the backend's 409 `PlayerHasParticipationError`.

    function rosterStateFromResult(result) {
      return result && result.ok
        ? { players: result.players, teams: result.teams }
        : { players: [], teams: [], error: true };
    }

    function rerenderPlayersPanels(state) {
      if (!messagesEl) return;
      var panels = messagesEl.querySelectorAll(".players-panel");
      if (!panels.length) return;
      panels.forEach(function (panel) {
        var isAdmin = panel.getAttribute("data-is-admin") === "1";
        var prevInput = panel.querySelector(".roster-admin-add-input");
        var savedValue = prevInput ? prevInput.value : "";
        var dataPanel = panel.parentNode;
        if (!dataPanel) return;
        dataPanel.innerHTML =
          "<h3>" +
          escapeHtml(panelTitleForDataType("GET_PLAYERS")) +
          "</h3>" +
          renderPlayersPanelBody(state, isAdmin);
        var freshPanel = dataPanel.querySelector(".players-panel");
        if (freshPanel) {
          var freshInput = freshPanel.querySelector(".roster-admin-add-input");
          if (freshInput && savedValue) {
            freshInput.value = savedValue;
            freshInput.dispatchEvent(new Event("input"));
          }
          bindPlayersPanelEvents(freshPanel, isAdmin);
        }
      });
    }

    function rerenderRosterReadPanels(state) {
      if (!messagesEl) return;
      var panels = messagesEl.querySelectorAll('.data-panel[data-read-type="GET_ROSTER"]');
      if (!panels.length) return;
      panels.forEach(function (dataPanel) {
        dataPanel.innerHTML = renderReadPanelBody("GET_ROSTER", state, !!route.hostToken);
      });
    }

    function refreshRosterSurfaces() {
      if (!messagesEl) return;
      fetchLeagueRoster(route.leagueId).then(function (result) {
        if (!result.ok) {
          console.warn("[TLCHAT] Roster surface refresh failed:", result);
          return;
        }
        applyLeagueRosterResult(result);
        var state = rosterStateFromResult(result);
        rerenderPlayersPanels(state);
        rerenderRosterReadPanels(state);
      });
    }

    function refreshAllPlayersPanels() {
      if (!messagesEl) return;
      var panels = messagesEl.querySelectorAll(".players-panel");
      if (!panels.length) return;
      fetchLeagueRoster(route.leagueId).then(function (result) {
        if (result.ok) applyLeagueRosterResult(result);
        rerenderPlayersPanels(rosterStateFromResult(result));
      });
    }

    async function removePlayerFromRoster(playerId, nickname, btn) {
      if (!playerId || !route.hostToken) return false;
      if (btn) {
        btn.disabled = true;
        btn.textContent = tr("playersPanelRemovingButton") || "Removing\u2026";
      }

      var base = backendMainBase();
      var url =
        base +
        "/admin/leagues/" +
        encodeURIComponent(route.leagueId) +
        "/players/" +
        encodeURIComponent(playerId);
      try {
        var res = await fetch(url, {
          method: "DELETE",
          headers: { "X-Host-Token": route.hostToken || "" },
        });
        if (res.ok) {
          refreshRosterSurfaces();
          return true;
        }
        var txt = await res.text();
        if (
          res.status === 409 &&
          leagueApiJsonErrorCode(txt) === "PlayerHasParticipationError"
        ) {
          throw new Error(
            tr("playersPanelRemoveBlockedByParticipation", { name: nickname }) ||
              tr("playersPanelRemoveBlockedByParticipation") ||
              nickname +
                " has matches recorded and can't be removed. Delete the matches first."
          );
        }
        throw new Error(friendlyMessageFromTechnicalError(txt));
      } catch (e) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = tr("rosterRemoveButton") || "Remove";
        }
        throw e;
      }
    }

    function showPlayersPanelMessage(panel, text, isError) {
      var inlineMsg = panel && panel.querySelector(".roster-admin-inline-msg");
      if (!inlineMsg) return false;
      inlineMsg.textContent = text;
      inlineMsg.hidden = false;
      inlineMsg.className =
        "roster-admin-inline-msg" +
        (isError ? " roster-admin-msg-error" : " roster-admin-msg-ok");
      setTimeout(function () {
        inlineMsg.hidden = true;
      }, 4000);
      return true;
    }

    function showRosterWriteMessage(anchor, text, isError) {
      var panel = anchor && anchor.closest && anchor.closest(".players-panel");
      if (showPlayersPanelMessage(panel, text, isError)) return;
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

    function aliasApiErrorMessage(status, text) {
      var code = leagueApiJsonErrorCode(text);
      if (status === 409 && code === "NicknameAlreadyInUseError") {
        return tr("aliasAlreadyExists") || "That nickname is already in use.";
      }
      if (status === 422 && code === "CannotRemoveCanonicalNicknameError") {
        return (
          tr("aliasCannotRemoveCanonical") ||
          "The canonical nickname cannot be removed as an alias."
        );
      }
      if (status === 422 && code === "LastNicknameError") {
        return (
          tr("aliasLastNickname") ||
          "A player must keep at least one nickname."
        );
      }
      return friendlyMessageFromTechnicalError(text);
    }

    async function addAliasToPlayer(playerId, alias) {
      var base = backendMainBase();
      var url =
        base +
        "/admin/leagues/" +
        encodeURIComponent(route.leagueId) +
        "/players/" +
        encodeURIComponent(playerId) +
        "/aliases";
      var res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Host-Token": route.hostToken || "",
        },
        body: JSON.stringify({ alias: alias }),
      });
      var txt = await res.text();
      if (res.ok) return txt ? tryParseJson(txt) : {};
      throw new Error(aliasApiErrorMessage(res.status, txt));
    }

    async function removeAliasFromPlayer(playerId, alias) {
      var base = backendMainBase();
      var url =
        base +
        "/admin/leagues/" +
        encodeURIComponent(route.leagueId) +
        "/players/" +
        encodeURIComponent(playerId) +
        "/aliases/" +
        encodeURIComponent(alias);
      var res = await fetch(url, {
        method: "DELETE",
        headers: { "X-Host-Token": route.hostToken || "" },
      });
      var txt = await res.text();
      if (res.ok) return true;
      throw new Error(aliasApiErrorMessage(res.status, txt));
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
            submitBtn.textContent = tr("aliasAddingButton") || "Adding…";
          }
          try {
            await addAliasToPlayer(playerId, alias);
            if (formRow.parentNode) formRow.parentNode.removeChild(formRow);
            showRosterWriteMessage(
              row,
              tr("aliasAddSuccess", { alias: alias, name: nickname }) || "Alias added.",
              false
            );
            refreshRosterSurfaces();
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

    /**
     * Wires up search filter + Add button on a freshly rendered
     * `.players-panel` root. Per-row Remove buttons are intentionally
     * NOT wired here — they're handled by the delegated
     * `messagesEl` listener at the bottom of `mountChat`, which catches
     * `.btn-roster-remove` clicks across every chat panel (including
     * `GET_ROSTER` and the Get Players bubbles).
     */
    function bindPlayersPanelEvents(panel, isAdmin) {
      if (!panel) return;

      function showMsg(text, isError) {
        showPlayersPanelMessage(panel, text, isError);
      }

      var addBtn = panel.querySelector(".roster-admin-add-btn");
      var addInput = panel.querySelector(".roster-admin-add-input");

      // Live-filter the player list as the user types in the input.
      // We filter on the *last* comma-separated token (matches how the
      // composer's @-mention popover narrows on partial queries) so
      // incremental multi-add typing like "alice, bo" still narrows to
      // "bo". Empty token => show everything. Active for both admin
      // (typing nicknames to add) and non-admin (search-only) modes.
      if (addInput) {
        var rosterListEl = panel.querySelector(".roster-admin-list");
        var noMatchesEl = panel.querySelector(".roster-admin-no-matches");
        var applyRosterFilter = function () {
          if (!rosterListEl) return;
          var raw = addInput.value || "";
          var lastToken = raw.split(",").pop();
          var query = normalizeMatchNickname(lastToken);
          var items = rosterListEl.querySelectorAll(".roster-admin-item");
          var anyVisible = false;
          items.forEach(function (li) {
            var nick = li.getAttribute("data-nick-norm") || "";
            var aliases = li.getAttribute("data-aliases-norm") || "";
            var visible =
              !query ||
              nick.indexOf(query) !== -1 ||
              aliases.indexOf(query) !== -1;
            li.hidden = !visible;
            if (visible) anyVisible = true;
          });
          if (noMatchesEl) {
            noMatchesEl.hidden = !(query && !anyVisible);
          }
        };
        addInput.addEventListener("input", applyRosterFilter);
      }

      if (isAdmin && addBtn && addInput) {
        addBtn.addEventListener("click", async function () {
          var raw = (addInput.value || "").trim();
          if (!raw) return;
          var nicknames = raw
            .split(",")
            .map(function (n) { return n.trim(); })
            .filter(Boolean);
          if (!nicknames.length) return;

          addBtn.disabled = true;
          addBtn.textContent = tr("playersPanelAddingButton") || "Adding\u2026";

          var base = backendMainBase();
          var url = base + "/admin/leagues/" + encodeURIComponent(route.leagueId) + "/players";
          try {
            var res = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Host-Token": route.hostToken || "",
              },
              body: JSON.stringify({ nicknames: nicknames }),
            });
            var txt = await res.text();
            if (res.ok) {
              addInput.value = "";
              showMsg(tr("playersPanelAddSuccess") || "Added to roster.", false);
              refreshRosterSurfaces();
            } else if (
              res.status === 409 &&
              leagueApiJsonErrorCode(txt) === "NicknameAlreadyInUseError"
            ) {
              showMsg(
                tr("playersPanelAlreadyExists") || "One or more nicknames are already on the roster.",
                true
              );
              addBtn.disabled = false;
              addBtn.textContent = tr("playersPanelAddButton") || "Add";
            } else {
              showMsg(friendlyMessageFromTechnicalError(txt), true);
              addBtn.disabled = false;
              addBtn.textContent = tr("playersPanelAddButton") || "Add";
            }
          } catch (e) {
            showMsg(friendlyMessageFromTechnicalError(String(e)), true);
            addBtn.disabled = false;
            addBtn.textContent = tr("playersPanelAddButton") || "Add";
          }
        });
      }
    }

    /**
     * Append a new "Get Players" panel as an assistant bubble. Renders
     * the loading state immediately, then re-renders with the loaded
     * roster (or an error state) when the fetch resolves. This is the
     * single entry point for both the `local-get-players` quick action
     * and the post-match-submit "Add to roster" recovery affordance —
     * pass `prefillNicknames` to seed the add-input with names the
     * caller wants the host to register.
     */
    function deliverPlayersPanel(opts) {
      var prefill = (opts && opts.prefillNicknames) || null;
      var isAdmin = !!route.hostToken;
      var initialHtml =
        '<div class="data-panel" data-read-type="GET_PLAYERS">' +
        "<h3>" +
        escapeHtml(panelTitleForDataType("GET_PLAYERS")) +
        "</h3>" +
        renderPlayersPanelBody({ loading: true }, isAdmin) +
        "</div>";
      var bubble = appendAssistant(initialHtml);
      var dataPanel = bubble.querySelector('.data-panel[data-read-type="GET_PLAYERS"]');
      fetchLeagueRoster(route.leagueId).then(function (result) {
        var state = result.ok
          ? { players: result.players, teams: result.teams }
          : { players: [], error: true };
        if (!dataPanel) return;
        dataPanel.innerHTML =
          "<h3>" +
          escapeHtml(panelTitleForDataType("GET_PLAYERS")) +
          "</h3>" +
          renderPlayersPanelBody(state, isAdmin);
        var freshPanel = dataPanel.querySelector(".players-panel");
        if (freshPanel) {
          bindPlayersPanelEvents(freshPanel, isAdmin);
          if (prefill && prefill.length && isAdmin) {
            var addInput = freshPanel.querySelector(".roster-admin-add-input");
            if (addInput) {
              addInput.value = prefill.join(", ");
              addInput.focus();
              addInput.dispatchEvent(new Event("input"));
            }
          }
        }
      });
    }

    /**
     * Backwards-compatible alias used by the post-match-submit
     * roster-membership recovery flow (the "+ Add to roster" button
     * after a 422 RosterMembershipRequired error). Pre-fills the
     * names that need adding into a freshly opened players panel.
     */
    function openPlayersPanelWithNicknames(nicknames) {
      deliverPlayersPanel({ prefillNicknames: nicknames || [] });
    }

    var mentionList = [];
    var mentionSelectedIndex = 0;

    /**
     * Active @-mention: @ at line/start or after whitespace; query is text after @ up to caret (no spaces).
     * Avoids triggering on email-like "x@y" when x is non-whitespace.
     */
    function getMentionState(text, caretPos) {
      if (caretPos == null || caretPos < 0) return null;
      var before = String(text || "").slice(0, caretPos);
      var at = before.lastIndexOf("@");
      if (at === -1) return null;
      if (at > 0 && !/\s/.test(before.charAt(at - 1))) return null;
      var afterAt = before.slice(at + 1);
      if (/[\s\u00a0\n\r]/.test(afterAt)) return null;
      return { atIndex: at, query: afterAt };
    }

    /**
     * Returns the roster nicknames as mention candidates, deduplicated
     * case-insensitively via `normalizeMatchNickname`. In v6 the roster
     * IS the player list (the `allowlist_entries` side table was retired),
     * so there is no separate allowlist union to merge in — pre-registered
     * nicknames already live in `leagueRoster.players`.
     */
    function combinedMentionCandidates() {
      var roster = leagueRoster.players || [];
      var seen = {};
      var out = [];
      function push(entry) {
        var nick = String((entry && entry.nickname) || "");
        if (!nick) return;
        var norm = normalizeMatchNickname(nick);
        if (!norm || seen[norm]) return;
        seen[norm] = true;
        out.push({ nickname: nick, aliases: playerAliases(entry) });
      }
      roster.forEach(push);
      return out;
    }

    function filterPlayersForMention(query) {
      var q = normalizeMatchNickname(query);
      var candidates = combinedMentionCandidates();
      var sortByName = function (a, b) {
        var na = String((a && a.nickname) || "");
        var nb = String((b && b.nickname) || "");
        return na.localeCompare(nb, undefined, { sensitivity: "base" });
      };
      if (!q) {
        return candidates.sort(sortByName);
      }
      return candidates
        .filter(function (p) {
          if (normalizeMatchNickname(p.nickname).indexOf(q) !== -1) return true;
          return playerAliases(p).some(function (alias) {
            return normalizeMatchNickname(alias).indexOf(q) !== -1;
          });
        })
        .sort(sortByName);
    }

    /**
     * Per-input nickname autocomplete used by the write-form nick-pair
     * inputs (team1_nicknames / team2_nicknames). Mirrors the composer's
     * @-mention popover behaviour (filter by substring of normalized
     * nickname, sort by name, keyboard navigation, mousedown-to-pick)
     * but is scoped to a single text input and triggered on focus/typing
     * instead of an `@` sigil. Shares the candidate source
     * (`combinedMentionCandidates`) so the roster stays a single concept.
     */
    function bindNickAutocomplete(input, popover) {
      var list = [];
      var selectedIndex = 0;
      var imeActive = false;

      function closeOtherNickPopovers() {
        var others = document.querySelectorAll(".nick-ac-popover");
        for (var i = 0; i < others.length; i++) {
          var p = others[i];
          if (p === popover || p.hidden) continue;
          p.hidden = true;
          p.innerHTML = "";
          var ctrl = document.querySelector('[aria-controls="' + p.id + '"]');
          if (ctrl) {
            ctrl.removeAttribute("aria-activedescendant");
            ctrl.setAttribute("aria-expanded", "false");
          }
        }
      }

      function hide() {
        if (popover.hidden) return;
        popover.hidden = true;
        popover.innerHTML = "";
        list = [];
        selectedIndex = 0;
        input.removeAttribute("aria-activedescendant");
        input.setAttribute("aria-expanded", "false");
      }

      function showStatus(text) {
        popover.innerHTML =
          '<div class="chat-mention-item chat-mention-status" role="presentation">' +
          escapeHtml(text) +
          "</div>";
        popover.hidden = false;
        input.setAttribute("aria-expanded", "true");
        list = [];
        selectedIndex = 0;
        input.removeAttribute("aria-activedescendant");
      }

      function show() {
        closeOtherNickPopovers();
        popover.innerHTML = "";
        list = [];
        selectedIndex = 0;

        if (leagueRoster.status === "loading") {
          showStatus(tr("mentionLoading") || "Loading players\u2026");
          return;
        }
        if (leagueRoster.status === "error") {
          showStatus(tr("mentionRosterError") || "Could not load roster.");
          return;
        }

        var matches = filterPlayersForMention(input.value);
        if (!matches.length) {
          showStatus(tr("mentionNoMatch") || "No matching players.");
          return;
        }

        var cap = 80;
        var slice = matches.length > cap ? matches.slice(0, cap) : matches;
        list = slice;
        var qNorm = normalizeMatchNickname(input.value || "");
        slice.forEach(function (p, i) {
          var nick = String((p && p.nickname) || "");
          var optId = popover.id + "-opt-" + i;
          var div = document.createElement("div");
          div.id = optId;
          div.className = "chat-mention-item" + (i === 0 ? " is-active" : "");
          div.setAttribute("role", "option");
          div.setAttribute("aria-selected", i === 0 ? "true" : "false");
          // When the query matched only via aliases (canonical nickname does
          // not contain the query substring), show "<nick> (<alias>, ...)"
          // so it's obvious why this candidate appeared. Picking still
          // inserts only the canonical nickname — that's what the backend
          // accepts.
          var aliasMatches = [];
          if (qNorm && nick && normalizeMatchNickname(nick).indexOf(qNorm) === -1) {
            var aliases = Array.isArray(p && p.aliases) ? p.aliases : [];
            for (var j = 0; j < aliases.length; j++) {
              var a = String(aliases[j] || "");
              if (a && normalizeMatchNickname(a).indexOf(qNorm) !== -1) {
                aliasMatches.push(a);
              }
            }
          }
          var label = aliasMatches.length
            ? (tr("mentionAliasMatch", {
                name: nick,
                aliases: aliasMatches.join(", "),
              }) || (nick + " (" + aliasMatches.join(", ") + ")"))
            : nick;
          div.textContent = label;
          div.addEventListener("mousedown", function (e) {
            e.preventDefault();
            applyPick(nick);
          });
          popover.appendChild(div);
        });
        if (matches.length > cap) {
          var more = document.createElement("div");
          more.className = "chat-mention-item chat-mention-status";
          more.setAttribute("role", "presentation");
          more.textContent =
            tr("mentionMore", { cap: cap, total: matches.length }) ||
            "Showing " + cap + " of " + matches.length + ". Type to narrow down.";
          popover.appendChild(more);
        }
        popover.hidden = false;
        input.setAttribute("aria-expanded", "true");
        input.setAttribute("aria-activedescendant", popover.id + "-opt-0");
      }

      function syncHighlight() {
        if (popover.hidden) return;
        var opts = popover.querySelectorAll('.chat-mention-item[role="option"]');
        if (!opts.length) {
          input.removeAttribute("aria-activedescendant");
          return;
        }
        if (selectedIndex >= opts.length) selectedIndex = 0;
        for (var i = 0; i < opts.length; i++) {
          var sel = i === selectedIndex;
          opts[i].setAttribute("aria-selected", sel ? "true" : "false");
          opts[i].classList.toggle("is-active", sel);
        }
        var active = opts[selectedIndex];
        if (active) {
          input.setAttribute("aria-activedescendant", active.id);
          active.scrollIntoView({ block: "nearest" });
        }
      }

      function applyPick(nickname) {
        input.value = nickname;
        hide();
        try {
          var len = nickname.length;
          input.setSelectionRange(len, len);
        } catch (e) { /* selection unsupported on this input type */ }
        input.focus();
      }

      function isOpen() {
        return !popover.hidden && popover.querySelector('.chat-mention-item[role="option"]') != null;
      }

      input.addEventListener("focus", show);
      input.addEventListener("click", show);
      input.addEventListener("input", function () {
        if (imeActive) return;
        show();
      });
      input.addEventListener("compositionstart", function () { imeActive = true; });
      input.addEventListener("compositionend", function () {
        imeActive = false;
        show();
      });

      input.addEventListener("keydown", function (e) {
        if (!isOpen()) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % list.length;
          syncHighlight();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + list.length) % list.length;
          syncHighlight();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          hide();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          var pick = list[selectedIndex];
          if (pick && pick.nickname != null) applyPick(String(pick.nickname));
          return;
        }
        // Tab: let native focus-move happen; blur handler will hide.
      });

      input.addEventListener("blur", function () {
        // Delay so a mousedown on a popover item can fire applyPick first
        // (mousedown -> blur -> click on item; we hide AFTER item handlers).
        setTimeout(hide, 120);
      });
    }

    function bindActionCardAutocomplete(card) {
      if (!card) return;
      var inputs = card.querySelectorAll('.nick-input-wrap > input[data-array-index]');
      inputs.forEach(function (input) {
        var popId = input.getAttribute("aria-controls");
        if (!popId) return;
        var popover = document.getElementById(popId);
        if (!popover) return;
        bindNickAutocomplete(input, popover);
      });
    }

    function hideMentionPopover() {
      if (!mentionPopover) return;
      mentionPopover.hidden = true;
      mentionPopover.innerHTML = "";
      mentionList = [];
      mentionSelectedIndex = 0;
      input.removeAttribute("aria-activedescendant");
    }

    function showMentionPopover(matches) {
      if (!mentionPopover) return;
      mentionPopover.innerHTML = "";
      mentionList = [];
      mentionSelectedIndex = 0;
      if (leagueRoster.status === "loading") {
        mentionPopover.innerHTML =
          '<div class="chat-mention-item chat-mention-status" role="presentation">' +
          escapeHtml(tr("mentionLoading") || "Loading players…") +
          "</div>";
        mentionPopover.hidden = false;
        return;
      }
      if (leagueRoster.status === "error") {
        mentionPopover.innerHTML =
          '<div class="chat-mention-item chat-mention-status" role="presentation">' +
          escapeHtml(tr("mentionRosterError") || "Could not load roster.") +
          "</div>";
        mentionPopover.hidden = false;
        return;
      }
      if (!matches.length) {
        mentionPopover.innerHTML =
          '<div class="chat-mention-item chat-mention-status" role="presentation">' +
          escapeHtml(tr("mentionNoMatch") || "No matching players.") +
          "</div>";
        mentionPopover.hidden = false;
        return;
      }
      var cap = 80;
      var slice = matches.length > cap ? matches.slice(0, cap) : matches;
      mentionList = slice;
      slice.forEach(function (p, i) {
        var nick = String((p && p.nickname) || "");
        var id = "chat-mention-opt-" + i;
        var div = document.createElement("div");
        div.id = id;
        div.className = "chat-mention-item" + (i === 0 ? " is-active" : "");
        div.setAttribute("role", "option");
        div.setAttribute("aria-selected", i === 0 ? "true" : "false");
        div.textContent = nick;
        div.addEventListener("mousedown", function (e) {
          e.preventDefault();
          applyMentionPick(nick);
        });
        mentionPopover.appendChild(div);
      });
      if (matches.length > cap) {
        var more = document.createElement("div");
        more.className = "chat-mention-item chat-mention-status";
        more.setAttribute("role", "presentation");
        more.textContent =
          tr("mentionMore", { cap: cap, total: matches.length }) ||
          "Showing " + cap + " of " + matches.length + ". Type to narrow down.";
        mentionPopover.appendChild(more);
      }
      mentionPopover.hidden = false;
      input.setAttribute("aria-activedescendant", "chat-mention-opt-0");
    }

    function syncMentionSelectionHighlight() {
      if (!mentionPopover || mentionPopover.hidden) return;
      var opts = mentionPopover.querySelectorAll(".chat-mention-item[role=\"option\"]");
      if (!opts.length) {
        input.removeAttribute("aria-activedescendant");
        return;
      }
      if (mentionSelectedIndex >= opts.length) mentionSelectedIndex = 0;
      for (var i = 0; i < opts.length; i++) {
        var sel = i === mentionSelectedIndex;
        opts[i].setAttribute("aria-selected", sel ? "true" : "false");
        opts[i].classList.toggle("is-active", sel);
      }
      var active = mentionPopover.querySelector("#chat-mention-opt-" + mentionSelectedIndex);
      if (active) {
        input.setAttribute("aria-activedescendant", active.id);
        active.scrollIntoView({ block: "nearest" });
      }
    }

    function applyMentionPick(nickname) {
      var v = input.value;
      var caret = input.selectionStart;
      var st = getMentionState(v, caret);
      if (!st) {
        hideMentionPopover();
        return;
      }
      var before = v.slice(0, st.atIndex);
      var after = v.slice(caret);
      var insert = nickname + (after.length && !/^\s/.test(after.charAt(0)) ? " " : "");
      input.value = before + insert + after;
      var newPos = before.length + insert.length;
      input.setSelectionRange(newPos, newPos);
      hideMentionPopover();
      autoResizeInput();
    }

    function updateMentionUI() {
      if (imeCompositionActive) return;
      var v = input.value;
      var caret = input.selectionStart;
      var st = getMentionState(v, caret);
      if (!st) {
        hideMentionPopover();
        return;
      }
      var matches = filterPlayersForMention(st.query);
      showMentionPopover(matches);
      syncMentionSelectionHighlight();
    }

    function mentionPopoverOpen() {
      if (!mentionPopover || mentionPopover.hidden) return false;
      return mentionPopover.querySelector(".chat-mention-item[role=\"option\"]") != null;
    }

    function autoResizeInput() {
      input.style.height = "auto";
      input.style.height = input.scrollHeight + "px";
    }

    function onInputResizeAndMention() {
      autoResizeInput();
      updateMentionUI();
    }

    input.addEventListener("input", onInputResizeAndMention);

    var imeCompositionActive = false;
    input.addEventListener("compositionstart", function () {
      imeCompositionActive = true;
    });
    input.addEventListener("compositionend", function () {
      imeCompositionActive = false;
      updateMentionUI();
    });

    input.addEventListener("keydown", function (e) {
      if (mentionPopoverOpen()) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          mentionSelectedIndex = (mentionSelectedIndex + 1) % mentionList.length;
          syncMentionSelectionHighlight();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          mentionSelectedIndex =
            (mentionSelectedIndex - 1 + mentionList.length) % mentionList.length;
          syncMentionSelectionHighlight();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          hideMentionPopover();
          return;
        }
        if (e.key === "Enter") {
          if (e.shiftKey) return;
          e.preventDefault();
          var pickE = mentionList[mentionSelectedIndex];
          var nickE = pickE && pickE.nickname != null ? String(pickE.nickname) : "";
          if (nickE) applyMentionPick(nickE);
          return;
        }
        if (e.key === "Tab") {
          if (e.shiftKey) return;
          e.preventDefault();
          var pickT = mentionList[mentionSelectedIndex];
          var nickT = pickT && pickT.nickname != null ? String(pickT.nickname) : "";
          if (nickT) applyMentionPick(nickT);
          return;
        }
      }
      if (e.key !== "Enter" || e.shiftKey) return;
      // Let IME (Korean, Japanese, etc.) consume Enter to finish composition; do not preventDefault.
      if (e.isComposing || imeCompositionActive) return;
      e.preventDefault();
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });

    input.addEventListener("click", updateMentionUI);
    input.addEventListener("keyup", function (e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
        updateMentionUI();
      }
    });

    document.addEventListener("click", function (e) {
      if (!mentionPopover || mentionPopover.hidden) return;
      if (e.target === input || mentionPopover.contains(e.target)) return;
      hideMentionPopover();
    });

    function clearEmpty() {
      if (!emptyRemoved) {
        messagesEl.innerHTML = "";
        emptyRemoved = true;
        var chatMain = messagesEl.closest(".chat-main");
        if (chatMain) chatMain.classList.remove("is-empty");
      }
    }

    function appendUser(text) {
      clearEmpty();
      var div = document.createElement("div");
      div.className = "msg user";
      div.innerHTML =
        "<div class=\"label\">" +
        escapeHtml(tr("labelYou") || "You") +
        "</div><div>" +
        escapeHtml(text) +
        "</div>";
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    /**
     * Small "typing" bubble shown while we wait for the chat server.
     * Caller is responsible for removing it via removeLoadingBubble(node)
     * once the response arrives (or fails).
     */
    function appendLoadingBubble() {
      clearEmpty();
      var div = document.createElement("div");
      div.className = "msg assistant msg-loading";
      div.setAttribute("aria-live", "polite");
      div.setAttribute(
        "aria-label",
        tr("assistantThinking") || "Assistant is thinking"
      );
      div.innerHTML =
        '<div class="label">' +
        escapeHtml(tr("labelAssistant") || "Assistant") +
        "</div>" +
        '<div class="typing-indicator" aria-hidden="true">' +
        "<span></span><span></span><span></span>" +
        "</div>";
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function removeLoadingBubble(node) {
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }

    function appendAssistant(html, extraClass) {
      clearEmpty();
      var div = document.createElement("div");
      div.className = "msg assistant" + (extraClass ? " " + extraClass : "");
      div.innerHTML =
        "<div class=\"label\">" + escapeHtml(tr("labelAssistant") || "Assistant") + "</div>" + html;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    /** Already user-oriented copy (validation, permissions). No technical log. */
    function appendErrorPlain(message) {
      appendAssistant(
        "<div class=\"error-user-facing\">" + escapeHtml(message) + "</div>",
        "msg-error"
      );
    }

    /** Log full technical detail for developers; show a short message in the thread. */
    function appendErrorTechnical(technicalMessage, logContext) {
      var tech = technicalMessage == null ? "" : String(technicalMessage);
      if (logContext) {
        console.error("[TLCHAT]", logContext, tech);
      } else {
        console.error("[TLCHAT]", tech);
      }
      appendAssistant(
        "<div class=\"error-user-facing\">" +
          escapeHtml(friendlyMessageFromTechnicalError(tech)) +
          "</div>",
        "msg-error"
      );
    }

    /** Each "+" is sent as " + " to the chat-to-intent server (doubles / partner notation). */
    function normalizePlusForIntentServer(message) {
      return String(message).replace(/\s*\+\s*/g, " + ");
    }

    async function postChat(clientMessage) {
      var url = chatApiBase() + "/leagues/" + encodeURIComponent(route.leagueId) + "/chat";
      var headers = { "Content-Type": "application/json" };
      if (route.hostToken) headers["X-Host-Token"] = route.hostToken;
      var res = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          client_message: clientMessage,
          conversation_history: conversationHistory,
        }),
      });
      var text = await res.text();
      var data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        var contentType = (res.headers && res.headers.get("content-type")) || "";
        var preview =
          text.length === 0
            ? "(empty body)"
            : text.length > 600
              ? text.slice(0, 600) + "…"
              : text;
        var oneLine = preview.replace(/\s+/g, " ").trim();
        console.error("[TLCHAT] Chat response was not valid JSON", {
          url: url,
          status: res.status,
          contentType: contentType,
          bodyLength: text.length,
          parseError: parseErr && parseErr.message,
          bodyPreview: preview,
        });
        if (text.length > 0 && text.length <= 8000) {
          console.error("[TLCHAT] Raw response body:\n", text);
        } else if (text.length > 8000) {
          console.error("[TLCHAT] Raw response body (first 8000 chars):\n", text.slice(0, 8000));
        }
        var hint = "";
        if (responseLooksLikeStaticHtml(text)) {
          hint =
            " The response looks like a static HTML page from your frontend. Usually chatApiBaseUrl is missing https:// " +
            "(so the browser treats it as a relative URL and hits the static site) or it points at the wrong host. " +
            "Request URL was: " +
            url +
            ". Set chatApiBaseUrl in js/config.js to the full chat API origin, e.g. https://your-service.up.railway.app";
        }
        throw new Error(
          "The chat server returned an unexpected response. Check that chatApiBaseUrl in js/config.js points at the chat API." +
            hint +
            (oneLine && !hint ? " Details: " + oneLine.slice(0, 200) : "")
        );
      }
      if (!res.ok) {
        var httpMsg = humanDetailFromHttpBody(text);
        if (!httpMsg) httpMsg = res.statusText || tr("requestFailed") || "Request failed.";
        var techBody = text && text.length ? text : "";
        if (techBody.length > 1200) techBody = techBody.slice(0, 1200) + "…";
        throw new Error(
          "[Chat HTTP " + res.status + "] " + httpMsg + (techBody ? " | body: " + techBody : "")
        );
      }
      return data;
    }

    function leagueAllowsUnrestrictedRematches(rosterState) {
      return !!(
        rosterState &&
        rosterState.rules &&
        rosterState.rules.match_pair_idempotency === "none"
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

    async function ensureLeagueRosterForStandingsDefault() {
      if (leagueRoster.status === "ok") return leagueRoster;
      try {
        var result = await fetchLeagueRoster(route.leagueId);
        if (result.ok) {
          applyLeagueRosterResult(result);
        } else {
          console.warn("[TLCHAT] Standings default roster fetch failed:", result);
        }
      } catch (err) {
        console.warn("[TLCHAT] Standings default roster fetch failed:", err);
      }
      return leagueRoster;
    }

    function isStandingsDataType(dataType) {
      return dataType === "GET_STANDINGS" || dataType === "GET_STANDINGS_BY_PLAYER";
    }

    function showStandingsDateError(form, message) {
      var errorEl = form && form.querySelector("[data-standings-date-error]");
      if (!errorEl) return;
      errorEl.textContent = message || "";
      errorEl.hidden = !message;
    }

    function setStandingsFilterBusy(form, busy) {
      if (!form) return;
      form
        .querySelectorAll("input, button")
        .forEach(function (el) {
          el.disabled = !!busy;
        });
    }

    function renderStandingsPanelInto(panel, dataType, data, isAdmin) {
      panel.innerHTML = renderReadPanelBody(dataType, data, isAdmin);
      bindStandingsDateControls(panel, dataType, isAdmin);
    }

    async function fetchAndRenderStandingsPanel(
      panel,
      dataType,
      playerName,
      startDate,
      endDate,
      isAdmin
    ) {
      var result = await fetchLeagueStandings(
        route.leagueId,
        dataType,
        playerName,
        startDate,
        endDate
      );
      if (!result.ok) return result;
      var nextData = cloneStandingsDataWithDateFilter(
        result.data || {},
        startDate,
        endDate
      );
      if (playerName) nextData.player_name = playerName;
      renderStandingsPanelInto(panel, dataType, nextData, isAdmin);
      return result;
    }

    function bindStandingsDateControls(scope, dataType, isAdmin) {
      if (!isStandingsDataType(dataType)) return;
      var panel = scope && scope.classList && scope.classList.contains("data-panel")
        ? scope
        : scope && scope.querySelector
          ? scope.querySelector(".data-panel")
          : null;
      if (!panel) return;
      var form = panel.querySelector("[data-standings-date-filter]");
      if (!form) return;
      var startInput = form.querySelector('input[name="start_date"]');
      var endInput = form.querySelector('input[name="end_date"]');
      var clearBtn = form.querySelector("[data-standings-clear]");
      var playerName = form.getAttribute("data-player-name") || "";

      async function applyFilter(startDate, endDate) {
        showStandingsDateError(form, "");
        if (startDate && endDate && startDate > endDate) {
          showStandingsDateError(
            form,
            tr("standingsDateRangeInvalid") ||
              "Start date must be on or before end date."
          );
          return;
        }
        setStandingsFilterBusy(form, true);
        try {
          var result = await fetchAndRenderStandingsPanel(
            panel,
            dataType,
            playerName,
            startDate,
            endDate,
            isAdmin
          );
          if (!result || !result.ok) {
            showStandingsDateError(
              form,
              tr("standingsFilterFailed") ||
                "Could not update standings for those dates."
            );
          }
        } catch (err) {
          console.warn("[TLCHAT] Standings filter fetch failed:", err);
          showStandingsDateError(
            form,
            tr("standingsFilterFailed") ||
              "Could not update standings for those dates."
          );
        } finally {
          if (document.body.contains(form)) setStandingsFilterBusy(form, false);
        }
      }

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        applyFilter(startInput ? startInput.value : "", endInput ? endInput.value : "");
      });

      if (clearBtn) {
        clearBtn.addEventListener("click", function () {
          if (startInput) startInput.value = "";
          if (endInput) endInput.value = "";
          applyFilter("", "");
        });
      }
    }

    async function resolveInitialStandingsData(dataType, data) {
      if (!isStandingsDataType(dataType)) return data || {};
      await ensureLeagueRosterForStandingsDefault();
      var latestDate = dateOnlyOrNull(leagueRoster.latest_match_date);
      if (!latestDate) return data || {};
      var playerName =
        dataType === "GET_STANDINGS_BY_PLAYER" && data && data.player_name != null
          ? String(data.player_name).trim()
          : "";
      var result = await fetchLeagueStandings(
        route.leagueId,
        dataType,
        playerName,
        latestDate,
        latestDate
      );
      if (result.ok) {
        var nextData = cloneStandingsDataWithDateFilter(
          result.data || {},
          latestDate,
          latestDate
        );
        if (playerName) nextData.player_name = playerName;
        return nextData;
      }
      console.warn("[TLCHAT] Latest-day standings fetch failed:", result);
      return cloneStandingsDataWithDateFilter(data || {}, latestDate, latestDate);
    }

    function matchSummaryForConfirmation(match) {
      var team1 =
        String(match.team1_player1_nickname || "") +
        " + " +
        String(match.team1_player2_nickname || "");
      var team2 =
        String(match.team2_player1_nickname || "") +
        " + " +
        String(match.team2_player2_nickname || "");
      return {
        teams: team1 + " " + (tr("vs") || "vs") + " " + team2,
        score:
          String(match.team1_score == null ? "" : match.team1_score) +
          " - " +
          String(match.team2_score == null ? "" : match.team2_score),
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
            "These two teams already have a match recorded today. Continue only if this is a separate rematch.";
        }
        if (detailEl && existing) {
          var summary = matchSummaryForConfirmation(existing);
          detailEl.textContent =
            tr("rematchConfirmModalExisting", summary) ||
            "Existing result: " +
              summary.teams +
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

      var pt1 = Array.isArray(payload.team1_nicknames)
        ? payload.team1_nicknames
        : [];
      var pt2 = Array.isArray(payload.team2_nicknames)
        ? payload.team2_nicknames
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

    async function submitBackendAction(cardEl, method, url, bodySpec) {
      var payload = collectWriteForm(cardEl, bodySpec);
      var miss = validateWriteBody(bodySpec, payload);
      if (miss.length) {
        appendErrorPlain(
          (tr("fillRequired") || "Please fill required fields: ") +
            miss
              .map(function (k) {
                return labelForFormField(k);
              })
              .join(", ")
        );
        return;
      }
      var needsToken = needsHostTokenForUrl(url);
      if (needsToken && !route.hostToken) {
        appendErrorPlain(
          tr("adminEndpointHint") ||
            "This action calls an admin endpoint. Open the Admin URL with your host token."
        );
        return;
      }
      var headers = {};
      var jsonBody = payload;
      var hasJsonBody = method !== "DELETE" && method !== "GET" && Object.keys(jsonBody).length > 0;
      if (hasJsonBody) {
        headers["Content-Type"] = "application/json";
      }
      // Attach the host token only when the URL targets an /admin/
      // route. By the routing contract (see
      // `.cursor/rules/frontend-vanilla-conventions.mdc` "Admin-page
      // write actions target /admin/* URLs"), every admin action
      // already builds an /admin/ URL upstream, so this is sufficient
      // and avoids accidentally promoting a player-route call.
      if (shouldAttachHostTokenForUrl(url, route.hostToken)) {
        headers["X-Host-Token"] = route.hostToken;
      }

      var btn = cardEl.querySelector("[data-submit-write]");
      if (btn) btn.disabled = true;

      var loadingNode = null;
      try {
        var confirmed = await confirmAllowedSameDayRematchIfNeeded(
          method,
          url,
          payload,
          btn
        );
        if (!confirmed) return;

        loadingNode = appendLoadingBubble();
        var opts = { method: method, headers: headers };
        if (hasJsonBody) {
          opts.body = JSON.stringify(jsonBody);
        }
        var res = await fetch(url, opts);
        var txt = await res.text();
        var ok = res.ok;
        if (ok) {
          var matchCreation = isMatchCreationCall(method, url);
          var matchEdit = !matchCreation && isMatchEditCall(method, url);
          var matchDelete = !matchCreation && !matchEdit && isMatchDeleteCall(method, url);
          if (matchCreation) {
            refreshLeagueRoster();
            var matchRecordedLine = tr("matchRecorded") || "Match recorded.";
            var calloutHtml =
              '<div class="response-callout response-callout-success"><strong>' +
              escapeHtml(tr("done") || "Done.") +
              "</strong> " +
              escapeHtml(matchRecordedLine) +
              "</div>";
            // Pure synthetic render: build the single-row match history panel
            // straight from the form values the user just submitted, with the
            // same trim+lowercase normalization the backend applies, so the
            // row visually matches existing server-rendered history rows.
            // `match_id` and `created_at` come from the server response so
            // the per-row Update button can target a real URL and the
            // window-gate math uses the DB-authoritative timestamp (not
            // an unreliable client clock).
            var serverResp = tryParseJson(txt) || {};
            var recordedAt = serverResp.created_at || new Date().toISOString();
            var latestDate = leagueLocalDateKey(
              recordedAt,
              leagueRoster.league_timezone || "America/Los_Angeles"
            );
            if (latestDate) leagueRoster.latest_match_date = latestDate;
            var t1 = Array.isArray(payload.team1_nicknames) ? payload.team1_nicknames : [];
            var t2 = Array.isArray(payload.team2_nicknames) ? payload.team2_nicknames : [];
            var newMatchRecord = {
              match_id: serverResp.match_id || null,
              team1_player1_nickname: normalizeMatchNickname(t1[0]),
              team1_player2_nickname: normalizeMatchNickname(t1[1]),
              team2_player1_nickname: normalizeMatchNickname(t2[0]),
              team2_player2_nickname: normalizeMatchNickname(t2[1]),
              team1_score: payload.team1_score,
              team2_score: payload.team2_score,
              created_at: recordedAt,
            };
            removeLoadingBubble(loadingNode);
            loadingNode = null;
            var submitOkWrap = appendAssistant(
              calloutHtml +
                renderReadPanel(
                  "GET_MATCH_HISTORY",
                  { matches: [newMatchRecord] },
                  !!route.hostToken
                )
            );
            bindMatchDateGroupToggles(submitOkWrap);
            bindMatchRowUpdateButtons(submitOkWrap);
            bindMatchRowDeleteButtons(submitOkWrap);
            conversationHistory.push({
              role: "assistant",
              content: matchRecordedLine,
            });
          } else if (matchEdit) {
            // Match-score-edit (PATCH) success. AGENTS.md hard rule:
            // never surface technical IDs in user-visible UI. The
            // backend's `EditMatchScoreResponse` is `{match_id,
            // team1_score, team2_score}` — ID-shaped, never directly
            // shown. Instead, reuse the post-create success UI: a
            // localised callout + a single-row history panel built
            // from (a) the new scores from the response/payload and
            // (b) the row's domain payload (nicknames, created_at)
            // recovered from the data-* attributes we stash on every
            // .match-row / .match-picker-row in the page.
            var editServerResp = tryParseJson(txt) || {};
            var editedMatchId =
              extractMatchIdFromEditUrl(url) ||
              (editServerResp.match_id ? String(editServerResp.match_id) : "");
            var newT1Score =
              editServerResp.team1_score != null
                ? String(editServerResp.team1_score)
                : String(payload.team1_score == null ? "" : payload.team1_score);
            var newT2Score =
              editServerResp.team2_score != null
                ? String(editServerResp.team2_score)
                : String(payload.team2_score == null ? "" : payload.team2_score);
            var origRow = editedMatchId
              ? document.querySelector(
                  '#messages [data-match-row-id="' +
                    cssEscapeAttrValue(editedMatchId) +
                    '"]'
                )
              : null;
            var editedMatchRecord = {
              match_id: editedMatchId || null,
              team1_player1_nickname: origRow
                ? origRow.getAttribute("data-team1-p1") || ""
                : "",
              team1_player2_nickname: origRow
                ? origRow.getAttribute("data-team1-p2") || ""
                : "",
              team2_player1_nickname: origRow
                ? origRow.getAttribute("data-team2-p1") || ""
                : "",
              team2_player2_nickname: origRow
                ? origRow.getAttribute("data-team2-p2") || ""
                : "",
              team1_score: newT1Score,
              team2_score: newT2Score,
              // PATCH preserves created_at on the DB side; reuse the
              // existing timestamp so the per-row Update button's
              // window math stays consistent with the next history
              // fetch. Falls back to "now" only if the row was
              // somehow rendered without it (defensive — never expected).
              created_at:
                (origRow && origRow.getAttribute("data-match-created-at")) ||
                new Date().toISOString(),
            };
            var matchUpdatedLine = tr("matchScoreUpdated") || "Match score updated.";
            removeLoadingBubble(loadingNode);
            loadingNode = null;
            var editOkWrap = appendAssistant(
              '<div class="response-callout response-callout-success"><strong>' +
                escapeHtml(tr("done") || "Done.") +
                "</strong> " +
                escapeHtml(matchUpdatedLine) +
                "</div>" +
                renderReadPanel(
                  "GET_MATCH_HISTORY",
                  { matches: [editedMatchRecord] },
                  !!route.hostToken
                )
            );
            bindMatchDateGroupToggles(editOkWrap);
            bindMatchRowUpdateButtons(editOkWrap);
            bindMatchRowDeleteButtons(editOkWrap);
            conversationHistory.push({
              role: "assistant",
              content: matchUpdatedLine,
            });
          } else if (matchDelete) {
            // Match-delete (DELETE) success. AGENTS.md hard rule: never
            // surface technical IDs in user-visible UI. The backend's
            // 204 response carries no body, so there's no ID-leak
            // risk, but we still avoid the generic
            // `humanSuccessFromHttpBody` path so the user sees a
            // specific "Match deleted." callout instead of the
            // generic "Changes saved." one. We also remove the row
            // in place across every assistant bubble that rendered
            // it (history panel, post-create success, duplicate
            // recovery), so the user gets immediate visual feedback
            // without a refetch.
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
            removeLoadingBubble(loadingNode);
            loadingNode = null;
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
          } else {
            var successLine = humanSuccessFromHttpBody(txt);
            removeLoadingBubble(loadingNode);
            loadingNode = null;
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
        } else {
          var errLine = humanDetailFromHttpBody(txt);
          var technical =
            "[League API " +
            res.status +
            "] " +
            (errLine || "(no detail in body)") +
            (txt && txt.length ? " | body: " + (txt.length > 800 ? txt.slice(0, 800) + "…" : txt) : "");

          var rosterMembershipResult =
            isMatchCreationCall(method, url) &&
            res.status === 422
              ? (function () {
                  var ufe = window.TLCHAT_USER_FACING_ERRORS;
                  if (ufe && typeof ufe.fromMatchSubmissionError === "function") {
                    var parsed = tryParseJson(txt);
                    return ufe.fromMatchSubmissionError(res.status, parsed);
                  }
                  return { isRosterMembershipRequired: false };
                })()
              : { isRosterMembershipRequired: false };

          if (rosterMembershipResult.isRosterMembershipRequired) {
            var missing = rosterMembershipResult.missing_nicknames || [];
            var calloutHtml =
              '<div class="response-callout response-callout-clarify">' +
              escapeHtml(rosterMembershipResult.headline || "") +
              "</div>";
            if (route.hostToken && missing.length) {
              var addBtnLabel = tr("rosterMembershipAddButton") || "+ Add to roster";
              calloutHtml +=
                '<button type="button" class="btn-secondary roster-admin-add-missing" style="margin-top:0.5rem">' +
                escapeHtml(addBtnLabel) +
                "</button>";
            }
            removeLoadingBubble(loadingNode);
            loadingNode = null;
            var rosterErrWrap = appendAssistant(calloutHtml, "msg-error");
            if (route.hostToken && missing.length) {
              var addMissingBtn = rosterErrWrap && rosterErrWrap.querySelector(".roster-admin-add-missing");
              if (addMissingBtn) {
                addMissingBtn.addEventListener("click", function () {
                  openPlayersPanelWithNicknames(missing);
                });
              }
            }
            conversationHistory.push({
              role: "assistant",
              content: rosterMembershipResult.headline || "",
            });
          } else {
          // Player-edit window expired: backend returns 422 with
          // error="MatchEditWindowExpiredError" when a non-admin tries
          // to edit a too-old match. Surface a friendly explanation
          // instead of the raw 422 technical line; no history refetch
          // is needed because the row is already on screen.
          var matchEditWindowExpired =
            res.status === 422 &&
            leagueApiJsonErrorCode(txt) === "MatchEditWindowExpiredError";
          // Same shape for the delete window: a non-admin deleting a
          // too-old match gets a localised "this can no longer be
          // deleted" callout rather than a raw 422.
          var matchDeleteWindowExpired =
            res.status === 422 &&
            leagueApiJsonErrorCode(txt) === "MatchDeleteWindowExpiredError";
          if (matchEditWindowExpired) {
            var expiredMsg =
              tr("matchEditWindowExpired") ||
              "This match can no longer be edited (window expired).";
            removeLoadingBubble(loadingNode);
            loadingNode = null;
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
          } else if (matchDeleteWindowExpired) {
            var deleteExpiredMsg =
              tr("matchDeleteWindowExpired") ||
              "This match can no longer be deleted (window expired).";
            removeLoadingBubble(loadingNode);
            loadingNode = null;
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
          } else {
          var failedMatchCreate =
            isMatchCreationCall(method, url) &&
            res.status === 409 &&
            leagueApiJsonErrorCode(txt) === "DuplicateTeamPairMatchError";
          if (failedMatchCreate) {
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
            var existingRow = hist.ok ? findMatchRecordForSubmittedPair(hist.matches, t1n, t2n) : null;
            var duplicateText = String(txt || "").toLowerCase();
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
              console.warn("[TLCHAT] Duplicate match — match history fetch failed", hist);
            } else if (!existingRow) {
              console.warn("[TLCHAT] Duplicate match — no matching row in history (unexpected)");
            }
            removeLoadingBubble(loadingNode);
            loadingNode = null;
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
          } else {
            removeLoadingBubble(loadingNode);
            loadingNode = null;
            appendErrorTechnical(technical, "League API error");
          }
          } // close matchEditWindowExpired else block
          } // close rosterMembershipResult.isRosterMembershipRequired else block
        }
      } catch (e) {
        removeLoadingBubble(loadingNode);
        loadingNode = null;
        appendErrorTechnical(e.message || String(e), "League API request failed");
      } finally {
        removeLoadingBubble(loadingNode);
        if (btn) btn.disabled = false;
      }
    }

    /**
     * Edit-match-score picker: posts the assistant message and wires up
     * per-row Edit/Submit click handlers. Each row's Edit button toggles an
     * inline form prefilled with the match's current scores; only one form is
     * open at a time. Submission delegates to submitBackendAction so we reuse
     * validation, host-token wiring, and success/error rendering.
     */
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
            4 /* picker table has 4 columns */
          );
        });
      });
    }

    /**
     * Reusable inline edit-score form mounter.
     *
     * Originally only fired from `renderEditMatchScorePickerMessage`
     * (the `EDIT_MATCH_SCORE` picker table). Now also fired from every
     * per-row Update button in `renderMatches()` (post-submit success
     * row, duplicate-match recovery row, full GET_MATCH_HISTORY).
     *
     * Args:
     *   panel       DOM element that contains the anchor row (a
     *               table/wrap; the form is inserted as a sibling
     *               row immediately after the anchor).
     *   matchId     UUID string used to find the anchor row by
     *               `data-match-row-id` AND to interpolate into url.
     *   match       Plain object carrying at least `team1_score` and
     *               `team2_score` so the form prefills the current
     *               values. Pass null/undefined to bail.
     *   url         Fully-resolved PATCH URL (no `{match_id}`
     *               placeholder remaining). Caller decides whether to
     *               point at the player or admin endpoint; the route
     *               handles X-Host-Token attachment via
     *               `needsHostTokenForUrl`.
     *   method      HTTP verb, almost always "PATCH".
     *   bodySchema  `{field: {type, required}}` map driving the form
     *               render. For the score-edit flow this is the
     *               2-field score schema.
     *   colspan     Column span for the inserted form row's <td>;
     *               varies by table (picker has 4 cols, match
     *               history has 3 or 4 depending on whether Actions
     *               is rendered).
     */
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
      Object.keys(bodySchema).forEach(function (key) {
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

    /**
     * Default body schema for the score-edit form. Used by both the
     * EDIT_MATCH_SCORE picker (which usually receives the same schema
     * from the chat server) and the per-row Update button on any match
     * history panel. Centralised so we don't accidentally drift between
     * the two call paths.
     */
    var DEFAULT_EDIT_MATCH_SCORE_BODY_SCHEMA = {
      team1_score: { type: "string", required: true },
      team2_score: { type: "string", required: true },
    };

    /**
     * Bind per-row Update buttons rendered by `renderMatches()` to the
     * inline edit form. Called by every place that mounts a match
     * history panel: the chat-response dispatcher, the post-submit
     * success branch, and the duplicate-match recovery branch.
     *
     * `wrap` is the DOM node returned by `appendAssistant(...)`.
     */
    function bindMatchRowUpdateButtons(wrap) {
      if (!wrap) return;
      var panel = wrap.querySelector(".data-panel") || wrap;
      var btns = panel.querySelectorAll(".btn-match-update[data-update-match-id]");
      if (!btns.length) return;

      // Index the rendered rows by match_id so we can extract the
      // current scores when the user opens the form (the row's DOM is
      // the source of truth; no need to keep a parallel JS cache).
      function rowDataForMatchId(id) {
        var row = panel.querySelector(
          '.match-row[data-match-row-id="' + cssEscapeAttrValue(id) + '"]'
        );
        if (!row) return null;
        var scoreCell = row.querySelectorAll("td")[1];
        if (!scoreCell) return null;
        var parts = scoreCell.textContent.split("\u2013"); // en-dash
        if (parts.length !== 2) parts = scoreCell.textContent.split("-");
        return {
          team1_score: (parts[0] || "").trim(),
          team2_score: (parts[1] || "").trim(),
        };
      }

      var leagueId = route.leagueId;
      var base = backendMainBase();
      // Per-role URL routing for match-score edits. An admin-page
      // click on Update is admin work and must hit the admin route;
      // the player route is reserved for unauthenticated player
      // submissions (which the backend gates by the player-edit
      // window). See `.cursor/rules/frontend-vanilla-conventions.mdc`
      // "Admin-page write actions target /admin/* URLs".
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
          // Match history table has 3 or 4 columns; renderMatches
          // adds Actions only when at least one row has an id (which
          // is true here, otherwise we wouldn't have a button to
          // click). Colspan = 4 covers it.
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

      // Touch support for disabled buttons (modeled on the
      // roster-remove-tip pattern). Toggling --tip-open on the wrap
      // forces the tooltip visible on tap; tapping elsewhere closes it.
      var disabledWraps = panel.querySelectorAll(
        ".match-update-wrap--disabled"
      );
      disabledWraps.forEach(function (w) {
        w.addEventListener("click", function (e) {
          e.stopPropagation();
          // Close other open tips first so only one is visible at a time.
          panel
            .querySelectorAll(".match-update-wrap--tip-open")
            .forEach(function (other) {
              if (other !== w)
                other.classList.remove("match-update-wrap--tip-open");
            });
          w.classList.toggle("match-update-wrap--tip-open");
        });
      });
    }

    /**
     * Bind per-row Delete buttons rendered by `renderMatches()` to a
     * modal confirm flow. First click opens a dialog with an
     * irreversible warning; Confirm fires DELETE through
     * `submitBackendAction` (host-token wiring, window-expired branch,
     * success plumbing). Cancel / backdrop / Escape close without
     * deleting.
     *
     * Mirrors `bindMatchRowUpdateButtons` in structure and is called
     * at every site that already calls that one.
     */
    var deleteConfirmModalEl = null;
    var deleteConfirmPending = null;

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
      // Per-role URL routing for match deletes. Mirrors the Update
      // button. An admin-page click on Delete is admin work and must
      // hit the admin route; the player route is reserved for
      // unauthenticated player calls (which the backend gates by the
      // player-delete window). See
      // `.cursor/rules/frontend-vanilla-conventions.mdc`.
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

      // Touch support for disabled buttons — mirrors the
      // match-update-wrap--disabled handler above. Toggling
      // --tip-open on the wrap forces the tooltip visible on tap.
      var disabledWraps = panel.querySelectorAll(
        ".match-delete-wrap--disabled"
      );
      disabledWraps.forEach(function (w) {
        w.addEventListener("click", function (e) {
          e.stopPropagation();
          panel
            .querySelectorAll(".match-delete-wrap--tip-open")
            .forEach(function (other) {
              if (other !== w)
                other.classList.remove("match-delete-wrap--tip-open");
            });
          w.classList.toggle("match-delete-wrap--tip-open");
        });
      });
    }

    /** Escape only the chars that break a quoted attribute filter ("..."). */
    function cssEscapeAttrValue(v) {
      return String(v == null ? "" : v).replace(/(["\\])/g, "\\$1");
    }

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
        var resp = await postChat(submittedText);
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
        team1_nicknames: { type: "array[string]", required: true, value: null },
        team2_nicknames: { type: "array[string]", required: true, value: null },
        team1_score:     { type: "string",        required: true, value: null },
        team2_score:     { type: "string",        required: true, value: null },
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

    /* Roster alias/add/remove from GET_ROSTER and Get Players chat panels.
       The button renderers own admin gating; this delegated listener owns
       the write calls and refreshes every open roster surface after success. */
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
        aliasRemoveBtn.textContent = "…";
        try {
          await removeAliasFromPlayer(playerIdForAlias, alias);
          showRosterWriteMessage(
            aliasRemoveBtn,
            tr("aliasRemoveSuccess", { alias: alias, name: nicknameForAlias }) ||
              "Alias removed.",
            false
          );
          refreshRosterSurfaces();
        } catch (err) {
          aliasRemoveBtn.disabled = false;
          aliasRemoveBtn.textContent = "×";
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

    /* Show disabled remove + players-add tooltips on touch (mobile).
       Both `.roster-remove-wrap--disabled` (per-row Remove on roster /
       players panels) and `.players-add-btn-wrap--disabled` (the
       admin-only Add button on a non-admin Get Players panel) use the
       same toggle-on-touch interaction so the tip is reachable on
       devices where `:hover` never fires. */
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

    /* Disabled-button tooltips on alias add / alias remove / roster
       remove are positioned `fixed` (see `.alias-tip` /
       `.roster-remove-tip` in styles.css) so they escape the
       `overflow: auto` clipping of the `.roster-admin-list` scroll
       container. The CSS keeps owning visibility (hover / focus /
       --tip-open); this code owns coordinates only.

       Without this, the tip would render at viewport (0, 0) because
       `position: fixed` ignores its ancestor `position: relative`. We
       measure the wrap with `getBoundingClientRect()` on every show
       event, place the tip centered above the wrap, then clamp to the
       viewport (flip below when there is no room above, slide
       sideways when wider than the wrap's slot). */
    var DISABLED_TIP_WRAP_SELECTOR =
      ".alias-add-wrap--disabled, " +
      ".alias-remove-wrap--disabled, " +
      ".roster-remove-wrap--disabled";

    function disabledTipNodeFor(wrap) {
      if (!wrap) return null;
      if (wrap.matches(".roster-remove-wrap--disabled")) {
        return wrap.querySelector(".roster-remove-tip");
      }
      return wrap.querySelector(".alias-tip");
    }

    function positionDisabledTip(wrap) {
      var tip = disabledTipNodeFor(wrap);
      if (!tip) return;
      // Reset before measuring so prior coordinates don't bias the
      // tip's measured width (which depends on max-width and the
      // viewport, not on `left`).
      tip.style.left = "0px";
      tip.style.top = "0px";
      var wrapRect = wrap.getBoundingClientRect();
      var tipRect = tip.getBoundingClientRect();
      var pad = 8;
      var vw = window.innerWidth || document.documentElement.clientWidth;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var gap = 6;
      // Default: centered horizontally on the wrap, sitting above it.
      var left = wrapRect.left + wrapRect.width / 2 - tipRect.width / 2;
      var top = wrapRect.top - tipRect.height - gap;
      if (left < pad) left = pad;
      if (left + tipRect.width > vw - pad) {
        left = Math.max(pad, vw - tipRect.width - pad);
      }
      // Flip below the wrap when there is no room above.
      if (top < pad) top = wrapRect.bottom + gap;
      if (top + tipRect.height > vh - pad) {
        top = Math.max(pad, vh - tipRect.height - pad);
      }
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    }

    root.addEventListener(
      "mouseover",
      function (e) {
        var wrap =
          e.target.closest && e.target.closest(DISABLED_TIP_WRAP_SELECTOR);
        if (!wrap) return;
        positionDisabledTip(wrap);
      },
      true
    );

    root.addEventListener("focusin", function (e) {
      var wrap =
        e.target.closest && e.target.closest(DISABLED_TIP_WRAP_SELECTOR);
      if (!wrap) return;
      positionDisabledTip(wrap);
    });

    // Reposition every currently-visible tip on scroll / resize (the
    // wrap moves, the fixed tip would otherwise stay where it was
    // first measured). `:hover` and `:focus-within` cover desktop;
    // `--tip-open` covers the touch / tap case.
    var disabledTipRafId = null;
    function repositionVisibleDisabledTips() {
      disabledTipRafId = null;
      var visibleWraps = document.querySelectorAll(
        ".alias-add-wrap--disabled:hover, " +
          ".alias-add-wrap--disabled:focus-within, " +
          ".alias-add-wrap--tip-open, " +
          ".alias-remove-wrap--disabled:hover, " +
          ".alias-remove-wrap--disabled:focus-within, " +
          ".alias-remove-wrap--tip-open, " +
          ".roster-remove-wrap--disabled:hover, " +
          ".roster-remove-wrap--disabled:focus-within, " +
          ".roster-remove-wrap--tip-open"
      );
      visibleWraps.forEach(positionDisabledTip);
    }
    function scheduleDisabledTipReposition() {
      if (disabledTipRafId != null) return;
      disabledTipRafId = requestAnimationFrame(repositionVisibleDisabledTips);
    }
    window.addEventListener("scroll", scheduleDisabledTipReposition, true);
    window.addEventListener("resize", scheduleDisabledTipReposition);

    /* Click-outside dismissal for the disabled Update/Delete tooltips on
       match-history rows. The per-wrap click handlers in
       bindMatchRowUpdateButtons / bindMatchRowDeleteButtons stop
       propagation, so clicks inside a disabled wrap never reach this
       listener — only true outside-clicks close the tip. */
    document.addEventListener("click", function (e) {
      var insideUpdate =
        e.target.closest && e.target.closest(".match-update-wrap--disabled");
      var insideDelete =
        e.target.closest && e.target.closest(".match-delete-wrap--disabled");
      if (insideUpdate || insideDelete) return;
      document
        .querySelectorAll(
          ".match-update-wrap--tip-open, .match-delete-wrap--tip-open"
        )
        .forEach(function (el) {
          el.classList.remove("match-update-wrap--tip-open");
          el.classList.remove("match-delete-wrap--tip-open");
        });
    });

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
