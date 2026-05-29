(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  function tr() { return api.tr.apply(api, arguments); }
  function escapeHtml() { return api.escapeHtml.apply(api, arguments); }
  function escapeAttr() { return api.escapeAttr.apply(api, arguments); }
  function labelForFormField() { return api.labelForFormField.apply(api, arguments); }
  function isFieldSpec() { return api.isFieldSpec.apply(api, arguments); }
  function rosterPlayerNormSet() { return api.rosterPlayerNormSet.apply(api, arguments); }
  function rosterCanonicalNormMap() { return api.rosterCanonicalNormMap.apply(api, arguments); }
  function rosterPairKeysFromTeams() { return api.rosterPairKeysFromTeams.apply(api, arguments); }
  function nickPairFromBodySpec() { return api.nickPairFromBodySpec.apply(api, arguments); }
  function canonicalizedNickPair() { return api.canonicalizedNickPair.apply(api, arguments); }
  function rosterTeamPairKey() { return api.rosterTeamPairKey.apply(api, arguments); }
  function findRosterTeamForPlayer() { return api.findRosterTeamForPlayer.apply(api, arguments); }
  function escapeTeamPairLabel() { return api.escapeTeamPairLabel.apply(api, arguments); }

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

  api.renderMatchSubmitRosterNotes = renderMatchSubmitRosterNotes;
  api.nextNickAcId = nextNickAcId;
  api.arrayToInputs = arrayToInputs;
  api.isScorePairBodyFields = isScorePairBodyFields;
  api.renderScorePicker = renderScorePicker;
  api.renderWriteForm = renderWriteForm;
  api.collectWriteForm = collectWriteForm;
  api.validateWriteBody = validateWriteBody;
})(typeof window !== "undefined" ? window : this);
