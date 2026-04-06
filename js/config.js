// const CHAT_API_BASE_URL = "https://tlmbchattointent-production.up.railway.app";

const CHAT_API_BASE_URL = "http://127.0.0.1:8000";


(function () {
  var params = new URLSearchParams(window.location.search);
  var fromQuery = params.get("chatApi");
  // Must be an absolute origin (include https://). Host-only strings are turned into https:// in app.js.
  window.TLCHAT_CONFIG = {
    chatApiBaseUrl: (fromQuery || CHAT_API_BASE_URL).replace(/\/$/, ""),
  };
})();
