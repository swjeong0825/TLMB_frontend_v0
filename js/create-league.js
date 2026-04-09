(function () {
  "use strict";

  function t(key, params) {
    var I = window.TLCHAT_I18N;
    if (!I || typeof I.t !== "function") return "";
    return I.t("createLeague." + key, params);
  }

  function backendBase() {
    var c = window.TLCHAT_CONFIG || {};
    var u = c.backendMainBaseUrl;
    if (!u || typeof u !== "string") {
      console.error("TLCHAT_CONFIG.backendMainBaseUrl missing; set in js/config.js");
      return "";
    }
    return u.replace(/\/$/, "");
  }

  function technicalFromResponse(status, bodyText) {
    var t = String(status || "") + " " + String(bodyText || "");
    try {
      var j = JSON.parse(bodyText);
      if (j && j.error) t += " " + String(j.error);
      if (j && j.detail !== undefined) t += " " + JSON.stringify(j.detail);
    } catch (_e) {
      /* ignore */
    }
    return t;
  }

  function userMessageFromResponse(status, bodyText) {
    try {
      var j = JSON.parse(bodyText);
      if (j && j.error === "LeagueTitleAlreadyExistsError") {
        return t("titleExists");
      }
    } catch (_e) {
      /* ignore */
    }
    var ufe = window.TLCHAT_USER_FACING_ERRORS;
    if (ufe && typeof ufe.fromTechnical === "function") {
      return ufe.fromTechnical(technicalFromResponse(status, bodyText));
    }
    var I = window.TLCHAT_I18N;
    if (I && typeof I.t === "function") return I.t("findLeagueJs.genericError");
    return "Something went wrong. Please try again.";
  }

  function buildPayload(form) {
    var title = (form.title.value || "").trim();
    var desc = (form.description.value || "").trim();
    var payload = { title: title };
    if (desc) payload.description = desc;

    var details = form.querySelector("details.create-league-advanced");
    if (details && details.open) {
      var mpi = form.match_pair_idempotency.value;
      var otpp = form.one_team_per_player.checked;
      payload.rules = {
        version: 1,
        match_pair_idempotency: mpi,
        one_team_per_player: otpp,
      };
    }
    return payload;
  }

  function setHidden(el, hidden) {
    el.hidden = !!hidden;
    if (hidden) el.setAttribute("aria-hidden", "true");
    else el.removeAttribute("aria-hidden");
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

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("create-league-form");
    var submitBtn = document.getElementById("create-league-submit");
    var errEl = document.getElementById("create-league-error");
    var successEl = document.getElementById("create-league-success");
    if (!form || !submitBtn) return;

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

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      setHidden(errEl, true);
      setHidden(successEl, true);

      var base = backendBase();
      if (!base) {
        errEl.textContent =
          window.TLCHAT_I18N && window.TLCHAT_I18N.t
            ? window.TLCHAT_I18N.t("findLeagueJs.backendNotConfigured")
            : "Backend URL is not configured.";
        setHidden(errEl, false);
        return;
      }

      var payload = buildPayload(form);
      if (!payload.title) {
        errEl.textContent = t("enterTitle");
        setHidden(errEl, false);
        return;
      }

      submitBtn.disabled = true;
      fetch(base + "/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.text().then(function (text) {
            return { res: res, text: text };
          });
        })
        .then(function (_ref) {
          var res = _ref.res;
          var text = _ref.text;
          if (res.ok) {
            var data;
            try {
              data = JSON.parse(text);
            } catch (parseErr) {
              errEl.textContent =
                window.TLCHAT_I18N && window.TLCHAT_I18N.t
                  ? window.TLCHAT_I18N.t("findLeagueJs.unexpectedResponse")
                  : "The server returned an unexpected response.";
              setHidden(errEl, false);
              return;
            }
            if (!data.league_id || !data.host_token) {
              errEl.textContent = t("missingIds");
              setHidden(errEl, false);
              return;
            }
            document.getElementById("out-league-id").textContent = data.league_id;
            document.getElementById("out-host-token").textContent = data.host_token;

            var playerUrl =
              "/league/?" +
              new URLSearchParams({ league_id: data.league_id }).toString();
            var adminUrl =
              "/league/?" +
              new URLSearchParams({ league_id: data.league_id, host_token: data.host_token }).toString();
            var linkPlayer = document.getElementById("link-player");
            var linkAdmin = document.getElementById("link-admin");
            linkPlayer.href = playerUrl;
            linkAdmin.href = adminUrl;

            form.reset();
            var adv = form.querySelector("details.create-league-advanced");
            if (adv) adv.open = false;

            setHidden(successEl, false);
            successEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
            return;
          }
          errEl.textContent = userMessageFromResponse(res.status, text);
          setHidden(errEl, false);
        })
        .catch(function (err) {
          var ufe = window.TLCHAT_USER_FACING_ERRORS;
          var msg =
            ufe && typeof ufe.fromTechnical === "function"
              ? ufe.fromTechnical(String(err && err.message ? err.message : err))
              : window.TLCHAT_I18N && window.TLCHAT_I18N.t
                ? window.TLCHAT_I18N.t("findLeagueJs.networkError")
                : "We couldn’t reach the server.";
          errEl.textContent = msg;
          setHidden(errEl, false);
        })
        .then(function () {
          submitBtn.disabled = false;
        });
    });
  });
})();
