(function (global) {
  "use strict";
  var api = global.TLCHAT_PLAN = global.TLCHAT_PLAN || {};

  function storageKey(backend, leagueId) {
    return "tlchat-planned-matches:v1:" + encodeURIComponent(String(backend).replace(/\/+$/, "")) +
      ":" + encodeURIComponent(leagueId);
  }

  function clearLegacyDrafts(getStorage, backend, leagueId) {
    try { getStorage().removeItem(storageKey(backend, leagueId)); } catch (_err) {}
  }

  // Drafts belong to one page instance. Never persist or restore them from storage.
  function createDraftStore(newId) {
    var records = [];

    function read() {
      return { ok: true, records: records.map(function (record) { return { id: record.id, value: record.value }; }) };
    }

    function save(value, editingId) {
      if (!api.parseValue(value)) return { ok: false, error: "invalidPlan" };
      var index = editingId ? records.findIndex(function (record) { return record.id === editingId; }) : -1;
      if (editingId && index === -1) return { ok: false, error: "planMissing" };
      var id;
      try { id = editingId || newId(); } catch (_err) { return { ok: false, error: "saveFailed" }; }
      var record = { id: id, value: value };
      if (!api.isValidRecord(record) || (!editingId && records.some(function (item) { return item.id.toLowerCase() === id.toLowerCase(); }))) {
        return { ok: false, error: "saveFailed" };
      }
      if (index === -1) records.push(record);
      else records[index] = record;
      return read();
    }

    function remove(index, expected) {
      if (index < 0 || index >= records.length || JSON.stringify(records[index]) !== JSON.stringify(expected)) {
        return { ok: false, error: "planMissing" };
      }
      records.splice(index, 1);
      return read();
    }

    function acknowledge(matches) {
      records = records.filter(function (record) {
        return !matches.some(function (match) {
          return match.id.toLowerCase() === record.id.toLowerCase() && match.value === record.value;
        });
      });
    }

    return { read: read, save: save, remove: remove, acknowledge: acknowledge, clear: function () { records = []; } };
  }

  api.storageKey = storageKey;
  api.clearLegacyDrafts = clearLegacyDrafts;
  api.createDraftStore = createDraftStore;
})(typeof window !== "undefined" ? window : this);
