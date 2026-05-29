(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  var collectWriteForm = api.collectWriteForm;
  var createWriteErrorHandler = api.createWriteErrorHandler;
  var createWriteSuccessHandler = api.createWriteSuccessHandler;
  var labelForFormField = api.labelForFormField;
  var needsHostTokenForUrl = api.needsHostTokenForUrl;
  var shouldAttachHostTokenForUrl = api.shouldAttachHostTokenForUrl;
  var tr = api.tr;
  var validateWriteBody = api.validateWriteBody;

  function noop() {}

  function createWriteActionController(ctx) {
    ctx = ctx || {};
    var route = ctx.route || {};
    var leagueRoster = ctx.leagueRoster || {};
    var appendErrorPlain = ctx.appendErrorPlain || noop;
    var appendErrorTechnical = ctx.appendErrorTechnical || noop;
    var appendLoadingBubble = ctx.appendLoadingBubble || function () { return null; };
    var removeLoadingBubble = ctx.removeLoadingBubble || noop;
    var confirmAllowedSameDayRematchIfNeeded =
      ctx.confirmAllowedSameDayRematchIfNeeded ||
      function () { return Promise.resolve(true); };

    var successHandler = createWriteSuccessHandler(ctx);
    var errorHandler = createWriteErrorHandler(ctx);

    function requiredFieldMessage(missingKeys) {
      return (
        (tr("fillRequired") || "Please fill required fields: ") +
        missingKeys
          .map(function (key) {
            return labelForFormField(key);
          })
          .join(", ")
      );
    }

    function requestOptions(method, url, payload) {
      var headers = {};
      var hasJsonBody =
        method !== "DELETE" &&
        method !== "GET" &&
        Object.keys(payload).length > 0;
      if (hasJsonBody) {
        headers["Content-Type"] = "application/json";
      }
      if (shouldAttachHostTokenForUrl(url, route.hostToken)) {
        headers["X-Host-Token"] = route.hostToken;
      }
      var opts = { method: method, headers: headers };
      if (hasJsonBody) {
        opts.body = JSON.stringify(payload);
      }
      return opts;
    }

    async function submitBackendAction(cardEl, method, url, bodySpec) {
      var payload = collectWriteForm(cardEl, bodySpec);
      var missing = validateWriteBody(bodySpec, payload);
      if (missing.length) {
        appendErrorPlain(requiredFieldMessage(missing));
        return;
      }
      if (needsHostTokenForUrl(url) && !route.hostToken) {
        appendErrorPlain(
          tr("adminEndpointHint") ||
            "This action calls an admin endpoint. Open the Admin URL with your host token."
        );
        return;
      }

      var btn = cardEl.querySelector("[data-submit-write]");
      if (btn) btn.disabled = true;

      var loadingNode = null;
      function clearLoading() {
        removeLoadingBubble(loadingNode);
        loadingNode = null;
      }

      try {
        var confirmed = await confirmAllowedSameDayRematchIfNeeded(
          method,
          url,
          payload,
          btn
        );
        if (!confirmed) return;

        loadingNode = appendLoadingBubble();
        var res = await fetch(url, requestOptions(method, url, payload));
        var text = await res.text();
        clearLoading();
        if (res.ok) {
          successHandler.handleWriteSuccess(method, url, payload, text);
        } else {
          await errorHandler.handleWriteError(method, url, payload, res, text);
        }
      } catch (e) {
        clearLoading();
        appendErrorTechnical(
          e && e.message ? e.message : String(e),
          "League API request failed"
        );
      } finally {
        clearLoading();
        if (btn) btn.disabled = false;
      }
    }

    return { submitBackendAction: submitBackendAction };
  }

  api.createWriteActionController = createWriteActionController;
})(typeof window !== "undefined" ? window : this);
