(function () {
  var params = new URLSearchParams(window.location.search);
  var fromQuery = params.get("chatApi");
  // Must be an absolute origin (include https://). Host-only strings are turned into https:// in app.js.
  window.TLCHAT_CONFIG = {
    chatApiBaseUrl: (fromQuery || "https://tlmbchattointent-production.up.railway.app").replace(/\/$/, ""),
  };
})();
