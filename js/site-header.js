/**
 * Shared static site header (language dropdown). Injected into #tlchat-site-header-root.
 * Loaded before initPage(); TLCHAT_I18N.initPage() calls mount() when this script is present.
 */
(function (global) {
  "use strict";

  var ROOT_ID = "tlchat-site-header-root";

  var SITE_HEADER_HTML =
    '<header class="site-header">' +
    '<div class="locale-dropdown-wrap">' +
    '<select id="tlchat-locale-select" class="locale-dropdown" data-i18n-aria-label="footer.language">' +
    '<option value="en">🇺🇸 EN</option>' +
    '<option value="ko">🇰🇷 KO</option>' +
    "</select>" +
    "</div>" +
    "</header>";

  /**
   * Replaces the placeholder div with the header markup. No-op if the root node is missing.
   * @param {string=} rootId default tlchat-site-header-root
   */
  function mount(rootId) {
    var doc = global.document;
    if (!doc) return;
    var id = rootId || ROOT_ID;
    var root = doc.getElementById(id);
    if (!root) return;
    root.outerHTML = SITE_HEADER_HTML;
  }

  global.TLCHAT_SITE_HEADER = {
    mount: mount,
    ROOT_ID: ROOT_ID,
    SITE_HEADER_HTML: SITE_HEADER_HTML,
  };
})(typeof window !== "undefined" ? window : this);
