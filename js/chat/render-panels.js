(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  var READ_TYPES = api.READ_TYPES;
  function tr() { return api.tr.apply(api, arguments); }
  function escapeHtml() { return api.escapeHtml.apply(api, arguments); }
  function escapeAttr() { return api.escapeAttr.apply(api, arguments); }
  function panelTitleForDataType() { return api.panelTitleForDataType.apply(api, arguments); }
  function renderFallbackData() { return api.renderFallbackData.apply(api, arguments); }
  function renderStandingsSubjectChooser() { return api.renderStandingsSubjectChooser.apply(api, arguments); }
  function renderStandingsScopeControls() { return api.renderStandingsScopeControls.apply(api, arguments); }
  function renderStandingsDateControls() { return api.renderStandingsDateControls.apply(api, arguments); }
  function renderStandings() { return api.renderStandings.apply(api, arguments); }
  function renderMatches() { return api.renderMatches.apply(api, arguments); }
  function renderRoster() { return api.renderRoster.apply(api, arguments); }
  function getUserIntents() { return api.getUserIntents.apply(api, arguments); }
  function getAdminIntents() { return api.getAdminIntents.apply(api, arguments); }
  function renderIntentGroup() { return api.renderIntentGroup.apply(api, arguments); }

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

  function renderReadPanelFilterNote(data) {
    var name = data && data.player_name;
    if (name == null || String(name).trim() === "") return "";
    return (
      '<p class="read-panel-filter hint">' +
      escapeHtml(tr("filterFor", { name: String(name).trim() }) || "Showing results for " + String(name).trim() + ".") +
      "</p>"
    );
  }

  function renderHistoryScopeControls(data, dataType) {
    if (data && data._hide_history_scope_controls) return "";
    var scope =
      data && data._history_scope != null ? String(data._history_scope).trim() : "doubles";
    if (scope !== "singles" && scope !== "both") scope = "doubles";
    var playerName =
      dataType === "GET_MATCH_HISTORY_BY_PLAYER" && data && data.player_name != null
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
        '<button type="button" class="btn-secondary history-scope-option' +
        (scope === key ? " is-active" : "") +
        '" data-history-scope="' +
        escapeAttr(key) +
        '">' +
        escapeHtml(opt[1]) +
        "</button>"
      );
    }).join("");
    return (
      '<div class="history-scope-controls" data-history-scope-controls' +
      ' data-history-type="' +
      escapeAttr(dataType || "") +
      '" data-player-name="' +
      escapeAttr(playerName) +
      '">' +
      '<span class="history-scope-label">' +
      escapeHtml(tr("historyScopeLabel") || "Format") +
      "</span>" +
      '<div class="history-scope-options" role="group" aria-label="' +
      escapeAttr(tr("historyChooseScope") || "Choose match history format") +
      '">' +
      buttons +
      "</div>" +
      "</div>"
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
      inner =
        dataType === "GET_STANDINGS" && data && data._standings_show_subject_chooser
          ? renderStandingsSubjectChooser(data)
          : renderStandingsScopeControls(data, dataType) +
            renderStandingsDateControls(data, dataType) +
            renderStandings(data);
    } else if (dataType === "GET_MATCH_HISTORY" || dataType === "GET_MATCH_HISTORY_BY_PLAYER") {
      filterNote = dataType === "GET_MATCH_HISTORY_BY_PLAYER" ? renderReadPanelFilterNote(data) : "";
      inner = renderHistoryScopeControls(data, dataType) + renderMatches(data, !!isAdmin);
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

  api.assistantContentFromResponse = assistantContentFromResponse;
  api.renderReadPanelFilterNote = renderReadPanelFilterNote;
  api.renderHistoryScopeControls = renderHistoryScopeControls;
  api.orderIntentsByCanonical = orderIntentsByCanonical;
  api.renderHelpPanel = renderHelpPanel;
  api.renderReadPanelBody = renderReadPanelBody;
  api.renderReadPanel = renderReadPanel;
})(typeof window !== "undefined" ? window : this);
