(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  var escapeHtml = api.escapeHtml;
  var tr = api.tr;
  var friendlyMessageFromTechnicalError = api.friendlyMessageFromTechnicalError;

  function createMessageThread(ctx) {
    ctx = ctx || {};
    var messagesEl = ctx.messagesEl;
    var emptyRemoved = false;

    function clearEmpty() {
      if (!emptyRemoved) {
        messagesEl.innerHTML = "";
        emptyRemoved = true;
        var chatMain = messagesEl.closest(".chat-main");
        if (chatMain) chatMain.classList.remove("is-empty");
      }
    }

    function appendUser(text) {
      clearEmpty();
      var div = document.createElement("div");
      div.className = "msg user";
      div.innerHTML =
        '<div class="label">' +
        escapeHtml(tr("labelYou") || "You") +
        "</div><div>" +
        escapeHtml(text) +
        "</div>";
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function appendLoadingBubble() {
      clearEmpty();
      var div = document.createElement("div");
      div.className = "msg assistant msg-loading";
      div.setAttribute("aria-live", "polite");
      div.setAttribute(
        "aria-label",
        tr("assistantThinking") || "Assistant is thinking"
      );
      div.innerHTML =
        '<div class="label">' +
        escapeHtml(tr("labelAssistant") || "Assistant") +
        "</div>" +
        '<div class="typing-indicator" aria-hidden="true">' +
        "<span></span><span></span><span></span>" +
        "</div>";
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function removeLoadingBubble(node) {
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }

    function appendAssistant(html, extraClass) {
      clearEmpty();
      var div = document.createElement("div");
      div.className = "msg assistant" + (extraClass ? " " + extraClass : "");
      div.innerHTML =
        '<div class="label">' +
        escapeHtml(tr("labelAssistant") || "Assistant") +
        "</div>" +
        html;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function appendErrorPlain(message) {
      appendAssistant(
        '<div class="error-user-facing">' + escapeHtml(message) + "</div>",
        "msg-error"
      );
    }

    function appendErrorTechnical(technicalMessage, logContext) {
      var tech = technicalMessage == null ? "" : String(technicalMessage);
      if (logContext) {
        console.error("[TLCHAT]", logContext, tech);
      } else {
        console.error("[TLCHAT]", tech);
      }
      appendAssistant(
        '<div class="error-user-facing">' +
          escapeHtml(friendlyMessageFromTechnicalError(tech)) +
          "</div>",
        "msg-error"
      );
    }

    return {
      appendAssistant: appendAssistant,
      appendErrorPlain: appendErrorPlain,
      appendErrorTechnical: appendErrorTechnical,
      appendLoadingBubble: appendLoadingBubble,
      appendUser: appendUser,
      clearEmpty: clearEmpty,
      removeLoadingBubble: removeLoadingBubble,
    };
  }

  api.createMessageThread = createMessageThread;
})(typeof window !== "undefined" ? window : this);
