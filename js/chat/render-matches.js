(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  function tr() { return api.tr.apply(api, arguments); }
  function escapeHtml() { return api.escapeHtml.apply(api, arguments); }
  function escapeAttr() { return api.escapeAttr.apply(api, arguments); }
  function formatWhen() { return api.formatWhen.apply(api, arguments); }
  function matchDateGroupForCreatedAt() { return api.matchDateGroupForCreatedAt.apply(api, arguments); }
  function getPlayerEditWindowSeconds() { return api.getPlayerEditWindowSeconds.apply(api, arguments); }
  function getPlayerMatchDeleteWindowSeconds() { return api.getPlayerMatchDeleteWindowSeconds.apply(api, arguments); }

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

  function matchFormat(match) {
    return match && match.match_format === "singles" ? "singles" : "doubles";
  }

  function matchScoreValues(match) {
    if (matchFormat(match) === "singles") {
      return {
        left: match.player1_score,
        right: match.player2_score,
      };
    }
    return {
      left: match.pair1_score,
      right: match.pair2_score,
    };
  }

  function renderMatchParticipants(match) {
    if (matchFormat(match) === "singles") {
      var p1 =
        '<span class="match-player match-player--1">' +
        escapeHtml(match.player1_nickname || "") +
        "</span>";
      var p2 =
        '<span class="match-player match-player--2">' +
        escapeHtml(match.player2_nickname || "") +
        "</span>";
      return (
        '<span class="match-pairs match-pairs--singles">' +
        p1 +
        '<span class="match-vs">' +
        escapeHtml(tr("vs") || "vs") +
        "</span>" +
        p2 +
        "</span>"
      );
    }
    var t1 =
      '<span class="match-pair match-pair--1">' +
      escapeHtml(match.pair1_player1_nickname) +
      ' <span class="match-pair-plus">+</span> ' +
      escapeHtml(match.pair1_player2_nickname) +
      "</span>";
    var t2 =
      '<span class="match-pair match-pair--2">' +
      escapeHtml(match.pair2_player1_nickname) +
      ' <span class="match-pair-plus">+</span> ' +
      escapeHtml(match.pair2_player2_nickname) +
      "</span>";
    return (
      '<span class="match-pairs">' +
      t1 +
      '<span class="match-vs">' +
      escapeHtml(tr("vs") || "vs") +
      "</span>" +
      t2 +
      "</span>"
    );
  }

  function matchRowDataAttrs(match, matchId) {
    if (!matchId) return "";
    var scores = matchScoreValues(match);
    var attrs =
      ' data-match-row-id="' + escapeAttr(matchId) + '"' +
      ' data-match-format="' + escapeAttr(matchFormat(match)) + '"' +
      ' data-score-left="' + escapeAttr(scores.left || "") + '"' +
      ' data-score-right="' + escapeAttr(scores.right || "") + '"';
    if (match.created_at) {
      attrs += ' data-match-created-at="' + escapeAttr(String(match.created_at)) + '"';
    }
    if (matchFormat(match) === "singles") {
      attrs +=
        ' data-player1="' + escapeAttr(match.player1_nickname || "") + '"' +
        ' data-player2="' + escapeAttr(match.player2_nickname || "") + '"';
      return attrs;
    }
    return (
      attrs +
      ' data-pair1-p1="' + escapeAttr(match.pair1_player1_nickname || "") + '"' +
      ' data-pair1-p2="' + escapeAttr(match.pair1_player2_nickname || "") + '"' +
      ' data-pair2-p1="' + escapeAttr(match.pair2_player1_nickname || "") + '"' +
      ' data-pair2-p2="' + escapeAttr(match.pair2_player2_nickname || "") + '"'
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
    var hasSingles = rows.some(function (m) { return matchFormat(m) === "singles"; });
    var h =
      "<div class=\"match-history-table-wrap\"><table class=\"data match-history-table\"><thead><tr><th>" +
      escapeHtml(hasSingles ? (tr("tableMatchup") || "Matchup") : (tr("tablePairs") || "Pairs")) +
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
      var when = m.created_at ? formatWhen(m.created_at) : escapeHtml(tr("emDash") || "—");
      var matchId = m.match_id ? String(m.match_id) : "";
      var scores = matchScoreValues(m);
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
      var rowDataAttrs = matchRowDataAttrs(m, matchId);
      h +=
        "<tr class=\"match-row\"" +
        rowDataAttrs +
        "><td class=\"col-pairs\">" +
        renderMatchParticipants(m) +
        "</td><td>" +
        escapeHtml(scores.left) +
        " – " +
        escapeHtml(scores.right) +
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
          '<span class="match-pair match-pair--1">' +
          escapeHtml(m.pair1_player1_nickname) +
          ' <span class="match-pair-plus">+</span> ' +
          escapeHtml(m.pair1_player2_nickname) +
          "</span>";
        var t2 =
          '<span class="match-pair match-pair--2">' +
          escapeHtml(m.pair2_player1_nickname) +
          ' <span class="match-pair-plus">+</span> ' +
          escapeHtml(m.pair2_player2_nickname) +
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
          ' data-pair1-p1="' + escapeAttr(m.pair1_player1_nickname || "") + '"' +
          ' data-pair1-p2="' + escapeAttr(m.pair1_player2_nickname || "") + '"' +
          ' data-pair2-p1="' + escapeAttr(m.pair2_player1_nickname || "") + '"' +
          ' data-pair2-p2="' + escapeAttr(m.pair2_player2_nickname || "") + '"';
        return (
          '<tr class="match-picker-row"' +
          pickerRowAttrs +
          ">" +
          '<td class="col-pairs"><span class="match-pairs">' +
          t1 +
          '<span class="match-vs">' +
          escapeHtml(tr("vs") || "vs") +
          "</span>" +
          t2 +
          "</span></td>" +
          "<td>" +
          escapeHtml(m.pair1_score) +
          " – " +
          escapeHtml(m.pair2_score) +
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
      escapeHtml(tr("tablePairs") || "Pairs") +
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

  api.renderMatchRowUpdateAction = renderMatchRowUpdateAction;
  api.renderMatchRowDeleteAction = renderMatchRowDeleteAction;
  api.renderMatches = renderMatches;
  api.removeEmptyMatchDateRows = removeEmptyMatchDateRows;
  api.matchDateToggleAriaLabel = matchDateToggleAriaLabel;
  api.setMatchDateGroupCollapsed = setMatchDateGroupCollapsed;
  api.bindMatchDateGroupToggles = bindMatchDateGroupToggles;
  api.renderEditMatchScorePicker = renderEditMatchScorePicker;
})(typeof window !== "undefined" ? window : this);
