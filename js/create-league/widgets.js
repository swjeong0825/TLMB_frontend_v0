(function (global) {
  "use strict";

  var api = global.TLCHAT_CREATE_LEAGUE = global.TLCHAT_CREATE_LEAGUE || {};

  var HELP_KEYS = {
    matchPair: true,
    leagueTimezone: true,
    oneTeamPerPlayer: true,
    rankingSubject: true,
    tieBreakers: true,
    autoRegisterPlayersOnMatch: true,
  };

  function setupLeagueTimezoneSelect(form) {
    var select = form.querySelector("[data-league-timezone-select]");
    if (!select) return;

    var preferred = api.browserTimezone();
    var options = api.LEAGUE_TIMEZONE_OPTIONS.slice();
    if (options.indexOf(preferred) === -1) options.unshift(preferred);

    while (select.firstChild) select.removeChild(select.firstChild);
    for (var i = 0; i < options.length; i++) {
      var opt = document.createElement("option");
      opt.value = options[i];
      opt.textContent = options[i];
      select.appendChild(opt);
    }
    select.value = preferred;
  }

  function fillHelpModalBody(container, text) {
    while (container.firstChild) container.removeChild(container.firstChild);
    var parts = String(text || "")
      .split(/\n\n+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      var p = document.createElement("p");
      p.textContent = parts[i];
      container.appendChild(p);
    }
  }

  function createHelpModalController(options) {
    var helpModal = options.helpModal;
    var helpTitle = options.helpTitle;
    var helpBody = options.helpBody;
    var helpClose = options.helpClose;
    var helpBackdrop = options.helpBackdrop;
    var helpReturnFocus = null;

    function openHelpModal(key) {
      if (!helpModal || !helpTitle || !helpBody) return;
      if (!HELP_KEYS[key]) return;
      var I = global.TLCHAT_I18N;
      if (!I || typeof I.t !== "function") return;
      helpTitle.textContent = I.t("createLeague.help." + key + "Title");
      fillHelpModalBody(helpBody, I.t("createLeague.help." + key + "Body"));
      helpReturnFocus = document.activeElement;
      helpModal.hidden = false;
      document.body.style.overflow = "hidden";
      if (helpClose && typeof helpClose.focus === "function") {
        helpClose.focus();
      }
    }

    function closeHelpModal() {
      if (!helpModal || helpModal.hidden) return;
      helpModal.hidden = true;
      document.body.style.overflow = "";
      if (helpReturnFocus && typeof helpReturnFocus.focus === "function") {
        try {
          helpReturnFocus.focus();
        } catch (_e) {
          /* ignore */
        }
      }
      helpReturnFocus = null;
    }

    function bind() {
      if (!helpModal || !helpClose || !helpBackdrop) return;
      helpClose.addEventListener("click", function () {
        closeHelpModal();
      });
      helpBackdrop.addEventListener("click", function () {
        closeHelpModal();
      });
      document.addEventListener("keydown", function (ev) {
        if (!helpModal.hidden && ev.key === "Escape") {
          ev.preventDefault();
          closeHelpModal();
        }
      });
      document.body.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest("[data-help-key]");
        if (!btn) return;
        var key = btn.getAttribute("data-help-key");
        if (!key || !HELP_KEYS[key]) return;
        ev.preventDefault();
        openHelpModal(key);
      });
    }

    return {
      bind: bind,
      open: openHelpModal,
      close: closeHelpModal,
    };
  }

  function chipNormalizeKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function findChipByKey(chipsContainer, key) {
    var nodes = chipsContainer.querySelectorAll(".chip[data-chip-name]");
    for (var i = 0; i < nodes.length; i++) {
      var n = chipNormalizeKey(nodes[i].getAttribute("data-chip-name"));
      if (n === key) return nodes[i];
    }
    return null;
  }

  function createChipElement(name) {
    var chip = document.createElement("span");
    chip.className = "chip";
    chip.setAttribute("data-chip-name", name);

    var label = document.createElement("span");
    label.className = "chip-label";
    label.textContent = name;
    chip.appendChild(label);

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-remove";
    remove.setAttribute("data-chip-remove", "");
    remove.setAttribute("tabindex", "-1");
    var I = global.TLCHAT_I18N;
    if (I && typeof I.t === "function") {
      remove.setAttribute(
        "aria-label",
        I.t("createLeague.initialPlayersChipRemoveAria", { name: name })
      );
    } else {
      remove.setAttribute("aria-label", "Remove " + name);
    }
    remove.textContent = "\u00D7";
    chip.appendChild(remove);

    return chip;
  }

  function commitChipFromText(chipsContainer, fieldEl, rawText) {
    var trimmed = String(rawText || "").trim();
    if (!trimmed) return false;
    var key = chipNormalizeKey(trimmed);
    if (!key) return false;
    if (findChipByKey(chipsContainer, key)) {
      return false;
    }
    var chip = createChipElement(trimmed);
    chipsContainer.insertBefore(chip, fieldEl);
    return true;
  }

  function commitMultipleChipsFromText(chipsContainer, fieldEl, text) {
    var parts = String(text || "").split(/[,\n\r\t]+/);
    var added = 0;
    for (var i = 0; i < parts.length; i++) {
      if (commitChipFromText(chipsContainer, fieldEl, parts[i])) added++;
    }
    return added;
  }

  function setupInitialPlayersChips(form) {
    var wrap = form.querySelector("[data-initial-players-chips]");
    if (!wrap) return;
    var field = wrap.querySelector(".chips-input-field");
    if (!field) return;

    wrap.addEventListener("click", function (ev) {
      if (ev.target.closest && ev.target.closest(".chip")) return;
      try {
        field.focus();
      } catch (_e) {
        /* ignore */
      }
    });

    wrap.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-chip-remove]");
      if (!btn) return;
      var chip = btn.closest(".chip");
      if (chip) chip.parentNode.removeChild(chip);
    });

    field.addEventListener("keydown", function (ev) {
      var key = ev.key;
      if (key === "Enter" || key === " " || key === ",") {
        if (field.value && field.value.trim().length > 0) {
          ev.preventDefault();
          if (commitChipFromText(wrap, field, field.value)) {
            field.value = "";
          } else {
            field.value = "";
          }
        } else if (key === "Enter") {
          ev.preventDefault();
        }
        return;
      }
      if (key === "Backspace" && field.value.length === 0) {
        var chips = wrap.querySelectorAll(".chip[data-chip-name]");
        if (chips.length > 0) {
          ev.preventDefault();
          var last = chips[chips.length - 1];
          last.parentNode.removeChild(last);
        }
      }
    });

    field.addEventListener("paste", function (ev) {
      var data = ev.clipboardData && ev.clipboardData.getData
        ? ev.clipboardData.getData("text")
        : "";
      if (!data) return;
      if (!/[,\n\r\t]/.test(data)) return;
      ev.preventDefault();
      commitMultipleChipsFromText(wrap, field, data);
    });

    field.addEventListener("blur", function () {
      if (field.value && field.value.trim().length > 0) {
        if (commitChipFromText(wrap, field, field.value)) {
          field.value = "";
        }
      }
    });
  }

  function clearInitialPlayersUi(form) {
    var wrap = form.querySelector("[data-initial-players-chips]");
    if (!wrap) return;
    var chips = wrap.querySelectorAll(".chip[data-chip-name]");
    for (var i = 0; i < chips.length; i++) {
      chips[i].parentNode.removeChild(chips[i]);
    }
    var field = wrap.querySelector(".chips-input-field");
    if (field) field.value = "";
    var toggle = form.querySelector('input[name="auto_register_players_on_match"]');
    if (toggle) toggle.checked = false;
  }

  api.HELP_KEYS = HELP_KEYS;
  api.setupLeagueTimezoneSelect = setupLeagueTimezoneSelect;
  api.fillHelpModalBody = fillHelpModalBody;
  api.createHelpModalController = createHelpModalController;
  api.chipNormalizeKey = chipNormalizeKey;
  api.findChipByKey = findChipByKey;
  api.createChipElement = createChipElement;
  api.commitChipFromText = commitChipFromText;
  api.commitMultipleChipsFromText = commitMultipleChipsFromText;
  api.setupInitialPlayersChips = setupInitialPlayersChips;
  api.clearInitialPlayersUi = clearInitialPlayersUi;
})(window);
