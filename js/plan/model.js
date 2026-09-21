(function (global) {
  "use strict";
  var api = global.TLCHAT_PLAN = global.TLCHAT_PLAN || {};
  var names = global.TLCHAT_NICKNAMES;
  var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function parseValue(value) {
    if (typeof value !== "string") return null;
    var sides = value.split(" ");
    if (sides.length !== 2) return null;
    var first = sides[0].split(",");
    var second = sides[1].split(",");
    if ((first.length !== 1 && first.length !== 2) || first.length !== second.length) return null;
    if (!first.concat(second).every(function (name) {
      return names.isValid(name) && name === names.normalize(name);
    })) return null;
    return { format: first.length === 1 ? "singles" : "doubles", sides: [first, second] };
  }

  function serialize(format, sides) {
    var size = format === "singles" ? 1 : format === "doubles" ? 2 : 0;
    if (!size || !Array.isArray(sides) || sides.length !== 2 || sides.some(function (side) {
      return !Array.isArray(side) || side.length !== size;
    })) throw new Error("invalid_plan");
    return sides.map(function (side) { return names.assertNames(side).join(","); }).join(" ");
  }

  function isValidId(id) { return typeof id === "string" && uuidPattern.test(id); }

  function isValidRecord(record) {
    return !!(record && isValidId(record.id) && parseValue(record.value));
  }

  function uploadPayload(records) {
    var seen = Object.create(null);
    if (!Array.isArray(records) || !records.length) throw new Error("invalid_plan");
    return { matches: records.map(function (record) {
      if (!isValidRecord(record) || seen[record.id.toLowerCase()]) throw new Error("invalid_plan");
      seen[record.id.toLowerCase()] = true;
      return { id: record.id, value: record.value };
    }) };
  }

  function registrationWarning(value, roster) {
    var parsed = parseValue(value);
    if (!parsed) return { kind: "none", names: [] };
    if (!roster || roster.status !== "ok" || !roster.rules ||
        typeof roster.rules.auto_register_players_on_match !== "boolean") {
      return { kind: "unavailable", names: [] };
    }
    if (roster.rules.auto_register_players_on_match) return { kind: "none", names: [] };
    var known = global.TLCHAT_CHAT.rosterPlayerNormSet(roster.players || []);
    var seen = Object.create(null);
    var unknown = parsed.sides[0].concat(parsed.sides[1]).filter(function (name) {
      var norm = global.TLCHAT_CHAT.normalizeMatchNickname(name);
      if (known[norm] || seen[norm]) return false;
      seen[norm] = true;
      return true;
    });
    return { kind: unknown.length ? "unregistered" : "none", names: unknown };
  }

  api.parseValue = parseValue;
  api.serialize = serialize;
  api.isValidId = isValidId;
  api.isValidRecord = isValidRecord;
  api.uploadPayload = uploadPayload;
  api.registrationWarning = registrationWarning;
})(typeof window !== "undefined" ? window : this);
