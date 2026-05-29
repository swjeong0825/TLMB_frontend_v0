(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  function tr() { return api.tr.apply(api, arguments); }
  function escapeHtml() { return api.escapeHtml.apply(api, arguments); }
  function isFieldSpec() { return api.isFieldSpec.apply(api, arguments); }

  function rosterPlayerParticipationCounts(player, pairs) {
    var pairsCount =
      player && typeof player.pairs_count === "number" ? player.pairs_count : 0;
    var matchesCount =
      player && typeof player.matches_count === "number" ? player.matches_count : 0;
    if (pairsCount === 0 && pairs && pairs.length && player && player.nickname) {
      var nick = String(player.nickname).toLowerCase();
      pairs.forEach(function (t) {
        if (
          String(t.player1_nickname || "").toLowerCase() === nick ||
          String(t.player2_nickname || "").toLowerCase() === nick
        ) {
          pairsCount += 1;
        }
      });
    }
    return { pairsCount: pairsCount, matchesCount: matchesCount };
  }

  function rosterPlayerCanRemove(player, pairs) {
    var c = rosterPlayerParticipationCounts(player, pairs);
    return c.pairsCount === 0 && c.matchesCount === 0;
  }

  function rosterPlayerRemoveDisableReason(isAdmin, player, pairs) {
    if (!isAdmin) {
      return tr("rosterRemoveAdminOnly") || "Remove is available only in Admin mode.";
    }
    var c = rosterPlayerParticipationCounts(player, pairs);
    var name = (player && player.nickname) || "";
    if (c.pairsCount > 0 && c.matchesCount > 0) {
      return (
        tr("rosterRemoveBlockedPairAndMatch", { name: name }) ||
        name +
          " belongs to a pair and appears in a match. Delete those first."
      );
    }
    if (c.pairsCount > 0) {
      return (
        tr("rosterRemoveBlockedPair", { name: name }) ||
        name + " belongs to a pair. Delete the pair first."
      );
    }
    if (c.matchesCount > 0) {
      return (
        tr("rosterRemoveBlockedMatch", { name: name }) ||
        name + " appears in a match. Delete the match first."
      );
    }
    return "";
  }

  function playerCanonicalNickname(player) {
    return String((player && player.nickname) || "");
  }

  function playerAliases(player) {
    var canonicalNorm = normalizeMatchNickname(playerCanonicalNickname(player));
    var raw = Array.isArray(player && player.aliases) ? player.aliases : [];
    var seen = {};
    return raw
      .map(function (a) { return String(a == null ? "" : a).trim(); })
      .filter(function (alias) {
        var norm = normalizeMatchNickname(alias);
        if (!alias || !norm || norm === canonicalNorm || seen[norm]) return false;
        seen[norm] = true;
        return true;
      });
  }

  function playerNicknameSearchNorms(player) {
    var seen = {};
    var out = [];
    [playerCanonicalNickname(player)].concat(playerAliases(player)).forEach(function (name) {
      var norm = normalizeMatchNickname(name);
      if (!norm || seen[norm]) return;
      seen[norm] = true;
      out.push(norm);
    });
    return out;
  }

  /** Aligns with backend PlayerNickname: trim + lowercase. */
  function normalizeMatchNickname(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  function nickPairFromBodySpec(bodySpec, key) {
    var spec = bodySpec[key];
    if (!spec || !isFieldSpec(spec) || !spec.type || spec.type.indexOf("array") !== 0) {
      return { raw: ["", ""], norm: ["", ""] };
    }
    var v = Array.isArray(spec.value) ? spec.value : [];
    var r0 = v[0] == null ? "" : String(v[0]).trim();
    var r1 = v[1] == null ? "" : String(v[1]).trim();
    return {
      raw: [r0, r1],
      norm: [normalizeMatchNickname(r0), normalizeMatchNickname(r1)],
    };
  }

  function rosterPlayerNormSet(players) {
    var set = Object.create(null);
    (players || []).forEach(function (p) {
      playerNicknameSearchNorms(p).forEach(function (n) {
        if (n) set[n] = true;
      });
    });
    return set;
  }

  function rosterCanonicalNormMap(players) {
    var map = Object.create(null);
    (players || []).forEach(function (p) {
      var canonical = normalizeMatchNickname(p && p.nickname);
      if (!canonical) return;
      playerNicknameSearchNorms(p).forEach(function (n) {
        if (n) map[n] = canonical;
      });
    });
    return map;
  }

  function canonicalizeNicknameNorm(norm, canonicalMap) {
    if (!norm) return "";
    return (canonicalMap && canonicalMap[norm]) || norm;
  }

  function canonicalizedNickPair(normPair, canonicalMap) {
    return [
      canonicalizeNicknameNorm(normPair && normPair[0], canonicalMap),
      canonicalizeNicknameNorm(normPair && normPair[1], canonicalMap),
    ];
  }

  function rosterPairMatchupKey(a, b) {
    if (!a || !b) return "";
    return a < b ? a + "\0" + b : b + "\0" + a;
  }

  function matchRecordPairMatchupKeys(record) {
    if (!record) return ["", ""];
    var k1 = rosterPairMatchupKey(
      normalizeMatchNickname(record.pair1_player1_nickname),
      normalizeMatchNickname(record.pair1_player2_nickname)
    );
    var k2 = rosterPairMatchupKey(
      normalizeMatchNickname(record.pair2_player1_nickname),
      normalizeMatchNickname(record.pair2_player2_nickname)
    );
    return [k1, k2];
  }

  function matchRecordMatchesSubmittedPair(record, t1Norms, t2Norms) {
    var kA = rosterPairMatchupKey(t1Norms[0], t1Norms[1]);
    var kB = rosterPairMatchupKey(t2Norms[0], t2Norms[1]);
    if (!kA || !kB) return false;
    var sides = matchRecordPairMatchupKeys(record);
    var s0 = sides[0];
    var s1 = sides[1];
    if (!s0 || !s1) return false;
    return (kA === s0 && kB === s1) || (kA === s1 && kB === s0);
  }

  function leagueLocalDateKey(value, leagueTimezone) {
    var date = value instanceof Date ? value : new Date(Date.parse(String(value)));
    if (!date || !isFinite(date.getTime())) return "";
    var tz =
      typeof leagueTimezone === "string" && leagueTimezone.trim()
        ? leagueTimezone.trim()
        : "America/Los_Angeles";
    try {
      if (typeof Intl === "undefined" || !Intl.DateTimeFormat) {
        return date.toISOString().slice(0, 10);
      }
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      var byType = {};
      parts.forEach(function (part) {
        byType[part.type] = part.value;
      });
      if (byType.year && byType.month && byType.day) {
        return byType.year + "-" + byType.month + "-" + byType.day;
      }
    } catch (_e) {
      return date.toISOString().slice(0, 10);
    }
    return date.toISOString().slice(0, 10);
  }

  /**
   * Find the league match row for the same unordered pair matchup (handles swapped sides).
   * t1Norms/t2Norms: two-element arrays of normalized nicknames per pair.
   */
  function findMatchRecordForSubmittedPair(matches, t1Norms, t2Norms) {
    for (var i = 0; i < (matches || []).length; i++) {
      if (matchRecordMatchesSubmittedPair(matches[i], t1Norms, t2Norms)) {
        return matches[i];
      }
    }
    return null;
  }

  function findSameDayMatchRecordForSubmittedPair(matches, t1Norms, t2Norms, leagueTimezone) {
    var submittedDay = leagueLocalDateKey(new Date(), leagueTimezone);
    if (!submittedDay) return null;
    for (var i = 0; i < (matches || []).length; i++) {
      var match = matches[i];
      if (!matchRecordMatchesSubmittedPair(match, t1Norms, t2Norms)) continue;
      if (leagueLocalDateKey(match.created_at, leagueTimezone) === submittedDay) {
        return match;
      }
    }
    return null;
  }

  function rosterPairKeysFromPairs(pairs) {
    var keys = Object.create(null);
    (pairs || []).forEach(function (t) {
      var a = normalizeMatchNickname(t.player1_nickname);
      var b = normalizeMatchNickname(t.player2_nickname);
      if (a && b) keys[rosterPairMatchupKey(a, b)] = true;
    });
    return keys;
  }

  function findRosterPairForPlayer(playerNorm, pairs) {
    if (!playerNorm) return null;
    for (var i = 0; i < (pairs || []).length; i++) {
      var tm = pairs[i];
      var a = normalizeMatchNickname(tm.player1_nickname);
      var b = normalizeMatchNickname(tm.player2_nickname);
      if (a === playerNorm) {
        return {
          player1_nickname: tm.player1_nickname,
          player2_nickname: tm.player2_nickname,
          partnerNorm: b,
        };
      }
      if (b === playerNorm) {
        return {
          player1_nickname: tm.player1_nickname,
          player2_nickname: tm.player2_nickname,
          partnerNorm: a,
        };
      }
    }
    return null;
  }

  function escapePairMatchupLabel(p1, p2) {
    return escapeHtml(p1) + " + " + escapeHtml(p2);
  }

  api.rosterPlayerParticipationCounts = rosterPlayerParticipationCounts;
  api.rosterPlayerCanRemove = rosterPlayerCanRemove;
  api.rosterPlayerRemoveDisableReason = rosterPlayerRemoveDisableReason;
  api.playerCanonicalNickname = playerCanonicalNickname;
  api.playerAliases = playerAliases;
  api.playerNicknameSearchNorms = playerNicknameSearchNorms;
  api.normalizeMatchNickname = normalizeMatchNickname;
  api.nickPairFromBodySpec = nickPairFromBodySpec;
  api.rosterPlayerNormSet = rosterPlayerNormSet;
  api.rosterCanonicalNormMap = rosterCanonicalNormMap;
  api.canonicalizeNicknameNorm = canonicalizeNicknameNorm;
  api.canonicalizedNickPair = canonicalizedNickPair;
  api.rosterPairMatchupKey = rosterPairMatchupKey;
  api.matchRecordPairMatchupKeys = matchRecordPairMatchupKeys;
  api.matchRecordMatchesSubmittedPair = matchRecordMatchesSubmittedPair;
  api.leagueLocalDateKey = leagueLocalDateKey;
  api.findMatchRecordForSubmittedPair = findMatchRecordForSubmittedPair;
  api.findSameDayMatchRecordForSubmittedPair = findSameDayMatchRecordForSubmittedPair;
  api.rosterPairKeysFromPairs = rosterPairKeysFromPairs;
  api.findRosterPairForPlayer = findRosterPairForPlayer;
  api.escapePairMatchupLabel = escapePairMatchupLabel;
})(typeof window !== "undefined" ? window : this);
