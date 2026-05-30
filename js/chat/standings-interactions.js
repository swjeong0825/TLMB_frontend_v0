(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  var tr = api.tr;
  var dateOnlyOrNull = api.dateOnlyOrNull;
  var fetchLeagueRoster = api.fetchLeagueRoster;
  var fetchLeagueStandings = api.fetchLeagueStandings;
  var cloneStandingsDataWithDateFilter = api.cloneStandingsDataWithDateFilter;
  var renderReadPanelBody = api.renderReadPanelBody;

  function createStandingsInteractionController(ctx) {
    ctx = ctx || {};
    var route = ctx.route || {};
    var leagueRoster = ctx.leagueRoster || {};
    var applyLeagueRosterResult = ctx.applyLeagueRosterResult;
    var messagesEl = ctx.messagesEl || null;

    async function ensureLeagueRosterForStandingsDefault() {
      if (leagueRoster.status === "ok") return leagueRoster;
      try {
        var result = await fetchLeagueRoster(route.leagueId);
        if (result.ok && typeof applyLeagueRosterResult === "function") {
          applyLeagueRosterResult(result);
        } else {
          console.warn("[TLCHAT] Standings default roster fetch failed:", result);
        }
      } catch (err) {
        console.warn("[TLCHAT] Standings default roster fetch failed:", err);
      }
      return leagueRoster;
    }

    function isStandingsDataType(dataType) {
      return dataType === "GET_STANDINGS" || dataType === "GET_STANDINGS_BY_PLAYER";
    }

    function showStandingsDateError(form, message) {
      var errorEl = form && form.querySelector("[data-standings-date-error]");
      if (!errorEl) return;
      errorEl.textContent = message || "";
      errorEl.hidden = !message;
    }

    function setStandingsFilterBusy(form, busy) {
      if (!form) return;
      form
        .querySelectorAll("input, button")
        .forEach(function (el) {
          el.disabled = !!busy;
        });
    }

    function renderStandingsPanelInto(panel, dataType, data, isAdmin) {
      panel.innerHTML = renderReadPanelBody(dataType, data, isAdmin);
      bindStandingsScopeControls(panel, dataType, isAdmin);
      bindStandingsDateControls(panel, dataType, isAdmin);
    }

    async function fetchAndRenderStandingsPanel(
      panel,
      dataType,
      playerName,
      startDate,
      endDate,
      isAdmin,
      subject,
      scope
    ) {
      var result = await fetchLeagueStandings(
        route.leagueId,
        dataType,
        playerName,
        startDate,
        endDate,
        subject,
        scope
      );
      if (!result.ok) return result;
      var nextData = cloneStandingsDataWithDateFilter(
        result.data || {},
        startDate,
        endDate
      );
      if (playerName) nextData.player_name = playerName;
      if (subject === "pair" || subject === "player") {
        nextData._standings_subject = subject;
      }
      nextData._standings_scope =
        scope === "singles" || scope === "both" ? scope : "doubles";
      renderStandingsPanelInto(panel, dataType, nextData, isAdmin);
      return result;
    }

    function showStandingsSubjectMessage(chooser, message) {
      var messageEl = chooser && chooser.querySelector("[data-standings-subject-message]");
      if (!messageEl) return;
      messageEl.textContent = message || "";
      messageEl.hidden = !message;
    }

    function setStandingsSubjectBusy(chooser, busy) {
      if (!chooser) return;
      chooser
        .querySelectorAll(".standings-subject-option, .standings-scope-option")
        .forEach(function (btn) {
          btn.disabled = !!busy;
        });
    }

    function latestDateForSelectedScope(scope) {
      if (scope === "singles") {
        return dateOnlyOrNull(leagueRoster.latest_match_date_single) || "";
      }
      if (scope === "both") {
        return dateOnlyOrNull(leagueRoster.latest_activity_date) || "";
      }
      return dateOnlyOrNull(leagueRoster.latest_match_date) || "";
    }

    async function fetchSelectedStandingsSubject(panel, subject, scope, isAdmin) {
      await ensureLeagueRosterForStandingsDefault();
      var effectiveScope =
        subject === "player" && (scope === "singles" || scope === "both")
          ? scope
          : "doubles";
      var latestDate = latestDateForSelectedScope(effectiveScope);
      return fetchAndRenderStandingsPanel(
        panel,
        "GET_STANDINGS",
        "",
        latestDate,
        latestDate,
        isAdmin,
        subject,
        effectiveScope
      );
    }

    // `markActiveScope` is true only once the user actually picks a scope;
    // revealing the options after a subject pick leaves them un-highlighted.
    function setChooserSelection(chooser, subject, scope, markActiveScope) {
      if (!chooser) return;
      var effectiveScope =
        subject === "player" && (scope === "singles" || scope === "both")
          ? scope
          : "doubles";
      chooser
        .querySelectorAll(".standings-subject-option")
        .forEach(function (btn) {
          btn.classList.toggle(
            "is-active",
            btn.getAttribute("data-standings-subject") === subject
          );
        });
      var scopeChooser = chooser.querySelector("[data-standings-scope-chooser]");
      if (scopeChooser) {
        scopeChooser.setAttribute("data-selected-subject", subject || "");
        scopeChooser.setAttribute("data-selected-scope", effectiveScope);
        // Scope options stay hidden until a subject is chosen.
        scopeChooser.hidden = subject !== "pair" && subject !== "player";
      }
      chooser
        .querySelectorAll(".standings-scope-option")
        .forEach(function (btn) {
          var key = btn.getAttribute("data-standings-scope") || "";
          // Pair standings only exist for doubles; lock Singles/Both.
          var locked = subject === "pair" && key !== "doubles";
          btn.classList.toggle(
            "is-active",
            !!markActiveScope && key === effectiveScope
          );
          btn.disabled = locked;
          var wrap = btn.closest(".standings-scope-wrap");
          if (wrap) {
            wrap.classList.toggle("standings-scope-wrap--disabled", locked);
          }
        });
      var helper = chooser.querySelector(".standings-scope-helper");
      if (helper) {
        helper.hidden = subject !== "pair";
      }
    }

    function bindStandingsSubjectChooserActions() {
      if (!messagesEl || !messagesEl.addEventListener) return;
      messagesEl.addEventListener("click", function (e) {
        var btn = e.target.closest && e.target.closest(".standings-subject-option");
        if (!btn || !messagesEl.contains(btn)) return;
        var subject = btn.getAttribute("data-standings-subject") || "";
        if (subject !== "pair" && subject !== "player") return;
        var chooser = btn.closest(".standings-subject-chooser");
        if (!chooser) return;

        // Selecting a subject only reveals the scope options; the standings
        // load once the user picks a scope (Doubles / Singles / Both).
        var scopeChooser = chooser.querySelector("[data-standings-scope-chooser]");
        var scope =
          subject === "pair"
            ? "doubles"
            : scopeChooser && scopeChooser.getAttribute("data-selected-scope")
              ? scopeChooser.getAttribute("data-selected-scope")
              : "doubles";
        showStandingsSubjectMessage(chooser, "");
        setChooserSelection(chooser, subject, scope);
      });

      messagesEl.addEventListener("click", async function (e) {
        var btn = e.target.closest && e.target.closest(".standings-scope-option");
        if (!btn || !messagesEl.contains(btn)) return;
        var chooser = btn.closest(".standings-subject-chooser");
        var panel = btn.closest(".data-panel");
        if (!chooser || !panel || btn.disabled) return;
        var scopeChooser = chooser.querySelector("[data-standings-scope-chooser]");
        var subject =
          scopeChooser && scopeChooser.getAttribute("data-selected-subject");
        if (subject !== "pair" && subject !== "player") return;
        var scope = btn.getAttribute("data-standings-scope") || "doubles";
        setChooserSelection(chooser, subject, scope, true);
        showStandingsSubjectMessage(
          chooser,
          tr("standingsSubjectLoading") || "Loading standings..."
        );
        setStandingsSubjectBusy(chooser, true);
        try {
          var result = await fetchSelectedStandingsSubject(
            panel,
            subject,
            scope,
            !!route.hostToken
          );
          if (!result || !result.ok) {
            showStandingsSubjectMessage(
              chooser,
              tr("standingsSubjectFetchFailed") || "Could not load those standings."
            );
            setStandingsSubjectBusy(chooser, false);
          }
        } catch (err) {
          console.warn("[TLCHAT] Standings scope fetch failed:", err);
          showStandingsSubjectMessage(
            chooser,
            tr("standingsSubjectFetchFailed") || "Could not load those standings."
          );
          setStandingsSubjectBusy(chooser, false);
        }
      });
    }

    function bindStandingsDateControls(scope, dataType, isAdmin) {
      if (!isStandingsDataType(dataType)) return;
      var panel = scope && scope.classList && scope.classList.contains("data-panel")
        ? scope
        : scope && scope.querySelector
          ? scope.querySelector(".data-panel")
          : null;
      if (!panel) return;
      var form = panel.querySelector("[data-standings-date-filter]");
      if (!form) return;
      var startInput = form.querySelector('input[name="start_date"]');
      var endInput = form.querySelector('input[name="end_date"]');
      var clearBtn = form.querySelector("[data-standings-clear]");
      var playerName = form.getAttribute("data-player-name") || "";
      var subject = form.getAttribute("data-standings-subject") || "";
      var scopeValue = form.getAttribute("data-standings-scope") || "doubles";

      async function applyFilter(startDate, endDate) {
        showStandingsDateError(form, "");
        if (startDate && endDate && startDate > endDate) {
          showStandingsDateError(
            form,
            tr("standingsDateRangeInvalid") ||
              "Start date must be on or before end date."
          );
          return;
        }
        setStandingsFilterBusy(form, true);
        try {
          var result = await fetchAndRenderStandingsPanel(
            panel,
            dataType,
            playerName,
            startDate,
            endDate,
            isAdmin,
            subject,
            scopeValue
          );
          if (!result || !result.ok) {
            showStandingsDateError(
              form,
              tr("standingsFilterFailed") ||
                "Could not update standings for those dates."
            );
          }
        } catch (err) {
          console.warn("[TLCHAT] Standings filter fetch failed:", err);
          showStandingsDateError(
            form,
            tr("standingsFilterFailed") ||
              "Could not update standings for those dates."
          );
        } finally {
          if (document.body.contains(form)) setStandingsFilterBusy(form, false);
        }
      }

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        applyFilter(startInput ? startInput.value : "", endInput ? endInput.value : "");
      });

      if (clearBtn) {
        clearBtn.addEventListener("click", function () {
          if (startInput) startInput.value = "";
          if (endInput) endInput.value = "";
          applyFilter("", "");
        });
      }
    }

    function bindStandingsScopeControls(scope, dataType, isAdmin) {
      if (!isStandingsDataType(dataType)) return;
      var panel = scope && scope.classList && scope.classList.contains("data-panel")
        ? scope
        : scope && scope.querySelector
          ? scope.querySelector(".data-panel")
          : null;
      if (!panel) return;
      var controls = panel.querySelector("[data-standings-inline-scope-controls]");
      if (!controls) return;
      controls.querySelectorAll("[data-standings-inline-scope]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var selectedScope = btn.getAttribute("data-standings-inline-scope") || "doubles";
          var playerName = controls.getAttribute("data-player-name") || "";
          var subject = controls.getAttribute("data-standings-subject") || "player";
          await ensureLeagueRosterForStandingsDefault();
          var latestDate = latestDateForSelectedScope(selectedScope);
          var startDate = latestDate;
          var endDate = latestDate;
          controls.querySelectorAll("button").forEach(function (b) {
            b.disabled = true;
          });
          try {
            await fetchAndRenderStandingsPanel(
              panel,
              dataType,
              playerName,
              startDate,
              endDate,
              isAdmin,
              subject,
              selectedScope
            );
          } catch (err) {
            console.warn("[TLCHAT] Standings scope fetch failed:", err);
          } finally {
            if (document.body.contains(controls)) {
              controls.querySelectorAll("button").forEach(function (b) {
                b.disabled = false;
              });
            }
          }
        });
      });
    }

    async function resolveInitialStandingsData(dataType, data) {
      if (!isStandingsDataType(dataType)) return data || {};
      await ensureLeagueRosterForStandingsDefault();
      var initialScope =
        data && (data._standings_scope === "singles" || data._standings_scope === "both")
          ? data._standings_scope
          : "doubles";
      var latestDate = latestDateForSelectedScope(initialScope);
      if (!latestDate) return data || {};
      var playerName =
        dataType === "GET_STANDINGS_BY_PLAYER" && data && data.player_name != null
          ? String(data.player_name).trim()
          : "";
      var result = await fetchLeagueStandings(
        route.leagueId,
        dataType,
        playerName,
        latestDate,
        latestDate,
        data && data._standings_subject,
        data && data._standings_scope
      );
      if (result.ok) {
        var nextData = cloneStandingsDataWithDateFilter(
          result.data || {},
          latestDate,
          latestDate
        );
        if (playerName) nextData.player_name = playerName;
        if (data && data._standings_subject) {
          nextData._standings_subject = data._standings_subject;
        }
        if (data && data._standings_scope) {
          nextData._standings_scope = data._standings_scope;
        }
        return nextData;
      }
      console.warn("[TLCHAT] Latest-day standings fetch failed:", result);
      return cloneStandingsDataWithDateFilter(data || {}, latestDate, latestDate);
    }

    return {
      bindStandingsDateControls: bindStandingsDateControls,
      bindStandingsScopeControls: bindStandingsScopeControls,
      bindStandingsSubjectChooserActions: bindStandingsSubjectChooserActions,
      isStandingsDataType: isStandingsDataType,
      resolveInitialStandingsData: resolveInitialStandingsData,
    };
  }

  api.createStandingsInteractionController = createStandingsInteractionController;
})(typeof window !== "undefined" ? window : this);
