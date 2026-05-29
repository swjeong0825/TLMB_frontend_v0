(function (global) {
  "use strict";

  var api = global.TLCHAT_CREATE_LEAGUE = global.TLCHAT_CREATE_LEAGUE || {};

  function t(key, params) {
    var I = global.TLCHAT_I18N;
    if (!I || typeof I.t !== "function") return "";
    return I.t("createLeague." + key, params);
  }

  function backendBase() {
    var c = global.TLCHAT_CONFIG || {};
    var u = c.backendMainBaseUrl;
    if (!u || typeof u !== "string") {
      console.error("TLCHAT_CONFIG.backendMainBaseUrl missing; set in js/config.js");
      return "";
    }
    return u.replace(/\/$/, "");
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.hidden = !!hidden;
    if (hidden) el.setAttribute("aria-hidden", "true");
    else el.removeAttribute("aria-hidden");
  }

  function technicalFromResponse(status, bodyText) {
    var technical = String(status || "") + " " + String(bodyText || "");
    try {
      var parsed = JSON.parse(bodyText);
      if (parsed && parsed.error) technical += " " + String(parsed.error);
      if (parsed && parsed.detail !== undefined) {
        technical += " " + JSON.stringify(parsed.detail);
      }
    } catch (_e) {
      /* ignore */
    }
    return technical;
  }

  function userMessageFromResponse(status, bodyText) {
    try {
      var parsed = JSON.parse(bodyText);
      if (parsed && parsed.error === "LeagueTitleAlreadyExistsError") {
        return t("titleExists");
      }
    } catch (_e) {
      /* ignore */
    }
    var ufe = global.TLCHAT_USER_FACING_ERRORS;
    if (ufe && typeof ufe.fromTechnical === "function") {
      return ufe.fromTechnical(technicalFromResponse(status, bodyText));
    }
    var I = global.TLCHAT_I18N;
    if (I && typeof I.t === "function") return I.t("findLeagueJs.genericError");
    return "Something went wrong. Please try again.";
  }

  function networkErrorMessage(err) {
    var ufe = global.TLCHAT_USER_FACING_ERRORS;
    if (ufe && typeof ufe.fromTechnical === "function") {
      return ufe.fromTechnical(String(err && err.message ? err.message : err));
    }
    var I = global.TLCHAT_I18N;
    if (I && typeof I.t === "function") return I.t("findLeagueJs.networkError");
    return "We couldn\u2019t reach the server.";
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      return Promise.resolve();
    } finally {
      document.body.removeChild(ta);
    }
  }

  api.t = t;
  api.backendBase = backendBase;
  api.setHidden = setHidden;
  api.technicalFromResponse = technicalFromResponse;
  api.userMessageFromResponse = userMessageFromResponse;
  api.networkErrorMessage = networkErrorMessage;
  api.copyText = copyText;
})(window);
