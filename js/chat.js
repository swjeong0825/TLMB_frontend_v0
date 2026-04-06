(function () {
  "use strict";

  var READ_TYPES = {
    GET_STANDINGS: true,
    GET_MATCH_HISTORY: true,
    GET_ROSTER: true,
  };

  var WRITE_TYPES = {
    SUBMIT_MATCH_RESULT: true,
    EDIT_PLAYER_NICKNAME: true,
    EDIT_MATCH_SCORE: true,
    DELETE_MATCH: true,
    DELETE_TEAM: true,
  };

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
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

  function assistantContentFromResponse(resp) {
    if (resp.data_type === "CLARIFICATION_QUESTION") return resp.data.question || "";
    if (resp.data_type === "ERROR") return "";
    return resp.server_message || ("[" + resp.data_type + "]");
  }

  function renderStandings(data) {
    var rows = data.standings || [];
    if (!rows.length) return "<p class=\"hint\">No standings yet.</p>";
    var h =
      "<table class=\"data\"><thead><tr><th>Rank</th><th>Team</th><th>W</th><th>L</th></tr></thead><tbody>";
    rows.forEach(function (r) {
      h +=
        "<tr><td>" +
        escapeHtml(r.rank) +
        "</td><td>" +
        escapeHtml(r.player1_nickname) +
        " &amp; " +
        escapeHtml(r.player2_nickname) +
        "</td><td>" +
        escapeHtml(r.wins) +
        "</td><td>" +
        escapeHtml(r.losses) +
        "</td></tr>";
    });
    return h + "</tbody></table>";
  }

  function renderMatches(data) {
    var rows = data.matches || [];
    if (!rows.length) return "<p class=\"hint\">No matches recorded.</p>";
    var h =
      "<table class=\"data\"><thead><tr><th>Teams</th><th>Score</th><th>When</th></tr></thead><tbody>";
    rows.forEach(function (m) {
      var t1 = escapeHtml(m.team1_player1_nickname) + " & " + escapeHtml(m.team1_player2_nickname);
      var t2 = escapeHtml(m.team2_player1_nickname) + " & " + escapeHtml(m.team2_player2_nickname);
      var when = m.created_at ? escapeHtml(String(m.created_at)) : "—";
      h +=
        "<tr><td>" +
        t1 +
        " vs " +
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

  function renderRoster(data) {
    var players = data.players || [];
    var teams = data.teams || [];
    var h = "";
    if (teams.length) {
      h += "<h3>Teams</h3><table class=\"data\"><thead><tr><th>Players</th><th>team_id</th></tr></thead><tbody>";
      teams.forEach(function (t) {
        h +=
          "<tr><td>" +
          escapeHtml(t.player1_nickname) +
          " &amp; " +
          escapeHtml(t.player2_nickname) +
          "</td><td><code>" +
          escapeHtml(t.team_id) +
          "</code></td></tr>";
      });
      h += "</tbody></table>";
    }
    if (players.length) {
      h += "<h3>Players</h3><table class=\"data\"><thead><tr><th>Nickname</th><th>player_id</th></tr></thead><tbody>";
      players.forEach(function (p) {
        h +=
          "<tr><td>" +
          escapeHtml(p.nickname) +
          "</td><td><code>" +
          escapeHtml(p.player_id) +
          "</code></td></tr>";
      });
      h += "</tbody></table>";
    }
    if (!h) return "<p class=\"hint\">Roster is empty.</p>";
    return h;
  }

  function renderReadPanel(dataType, data) {
    var inner = "";
    if (dataType === "GET_STANDINGS") inner = renderStandings(data);
    else if (dataType === "GET_MATCH_HISTORY") inner = renderMatches(data);
    else if (dataType === "GET_ROSTER") inner = renderRoster(data);
    else inner = "<pre class=\"hint\">" + escapeHtml(JSON.stringify(data, null, 2)) + "</pre>";
    return (
      "<div class=\"data-panel\"><h3>" + escapeHtml(dataType.replace(/_/g, " ")) + "</h3>" + inner + "</div>"
    );
  }

  function arrayToInputs(name, arr) {
    var a = Array.isArray(arr) ? arr : [null, null];
    return (
      "<div class=\"nick-pair\" data-array-field=\"" +
      escapeHtml(name) +
      "\">" +
      "<label>P1 <input type=\"text\" data-array-index=\"0\" value=\"" +
      escapeHtml(a[0] || "") +
      "\" /></label>" +
      "<label>P2 <input type=\"text\" data-array-index=\"1\" value=\"" +
      escapeHtml(a[1] || "") +
      "\" /></label>" +
      "</div>"
    );
  }

  function renderWriteForm(bodySpec) {
    if (!bodySpec || typeof bodySpec !== "object" || !Object.keys(bodySpec).length) {
      return "<p class=\"hint\">No body. Confirm to send the request.</p>";
    }
    var parts = ['<div class="form-grid">'];
    Object.keys(bodySpec).forEach(function (key) {
      var spec = bodySpec[key];
      if (!isFieldSpec(spec)) return;
      var req = spec.required ? " *" : "";
      if (spec.type && spec.type.indexOf("array") === 0) {
        parts.push("<label><span>" + escapeHtml(key) + req + "</span>");
        parts.push(arrayToInputs(key, spec.value));
        parts.push("</label>");
      } else {
        var val = spec.value == null ? "" : String(spec.value);
        parts.push(
          "<label><span>" +
            escapeHtml(key) +
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

  var USER_INTENTS = [
    {
      name: "GET_STANDINGS",
      desc: "View current win/loss standings for all teams.",
      examples: ["show me the standings", "who's winning the league?", "what's the current leaderboard?"],
    },
    {
      name: "GET_MATCH_HISTORY",
      desc: "View all recorded match results, most recent first.",
      examples: ["show me all the matches", "what matches have been played?", "what were the recent results?"],
    },
    {
      name: "GET_ROSTER",
      desc: "View all registered players and teams.",
      examples: ["show me all the players", "who's in the league?", "list all teams"],
    },
    {
      name: "SUBMIT_MATCH_RESULT",
      desc: "Record a doubles match result. New players are registered automatically.",
      examples: ["Jae + Jazz 6:4 DK + Casper", "Alice and Bob beat Charlie and Diana 6 to 3", "record a match: John and Sarah vs Mike and Emma, 7-5"],
    },
  ];

  var ADMIN_INTENTS = [
    {
      name: "EDIT_PLAYER_NICKNAME",
      desc: "Correct or update a player's nickname.",
      examples: ["rename Alice to Alicia", "change John's nickname to Johnny"],
    },
    {
      name: "EDIT_MATCH_SCORE",
      desc: "Correct the score of a previously recorded match.",
      examples: ["fix the score for Alice and Bob vs Charlie and Diana — it should be 6-2 not 6-3"],
    },
    {
      name: "DELETE_MATCH",
      desc: "Permanently delete a match record.",
      examples: ["delete the match between Alice/Bob and Charlie/Diana"],
    },
    {
      name: "DELETE_TEAM",
      desc: "Permanently delete a team from the roster.",
      examples: ["delete the team Alice and Bob"],
    },
  ];

  function renderIntentGroup(title, intents, groupClass) {
    var h = '<div class="intent-group ' + escapeHtml(groupClass) + '">';
    if (title) {
      h += '<div class="intent-group-title">' + escapeHtml(title) + "</div>";
    }
    intents.forEach(function (intent) {
      h += '<div class="intent-item">';
      h += '<div class="intent-name">' + escapeHtml(intent.name) + "</div>";
      h += '<div class="intent-desc">' + escapeHtml(intent.desc) + "</div>";
      h += '<div class="intent-examples">';
      intent.examples.forEach(function (ex) {
        h += '<span class="intent-ex">&ldquo;' + escapeHtml(ex) + "&rdquo;</span>";
      });
      h += "</div>";
      h += "</div>";
    });
    h += "</div>";
    return h;
  }

  function renderIntentHelper(isAdmin) {
    var totalCount = isAdmin ? USER_INTENTS.length + ADMIN_INTENTS.length : USER_INTENTS.length;
    var body = renderIntentGroup(isAdmin ? "Player commands" : "", USER_INTENTS, "user-intents");
    if (isAdmin) {
      body += renderIntentGroup("Admin commands", ADMIN_INTENTS, "admin-intents");
    }
    return (
      '<details class="intent-helper">' +
      '<summary class="intent-helper-summary"><span class="intent-helper-title">Supported commands</span>' +
      '<span class="intent-helper-count">' +
      escapeHtml(String(totalCount)) +
      " intent" +
      (totalCount !== 1 ? "s" : "") +
      "</span></summary>" +
      '<div class="intent-helper-body">' +
      body +
      "</div>" +
      "</details>"
    );
  }

  function renderChatShell(route) {
    var isAdmin = !!route.hostToken;
    var isMobile = window.innerWidth <= 520;
    var inputPlaceholder = isMobile
      ? "Report Match Result, or Ask about standings, match history, or the roster."
      : "Report Match Result, or Ask about standings, match history, or the roster.\nCheck &quot;Supported Commands&quot; for more details.";
    return (
      "<header class=\"app-header\">" +
      "<div><h1>Tennis League Management Bot</h1>" +
      '<span class="badge ' +
      (isAdmin ? "admin" : "") +
      '">' +
      (isAdmin ? "Admin" : "Player") +
      "</span></div>" +
      '<div class="meta">League <code>' +
      escapeHtml(route.leagueId) +
      "</code>" +
      (isAdmin ? " · host token in URL" : "") +
      "</div>" +
      '<button id="theme-toggle-btn" class="theme-toggle" aria-label="Toggle light/dark mode">' +
      '<span class="theme-icon"></span>' +
      '<span class="theme-label"></span>' +
      "</button>" +
      "</header>" +
      renderIntentHelper(isAdmin) +
      '<main class="chat-main is-empty">' +
      '<div id="messages" class="messages">' +
      "</div>" +
      '<div class="composer">' +
      '<form id="chat-form">' +
      '<div class="composer-input-wrap">' +
      '<textarea id="chat-input" rows="2" placeholder="' + inputPlaceholder + '" autocomplete="off"></textarea>' +
      '<button type="submit" id="send-btn" aria-label="Send">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>' +
      "</button>" +
      "</div>" +
      "</form>" +
      "</div></main>" +
      '<footer class="chat-footer">' +
      '<span>Backend source:</span>' +
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
    btn.querySelector(".theme-icon").textContent = isLight ? "☀️" : "🌙";
    btn.querySelector(".theme-label").textContent = isLight ? "Light" : "Dark";
  }

  function mountChat(route) {
    var root = document.getElementById("app-root");
    root.innerHTML = renderChatShell(route);

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
    var input = document.getElementById("chat-input");
    var sendBtn = document.getElementById("send-btn");

    var conversationHistory = [];
    var emptyRemoved = false;

    function autoResizeInput() {
      input.style.height = "auto";
      input.style.height = input.scrollHeight + "px";
    }

    input.addEventListener("input", autoResizeInput);

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
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
      div.innerHTML = "<div class=\"label\">You</div><div>" + escapeHtml(text) + "</div>";
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function appendAssistant(html, extraClass) {
      clearEmpty();
      var div = document.createElement("div");
      div.className = "msg assistant" + (extraClass ? " " + extraClass : "");
      div.innerHTML = "<div class=\"label\">Assistant</div>" + html;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function appendError(message) {
      appendAssistant("<div>" + escapeHtml(message) + "</div>", "msg-error");
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
          "Invalid JSON from chat server (" +
            res.status +
            "). Content-Type: " +
            (contentType || "(none)") +
            ". " +
            oneLine +
            hint
        );
      }
      if (!res.ok) {
        throw new Error(data.detail ? JSON.stringify(data.detail) : text || res.statusText);
      }
      return data;
    }

    async function submitBackendAction(cardEl, method, url, bodySpec) {
      var payload = collectWriteForm(cardEl, bodySpec);
      var miss = validateWriteBody(bodySpec, payload);
      if (miss.length) {
        appendError("Please fill required fields: " + miss.join(", "));
        return;
      }
      var needsToken = needsHostTokenForUrl(url);
      if (needsToken && !route.hostToken) {
        appendError("This action calls an admin endpoint. Open the Admin URL with your host token.");
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
        var summary =
          method +
          " " +
          res.status +
          (txt ? ": " + (txt.length > 280 ? txt.slice(0, 280) + "…" : txt) : "");
        if (ok) {
          appendAssistant("<div><strong>Done.</strong> " + escapeHtml(summary) + "</div>");
          conversationHistory.push({ role: "assistant", content: "Action completed: " + summary });
        } else {
          appendError("Backend rejected the request. " + summary);
        }
      } catch (e) {
        appendError(e.message || String(e));
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    function renderResponse(resp) {

      if (resp.data_type === "ERROR") {
        var em = (resp.data && resp.data.error_message) || "Error";
        var sc = resp.data && resp.data.status_code;
        appendError((sc ? "[" + sc + "] " : "") + em);
        return;
      }

      if (resp.data_type === "CLARIFICATION_QUESTION") {
        var q = (resp.data && resp.data.question) || "Could you clarify?";
        appendAssistant("<div>" + escapeHtml(q) + "</div>");
        return;
      }

      var parts = [];
      if (resp.server_message && resp.server_message.trim()) {
        parts.push("<div>" + escapeHtml(resp.server_message.trim()) + "</div>");
      }

      if (READ_TYPES[resp.data_type]) {
        parts.push(renderReadPanel(resp.data_type, resp.data || {}));
        appendAssistant(parts.join(""));
        return;
      }

      if (WRITE_TYPES[resp.data_type]) {
        parts = [];
        var d = resp.data || {};
        var method = d.method || "POST";
        var bUrl = d.url || "";
        var bodySpec = d.body || {};
        var warn = "";
        if (needsHostTokenForUrl(bUrl) && !route.hostToken) {
          warn =
            "<p class=\"hint\" style=\"color:var(--warn)\">This write targets an admin endpoint. Use the Admin URL with <code>X-Host-Token</code>.</p>";
        }
        parts.push(warn);
        parts.push(
          "<div class=\"action-card\">" +
            renderWriteForm(bodySpec) +
            "<button type=\"button\" class=\"btn-secondary\" data-submit-write>Submit to league API</button>" +
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

      appendAssistant(
        "<pre class=\"hint\">" + escapeHtml(JSON.stringify(resp, null, 2)) + "</pre>"
      );
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var text = (input.value || "").trim();
      if (!text) return;
      input.value = "";
      input.style.height = "auto";
      appendUser(text);
      sendBtn.disabled = true;
      try {
        var resp = await postChat(text);
        renderResponse(resp);
        conversationHistory.push({ role: "user", content: text });
        var assistantContent = assistantContentFromResponse(resp);
        if (assistantContent) {
          conversationHistory.push({ role: "assistant", content: assistantContent });
        }
      } catch (err) {
        appendError(err.message || String(err));
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    });

    input.focus();
  }

  function boot() {
    var stored = localStorage.getItem("tlchat-theme");
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(stored || (prefersDark ? "dark" : "light"));

    var route = window.TLCHAT_ROUTE;
    if (!route || !route.leagueId) {
      document.getElementById("app-root").innerHTML =
        '<main class="landing"><p class="hint">No league specified. <a href="/">Go to home</a>.</p></main>';
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
