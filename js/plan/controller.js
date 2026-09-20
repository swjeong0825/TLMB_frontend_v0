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
    var active = true;
    var readVersion = 0;

    function copy(records) { return records.map(function (record) { return { id: record.id, value: record.value }; }); }
    function view() {
      return { drafts: drafts.read().records, saved: copy(saved), loading: loading, writing: writing,
        loadError: loadError, invalidCount: invalidCount, loaded: loaded };
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
      } else loadError = result.error;
      notify();
      return result;
    }

    async function write(matches, kind) {
      if (!active || writing) return unavailable();
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
      },
    };
  }

  api.createPlanManager = createPlanManager;
})(typeof window !== "undefined" ? window : this);
