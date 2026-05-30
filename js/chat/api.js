(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  function chatApiBase() { return api.chatApiBase.apply(api, arguments); }
  function backendMainBase() { return api.backendMainBase.apply(api, arguments); }
  function dateOnlyOrNull() { return api.dateOnlyOrNull.apply(api, arguments); }
  function humanDetailFromHttpBody() { return api.humanDetailFromHttpBody.apply(api, arguments); }
  function responseLooksLikeStaticHtml() { return api.responseLooksLikeStaticHtml.apply(api, arguments); }
  function tr() { return api.tr.apply(api, arguments); }

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
        latest_match_date_single:
          data && typeof data.latest_match_date_single === "string"
            ? dateOnlyOrNull(data.latest_match_date_single)
            : null,
        latest_activity_date:
          data && typeof data.latest_activity_date === "string"
            ? dateOnlyOrNull(data.latest_activity_date)
            : null,
        rules: data && typeof data.rules === "object" && data.rules !== null ? data.rules : null,
        players: Array.isArray(data.players) ? data.players : [],
        pairs: Array.isArray(data.pairs) ? data.pairs : [],
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
    endDate,
    subject,
    scope
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
    } else {
      var selectedSubject = String(subject == null ? "" : subject).trim();
      if (selectedSubject === "pair" || selectedSubject === "player") {
        params.set("subject", selectedSubject);
      }
    }
    if (dateOnlyOrNull(startDate)) params.set("start_date", startDate);
    if (dateOnlyOrNull(endDate)) params.set("end_date", endDate);
    var selectedScope = String(scope == null ? "" : scope).trim();
    if (
      selectedScope === "doubles" ||
      selectedScope === "singles" ||
      selectedScope === "both"
    ) {
      params.set("scope", selectedScope);
    }

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
  async function fetchLeagueMatchHistory(leagueId, dataTypeOrScope, playerName, scope) {
    var base = backendMainBase();
    if (!base || !leagueId) {
      return { ok: false, error: "missing_config_or_league" };
    }
    var dataType = "GET_MATCH_HISTORY";
    var selectedScope = "doubles";
    if (
      dataTypeOrScope === "GET_MATCH_HISTORY" ||
      dataTypeOrScope === "GET_MATCH_HISTORY_BY_PLAYER"
    ) {
      dataType = dataTypeOrScope;
      selectedScope = String(scope || "doubles");
    } else if (typeof dataTypeOrScope === "string" && dataTypeOrScope) {
      selectedScope = dataTypeOrScope;
    }
    var isByPlayer = dataType === "GET_MATCH_HISTORY_BY_PLAYER";
    var path =
      "/leagues/" +
      encodeURIComponent(leagueId) +
      "/matches" +
      (isByPlayer ? "/by-player" : "");
    var params = new URLSearchParams();
    if (isByPlayer) {
      var name = String(playerName == null ? "" : playerName).trim();
      if (!name) return { ok: false, error: "missing_player_name" };
      params.set("player_name", name);
    }
    if (
      selectedScope === "doubles" ||
      selectedScope === "singles" ||
      selectedScope === "both"
    ) {
      params.set("scope", selectedScope);
    }
    var url = base + path + (params.toString() ? "?" + params.toString() : "");
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
   * in the same `players` array — they simply do not appear in `pairs`. */
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

  async function postChat(route, clientMessage, conversationHistory) {
    var safeRoute = route || {};
    var url =
      chatApiBase() +
      "/leagues/" +
      encodeURIComponent(safeRoute.leagueId) +
      "/chat";
    var headers = { "Content-Type": "application/json" };
    if (safeRoute.hostToken) headers["X-Host-Token"] = safeRoute.hostToken;
    var res = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        client_message: clientMessage,
        conversation_history: conversationHistory || [],
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
            ? text.slice(0, 600) + "..."
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
        console.error(
          "[TLCHAT] Raw response body (first 8000 chars):\n",
          text.slice(0, 8000)
        );
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
      if (!httpMsg) {
        httpMsg = res.statusText || tr("requestFailed") || "Request failed.";
      }
      var techBody = text && text.length ? text : "";
      if (techBody.length > 1200) techBody = techBody.slice(0, 1200) + "...";
      throw new Error(
        "[Chat HTTP " +
          res.status +
          "] " +
          httpMsg +
          (techBody ? " | body: " + techBody : "")
      );
    }
    return data;
  }

  api.fetchLeagueRoster = fetchLeagueRoster;
  api.fetchLeagueAdminInfo = fetchLeagueAdminInfo;
  api.fetchLeagueStandings = fetchLeagueStandings;
  api.fetchLeagueMatchHistory = fetchLeagueMatchHistory;
  api.fetchRosterPlayersFromApi = fetchRosterPlayersFromApi;
  api.postChat = postChat;
})(typeof window !== "undefined" ? window : this);
