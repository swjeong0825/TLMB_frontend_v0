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
      bindStandingsDateControls(panel, dataType, isAdmin);
    }

    async function fetchAndRenderStandingsPanel(
      panel,
      dataType,
      playerName,
      startDate,
      endDate,
      isAdmin,
      subject
    ) {
      var result = await fetchLeagueStandings(
        route.leagueId,
        dataType,
        playerName,
        startDate,
        endDate,
        subject
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
        .querySelectorAll(".standings-subject-option")
        .forEach(function (btn) {
          btn.disabled = !!busy;
        });
    }

    async function fetchSelectedStandingsSubject(panel, subject, isAdmin) {
      await ensureLeagueRosterForStandingsDefault();
      var latestDate = dateOnlyOrNull(leagueRoster.latest_match_date) || "";
      return fetchAndRenderStandingsPanel(
        panel,
        "GET_STANDINGS",
        "",
        latestDate,
        latestDate,
        isAdmin,
        subject
      );
    }

    function bindStandingsSubjectChooserActions() {
      if (!messagesEl || !messagesEl.addEventListener) return;
      messagesEl.addEventListener("click", async function (e) {
        var btn = e.target.closest && e.target.closest(".standings-subject-option");
        if (!btn || !messagesEl.contains(btn)) return;
        var subject = btn.getAttribute("data-standings-subject") || "";
        if (subject !== "pair" && subject !== "player") return;
        var panel = btn.closest(".data-panel");
        var chooser = btn.closest(".standings-subject-chooser");
        if (!panel || !chooser) return;

        showStandingsSubjectMessage(
          chooser,
          tr("standingsSubjectLoading") || "Loading standings..."
        );
        setStandingsSubjectBusy(chooser, true);
        try {
          var result = await fetchSelectedStandingsSubject(
            panel,
            subject,
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
          console.warn("[TLCHAT] Standings subject fetch failed:", err);
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
            subject
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

    async function resolveInitialStandingsData(dataType, data) {
      if (!isStandingsDataType(dataType)) return data || {};
      await ensureLeagueRosterForStandingsDefault();
      var latestDate = dateOnlyOrNull(leagueRoster.latest_match_date);
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
        data && data._standings_subject
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
        return nextData;
      }
      console.warn("[TLCHAT] Latest-day standings fetch failed:", result);
      return cloneStandingsDataWithDateFilter(data || {}, latestDate, latestDate);
    }

    return {
      bindStandingsDateControls: bindStandingsDateControls,
      bindStandingsSubjectChooserActions: bindStandingsSubjectChooserActions,
      isStandingsDataType: isStandingsDataType,
      resolveInitialStandingsData: resolveInitialStandingsData,
    };
  }

  api.createStandingsInteractionController = createStandingsInteractionController;
})(typeof window !== "undefined" ? window : this);
