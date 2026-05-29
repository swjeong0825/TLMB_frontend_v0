(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};
  var escapeHtml = api.escapeHtml;
  var normalizeMatchNickname = api.normalizeMatchNickname;
  var playerAliases = api.playerAliases;
  var tr = api.tr;

  function createNicknameAutocomplete(ctx) {
    ctx = ctx || {};
    var leagueRoster = ctx.leagueRoster || {};

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
     * IS the player list, so there is no separate allowlist union to merge.
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
     * inputs (pair1_nicknames / pair2_nicknames). Mirrors the composer's
     * @-mention popover behavior but is scoped to a single text input and
     * triggered on focus/typing instead of an `@` sigil.
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
        } catch (_e) {
          /* selection unsupported on this input type */
        }
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
      input.addEventListener("compositionstart", function () {
        imeActive = true;
      });
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
        }
      });

      input.addEventListener("blur", function () {
        setTimeout(hide, 120);
      });
    }

    return {
      bindNickAutocomplete: bindNickAutocomplete,
      combinedMentionCandidates: combinedMentionCandidates,
      filterPlayersForMention: filterPlayersForMention,
      getMentionState: getMentionState,
    };
  }

  api.createNicknameAutocomplete = createNicknameAutocomplete;
})(typeof window !== "undefined" ? window : this);
