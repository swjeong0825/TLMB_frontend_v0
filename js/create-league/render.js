(function (global) {
  "use strict";

  var api = global.TLCHAT_CREATE_LEAGUE = global.TLCHAT_CREATE_LEAGUE || {};

  function renderCreateLeagueSuccess(form, successEl, data) {
    var tokenEl = document.getElementById("out-host-token");
    if (tokenEl) tokenEl.textContent = data.host_token;

    var playerUrl =
      "/league/?" +
      new URLSearchParams({ league_id: data.league_id }).toString();
    var adminUrl =
      "/league/?" +
      new URLSearchParams({
        league_id: data.league_id,
        host_token: data.host_token,
      }).toString();
    var linkPlayer = document.getElementById("link-player");
    var linkAdmin = document.getElementById("link-admin");
    var origin = global.location.origin || "";
    if (linkPlayer) {
      linkPlayer.href = origin ? new URL(playerUrl, origin).href : playerUrl;
    }
    if (linkAdmin) {
      linkAdmin.href = origin ? new URL(adminUrl, origin).href : adminUrl;
    }

    form.reset();
    api.clearInitialPlayersUi(form);
    var adv = form.querySelector("details.create-league-advanced");
    if (adv) adv.open = false;

    api.setHidden(successEl, false);
    successEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  api.renderCreateLeagueSuccess = renderCreateLeagueSuccess;
})(window);
