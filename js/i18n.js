/**
 * Vanilla i18n: locale registry + t() helper.
 * Locale: ?lang=en|ko (persisted), then localStorage tlchat-locale, then navigator.
 * Optional: load site-header.js before initPage() to inject the shared static header from #tlchat-site-header-root.
 *
 * Exposes window.TLCHAT_I18N { registerLocale, t, getLocale, setLocale, applyDom, initPage,
 *   wireLocaleSwitchers, renderLocaleDropdown, syncLocaleDropdown }
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "tlchat-locale";
  var SUPPORTED = { en: true, ko: true };

  var STRINGS = {};

  function registerLocale(locale, strings) {
    var loc = normalizeLocale(locale);
    if (!SUPPORTED[loc] || !strings || typeof strings !== "object") return;
    STRINGS[loc] = strings;
  }

  function normalizeLocale(raw) {
    var s = String(raw || "")
      .trim()
      .toLowerCase();
    if (s.indexOf("ko") === 0) return "ko";
    if (s.indexOf("en") === 0) return "en";
    return "";
  }

  function localeFromNavigator() {
    try {
      var list = global.navigator.languages || [];
      for (var i = 0; i < list.length; i++) {
        var n = normalizeLocale(list[i]);
        if (n && SUPPORTED[n]) return n;
      }
      return normalizeLocale(global.navigator.language) || "en";
    } catch (e) {
      return "en";
    }
  }

  function getLocale() {
    try {
      var params = new URLSearchParams(global.location.search || "");
      var q = normalizeLocale(params.get("lang"));
      if (q && SUPPORTED[q]) {
        try {
          global.localStorage.setItem(STORAGE_KEY, q);
        } catch (e2) {
          /* ignore */
        }
        return q;
      }
    } catch (e) {
      /* ignore */
    }
    try {
      var stored = normalizeLocale(global.localStorage.getItem(STORAGE_KEY));
      if (stored && SUPPORTED[stored]) return stored;
    } catch (e) {
      /* ignore */
    }
    return localeFromNavigator();
  }

  function setLocale(locale) {
    var loc = normalizeLocale(locale);
    if (!SUPPORTED[loc]) loc = "en";
    try {
      global.localStorage.setItem(STORAGE_KEY, loc);
    } catch (e) {
      /* ignore */
    }
    if (global.document && global.document.documentElement) {
      global.document.documentElement.lang = loc === "ko" ? "ko" : "en";
      global.document.documentElement.setAttribute("data-locale", loc);
    }
    return loc;
  }

  function resolvePath(obj, parts) {
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  /**
   * @param {string} key dot-separated path, e.g. "findLeague.h1"
   * @param {Record<string, string|number>=} params placeholders {name}
   */
  function t(key, params) {
    var loc = getLocale();
    var parts = String(key || "").split(".").filter(Boolean);
    var val = resolvePath(STRINGS[loc] || {}, parts);
    if (typeof val !== "string") val = resolvePath(STRINGS.en || {}, parts);
    if (typeof val !== "string") return String(key || "");

    if (params && typeof params === "object") {
      Object.keys(params).forEach(function (k) {
        val = val.split("{" + k + "}").join(String(params[k]));
      });
    }
    return val;
  }

  function applyDom(root) {
    var r = root || global.document;
    if (!r || !r.querySelectorAll) return;

    r.querySelectorAll("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      if (!k) return;
      el.textContent = t(k);
    });

    r.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-html");
      if (!k) return;
      el.innerHTML = t(k);
    });

    r.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-placeholder");
      if (!k) return;
      el.setAttribute("placeholder", t(k));
    });

    r.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-aria-label");
      if (!k) return;
      el.setAttribute("aria-label", t(k));
    });

    r.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-title");
      if (!k) return;
      el.setAttribute("title", t(k));
    });
  }

  function applyDocumentTitle(key) {
    if (!global.document) return;
    var title = t(key);
    if (title) global.document.title = title;
  }

  function wireLocaleSwitchers() {
    if (!global.document || global.document.documentElement.dataset.localeSwitchWired === "1") {
      return;
    }
    global.document.documentElement.dataset.localeSwitchWired = "1";
    global.document.addEventListener("change", function (ev) {
      var el = ev.target;
      if (!el || !el.matches || !el.matches("select.locale-dropdown")) return;
      var next = normalizeLocale(el.value);
      if (!SUPPORTED[next]) return;
      var cur = getLocale();
      if (cur === next) return;
      setLocale(next);
      global.location.reload();
    });
  }

  function syncHtmlLang() {
    var loc = getLocale();
    setLocale(loc);
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  /**
   * Native select: flag emoji + two-letter language code per option.
   * Chat: { compact: true } — tighter padding; aria-label from footer.language.
   * Static: optional visible label via data-i18n on sibling (see HTML).
   */
  function renderLocaleDropdown(options) {
    var compact = options && options.compact;
    var cur = getLocale();
    var optEn = cur === "en" ? " selected" : "";
    var optKo = cur === "ko" ? " selected" : "";
    var optionsHtml =
      '<option value="en"' +
      optEn +
      ">🇺🇸 EN</option>" +
      '<option value="ko"' +
      optKo +
      ">🇰🇷 KO</option>";
    var aria = escapeAttr(t("footer.language"));
    var cls = "locale-dropdown" + (compact ? " locale-dropdown--compact" : "");
    var sel =
      '<select class="' +
      cls +
      '"' +
      (compact
        ? ' aria-label="' + aria + '"'
        : ' id="tlchat-locale-select" data-i18n-aria-label="footer.language"') +
      ">" +
      optionsHtml +
      "</select>";
    return (
      '<div class="locale-dropdown-wrap' +
      (compact ? " locale-dropdown-wrap--compact" : "") +
      '">' +
      sel +
      "</div>"
    );
  }

  function syncLocaleDropdown(root) {
    var r = root || global.document;
    if (!r || !r.querySelectorAll) return;
    var cur = getLocale();
    if (!SUPPORTED[cur]) return;
    r.querySelectorAll("select.locale-dropdown").forEach(function (sel) {
      sel.value = cur;
    });
  }

  /**
   * Call from static pages after scripts: set title from body[data-i18n-title-key], translate DOM, wire switchers.
   */
  function initPage() {
    if (global.TLCHAT_SITE_HEADER && typeof global.TLCHAT_SITE_HEADER.mount === "function") {
      global.TLCHAT_SITE_HEADER.mount();
    }
    syncHtmlLang();
    var body = global.document && global.document.body;
    var titleKey = body && body.getAttribute("data-i18n-title-key");
    if (titleKey) applyDocumentTitle(titleKey);
    applyDom(global.document);
    syncLocaleDropdown(global.document);
    wireLocaleSwitchers();
  }

  syncHtmlLang();

  global.TLCHAT_I18N = {
    registerLocale: registerLocale,
    t: t,
    getLocale: getLocale,
    setLocale: setLocale,
    applyDom: applyDom,
    applyDocumentTitle: applyDocumentTitle,
    initPage: initPage,
    wireLocaleSwitchers: wireLocaleSwitchers,
    renderLocaleDropdown: renderLocaleDropdown,
    syncLocaleDropdown: syncLocaleDropdown,
  };
})(typeof window !== "undefined" ? window : this);
