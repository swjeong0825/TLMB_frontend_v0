(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  function tr() { return api.tr.apply(api, arguments); }
  function escapeHtml() { return api.escapeHtml.apply(api, arguments); }

  function getUserIntents() {
    return [
      {
        name: "SUBMIT_MATCH_RESULT",
        desc:
          tr("intentSubmitMatchDesc") ||
          "Record a doubles match result.",
        examples: [
          tr("intentSubmitMatchEx1") || "record a match",
          tr("intentSubmitMatchEx2") || "Jae + Jazz 6:4 DK + Casper",
          tr("intentSubmitMatchEx3") || "Alice and Bob beat Charlie and Diana 6 to 3",
        ],
      },
      {
        name: "GET_STANDINGS",
        desc:
          tr("intentGetStandingsDesc") ||
          "League leaderboard (pairs or players).",
        examples: [
          tr("intentGetStandingsEx1") || "show me the standings",
          tr("intentGetStandingsEx2") || "who's winning the league?",
          tr("intentGetStandingsEx3") || "what's the current leaderboard?",
        ],
      },
      {
        name: "GET_STANDINGS_BY_PLAYER",
        desc:
          tr("intentGetStandingsByPlayerDesc") ||
          "One player's standings row.",
        examples: [
          tr("intentGetStandingsByPlayerEx1") || "what's Alice's rank in the league?",
          tr("intentGetStandingsByPlayerEx2") || "where does Bob's pair stand?",
          tr("intentGetStandingsByPlayerEx3") || "show me Charlie's standing",
        ],
      },
      {
        name: "GET_MATCH_HISTORY",
        desc: tr("intentGetMatchHistoryDesc") || "All match results, newest first.",
        examples: [
          tr("intentGetMatchHistoryEx1") || "show me all the matches",
          tr("intentGetMatchHistoryEx2") || "what matches have been played?",
          tr("intentGetMatchHistoryEx3") || "what were the recent results?",
        ],
      },
      {
        name: "GET_MATCH_HISTORY_BY_PLAYER",
        desc:
          tr("intentGetMatchHistoryByPlayerDesc") ||
          "One player's match history.",
        examples: [
          tr("intentGetMatchHistoryByPlayerEx1") || "show me Alice's match history",
          tr("intentGetMatchHistoryByPlayerEx2") || "what matches has Bob played?",
          tr("intentGetMatchHistoryByPlayerEx3") || "matches involving Charlie",
        ],
      },
      {
        name: "GET_ROSTER",
        desc: tr("intentGetRosterDesc") || "All registered players and pairs.",
        examples: [
          tr("intentGetRosterEx1") || "show me all the players",
          tr("intentGetRosterEx2") || "who's in the league?",
          tr("intentGetRosterEx3") || "list all pairs",
        ],
      },
    ];
  }

  function getAdminIntents() {
    return [
      {
        name: "EDIT_PLAYER_NICKNAME",
        desc: tr("intentEditNickDesc") || "Change a player's nickname.",
        examples: [
          tr("intentEditNickEx1") || "rename Alice to Alicia",
          tr("intentEditNickEx2") || "change John's nickname to Johnny",
        ],
      },
      {
        name: "EDIT_MATCH_SCORE",
        desc:
          tr("intentEditScoreDesc") ||
          "Fix a logged match score (via form).",
        examples: [
          tr("intentEditScoreEx1") || "edit match score for Alice",
          tr("intentEditScoreEx2") || "fix a match score involving Alice and Bob",
          tr("intentEditScoreEx3") || "correct the score of the match Alice and Bob vs Charlie and Diana",
        ],
      },
      {
        name: "DELETE_MATCH",
        desc: tr("intentDeleteMatchDesc") || "Delete a match (four nicknames).",
        examples: [tr("intentDeleteMatchEx1") || "delete the match between Alice/Bob and Charlie/Diana"],
      },
      {
        name: "DELETE_PAIR",
        desc: tr("intentDeletePairDesc") || "Delete a pair with no matches.",
        examples: [tr("intentDeletePairEx1") || "delete the pair Alice and Bob"],
      },
      {
        name: "ADD_PLAYERS_TO_ROSTER",
        desc:
          tr("intentAddPlayersToRosterDesc") ||
          "Pre-register one or more players on the roster.",
        examples: [
          tr("intentAddPlayersToRosterEx1") || "add Alex and Daniel to the roster",
          tr("intentAddPlayersToRosterEx2") || "allow Jason to play",
        ],
      },
      {
        name: "REMOVE_PLAYER_FROM_ROSTER",
        desc:
          tr("intentRemovePlayerFromRosterDesc") ||
          "Remove one pre-registered player from the roster.",
        examples: [
          tr("intentRemovePlayerFromRosterEx1") || "remove Michael from the roster",
          tr("intentRemovePlayerFromRosterEx2") || "drop Ryan from the roster",
        ],
      },
    ];
  }

  function renderIntentGroup(title, intents, groupClass) {
    var h = '<div class="intent-group ' + escapeHtml(groupClass) + '">';
    if (title) {
      h += '<div class="intent-group-title">' + escapeHtml(title) + "</div>";
    }
    intents.forEach(function (intent) {
      var exHtml = "";
      intent.examples.forEach(function (ex) {
        exHtml += '<span class="intent-ex">&ldquo;' + escapeHtml(ex) + "&rdquo;</span>";
      });
      h += '<details class="intent-item intent-accordion">';
      h += '<summary class="intent-item-summary">';
      h += '<span class="intent-chevron" aria-hidden="true"></span>';
      h += '<span class="intent-name">' + escapeHtml(intent.name) + "</span>";
      h += "</summary>";
      h += '<div class="intent-item-details">';
      h += '<div class="intent-desc">' + escapeHtml(intent.desc) + "</div>";
      h += '<div class="intent-examples">' + exHtml + "</div>";
      h += "</div>";
      h += "</details>";
    });
    h += "</div>";
    return h;
  }

  api.getUserIntents = getUserIntents;
  api.getAdminIntents = getAdminIntents;
  api.renderIntentGroup = renderIntentGroup;
})(typeof window !== "undefined" ? window : this);
