(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  function cssEscapeAttrValue(v) {
    return String(v == null ? "" : v).replace(/(["\\])/g, "\\$1");
  }

  /** Each "+" is sent as " + " to the chat-to-intent server (doubles / partner notation). */
  function normalizePlusForIntentServer(message) {
    return String(message).replace(/\s*\+\s*/g, " + ");
  }

  /**
   * Fixed-position disabled-button tooltips escape scroll containers.
   * This helper owns only coordinates; CSS still owns visibility.
   */
  var DISABLED_TIP_WRAP_SELECTOR =
    ".alias-add-wrap--disabled, " +
    ".alias-remove-wrap--disabled, " +
    ".roster-remove-wrap--disabled, " +
    ".match-update-wrap--disabled, " +
    ".match-delete-wrap--disabled, " +
    ".standings-scope-wrap--disabled";

  function disabledTipNodeFor(wrap) {
    if (!wrap) return null;
    if (wrap.matches(".roster-remove-wrap--disabled")) {
      return wrap.querySelector(".roster-remove-tip");
    }
    if (wrap.matches(".match-update-wrap--disabled")) {
      return wrap.querySelector(".match-update-tip");
    }
    if (wrap.matches(".match-delete-wrap--disabled")) {
      return wrap.querySelector(".match-delete-tip");
    }
    if (wrap.matches(".standings-scope-wrap--disabled")) {
      return wrap.querySelector(".standings-scope-tip");
    }
    return wrap.querySelector(".alias-tip");
  }

  function positionDisabledTip(wrap) {
    var tip = disabledTipNodeFor(wrap);
    if (!tip) return;
    tip.style.left = "0px";
    tip.style.top = "0px";
    var wrapRect = wrap.getBoundingClientRect();
    var tipRect = tip.getBoundingClientRect();
    var pad = 8;
    var vw = window.innerWidth || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var gap = 6;
    var left = wrapRect.left + wrapRect.width / 2 - tipRect.width / 2;
    var top = wrapRect.top - tipRect.height - gap;
    if (left < pad) left = pad;
    if (left + tipRect.width > vw - pad) {
      left = Math.max(pad, vw - tipRect.width - pad);
    }
    if (top < pad) top = wrapRect.bottom + gap;
    if (top + tipRect.height > vh - pad) {
      top = Math.max(pad, vh - tipRect.height - pad);
    }
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  function bindDisabledTipPositioning(root) {
    if (!root || !root.addEventListener) return;
    root.addEventListener(
      "mouseover",
      function (e) {
        var wrap =
          e.target.closest && e.target.closest(DISABLED_TIP_WRAP_SELECTOR);
        if (!wrap) return;
        positionDisabledTip(wrap);
      },
      true
    );

    root.addEventListener("focusin", function (e) {
      var wrap =
        e.target.closest && e.target.closest(DISABLED_TIP_WRAP_SELECTOR);
      if (!wrap) return;
      positionDisabledTip(wrap);
    });

    var disabledTipRafId = null;
    function repositionVisibleDisabledTips() {
      disabledTipRafId = null;
      var visibleWraps = document.querySelectorAll(
        ".alias-add-wrap--disabled:hover, " +
          ".alias-add-wrap--disabled:focus-within, " +
          ".alias-add-wrap--tip-open, " +
          ".alias-remove-wrap--disabled:hover, " +
          ".alias-remove-wrap--disabled:focus-within, " +
          ".alias-remove-wrap--tip-open, " +
          ".roster-remove-wrap--disabled:hover, " +
          ".roster-remove-wrap--disabled:focus-within, " +
          ".roster-remove-wrap--tip-open, " +
          ".match-update-wrap--disabled:hover, " +
          ".match-update-wrap--disabled:focus-within, " +
          ".match-update-wrap--tip-open, " +
          ".match-delete-wrap--disabled:hover, " +
          ".match-delete-wrap--disabled:focus-within, " +
          ".match-delete-wrap--tip-open, " +
          ".standings-scope-wrap--disabled:hover, " +
          ".standings-scope-wrap--disabled:focus-within"
      );
      visibleWraps.forEach(positionDisabledTip);
    }
    function scheduleDisabledTipReposition() {
      if (disabledTipRafId != null) return;
      disabledTipRafId = requestAnimationFrame(repositionVisibleDisabledTips);
    }
    window.addEventListener("scroll", scheduleDisabledTipReposition, true);
    window.addEventListener("resize", scheduleDisabledTipReposition);

    document.addEventListener("click", function (e) {
      var insideUpdate =
        e.target.closest && e.target.closest(".match-update-wrap--disabled");
      var insideDelete =
        e.target.closest && e.target.closest(".match-delete-wrap--disabled");
      if (insideUpdate || insideDelete) return;
      document
        .querySelectorAll(
          ".match-update-wrap--tip-open, .match-delete-wrap--tip-open"
        )
        .forEach(function (el) {
          el.classList.remove("match-update-wrap--tip-open");
          el.classList.remove("match-delete-wrap--tip-open");
        });
    });
  }

  api.cssEscapeAttrValue = cssEscapeAttrValue;
  api.normalizePlusForIntentServer = normalizePlusForIntentServer;
  api.positionDisabledTip = positionDisabledTip;
  api.bindDisabledTipPositioning = bindDisabledTipPositioning;
})(typeof window !== "undefined" ? window : this);
