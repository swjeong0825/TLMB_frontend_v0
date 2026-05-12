(function () {
  "use strict";

  var READ_TYPES = {
    GET_STANDINGS: true,
    GET_STANDINGS_BY_PLAYER: true,
    GET_MATCH_HISTORY: true,
    GET_MATCH_HISTORY_BY_PLAYER: true,
    GET_ROSTER: true,
    GET_ELIGIBLE_PLAYERS: true,
    HELP: true,
  };

  var WRITE_TYPES = {
    SUBMIT_MATCH_RESULT: true,
    EDIT_PLAYER_NICKNAME: true,
    EDIT_MATCH_SCORE: true,
    DELETE_MATCH: true,
    DELETE_TEAM: true,
    ADD_ELIGIBLE_PLAYERS: true,
    REMOVE_ELIGIBLE_PLAYER: true,
  };

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
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
    if (dataType === "GET_ELIGIBLE_PLAYERS") return tr("panelEligiblePlayers") || tr("eligiblePanelTitle") || "Eligible players";
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
      nicknames: tr("fieldEligibleNicknames") || "Eligible nicknames",
      nickname: tr("fieldEligibleNickname") || "Eligible nickname",
    };
    if (byKey[key]) return byKey[key];
    return key
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function formatWhen(iso) {
    if (iso == null || iso === "") return tr("emDash") || "—";
    var t = Date.parse(String(iso));
    if (isNaN(t)) return escapeHtml(String(iso));
    try {
      return escapeHtml(
        new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      );
    } catch (e) {
      return escapeHtml(String(iso));
    }
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

  /**
   * GET /leagues/{id}/roster — used on chat open; includes league title for header + roster cache for mentions.
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
      return {
        ok: true,
        title: leagueTitle,
        players: Array.isArray(data.players) ? data.players : [],
        teams: Array.isArray(data.teams) ? data.teams : [],
      };
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

  /** GET /leagues/{id}/eligible-players — host-only panel data. */
  async function fetchEligiblePlayersFromApi(leagueId, hostToken) {
    var base = backendMainBase();
    if (!base || !leagueId) {
      return { ok: false, error: "missing_config_or_league" };
    }
    var url = base + "/leagues/" + encodeURIComponent(leagueId) + "/eligible-players";
    var headers = {};
    if (hostToken) headers["X-Host-Token"] = hostToken;
    try {
      var res = await fetch(url, { headers: headers });
      var text = await res.text();
      if (!res.ok) {
        return { ok: false, error: "http", status: res.status, body: text };
      }
      var data = JSON.parse(text);
      return {
        ok: true,
        eligible_players: Array.isArray(data.eligible_players) ? data.eligible_players : [],
      };
    } catch (e) {
      return { ok: false, error: "parse", message: e && e.message ? e.message : String(e) };
    }
  }

  function renderEligiblePlayersPanelHtml(state) {
    var players = (state && state.eligible_players) || [];
    var isLoading = state && state.loading;
    var errorMsg = state && state.error;
    var count = players.length;

    var heading =
      '<summary class="eligible-players-summary" aria-expanded="false">' +
      escapeHtml(tr("eligiblePanelTitle") || "Eligible players") +
      ' <span class="eligible-players-count">(' + count + ')</span>' +
      "</summary>";

    var bodyHtml;
    if (isLoading) {
      bodyHtml =
        '<p class="hint">' +
        escapeHtml(tr("eligiblePanelLoading") || "Loading eligible players\u2026") +
        "</p>";
    } else if (errorMsg) {
      bodyHtml =
        '<p class="hint eligible-players-error">' +
        escapeHtml(tr("eligiblePanelError") || "Could not load eligible players.") +
        "</p>";
    } else if (!players.length) {
      bodyHtml =
        '<p class="hint">' +
        escapeHtml(tr("eligiblePanelEmpty") || "No eligible players defined yet.") +
        "</p>";
    } else {
      var rows = players
        .map(function (ep) {
          return (
            '<li class="eligible-player-item">' +
            '<span class="eligible-player-name">' +
            escapeHtml(ep.nickname || "") +
            "</span>" +
            '<button type="button" class="btn-remove-eligible" data-eligible-id="' +
            escapeAttr(String(ep.eligible_player_id || "")) +
            '" aria-label="' +
            escapeAttr(tr("eligibleRemoveAria") || "Remove") +
            " " +
            escapeAttr(ep.nickname || "") +
            '">\u00d7</button>' +
            "</li>"
          );
        })
        .join("");
      bodyHtml = '<ul class="eligible-players-list">' + rows + "</ul>";
    }

    var addRow =
      '<div class="eligible-players-add-row">' +
      '<input type="text" class="eligible-players-add-input" placeholder="' +
      escapeAttr(tr("eligibleAddPlaceholder") || "e.g. alice, bob, charlie") +
      '" />' +
      '<button type="button" class="btn-secondary eligible-players-add-btn">' +
      escapeHtml(tr("eligibleAddButton") || "Add") +
      "</button>" +
      "</div>" +
      '<div class="eligible-players-inline-msg" hidden></div>';

    return heading + '<div class="eligible-players-body">' + bodyHtml + addRow + "</div>";
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

  function needsHostTokenForUrl(url) {
    return typeof url === "string" && url.indexOf("/admin/") !== -1;
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
      var n = normalizeMatchNickname(p && p.nickname);
      if (n) set[n] = true;
    });
    return set;
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

  /**
   * Find the league match row for the same unordered pair of teams (handles swapped sides).
   * t1Norms/t2Norms: two-element arrays of normalized nicknames per team.
   */
  function findMatchRecordForSubmittedPair(matches, t1Norms, t2Norms) {
    var kA = rosterTeamPairKey(t1Norms[0], t1Norms[1]);
    var kB = rosterTeamPairKey(t2Norms[0], t2Norms[1]);
    if (!kA || !kB) return null;
    for (var i = 0; i < (matches || []).length; i++) {
      var sides = matchRecordTeamPairKeys(matches[i]);
      var s0 = sides[0];
      var s1 = sides[1];
      if (!s0 || !s1) continue;
      if ((kA === s0 && kB === s1) || (kA === s1 && kB === s0)) {
        return matches[i];
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
   * Assumes default one-team-per-player when flagging partner conflicts (matches typical league rules).
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
    var pairKeys = rosterPairKeysFromTeams(teams);

    var t1 = nickPairFromBodySpec(bodySpec, "team1_nicknames");
    var t2 = nickPairFromBodySpec(bodySpec, "team2_nicknames");

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

    analyzeSide(t1.raw, t1.norm);
    analyzeSide(t2.raw, t2.norm);

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

  // Metrics not in tie_breakers appear in this order after tie-breaker columns.
  var STANDINGS_METRIC_BASE_ORDER = [
    "matches_won",
    "match_diff",
    "games_won",
    "games_lost",
    "games_diff",
    "win_pct",
    "matches_played",
  ];

  function orderedStandingsMetricKeys(tieBreakers) {
    var tb = Array.isArray(tieBreakers) ? tieBreakers : [];
    var first = [];
    var seen = {};
    var i;
    for (i = 0; i < tb.length; i++) {
      var m = tb[i];
      if (METRIC_COLUMN[m] && !seen[m]) {
        seen[m] = true;
        first.push(m);
      }
    }
    var rest = [];
    for (i = 0; i < STANDINGS_METRIC_BASE_ORDER.length; i++) {
      var key = STANDINGS_METRIC_BASE_ORDER[i];
      if (!seen[key]) {
        seen[key] = true;
        rest.push(key);
      }
    }
    return first.concat(rest);
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

  function renderStandings(data) {
    var rows = data.standings || [];
    if (!rows.length) {
      return "<p class=\"hint\">" + escapeHtml(tr("standingsEmpty") || "No standings yet.") + "</p>";
    }
    var subjectKind = rows[0].subject_kind || "team";
    var subjectHeader =
      subjectKind === "player"
        ? escapeHtml(tr("tablePlayer") || "Player")
        : escapeHtml(tr("tableTeam") || "Team");
    var metricKeys = orderedStandingsMetricKeys(data.tie_breakers);
    var rankMetrics = rankingMetricSet(data.tie_breakers);
    var h =
      "<div class=\"standings-table-wrap\"><table class=\"data standings-table\"><thead><tr><th>" +
      escapeHtml(tr("tableRank") || "Rank") +
      "</th><th>" +
      subjectHeader +
      "</th><th>" +
      escapeHtml(tr("tableW") || "W") +
      "</th><th>" +
      escapeHtml(tr("tableL") || "L") +
      "</th>";
    var hi;
    for (hi = 0; hi < metricKeys.length; hi++) {
      var mk = metricKeys[hi];
      var colDef = METRIC_COLUMN[mk];
      var hdr = escapeHtml(tr(colDef.headerKey) || colDef.headerFallback);
      if (rankMetrics[mk]) {
        h += "<th class=\"standings-metric-rank\"><strong>" + hdr + "</strong></th>";
      } else {
        h += "<th>" + hdr + "</th>";
      }
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
        "</td><td>" +
        escapeHtml(r.wins) +
        "</td><td>" +
        escapeHtml(r.losses) +
        "</td>";
      var ci;
      for (ci = 0; ci < metricKeys.length; ci++) {
        var ck = metricKeys[ci];
        var cdef = METRIC_COLUMN[ck];
        var cell = escapeHtml(formatMetricValue(cdef, r));
        if (rankMetrics[ck]) {
          h += "<td class=\"standings-metric-rank\"><strong>" + cell + "</strong></td>";
        } else {
          h += "<td>" + cell + "</td>";
        }
      }
      h += "</tr>";
    });
    return h + "</tbody></table></div>";
  }

  function renderMatches(data) {
    var rows = data.matches || [];
    if (!rows.length) {
      return "<p class=\"hint\">" + escapeHtml(tr("matchesEmpty") || "No matches recorded.") + "</p>";
    }
    var h =
      "<table class=\"data\"><thead><tr><th>" +
      escapeHtml(tr("tableTeams") || "Teams") +
      "</th><th>" +
      escapeHtml(tr("tableScore") || "Score") +
      "</th><th>" +
      escapeHtml(tr("tableWhen") || "When") +
      "</th></tr></thead><tbody>";
    rows.forEach(function (m) {
      var t1 = escapeHtml(m.team1_player1_nickname) + " + " + escapeHtml(m.team1_player2_nickname);
      var t2 = escapeHtml(m.team2_player1_nickname) + " + " + escapeHtml(m.team2_player2_nickname);
      var when = m.created_at ? formatWhen(m.created_at) : escapeHtml(tr("emDash") || "—");
      h +=
        "<tr><td>" +
        t1 +
        " " +
        escapeHtml(tr("vs") || "vs") +
        " " +
        t2 +
        "</td><td>" +
        escapeHtml(m.team1_score) +
        " – " +
        escapeHtml(m.team2_score) +
        "</td><td>" +
        when +
        "</td></tr>";
    });
    return h + "</tbody></table>";
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
          escapeHtml(m.team1_player1_nickname) +
          " + " +
          escapeHtml(m.team1_player2_nickname);
        var t2 =
          escapeHtml(m.team2_player1_nickname) +
          " + " +
          escapeHtml(m.team2_player2_nickname);
        var when = m.created_at
          ? formatWhen(m.created_at)
          : escapeHtml(tr("emDash") || "—");
        var matchId = m.match_id || "";
        return (
          '<tr class="match-picker-row" data-match-row-id="' +
          escapeAttr(matchId) +
          '">' +
          "<td>" +
          t1 +
          " " +
          escapeHtml(tr("vs") || "vs") +
          " " +
          t2 +
          "</td>" +
          "<td>" +
          escapeHtml(m.team1_score) +
          " – " +
          escapeHtml(m.team2_score) +
          "</td>" +
          "<td>" +
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

  function renderRoster(data) {
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
        h += "<li class=\"roster-item\">" + escapeHtml(p.nickname) + "</li>";
      });
      h += "</ul></div>";
    }
    if (!h) return "<p class=\"hint\">" + escapeHtml(tr("rosterEmpty") || "Roster is empty.") + "</p>";
    return h;
  }

  function renderEligiblePlayersList(data) {
    var players = data.eligible_players || [];
    if (!players.length) {
      return (
        "<p class=\"hint\">" +
        escapeHtml(tr("eligiblePanelEmpty") || "No eligible players defined yet.") +
        "</p>"
      );
    }
    var items = players
      .map(function (ep) {
        return "<li class=\"roster-item\">" + escapeHtml(ep.nickname || "") + "</li>";
      })
      .join("");
    return (
      '<div class="roster-block"><ul class="roster-list roster-list-players">' +
      items +
      "</ul></div>"
    );
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

  function renderReadPanel(dataType, data, isAdmin) {
    var inner = "";
    var filterNote = "";
    if (dataType === "GET_STANDINGS" || dataType === "GET_STANDINGS_BY_PLAYER") {
      filterNote = dataType === "GET_STANDINGS_BY_PLAYER" ? renderReadPanelFilterNote(data) : "";
      inner = renderStandings(data);
    } else if (dataType === "GET_MATCH_HISTORY" || dataType === "GET_MATCH_HISTORY_BY_PLAYER") {
      filterNote = dataType === "GET_MATCH_HISTORY_BY_PLAYER" ? renderReadPanelFilterNote(data) : "";
      inner = renderMatches(data);
    } else if (dataType === "GET_ROSTER") inner = renderRoster(data);
    else if (dataType === "GET_ELIGIBLE_PLAYERS") inner = renderEligiblePlayersList(data);
    else if (dataType === "HELP") inner = renderHelpPanel(data, !!isAdmin);
    else inner = renderFallbackData(data);
    return (
      '<div class="data-panel"><h3>' +
      escapeHtml(panelTitleForDataType(dataType)) +
      "</h3>" +
      filterNote +
      inner +
      "</div>"
    );
  }

  function arrayToInputs(name, arr) {
    var a = Array.isArray(arr) ? arr : [null, null];
    return (
      "<div class=\"nick-pair\" data-array-field=\"" +
      escapeHtml(name) +
      "\">" +
      "<label>" +
      escapeHtml(tr("formP1") || "P1") +
      " <input type=\"text\" data-array-index=\"0\" value=\"" +
      escapeHtml(a[0] || "") +
      "\" /></label>" +
      "<label>" +
      escapeHtml(tr("formP2") || "P2") +
      " <input type=\"text\" data-array-index=\"1\" value=\"" +
      escapeHtml(a[1] || "") +
      "\" /></label>" +
      "</div>"
    );
  }

  function renderWriteForm(bodySpec) {
    if (!bodySpec || typeof bodySpec !== "object" || !Object.keys(bodySpec).length) {
      return (
        "<p class=\"hint\">" + escapeHtml(tr("noBodyHint") || "No request body. Confirm to send.") + "</p>"
      );
    }
    var parts = ['<div class="form-grid">'];
    Object.keys(bodySpec).forEach(function (key) {
      var spec = bodySpec[key];
      if (!isFieldSpec(spec)) return;
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
    });
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
        var inp = root.querySelector('input[data-field="' + key.replace(/"/g, "\\\"") + '"]');
        out[key] = inp ? inp.value.trim() : spec.value;
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
      {
        name: "GET_ELIGIBLE_PLAYERS",
        desc: tr("intentGetEligiblePlayersDesc") || "Show the eligible-players allowlist.",
        examples: [
          tr("intentGetEligiblePlayersEx1") || "show me the eligible players",
          tr("intentGetEligiblePlayersEx2") || "who can join this league?",
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
        name: "ADD_ELIGIBLE_PLAYERS",
        desc: tr("intentAddEligiblePlayersDesc") || "Add nicknames to the eligible list.",
        examples: [
          tr("intentAddEligiblePlayersEx1") || "add Alex and Daniel to the eligible players",
          tr("intentAddEligiblePlayersEx2") || "make Jason eligible to play",
        ],
      },
      {
        name: "REMOVE_ELIGIBLE_PLAYER",
        desc: tr("intentRemoveEligiblePlayerDesc") || "Remove one nickname from the eligible list.",
        examples: [
          tr("intentRemoveEligiblePlayerEx1") || "remove Michael from the eligible players",
          tr("intentRemoveEligiblePlayerEx2") || "drop Ryan from the allowlist",
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

  function renderIntentHelper(isAdmin) {
    var userIntents = getUserIntents();
    var adminIntents = getAdminIntents();
    var totalCount = isAdmin ? userIntents.length + adminIntents.length : userIntents.length;
    var countLabel =
      totalCount === 1
        ? tr("intentCountOne", { n: totalCount }) || String(totalCount) + " intent"
        : tr("intentCountMany", { n: totalCount }) || String(totalCount) + " intents";
    var body = renderIntentGroup(
      isAdmin ? tr("groupPlayerCommands") || "Player commands" : "",
      userIntents,
      "user-intents"
    );
    if (isAdmin) {
      body += renderIntentGroup(
        tr("groupAdminCommands") || "Admin commands",
        adminIntents,
        "admin-intents"
      );
    }
    var rawHint = tr("helperHint") || "or just type \"help\" in chat";
    var hintHtml = escapeHtml(rawHint).replace(
      /["']help["']/g,
      '<code class="intent-helper-hint-cmd">help</code>'
    );
    return (
      '<details class="intent-helper">' +
      '<summary class="intent-helper-summary"><span class="intent-helper-title">' +
      escapeHtml(tr("supportedCommands") || "Supported commands") +
      "</span>" +
      '<span class="intent-helper-hint">' +
      hintHtml +
      "</span>" +
      '<span class="intent-helper-count">' +
      escapeHtml(countLabel) +
      "</span></summary>" +
      '<div class="intent-helper-body">' +
      body +
      "</div>" +
      "</details>"
    );
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

  function renderChatShell(route, cachedHeaderTitle) {
    var isAdmin = !!route.hostToken;
    var isMobile = window.innerWidth <= 520;
    var rawPlaceholder = isMobile
      ? tr("placeholderMobile") ||
        "Report Match Result, or Ask about standings, match history, or the roster."
      : tr("placeholderDesktop") ||
        "Report Match Result, or Ask about standings, match history, or the roster.\nCheck \"Supported Commands\" for more details.";
    var inputPlaceholder = escapeAttr(rawPlaceholder);
    var headerLang =
      window.TLCHAT_I18N && typeof window.TLCHAT_I18N.renderLocaleDropdown === "function"
        ? window.TLCHAT_I18N.renderLocaleDropdown({ compact: true })
        : "";
    var metaHtml = isAdmin
      ? '<div class="meta">' +
        escapeHtml(tr("metaHostToken") || "Host token in URL") +
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
      (isAdmin
        ? '<details id="eligible-players-panel" class="eligible-players-panel">' +
          renderEligiblePlayersPanelHtml({ loading: true }) +
          "</details>"
        : "") +
      '<main class="chat-main is-empty">' +
      '<div id="messages" class="messages">' +
      "</div>" +
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
     * `eligiblePlayers` is the league's host-curated allowlist (loaded
     * in parallel with the roster) and is merged into the @-mention
     * popover so users can also pick names that have been pre-declared
     * but haven't played yet. */
    var leagueRoster = {
      status: "loading",
      players: [],
      teams: [],
      eligiblePlayers: [],
      fetchedAt: null,
    };

    function refreshLeagueRoster() {
      leagueRoster.status = "loading";
      fetchLeagueRoster(route.leagueId)
        .then(function (result) {
          if (result.ok) {
            leagueRoster.players = result.players;
            leagueRoster.teams = result.teams;
            leagueRoster.status = "ok";
            leagueRoster.fetchedAt = Date.now();
            if (result.title != null && String(result.title).trim() !== "") {
              rememberLeagueTitle(route.leagueId, result.title);
            }
            applyChatHeaderTitle(
              document.getElementById("chat-header-title"),
              result.title,
              route.leagueId
            );
            updateMentionUI();
          } else {
            leagueRoster.status = "error";
            console.warn("[TLCHAT] League roster fetch failed:", result);
            applyChatHeaderTitle(
              document.getElementById("chat-header-title"),
              null,
              route.leagueId
            );
            updateMentionUI();
          }
        })
        .catch(function (err) {
          leagueRoster.status = "error";
          console.warn("[TLCHAT] League roster fetch failed:", err);
          applyChatHeaderTitle(
            document.getElementById("chat-header-title"),
            null,
            route.leagueId
          );
          updateMentionUI();
        });
    }

    function refreshEligiblePlayersForMentions() {
      fetchEligiblePlayersFromApi(route.leagueId, route.hostToken)
        .then(function (result) {
          leagueRoster.eligiblePlayers = result.ok
            ? result.eligible_players || []
            : [];
          updateMentionUI();
        })
        .catch(function (err) {
          console.warn("[TLCHAT] Eligible-players fetch failed:", err);
          leagueRoster.eligiblePlayers = [];
        });
    }

    refreshLeagueRoster();
    refreshEligiblePlayersForMentions();

    // ── Eligible-players panel (host/admin only) ─────────────────────────────

    var eligiblePanel = document.getElementById("eligible-players-panel");

    function refreshEligiblePlayersPanel() {
      if (!eligiblePanel) return;
      fetchEligiblePlayersFromApi(route.leagueId, route.hostToken).then(function (result) {
        var state = result.ok
          ? { eligible_players: result.eligible_players }
          : { eligible_players: [], error: true };
        eligiblePanel.innerHTML = renderEligiblePlayersPanelHtml(state);
        bindEligiblePanelEvents(state.eligible_players || []);
      });
    }

    function bindEligiblePanelEvents(players) {
      if (!eligiblePanel) return;

      var inlineMsg = eligiblePanel.querySelector(".eligible-players-inline-msg");

      function showMsg(text, isError) {
        if (!inlineMsg) return;
        inlineMsg.textContent = text;
        inlineMsg.hidden = false;
        inlineMsg.className =
          "eligible-players-inline-msg" + (isError ? " eligible-msg-error" : " eligible-msg-ok");
        setTimeout(function () {
          inlineMsg.hidden = true;
        }, 4000);
      }

      var addBtn = eligiblePanel.querySelector(".eligible-players-add-btn");
      var addInput = eligiblePanel.querySelector(".eligible-players-add-input");

      if (addBtn && addInput) {
        addBtn.addEventListener("click", async function () {
          var raw = (addInput.value || "").trim();
          if (!raw) return;
          var nicknames = raw
            .split(",")
            .map(function (n) { return n.trim(); })
            .filter(Boolean);
          if (!nicknames.length) return;

          addBtn.disabled = true;
          addBtn.textContent = tr("eligibleAddingButton") || "Adding\u2026";

          var base = backendMainBase();
          var url = base + "/admin/leagues/" + encodeURIComponent(route.leagueId) + "/eligible-players";
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
              showMsg(tr("eligibleAddSuccess") || "Added to eligible list.", false);
              refreshEligiblePlayersPanel();
            } else if (
              res.status === 409 &&
              leagueApiJsonErrorCode(txt) === "EligiblePlayerNicknameAlreadyExistsError"
            ) {
              showMsg(
                tr("eligibleAlreadyExists") || "One or more nicknames are already in the list.",
                true
              );
              addBtn.disabled = false;
              addBtn.textContent = tr("eligibleAddButton") || "Add";
            } else {
              showMsg(friendlyMessageFromTechnicalError(txt), true);
              addBtn.disabled = false;
              addBtn.textContent = tr("eligibleAddButton") || "Add";
            }
          } catch (e) {
            showMsg(friendlyMessageFromTechnicalError(String(e)), true);
            addBtn.disabled = false;
            addBtn.textContent = tr("eligibleAddButton") || "Add";
          }
        });
      }

      eligiblePanel.querySelectorAll(".btn-remove-eligible").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var eligibleId = btn.getAttribute("data-eligible-id");
          if (!eligibleId) return;
          var prevLabel = btn.textContent;
          btn.disabled = true;
          btn.setAttribute("aria-label", tr("eligibleRemovingAria") || "Removing\u2026");

          var base = backendMainBase();
          var url =
            base +
            "/admin/leagues/" +
            encodeURIComponent(route.leagueId) +
            "/eligible-players/" +
            encodeURIComponent(eligibleId);
          try {
            var res = await fetch(url, {
              method: "DELETE",
              headers: { "X-Host-Token": route.hostToken || "" },
            });
            if (res.ok) {
              showMsg(tr("eligibleRemoveSuccess") || "Removed from eligible list.", false);
              refreshEligiblePlayersPanel();
            } else {
              var txt = await res.text();
              showMsg(friendlyMessageFromTechnicalError(txt), true);
              btn.disabled = false;
              btn.setAttribute("aria-label", tr("eligibleRemoveAria") || "Remove");
            }
          } catch (e) {
            showMsg(friendlyMessageFromTechnicalError(String(e)), true);
            btn.disabled = false;
            btn.setAttribute("aria-label", prevLabel);
          }
        });
      });
    }

    if (eligiblePanel) {
      // Render loading state immediately visible when the panel is first opened
      eligiblePanel.addEventListener("toggle", function () {
        if (eligiblePanel.open) {
          refreshEligiblePlayersPanel();
        }
      });
      // Bind the initial (loading) state so the add row is functional right away
      bindEligiblePanelEvents([]);
    }

    /** Pre-fill the eligible-players panel add-input and open the panel. */
    function openEligiblePanelWithNicknames(nicknames) {
      if (!eligiblePanel) return;
      eligiblePanel.open = true;
      refreshEligiblePlayersPanel();
      // After the DOM refreshes, set the add-input value
      setTimeout(function () {
        var addInput = eligiblePanel.querySelector(".eligible-players-add-input");
        if (addInput && nicknames && nicknames.length) {
          addInput.value = nicknames.join(", ");
          addInput.focus();
        }
      }, 100);
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
     * Returns the union of roster nicknames and eligible-players-allowlist
     * nicknames, deduplicated case-insensitively via `normalizeMatchNickname`.
     * Roster entries take precedence on conflict so the picked text matches
     * the registered casing.
     */
    function combinedMentionCandidates() {
      var roster = leagueRoster.players || [];
      var eligible = leagueRoster.eligiblePlayers || [];
      var seen = {};
      var out = [];
      function push(entry) {
        var nick = String((entry && entry.nickname) || "");
        if (!nick) return;
        var norm = normalizeMatchNickname(nick);
        if (!norm || seen[norm]) return;
        seen[norm] = true;
        out.push({ nickname: nick });
      }
      roster.forEach(push);
      eligible.forEach(push);
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
          return normalizeMatchNickname(p.nickname).indexOf(q) !== -1;
        })
        .sort(sortByName);
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
      if (needsToken && route.hostToken) headers["X-Host-Token"] = route.hostToken;

      var btn = cardEl.querySelector("[data-submit-write]");
      if (btn) btn.disabled = true;

      try {
        var opts = { method: method, headers: headers };
        if (hasJsonBody) {
          opts.body = JSON.stringify(jsonBody);
        }
        var res = await fetch(url, opts);
        var txt = await res.text();
        var ok = res.ok;
        if (ok) {
          var matchCreation = isMatchCreationCall(method, url);
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
            var t1 = Array.isArray(payload.team1_nicknames) ? payload.team1_nicknames : [];
            var t2 = Array.isArray(payload.team2_nicknames) ? payload.team2_nicknames : [];
            var newMatchRecord = {
              team1_player1_nickname: normalizeMatchNickname(t1[0]),
              team1_player2_nickname: normalizeMatchNickname(t1[1]),
              team2_player1_nickname: normalizeMatchNickname(t2[0]),
              team2_player2_nickname: normalizeMatchNickname(t2[1]),
              team1_score: payload.team1_score,
              team2_score: payload.team2_score,
              created_at: new Date().toISOString(),
            };
            appendAssistant(
              calloutHtml +
                renderReadPanel(
                  "GET_MATCH_HISTORY",
                  { matches: [newMatchRecord] },
                  !!route.hostToken
                )
            );
            conversationHistory.push({
              role: "assistant",
              content: matchRecordedLine,
            });
          } else {
            var successLine = humanSuccessFromHttpBody(txt);
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

          var ineligibleResult =
            isMatchCreationCall(method, url) &&
            res.status === 422
              ? (function () {
                  var ufe = window.TLCHAT_USER_FACING_ERRORS;
                  if (ufe && typeof ufe.fromMatchSubmissionError === "function") {
                    var parsed = tryParseJson(txt);
                    return ufe.fromMatchSubmissionError(res.status, parsed);
                  }
                  return { isIneligible: false };
                })()
              : { isIneligible: false };

          if (ineligibleResult.isIneligible) {
            var missing = ineligibleResult.missing_nicknames || [];
            var calloutHtml =
              '<div class="response-callout response-callout-clarify">' +
              escapeHtml(ineligibleResult.headline || "") +
              "</div>";
            if (route.hostToken && missing.length) {
              var addBtnLabel = tr("ineligibleAddButton") || "+ Add to eligible players";
              calloutHtml +=
                '<button type="button" class="btn-secondary eligible-players-add-missing" style="margin-top:0.5rem">' +
                escapeHtml(addBtnLabel) +
                "</button>";
            }
            var ineligibleWrap = appendAssistant(calloutHtml, "msg-error");
            if (route.hostToken && missing.length) {
              var addMissingBtn = ineligibleWrap && ineligibleWrap.querySelector(".eligible-players-add-missing");
              if (addMissingBtn) {
                addMissingBtn.addEventListener("click", function () {
                  openEligiblePanelWithNicknames(missing);
                });
              }
            }
            conversationHistory.push({
              role: "assistant",
              content: ineligibleResult.headline || "",
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
            var t1n = [normalizeMatchNickname(pt1[0]), normalizeMatchNickname(pt1[1])];
            var t2n = [normalizeMatchNickname(pt2[0]), normalizeMatchNickname(pt2[1])];
            var existingRow = hist.ok ? findMatchRecordForSubmittedPair(hist.matches, t1n, t2n) : null;
            var shortMsg = tr("matchAlreadyExists") || "Match already exists. Record Not Saved";
            var calloutHtml =
              '<div class="response-callout response-callout-clarify"><strong>' +
              escapeHtml(shortMsg) +
              "</strong></div>";
            if (!hist.ok) {
              console.warn("[TLCHAT] Duplicate match — match history fetch failed", hist);
            } else if (!existingRow) {
              console.warn("[TLCHAT] Duplicate match — no matching row in history (unexpected)");
            }
            if (existingRow) {
              appendAssistant(
                calloutHtml +
                  renderReadPanel("GET_MATCH_HISTORY", { matches: [existingRow] }, !!route.hostToken)
              );
            } else {
              appendAssistant(calloutHtml);
            }
            conversationHistory.push({
              role: "assistant",
              content: shortMsg,
            });
          } else {
            appendErrorTechnical(technical, "League API error");
          }
          } // close ineligibleResult.isIneligible else block
        }
      } catch (e) {
        appendErrorTechnical(e.message || String(e), "League API request failed");
      } finally {
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
          toggleEditMatchScoreForm(panel, id, matchById[id], urlTemplate, method, bodySchema);
        });
      });
    }

    function toggleEditMatchScoreForm(panel, matchId, match, urlTemplate, method, bodySchema) {
      var existing = panel.querySelector(".match-picker-edit-row[data-edit-row-id]");
      if (existing) {
        var existingId = existing.getAttribute("data-edit-row-id");
        existing.parentNode.removeChild(existing);
        if (existingId === matchId) return;
      }
      if (!match) return;
      var anchor = panel.querySelector(
        '.match-picker-row[data-match-row-id="' + cssEscapeAttrValue(matchId) + '"]'
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

      var formRow = document.createElement("tr");
      formRow.className = "match-picker-edit-row";
      formRow.setAttribute("data-edit-row-id", matchId);
      formRow.innerHTML =
        '<td colspan="4">' +
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
      var url = urlTemplate.replace(
        "{match_id}",
        encodeURIComponent(String(matchId))
      );
      submitBtn.addEventListener("click", function () {
        submitBackendAction(card, method, url, bodySpec);
      });
    }

    /** Escape only the chars that break a quoted attribute filter ("..."). */
    function cssEscapeAttrValue(v) {
      return String(v == null ? "" : v).replace(/(["\\])/g, "\\$1");
    }

    function renderResponse(resp) {

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
        parts.push(renderReadPanel(resp.data_type, resp.data || {}, !!route.hostToken));
        appendAssistant(parts.join(""));
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
      try {
        if (!silent) {
          appendUser(trimmed);
        }
        var resp = await postChat(submittedText);
        renderResponse(resp);
        conversationHistory.push({ role: "user", content: submittedText });
        var assistantContent = assistantContentFromResponse(resp);
        if (assistantContent) {
          conversationHistory.push({ role: "assistant", content: assistantContent });
        }
      } catch (err) {
        appendErrorTechnical(err.message || String(err), "Chat request failed");
      } finally {
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

    deliverChatMessage("help", { silent: true });

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
