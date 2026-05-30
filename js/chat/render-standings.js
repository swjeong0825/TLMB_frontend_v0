(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  function tr() { return api.tr.apply(api, arguments); }
  function escapeHtml() { return api.escapeHtml.apply(api, arguments); }
  function escapeAttr() { return api.escapeAttr.apply(api, arguments); }
  function dateOnlyOrNull() { return api.dateOnlyOrNull.apply(api, arguments); }

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

  function renderSubjectOption(subjectKey, title) {
    return (
      '<button type="button" class="btn-secondary standings-subject-option" data-standings-subject="' +
      escapeAttr(subjectKey) +
      '">' +
      escapeHtml(title) +
      "</button>"
    );
  }

  // Singles/Both can be locked (when the chosen subject is "pair"); the wrap
  // hosts a fixed-position tooltip positioned by `bindDisabledTipPositioning`.
  function renderLockableScopeOption(scopeKey, label) {
    return (
      '<span class="standings-scope-wrap" data-standings-scope-wrap="' +
      escapeAttr(scopeKey) +
      '">' +
      '<button type="button" class="btn-secondary standings-scope-option" data-standings-scope="' +
      escapeAttr(scopeKey) +
      '" disabled>' +
      escapeHtml(label) +
      "</button>" +
      '<span class="standings-scope-tip" role="tooltip">' +
      escapeHtml(
        tr("standingsPairDoublesOnly") || "Pair standings only support Doubles."
      ) +
      "</span>" +
      "</span>"
    );
  }

  function renderStandingsSubjectChooser() {
    return (
      '<div class="standings-subject-chooser">' +
      '<div class="standings-subject-group">' +
      '<div class="standings-subject-options" role="group" aria-label="' +
      escapeAttr(tr("standingsChooseSubject") || "Choose how to view standings.") +
      '">' +
      renderSubjectOption("pair", tr("standingsPairOption") || "Pair") +
      renderSubjectOption("player", tr("standingsPlayerOption") || "Player") +
      "</div>" +
      "</div>" +
      '<p class="standings-subject-message" data-standings-subject-message hidden></p>' +
      '<div class="standings-scope-chooser" data-standings-scope-chooser data-selected-subject="" data-selected-scope="doubles" hidden>' +
      '<div class="standings-scope-options" role="group" aria-label="' +
      escapeAttr(tr("standingsChooseScope") || "Choose match format") +
      '">' +
      '<button type="button" class="btn-secondary standings-scope-option" data-standings-scope="doubles" disabled>' +
      escapeHtml(tr("scopeDoubles") || "Doubles") +
      "</button>" +
      renderLockableScopeOption("singles", tr("scopeSingles") || "Singles") +
      renderLockableScopeOption("both", tr("scopeBoth") || "Both") +
      "</div>" +
      '<p class="hint standings-scope-helper" hidden>' +
      escapeHtml(
        tr("standingsPairDoublesOnly") || "Pair standings only support Doubles."
      ) +
      "</p>" +
      "</div>" +
      "</div>"
    );
  }

  function renderStandingsScopeControls(data, dataType) {
    var subject =
      dataType === "GET_STANDINGS" && data && data._standings_subject != null
        ? String(data._standings_subject).trim()
        : "player";
    if (subject === "pair") return "";
    var scope =
      data && data._standings_scope != null
        ? String(data._standings_scope).trim()
        : "doubles";
    if (scope !== "singles" && scope !== "both") scope = "doubles";
    var playerName =
      dataType === "GET_STANDINGS_BY_PLAYER" && data && data.player_name != null
        ? String(data.player_name).trim()
        : "";
    var opts = [
      ["doubles", tr("scopeDoubles") || "Doubles"],
      ["singles", tr("scopeSingles") || "Singles"],
      ["both", tr("scopeBoth") || "Both"],
    ];
    var buttons = opts.map(function (opt) {
      var key = opt[0];
      return (
        '<button type="button" class="btn-secondary standings-inline-scope-option' +
        (scope === key ? " is-active" : "") +
        '" data-standings-inline-scope="' +
        escapeAttr(key) +
        '">' +
        escapeHtml(opt[1]) +
        "</button>"
      );
    }).join("");
    return (
      '<div class="standings-inline-scope" data-standings-inline-scope-controls' +
      ' data-standings-type="' +
      escapeAttr(dataType || "") +
      '" data-player-name="' +
      escapeAttr(playerName) +
      '" data-standings-subject="' +
      escapeAttr(subject) +
      '">' +
      '<span class="standings-inline-scope-label">' +
      escapeHtml(tr("standingsScopeLabel") || "Format") +
      "</span>" +
      '<div class="standings-inline-scope-options" role="group" aria-label="' +
      escapeAttr(tr("standingsChooseScope") || "Choose match format") +
      '">' +
      buttons +
      "</div>" +
      "</div>"
    );
  }

  function renderStandingsDateControls(data, dataType) {
    var startDate = dateOnlyOrNull(data && data._standings_filter_start_date) || "";
    var endDate = dateOnlyOrNull(data && data._standings_filter_end_date) || "";
    var subject =
      dataType === "GET_STANDINGS" && data && data._standings_subject != null
        ? String(data._standings_subject).trim()
        : "";
    var scope =
      data && data._standings_scope != null
        ? String(data._standings_scope).trim()
        : "doubles";
    if (scope !== "singles" && scope !== "both") scope = "doubles";
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
      '" data-standings-subject="' +
      escapeAttr(subject) +
      '" data-standings-scope="' +
      escapeAttr(scope) +
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
    var subjectKind = rows[0].subject_kind || "pair";
    var subjectHeader =
      subjectKind === "player"
        ? escapeHtml(tr("tablePlayer") || "Player")
        : escapeHtml(tr("tablePair") || "Pair");
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
      if ((r.subject_kind || "pair") === "player") {
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

  api.METRIC_COLUMN = METRIC_COLUMN;
  api.STANDINGS_SUPPLEMENTARY_METRIC_ORDER = STANDINGS_SUPPLEMENTARY_METRIC_ORDER;
  api.partitionStandingsMetricKeys = partitionStandingsMetricKeys;
  api.rankingMetricSet = rankingMetricSet;
  api.formatMetricValue = formatMetricValue;
  api.cloneStandingsDataWithDateFilter = cloneStandingsDataWithDateFilter;
  api.renderStandingsSubjectChooser = renderStandingsSubjectChooser;
  api.renderStandingsScopeControls = renderStandingsScopeControls;
  api.renderStandingsDateControls = renderStandingsDateControls;
  api.standingsRowsWithMatches = standingsRowsWithMatches;
  api.renderStandings = renderStandings;
})(typeof window !== "undefined" ? window : this);
