(function () {
  "use strict";

  var api = window.TLCHAT_CREATE_LEAGUE || {};
  var t = api.t;
  var backendBase = api.backendBase;
  var setHidden = api.setHidden;
  var buildPayload = api.buildPayload;
  var validateCreateLeagueForm = api.validateCreateLeagueForm;
  var applyCrossRule = api.applyCrossRule;
  var setupLeagueTimezoneSelect = api.setupLeagueTimezoneSelect;
  var setupInitialPlayersChips = api.setupInitialPlayersChips;
  var createHelpModalController = api.createHelpModalController;
  var copyText = api.copyText;
  var postCreateLeague = api.postCreateLeague;
  var renderCreateLeagueSuccess = api.renderCreateLeagueSuccess;
  var userMessageFromResponse = api.userMessageFromResponse;
  var networkErrorMessage = api.networkErrorMessage;

  function focusIfPossible(el) {
    if (!el || typeof el.focus !== "function") return;
    try {
      el.focus();
    } catch (_e) {
      /* ignore */
    }
  }

  function i18nFallback(key, fallback) {
    var I = window.TLCHAT_I18N;
    if (I && typeof I.t === "function") return I.t(key);
    return fallback;
  }

  function showError(errEl, message, focusEl) {
    errEl.textContent = message;
    setHidden(errEl, false);
    focusIfPossible(focusEl);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("create-league-form");
    var submitBtn = document.getElementById("create-league-submit");
    var errEl = document.getElementById("create-league-error");
    var successEl = document.getElementById("create-league-success");
    if (!form || !submitBtn) return;

    var helpModal = document.getElementById("create-league-help-modal");
    var helpController = createHelpModalController({
      helpModal: helpModal,
      helpTitle: document.getElementById("create-league-help-title"),
      helpBody: document.getElementById("create-league-help-body"),
      helpClose: helpModal && helpModal.querySelector(".help-modal-close"),
      helpBackdrop: helpModal && helpModal.querySelector(".help-modal-backdrop"),
    });
    helpController.bind();

    if (form.ranking_subject) {
      form.ranking_subject.addEventListener("change", function () {
        applyCrossRule(form, "ranking_subject");
      });
    }
    if (form.one_pair_per_player) {
      form.one_pair_per_player.addEventListener("change", function () {
        applyCrossRule(form, "one_pair_per_player");
      });
    }

    setupLeagueTimezoneSelect(form);
    setupInitialPlayersChips(form);

    document.body.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-copy-target]");
      if (!btn) return;
      var id = btn.getAttribute("data-copy-target");
      var node = id && document.getElementById(id);
      if (!node) return;
      var text = (node.textContent || "").trim();
      if (!text) return;
      copyText(text).then(
        function () {
          var prev = btn.textContent;
          btn.textContent = t("copied");
          setTimeout(function () {
            btn.textContent = prev;
          }, 1500);
        },
        function () {
          btn.textContent = t("failed");
          setTimeout(function () {
            btn.textContent = t("copy");
          }, 1500);
        }
      );
    });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      setHidden(errEl, true);
      setHidden(successEl, true);

      var base = backendBase();
      if (!base) {
        showError(
          errEl,
          i18nFallback("findLeagueJs.backendNotConfigured", "Backend URL is not configured.")
        );
        return;
      }

      var payload = buildPayload(form);
      var validation = validateCreateLeagueForm(form, payload);
      if (!validation.ok) {
        showError(errEl, validation.message, validation.focusEl);
        return;
      }

      submitBtn.disabled = true;
      try {
        var result = await postCreateLeague(base, payload);
        if (result.ok) {
          renderCreateLeagueSuccess(form, successEl, result.data);
          return;
        }
        if (result.error === "parse") {
          showError(
            errEl,
            i18nFallback(
              "findLeagueJs.unexpectedResponse",
              "The server returned an unexpected response."
            )
          );
          return;
        }
        if (result.error === "missing_ids") {
          showError(errEl, t("missingIds"));
          return;
        }
        if (result.error === "http") {
          showError(errEl, userMessageFromResponse(result.status, result.body));
          return;
        }
        showError(errEl, networkErrorMessage(result.err || result.error));
      } finally {
        submitBtn.disabled = false;
      }
    });
  });
})();
