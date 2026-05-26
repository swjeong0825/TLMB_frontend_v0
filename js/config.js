const CHAT_API_BASE_URL = "https://tlmbchattointent-production.up.railway.app";
// const CHAT_API_BASE_URL = "https://tlmbchattointent-copy2-production.up.railway.app"; // new feature testing

// const CHAT_API_BASE_URL = "http://127.0.0.1:8000";

const BACKEND_MAIN_BASE_URL = "https://tlmbbackendmain-production.up.railway.app";
// const BACKEND_MAIN_BASE_URL = "https://tlmbbackendmain-copy2-production.up.railway.app"; // new feature testing

// const BACKEND_MAIN_BASE_URL = "http://127.0.0.1:8000";

(function () {
  var params = new URLSearchParams(window.location.search);
  var fromQuery = params.get("chatApi");
  var backendFromQuery = params.get("backendApi");
  // Must be an absolute origin (include https://). Host-only strings are turned into https:// in app.js.
  window.TLCHAT_CONFIG = {
    chatApiBaseUrl: (fromQuery || CHAT_API_BASE_URL).replace(/\/$/, ""),
    backendMainBaseUrl: (backendFromQuery || BACKEND_MAIN_BASE_URL).replace(/\/$/, ""),
  };
})();
