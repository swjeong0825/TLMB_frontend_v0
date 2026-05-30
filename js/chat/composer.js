(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};
  var createNicknameAutocomplete = api.createNicknameAutocomplete;
  var escapeHtml = api.escapeHtml;
  var tr = api.tr;

  function createComposerController(ctx) {
    ctx = ctx || {};
    var input = ctx.input;
    var form = ctx.form;
    var mentionPopover = ctx.mentionPopover;
    var nicknameAutocomplete = createNicknameAutocomplete({
      leagueRoster: ctx.leagueRoster || {},
    });
    var getMentionState = nicknameAutocomplete.getMentionState;
    var filterPlayersForMention = nicknameAutocomplete.filterPlayersForMention;

    var mentionList = [];
    var mentionSelectedIndex = 0;

    function bindActionCardAutocomplete(card) {
      if (!card) return;
      var inputs = card.querySelectorAll('.nick-input-wrap > input');
      inputs.forEach(function (inputEl) {
        var popId = inputEl.getAttribute("aria-controls");
        if (!popId) return;
        var popover = document.getElementById(popId);
        if (!popover) return;
        nicknameAutocomplete.bindNickAutocomplete(inputEl, popover);
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

    function showMentionStatus(text) {
      mentionPopover.innerHTML =
        '<div class="chat-mention-item chat-mention-status" role="presentation">' +
        escapeHtml(text) +
        "</div>";
      mentionPopover.hidden = false;
    }

    function showMentionPopover(matches) {
      if (!mentionPopover) return;
      mentionPopover.innerHTML = "";
      mentionList = [];
      mentionSelectedIndex = 0;
      var leagueRoster = ctx.leagueRoster || {};
      if (leagueRoster.status === "loading") {
        showMentionStatus(tr("mentionLoading") || "Loading players\u2026");
        return;
      }
      if (leagueRoster.status === "error") {
        showMentionStatus(tr("mentionRosterError") || "Could not load roster.");
        return;
      }
      if (!matches.length) {
        showMentionStatus(tr("mentionNoMatch") || "No matching players.");
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
      var opts = mentionPopover.querySelectorAll('.chat-mention-item[role="option"]');
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
      return mentionPopover.querySelector('.chat-mention-item[role="option"]') != null;
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

    return {
      autoResizeInput: autoResizeInput,
      bindActionCardAutocomplete: bindActionCardAutocomplete,
      updateMentionUI: updateMentionUI,
    };
  }

  api.createComposerController = createComposerController;
})(typeof window !== "undefined" ? window : this);
