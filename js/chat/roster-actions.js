(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};
  var backendMainBase = api.backendMainBase;
  var friendlyMessageFromTechnicalError = api.friendlyMessageFromTechnicalError;
  var leagueApiJsonErrorCode = api.leagueApiJsonErrorCode;
  var tr = api.tr;
  var tryParseJson = api.tryParseJson;

  function createRosterActionApi(ctx) {
    ctx = ctx || {};
    var route = ctx.route || {};

    function adminLeaguePath() {
      return (
        backendMainBase() +
        "/admin/leagues/" +
        encodeURIComponent(route.leagueId)
      );
    }

    function adminHeaders(includeJson) {
      var headers = { "X-Host-Token": route.hostToken || "" };
      if (includeJson) headers["Content-Type"] = "application/json";
      return headers;
    }

    function aliasApiErrorMessage(status, text) {
      var code = leagueApiJsonErrorCode(text);
      if (status === 409 && code === "NicknameAlreadyInUseError") {
        return tr("aliasAlreadyExists") || "That nickname is already in use.";
      }
      if (status === 422 && code === "CannotRemoveCanonicalNicknameError") {
        return (
          tr("aliasCannotRemoveCanonical") ||
          "The canonical nickname cannot be removed as an alias."
        );
      }
      if (status === 422 && code === "LastNicknameError") {
        return (
          tr("aliasLastNickname") ||
          "A player must keep at least one nickname."
        );
      }
      return friendlyMessageFromTechnicalError(text);
    }

    async function addPlayers(nicknames) {
      var url = adminLeaguePath() + "/players";
      var res = await fetch(url, {
        method: "POST",
        headers: adminHeaders(true),
        body: JSON.stringify({ nicknames: nicknames }),
      });
      var txt = await res.text();
      if (res.ok) return txt ? tryParseJson(txt) : {};
      if (
        res.status === 409 &&
        leagueApiJsonErrorCode(txt) === "NicknameAlreadyInUseError"
      ) {
        throw new Error(
          tr("playersPanelAlreadyExists") ||
            "One or more nicknames are already on the roster."
        );
      }
      throw new Error(friendlyMessageFromTechnicalError(txt));
    }

    async function removePlayer(playerId, nickname) {
      if (!playerId || !route.hostToken) return false;
      var url = adminLeaguePath() + "/players/" + encodeURIComponent(playerId);
      var res = await fetch(url, {
        method: "DELETE",
        headers: adminHeaders(false),
      });
      if (res.ok) return true;
      var txt = await res.text();
      if (
        res.status === 409 &&
        leagueApiJsonErrorCode(txt) === "PlayerHasParticipationError"
      ) {
        throw new Error(
          tr("playersPanelRemoveBlockedByParticipation", { name: nickname }) ||
            tr("playersPanelRemoveBlockedByParticipation") ||
            nickname +
              " has matches recorded and can't be removed. Delete the matches first."
        );
      }
      throw new Error(friendlyMessageFromTechnicalError(txt));
    }

    async function addAlias(playerId, alias) {
      var url =
        adminLeaguePath() +
        "/players/" +
        encodeURIComponent(playerId) +
        "/aliases";
      var res = await fetch(url, {
        method: "POST",
        headers: adminHeaders(true),
        body: JSON.stringify({ alias: alias }),
      });
      var txt = await res.text();
      if (res.ok) return txt ? tryParseJson(txt) : {};
      throw new Error(aliasApiErrorMessage(res.status, txt));
    }

    async function removeAlias(playerId, alias) {
      var url =
        adminLeaguePath() +
        "/players/" +
        encodeURIComponent(playerId) +
        "/aliases/" +
        encodeURIComponent(alias);
      var res = await fetch(url, {
        method: "DELETE",
        headers: adminHeaders(false),
      });
      var txt = await res.text();
      if (res.ok) return true;
      throw new Error(aliasApiErrorMessage(res.status, txt));
    }

    return {
      addAlias: addAlias,
      addPlayers: addPlayers,
      removeAlias: removeAlias,
      removePlayer: removePlayer,
    };
  }

  api.createRosterActionApi = createRosterActionApi;
})(typeof window !== "undefined" ? window : this);
