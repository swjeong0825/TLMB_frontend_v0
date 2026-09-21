(function (global) {
  "use strict";
  var api = global.TLCHAT_PLAN = global.TLCHAT_PLAN || {};

  function createPlanManager(options) {
    var drafts = api.createDraftStore(options.newId);
    var saved = [];
    var loading = false;
    var writing = "";
    var loadError = "";
    var invalidCount = 0;
    var loaded = false;
    var deleteNeedsRefresh = false;
    var active = true;
    var readVersion = 0;

    function copy(records) { return records.map(function (record) { return { id: record.id, value: record.value }; }); }
    function view() {
      return { drafts: drafts.read().records, saved: copy(saved), loading: loading, writing: writing,
        loadError: loadError, invalidCount: invalidCount, loaded: loaded, deleteNeedsRefresh: deleteNeedsRefresh };
    }
    function notify() { if (active && options.onChange) options.onChange(view()); }
    function unavailable() { return { ok: false, error: active ? "requestBusy" : "pageClosed" }; }

    async function loadSaved() {
      if (!active || loading || writing) return unavailable();
      var version = ++readVersion;
      loading = true;
      loadError = "";
      notify();
      var result;
      try { result = await api.loadMatches(options.leagueId); }
      catch (_err) { result = { ok: false, error: "plannedLoadFailed" }; }
      if (!active || version !== readVersion) return unavailable();
      loading = false;
      if (result.ok) {
        saved = copy(result.matches);
        invalidCount = result.invalidCount;
        loaded = true;
        deleteNeedsRefresh = false;
      } else loadError = result.error;
      notify();
      return result;
    }

    async function write(matches, kind) {
      if (!active || writing) return unavailable();
      if (deleteNeedsRefresh) return { ok: false, error: "deleteRefreshRequired" };
      // A GET started before this write must never overwrite its acknowledgement.
      readVersion++;
      loading = false;
      writing = kind;
      notify();
      var result;
      try { result = await api.uploadMatches(options.leagueId, { matches: matches }); }
      catch (_err) { result = { ok: false, error: "uploadUnconfirmed" }; }
      if (!active) return unavailable();
      writing = "";
      if (result.ok) {
        var merged = Object.create(null);
        saved.concat(result.matches).forEach(function (record) { merged[record.id.toLowerCase()] = record; });
        saved = Object.keys(merged).sort().map(function (id) { return { id: merged[id].id, value: merged[id].value }; });
        if (kind === "upload") drafts.acknowledge(result.matches);
      }
      notify();
      if (result.ok) loadSaved();
      return result;
    }

    async function deleteSaved(record) {
      if (!active || writing) return unavailable();
      if (deleteNeedsRefresh) return { ok: false, error: "deleteRefreshRequired" };
      var id = record && record.id;
      if (!api.isValidId(id)) return { ok: false, error: "deleteRejected" };
      var key = id.toLowerCase();
      if (!saved.some(function (item) { return item.id.toLowerCase() === key; })) return { ok: false, error: "planMissing" };
      // Invalidate older reads before deleting so they cannot restore a removed row.
      readVersion++;
      loading = false;
      writing = "delete";
      notify();
      var result;
      try { result = await api.deleteMatch(options.leagueId, { id: id }); }
      catch (_err) { result = { ok: false, error: "deleteUnconfirmed", unconfirmed: true }; }
      if (!active) return unavailable();
      writing = "";
      if (result.ok) saved = saved.filter(function (item) { return item.id.toLowerCase() !== key; });
      deleteNeedsRefresh = !!(result.unconfirmed || result.error === "deletePlanMissing");
      notify();
      // A failed refresh never undoes a confirmed deletion or repeats a DELETE.
      if (result.ok) loadSaved();
      else if (deleteNeedsRefresh) await loadSaved();
      if (!active) return unavailable();
      return result;
    }

    return {
      view: view,
      saveDraft: function (value, id) {
        if (!active) return unavailable();
        var result = drafts.save(value, id);
        notify();
        return result;
      },
      removeDraft: function (index, expected) {
        if (!active) return unavailable();
        var result = drafts.remove(index, expected);
        notify();
        return result;
      },
      loadSaved: loadSaved,
      deleteSaved: deleteSaved,
      uploadDrafts: function () {
        var records = drafts.read().records;
        if (!records.length) return Promise.resolve({ ok: false, error: "invalidUpload" });
        return write(records, "upload");
      },
      updateSaved: function (record) {
        if (!api.isValidRecord(record)) return Promise.resolve({ ok: false, error: "invalidPlan" });
        if (!saved.some(function (item) { return item.id.toLowerCase() === record.id.toLowerCase(); })) {
          return Promise.resolve({ ok: false, error: "planMissing" });
        }
        return write(copy([record]), "edit");
      },
      dispose: function () {
        active = false;
        readVersion++;
        drafts.clear();
        saved = [];
        loading = false;
        writing = "";
        deleteNeedsRefresh = false;
      },
    };
  }

  api.createPlanManager = createPlanManager;
})(typeof window !== "undefined" ? window : this);
