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

  function collectTieBreakers(form) {
    var slots = ["primary", "secondary", "tertiary"];
    var picked = [];
    var seen = {};
    for (var i = 0; i < slots.length; i++) {
      var sel = form.querySelector('[data-tie-breaker="' + slots[i] + '"]');
      if (!sel) continue;
      var v = (sel.value || "").trim();
      if (!v) continue;
      if (seen[v]) continue;
      seen[v] = true;
      picked.push(v);
    }
    return picked;
  }

  function buildPayload(form) {
    var title = (form.title.value || "").trim();
    var desc = (form.description.value || "").trim();
    var payload = { title: title };
    if (desc) payload.description = desc;

    var details = form.querySelector("details.create-league-advanced");
    if (details && details.open) {
      var mpi = form.match_pair_idempotency.value;
      var subject =
        form.ranking_subject && form.ranking_subject.value
          ? form.ranking_subject.value
          : "team";
      var otpp =
        form.one_team_per_player && form.one_team_per_player.value
          ? form.one_team_per_player.value === "true"
          : true;
      var tieBreakers = collectTieBreakers(form);
      if (!tieBreakers.length) tieBreakers = ["matches_won"];
      payload.rules = {
        version: 3,
        match_pair_idempotency: mpi,
        one_team_per_player: otpp,
        ranking_subject: subject,
        tie_breakers: tieBreakers,
      };
    }
    return payload;
  }

  function applyCrossRule(form, source) {
    var subjectSel = form.ranking_subject;
    var otppSel = form.one_team_per_player;
    if (!subjectSel || !otppSel) return;
    if (source === "ranking_subject" && subjectSel.value === "player") {
      if (otppSel.value !== "false") otppSel.value = "false";
      return;
    }
    if (source === "one_team_per_player" && otppSel.value === "true") {
      if (subjectSel.value !== "team") subjectSel.value = "team";
      return;
    }
  }

  function setHidden(el, hidden) {
    el.hidden = !!hidden;
    if (hidden) el.setAttribute("aria-hidden", "true");
    else el.removeAttribute("aria-hidden");
  }

  var HELP_KEYS = { matchPair: true, oneTeamPerPlayer: true, rankingSubject: true, tieBreakers: true };

  function fillHelpModalBody(container, text) {
    while (container.firstChild) container.removeChild(container.firstChild);
    var parts = String(text || "")
      .split(/\n\n+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      var p = document.createElement("p");
      p.textContent = parts[i];
      container.appendChild(p);
    }
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

    var helpModal = document.getElementById("create-league-help-modal");
    var helpTitle = document.getElementById("create-league-help-title");
    var helpBody = document.getElementById("create-league-help-body");
    var helpClose = helpModal && helpModal.querySelector(".help-modal-close");
    var helpBackdrop = helpModal && helpModal.querySelector(".help-modal-backdrop");
    var helpReturnFocus = null;

    function openHelpModal(key) {
      if (!helpModal || !helpTitle || !helpBody) return;
      if (!HELP_KEYS[key]) return;
      var I = window.TLCHAT_I18N;
      if (!I || typeof I.t !== "function") return;
      helpTitle.textContent = I.t("createLeague.help." + key + "Title");
      fillHelpModalBody(helpBody, I.t("createLeague.help." + key + "Body"));
      helpReturnFocus = document.activeElement;
      helpModal.hidden = false;
      document.body.style.overflow = "hidden";
      if (helpClose && typeof helpClose.focus === "function") {
        helpClose.focus();
      }
    }

    function closeHelpModal() {
      if (!helpModal || helpModal.hidden) return;
      helpModal.hidden = true;
      document.body.style.overflow = "";
      if (helpReturnFocus && typeof helpReturnFocus.focus === "function") {
        try {
          helpReturnFocus.focus();
        } catch (_e) {
          /* ignore */
        }
      }
      helpReturnFocus = null;
    }

    if (helpModal && helpClose && helpBackdrop) {
      helpClose.addEventListener("click", function () {
        closeHelpModal();
      });
      helpBackdrop.addEventListener("click", function () {
        closeHelpModal();
      });
      document.addEventListener("keydown", function (ev) {
        if (!helpModal.hidden && ev.key === "Escape") {
          ev.preventDefault();
          closeHelpModal();
        }
      });
      document.body.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest("[data-help-key]");
        if (!btn) return;
        var key = btn.getAttribute("data-help-key");
        if (!key || !HELP_KEYS[key]) return;
        ev.preventDefault();
        openHelpModal(key);
      });
    }

    if (form.ranking_subject) {
      form.ranking_subject.addEventListener("change", function () {
        applyCrossRule(form, "ranking_subject");
      });
    }
    if (form.one_team_per_player) {
      form.one_team_per_player.addEventListener("change", function () {
        applyCrossRule(form, "one_team_per_player");
      });
    }

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
            document.getElementById("out-host-token").textContent = data.host_token;

            var playerUrl =
              "/league/?" +
              new URLSearchParams({ league_id: data.league_id }).toString();
            var adminUrl =
              "/league/?" +
              new URLSearchParams({ league_id: data.league_id, host_token: data.host_token }).toString();
            var linkPlayer = document.getElementById("link-player");
            var linkAdmin = document.getElementById("link-admin");
            var origin = window.location.origin || "";
            linkPlayer.href = origin ? new URL(playerUrl, origin).href : playerUrl;
            linkAdmin.href = origin ? new URL(adminUrl, origin).href : adminUrl;

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
