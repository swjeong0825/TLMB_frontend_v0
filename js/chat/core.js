(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

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
    DELETE_PAIR: true,
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
      pair_id: tr("fieldPairId"),
      match_id: tr("fieldMatchId"),
      player_id: tr("fieldPlayerId"),
      current_nickname: tr("fieldCurrentNickname"),
      new_nickname: tr("fieldNewNickname"),
      pair1_player_nicknames: tr("fieldPair1Players"),
      pair2_player_nicknames: tr("fieldPair2Players"),
      pair1_nicknames: tr("fieldPair1Nicknames"),
      pair2_nicknames: tr("fieldPair2Nicknames"),
      pair1_score: tr("fieldPair1Score"),
      pair2_score: tr("fieldPair2Score"),
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
      // (e.g. `{match_id, pair_id}`). Returning the raw stringified
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
    pair_id: true,
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

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  api.READ_TYPES = READ_TYPES;
  api.WRITE_TYPES = WRITE_TYPES;
  api.escapeHtml = escapeHtml;
  api.getPlayerEditWindowSeconds = getPlayerEditWindowSeconds;
  api.setPlayerEditWindowSeconds = setPlayerEditWindowSeconds;
  api.getPlayerMatchDeleteWindowSeconds = getPlayerMatchDeleteWindowSeconds;
  api.setPlayerMatchDeleteWindowSeconds = setPlayerMatchDeleteWindowSeconds;
  api.tr = tr;
  api.panelTitleForDataType = panelTitleForDataType;
  api.labelForFormField = labelForFormField;
  api.formatWhenPlain = formatWhenPlain;
  api.formatWhen = formatWhen;
  api.matchDateGroupForCreatedAt = matchDateGroupForCreatedAt;
  api.tryParseJson = tryParseJson;
  api.humanDetailFromHttpBody = humanDetailFromHttpBody;
  api.humanSuccessFromHttpBody = humanSuccessFromHttpBody;
  api.isInternalDisplayKey = isInternalDisplayKey;
  api.sanitizeForDisplay = sanitizeForDisplay;
  api.renderFallbackData = renderFallbackData;
  api.friendlyMessageFromTechnicalError = friendlyMessageFromTechnicalError;
  api.normalizeChatApiBaseUrl = normalizeChatApiBaseUrl;
  api.chatApiBase = chatApiBase;
  api.backendMainBase = backendMainBase;
  api.dateOnlyOrNull = dateOnlyOrNull;
  api.leagueApiJsonErrorCode = leagueApiJsonErrorCode;
  api.isMatchCreationCall = isMatchCreationCall;
  api.isMatchEditCall = isMatchEditCall;
  api.isMatchDeleteCall = isMatchDeleteCall;
  api.extractMatchIdFromEditUrl = extractMatchIdFromEditUrl;
  api.responseLooksLikeStaticHtml = responseLooksLikeStaticHtml;
  api.isFieldSpec = isFieldSpec;
  api.needsHostTokenForUrl = needsHostTokenForUrl;
  api.shouldAttachHostTokenForUrl = shouldAttachHostTokenForUrl;
  api.escapeAttr = escapeAttr;
})(typeof window !== "undefined" ? window : this);
