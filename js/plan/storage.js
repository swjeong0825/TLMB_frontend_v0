(function (global) {
  "use strict";
  var api = global.TLCHAT_PLAN = global.TLCHAT_PLAN || {};

  function storageKey(backend, leagueId) {
    return "tlchat-planned-matches:v1:" + encodeURIComponent(String(backend).replace(/\/+$/, "")) +
      ":" + encodeURIComponent(leagueId);
  }

  function createDraftStore(getStorage, backend, leagueId, newId) {
    var key = storageKey(backend, leagueId);

    function read() {
      try {
        var raw = getStorage().getItem(key);
        if (raw === null) return { ok: true, records: [] };
        var data = JSON.parse(raw);
        if (!data || data.version !== 1 || !Array.isArray(data.matches)) {
          return { ok: false, error: "storageUnreadable", records: [] };
        }
        return { ok: true, records: data.matches };
      } catch (err) {
        return { ok: false, error: err instanceof SyntaxError ? "storageUnreadable" : "storageUnavailable", records: [] };
      }
    }

    function write(records) {
      try {
        getStorage().setItem(key, JSON.stringify({ version: 1, matches: records }));
        return { ok: true, records: records };
      } catch (_err) {
        return { ok: false, error: "storageWriteFailed" };
      }
    }

    function save(value, editingId) {
      var state = read();
      if (!state.ok) return state;
      if (!api.parseValue(value)) return { ok: false, error: "invalidPlan" };
      var index = editingId ? state.records.findIndex(function (record) { return record && record.id === editingId; }) : -1;
      if (editingId && index === -1) return { ok: false, error: "planMissing" };
      var id;
      try { id = editingId || newId(); } catch (_err) { return { ok: false, error: "saveFailed" }; }
      var record = { id: id, value: value };
      if (!api.isValidRecord(record) || (!editingId && state.records.some(function (item) { return item && item.id === id; }))) {
        return { ok: false, error: "saveFailed" };
      }
      if (index === -1) state.records.push(record);
      else state.records[index] = record;
      return write(state.records);
    }

    // Index + expected value also permits removing malformed entries without guessing an ID.
    function remove(index, expected) {
      var state = read();
      if (!state.ok) return state;
      if (index < 0 || index >= state.records.length || JSON.stringify(state.records[index]) !== JSON.stringify(expected)) {
        return { ok: false, error: "planMissing" };
      }
      state.records.splice(index, 1);
      return write(state.records);
    }

    return { key: key, read: read, save: save, remove: remove };
  }

  api.storageKey = storageKey;
  api.createDraftStore = createDraftStore;
})(typeof window !== "undefined" ? window : this);
