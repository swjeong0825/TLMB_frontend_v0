(function (global) {
  "use strict";
  var api = global.TLCHAT_PLAN = global.TLCHAT_PLAN || {};

  // Shared by planned-recording panels for one league page, including action navigation.
  function createRecordingSession(options) {
    var records = [], drafts = Object.create(null), pending = Object.create(null);
    var errors = Object.create(null), blocked = Object.create(null), retired = Object.create(null);
    var recorded = Object.create(null);
    var listeners = [], loading = false, loadError = "", invalidCount = 0, notice = null;
    var needsResults = false, leagueBlocked = false, readVersion = 0, active = true;
    function key(id) { return id.toLowerCase(); }
    function copy(record) { return { id: record.id, value: record.value }; }
    function view() {
      var values = Object.create(null);
      records.forEach(function (record) {
        var id = key(record.id), draft = recorded[id] || drafts[id];
        values[record.id] = { value: record.value,
          scores: draft && (recorded[id] || draft.value === record.value) ? draft.scores.slice() : ["", ""],
          recorded: !!recorded[id],
          pending: !!pending[id], disabled: !!recorded[id] || !!pending[id] || !!blocked[id] || leagueBlocked,
          error: errors[id] || null };
      });
      return { records: records.map(copy), drafts: values, loading: loading, loadError: loadError,
        invalidCount: invalidCount, notice: notice };
    }
    function notify() { if (active) listeners = listeners.filter(function (listener) { return listener(view()) !== false; }); }
    function closed() { return { ok: false, error: "plannedRecording" }; }

    async function refresh(withResults) {
      if (!active) return closed();
      var version = ++readVersion;
      var checkResults = !!withResults || needsResults;
      if (checkResults) needsResults = true;
      loading = true;
      loadError = "";
      notify();
      var results = await Promise.allSettled([
        Promise.resolve().then(function () { return api.loadMatches(options.leagueId); }),
        checkResults ? Promise.resolve().then(function () { return options.refreshResults(); }) : Promise.resolve({ ok: true }),
      ]);
      if (!active || version !== readVersion) return closed();
      loading = false;
      var plans = results[0].status === "fulfilled" ? results[0].value : { ok: false, error: "plannedLoadFailed" };
      var related = results[1].status === "fulfilled" && results[1].value && results[1].value.ok;
      if (checkResults && related) needsResults = false;
      if (plans.ok) {
        var incoming = Object.create(null);
        plans.matches.forEach(function (record) { incoming[key(record.id)] = record; });
        Object.keys(errors).forEach(function (id) {
          // An absent plan is no longer actionable, but absence does not prove our POST succeeded.
          if (errors[id].review && !incoming[id] && !pending[id]) retired[id] = true;
        });
        var nextRecords = plans.matches.filter(function (record) { return !retired[key(record.id)]; }).map(function (record) {
          return copy(pending[key(record.id)] ? pending[key(record.id)].record : record);
        });
        Object.keys(pending).forEach(function (id) {
          if (!incoming[id]) nextRecords.push(copy(pending[id].record));
        });
        // Consumed plans disappear from GET, but keep their confirmed cards in place.
        records.forEach(function (record, index) {
          var completed = recorded[key(record.id)];
          if (completed) nextRecords.splice(Math.min(index, nextRecords.length), 0, copy(completed.record));
        });
        records = nextRecords;
        records.forEach(function (record) {
          var id = key(record.id);
          if (drafts[id] && drafts[id].value !== record.value) delete drafts[id];
        });
        invalidCount = plans.invalidCount;
        if (related) {
          leagueBlocked = false;
          Object.keys(blocked).forEach(function (id) { if (!pending[id]) delete blocked[id]; });
        }
      }
      loadError = !plans.ok ? plans.error : !related ? "plannedResultsRefreshFailed" : "";
      notify();
      return { ok: !!plans.ok && !!related };
    }

    async function submit(recordId, first, second) {
      var id = key(recordId);
      var record = records.find(function (item) { return key(item.id) === id; });
      if (!active || pending[id] || blocked[id] || retired[id] || leagueBlocked) return closed();
      if (!record) return { ok: false, error: "plannedMissing" };
      try { api.recordPayload(record, first, second); }
      catch (error) { errors[id] = { ok: false, error: error.message }; notify(); return errors[id]; }
      drafts[id] = { value: record.value, scores: [String(first), String(second)] };
      var submitted = { record: copy(record), scores: drafts[id].scores.slice() };
      pending[id] = submitted;
      delete errors[id];
      readVersion++;
      loading = false;
      notify();
      var result;
      try { result = await api.recordMatch(options.leagueId, submitted.record, first, second); }
      catch (_err) { result = { ok: false, error: "plannedUnconfirmed", unconfirmed: true, reconcile: true, review: true }; }
      if (!active) return closed();
      delete pending[id];
      readVersion++;
      loading = false;
      if (result.ok) {
        retired[id] = true;
        recorded[id] = { record: copy(submitted.record), scores: submitted.scores.slice() };
        delete drafts[id];
        delete errors[id];
        notice = { key: "plannedRecorded", record: submitted.record, scores: submitted.scores };
      } else {
        errors[id] = result;
        if (result.review) blocked[id] = true;
        if (result.review && !result.unconfirmed) delete drafts[id];
        if (result.error === "plannedLeagueMissing") leagueBlocked = true;
        notice = { key: result.error, record: submitted.record, scores: submitted.scores };
      }
      notify();
      if (result.ok || result.reconcile) await refresh(true);
      return result;
    }

    return {
      view: view, refresh: refresh, submit: submit,
      setScores: function (recordId, first, second) {
        var id = key(recordId), record = records.find(function (item) { return key(item.id) === id; });
        if (active && record && !pending[id] && !recorded[id]) drafts[id] = { value: record.value, scores: [first, second] };
      },
      subscribe: function (listener) { listeners.push(listener); listener(view()); },
      dispose: function () { active = false; readVersion++; records = []; drafts = {}; pending = {}; recorded = {}; notice = null; listeners = []; },
    };
  }

  api.createRecordingSession = createRecordingSession;
})(typeof window !== "undefined" ? window : this);
