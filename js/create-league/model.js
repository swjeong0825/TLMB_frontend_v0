(function (global) {
  "use strict";

  var api = global.TLCHAT_CREATE_LEAGUE = global.TLCHAT_CREATE_LEAGUE || {};

  var DEFAULT_LEAGUE_TIMEZONE = "America/Los_Angeles";
  var LEAGUE_TIMEZONE_OPTIONS = [
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/Phoenix",
    "America/Anchorage",
    "Pacific/Honolulu",
    "Asia/Seoul",
    "UTC",
  ];

  function browserTimezone() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return tz || DEFAULT_LEAGUE_TIMEZONE;
    } catch (_e) {
      return DEFAULT_LEAGUE_TIMEZONE;
    }
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

  function readInitialPlayersChips(form) {
    var wrap = form.querySelector("[data-initial-players-chips]");
    if (!wrap) return [];
    var nodes = wrap.querySelectorAll(".chip[data-chip-name]");
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var name = nodes[i].getAttribute("data-chip-name");
      if (name) out.push(name);
    }
    return out;
  }

  function buildPayload(form) {
    var title = (form.title.value || "").trim();
    var hostEmail = (form.host_email && form.host_email.value || "")
      .trim()
      .toLowerCase();
    var desc = (form.description.value || "").trim();
    var payload = { title: title, host_email: hostEmail };
    if (desc) payload.description = desc;

    var autoRegister = !!(
      form.auto_register_players_on_match &&
      form.auto_register_players_on_match.checked
    );
    var mpi = form.pair_matchup_idempotency.value;
    var subject =
      form.ranking_subject && form.ranking_subject.value
        ? form.ranking_subject.value
        : "player";
    var otpp = !!(
      form.one_pair_per_player && form.one_pair_per_player.checked
    );
    var tieBreakers = collectTieBreakers(form);
    if (!tieBreakers.length) tieBreakers = ["games_won"];
    var leagueTimezone =
      form.league_timezone && form.league_timezone.value
        ? form.league_timezone.value
        : DEFAULT_LEAGUE_TIMEZONE;
    payload.league_timezone = leagueTimezone;
    payload.rules = {
      version: 8,
      pair_matchup_idempotency: mpi,
      one_pair_per_player: otpp,
      ranking_subject: subject,
      tie_breakers: tieBreakers,
      auto_register_players_on_match: autoRegister,
    };

    var initialPlayers = readInitialPlayersChips(form);
    if (initialPlayers.length > 0) {
      payload.initial_players = initialPlayers;
    }
    return payload;
  }

  function applyCrossRule(form, source) {
    var subjectSel = form.ranking_subject;
    var otppSel = form.one_pair_per_player;
    if (!subjectSel || !otppSel) return;
    if (source === "ranking_subject" && subjectSel.value === "player") {
      if (otppSel.checked) otppSel.checked = false;
      return;
    }
    if (source === "one_pair_per_player" && otppSel.checked) {
      if (subjectSel.value !== "pair") subjectSel.value = "pair";
      return;
    }
  }

  function validateCreateLeagueForm(form, payload) {
    if (!payload.title) {
      return { ok: false, message: api.t("enterTitle") };
    }
    if (!payload.host_email) {
      return {
        ok: false,
        message: api.t("enterHostEmail"),
        focusEl: form.host_email || null,
      };
    }
    // Cheap structural check before hitting the backend; full RFC
    // validation lives server-side in Pydantic EmailStr.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.host_email)) {
      return {
        ok: false,
        message: api.t("invalidHostEmail"),
        focusEl: form.host_email || null,
      };
    }
    // With `auto_register_players_on_match=false`, matches submitted with
    // an unknown nickname are rejected. Seeding `initial_players` at
    // create time is the most common way to bootstrap the roster, but
    // it's not required (the host can always add players after the fact).
    if (
      form.auto_register_players_on_match &&
      !form.auto_register_players_on_match.checked &&
      (!payload.initial_players || payload.initial_players.length === 0)
    ) {
      var wrap = form.querySelector("[data-initial-players-chips]");
      return {
        ok: false,
        message: api.t("initialPlayersRequiredError"),
        focusEl: wrap && wrap.querySelector(".chips-input-field"),
      };
    }
    return { ok: true };
  }

  api.DEFAULT_LEAGUE_TIMEZONE = DEFAULT_LEAGUE_TIMEZONE;
  api.LEAGUE_TIMEZONE_OPTIONS = LEAGUE_TIMEZONE_OPTIONS;
  api.browserTimezone = browserTimezone;
  api.collectTieBreakers = collectTieBreakers;
  api.readInitialPlayersChips = readInitialPlayersChips;
  api.buildPayload = buildPayload;
  api.applyCrossRule = applyCrossRule;
  api.validateCreateLeagueForm = validateCreateLeagueForm;
})(window);
