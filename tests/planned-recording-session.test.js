const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const a = Object.freeze({ id: 'd315f636-10e5-4265-9b19-fc260e1ed224', value: 'Alice Bob' });
const b = Object.freeze({ id: '719e28b2-bce7-4e48-92a7-204711504dc8', value: 'Alice,민수 Guest1,Guest2' });
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const uncertain = { ok: false, error: 'plannedUnconfirmed', unconfirmed: true, reconcile: true, review: true };
function setup() {
  const context = vm.createContext({});
  for (const file of ['js/nicknames.js', 'js/plan/model.js', 'js/plan/record.js', 'js/plan/record-session.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  const state = { rows: [a, b], loads: 0, posts: [], resultReads: 0, loadError: '', resultsOK: true };
  const api = context.TLCHAT_PLAN;
  api.loadMatches = async () => { state.loads++; return state.loadError ? { ok: false, error: state.loadError } : { ok: true, matches: state.rows, invalidCount: 0 }; };
  api.recordMatch = async (league, record, first, second) => {
    state.posts.push({ league, record: plain(record), scores: [first, second] });
    return state.write ? state.write(record) : { ok: false, error: 'plannedRejected' };
  };
  const session = api.createRecordingSession({ leagueId: 'league-id', refreshResults: async () => {
    state.resultReads++; return { ok: state.resultsOK };
  } });
  return { session, state, api };
}

test('confirmed results remove their plan/draft and reconcile once without a second POST or resurrection', async () => {
  const { session, state } = setup();
  await session.refresh();
  session.setScores(a.id, '6', '0');
  state.write = () => ({ ok: true, match_id: b.id, created_at: '2026-09-20T00:00:00Z' });
  assert.equal((await session.submit(a.id, '6', '0')).ok, true);
  assert.deepEqual(plain(session.view().records), [b]); // Stale GET still includes a; it cannot resurrect it.
  assert.equal(session.view().drafts[a.id], undefined);
  assert.equal(session.view().notice.key, 'plannedRecorded');
  assert.equal(state.posts.length, 1);
  assert.equal(state.loads, 2);
  assert.equal(state.resultReads, 1);
  assert.equal((await session.submit(a.id, '6', '0')).ok, false);
  assert.equal(state.posts.length, 1);
});

test('failed post-success refresh is only a refresh error; no duplicate result', async () => {
  const { session, state } = setup();
  await session.refresh();
  state.write = () => { state.loadError = 'plannedLoadFailed'; return { ok: true }; };
  const result = await session.submit(a.id, '6', '3');
  assert.equal(result.ok, true);
  assert.equal(session.view().notice.key, 'plannedRecorded');
  assert.equal(session.view().loadError, 'plannedLoadFailed');
  assert.equal(session.view().records.length, 1);
  await session.refresh();
  assert.equal(state.posts.length, 1);
});

test('double submit and navigating to a new subscriber keep one pending request and fixed teams/scores', async () => {
  const { session, state } = setup();
  await session.refresh();
  const gate = deferred();
  state.write = () => gate.promise;
  let detachedUpdates = 0;
  session.subscribe(() => { detachedUpdates++; return false; });
  const pending = session.submit(a.id, '6', '0');
  assert.equal(session.view().drafts[a.id].pending, true);
  assert.equal((await session.submit(a.id, '6', '0')).ok, false);
  session.setScores(a.id, '1', '1');
  let newPanel;
  session.subscribe(view => { newPanel = view; });
  state.rows = [{ ...a, value: 'Other Teams' }, b];
  await session.refresh();
  assert.equal(newPanel.records[0].value, a.value);
  assert.deepEqual(plain(newPanel.drafts[a.id].scores), ['6', '0']);
  assert.equal(state.posts.length, 1);
  gate.resolve({ ok: true });
  await pending;
  assert.equal(newPanel.records.length, 1);
  assert.ok(detachedUpdates <= 2);
});

test('mismatch refreshes changed participants and clears old scores before another explicit submission', async () => {
  const { session, state } = setup();
  await session.refresh();
  state.write = () => {
    state.rows = [{ ...a, value: '민수 Alice' }, b];
    return { ok: false, error: 'plannedMismatch', reconcile: true, review: true };
  };
  await session.submit(a.id, '6', '2');
  assert.equal(session.view().records[0].value, '민수 Alice');
  assert.deepEqual(plain(session.view().drafts[a.id].scores), ['', '']);
  assert.equal(session.view().drafts[a.id].disabled, false);
  assert.equal(state.posts.length, 1);
  await session.submit(a.id, '', '');
  assert.equal(state.posts.length, 1);
});

test('ordinary rejections retain scores and permit correction without automatic retry', async () => {
  for (const error of ['plannedRosterRequired', 'plannedRepeatedPlayer', 'plannedRuleConflict', 'plannedRateLimited', 'plannedBackendUnavailable']) {
    const { session, state } = setup();
    await session.refresh();
    state.write = () => ({ ok: false, error });
    await session.submit(a.id, '6', '0');
    assert.deepEqual(plain(session.view().drafts[a.id].scores), ['6', '0']);
    assert.equal(session.view().drafts[a.id].disabled, false);
    assert.equal(session.view().drafts[a.id].error.error, error);
    assert.equal(state.loads, 1);
    assert.equal(state.posts.length, 1);
  }
});

test('uncertain submission requires fresh plans and history before explicit retry with the same saved ID', async () => {
  const { session, state } = setup();
  await session.refresh();
  state.resultsOK = false;
  state.write = () => uncertain;
  await session.submit(a.id, '6', '0');
  assert.equal(session.view().drafts[a.id].disabled, true);
  assert.equal(session.view().loadError, 'plannedResultsRefreshFailed');
  await session.submit(a.id, '6', '0');
  assert.equal(state.posts.length, 1);
  assert.deepEqual(plain(session.view().drafts[a.id].scores), ['6', '0']);
  state.resultsOK = true;
  await session.refresh();
  assert.equal(session.view().drafts[a.id].disabled, false);
  assert.equal(state.resultReads, 2);
  assert.equal(state.posts.length, 1);
  await session.submit(a.id, '6', '0');
  assert.equal(state.posts.length, 2);
  assert.equal(state.posts[1].record.id, a.id);
});

test('missing plan after an unconfirmed write does not imply success or recreate the plan', async () => {
  const { session, state } = setup();
  await session.refresh();
  state.write = () => { state.rows = [b]; return uncertain; };
  await session.submit(a.id, '6', '0');
  assert.equal(session.view().notice.key, 'plannedUnconfirmed');
  assert.equal(session.view().notice.record.value, a.value);
  assert.deepEqual(plain(session.view().notice.scores), ['6', '0']);
  assert.deepEqual(plain(session.view().records), [b]);
  await session.submit(a.id, '6', '0');
  assert.equal(state.posts.length, 1);
});

test('refresh failures preserve the list and keep reviewed rows blocked until loading succeeds', async () => {
  const { session, state } = setup();
  await session.refresh();
  state.write = () => { state.loadError = 'plannedLoadFailed'; return uncertain; };
  await session.submit(a.id, '6', '3');
  assert.deepEqual(plain(session.view().records), [a, b]);
  assert.equal(session.view().drafts[a.id].disabled, true);
  state.loadError = '';
  await session.refresh();
  assert.equal(session.view().drafts[a.id].disabled, false);
  assert.equal(state.posts.length, 1);
});

test('league-not-found stops all rows until a successful league refresh', async () => {
  const { session, state } = setup();
  await session.refresh();
  state.write = () => { state.loadError = 'plannedLeagueMissing'; return { ok: false, error: 'plannedLeagueMissing', reconcile: true }; };
  await session.submit(a.id, '6', '0');
  assert.equal(session.view().drafts[b.id].disabled, true);
  await session.submit(b.id, '6', '1');
  assert.equal(state.posts.length, 1);
});

test('stale GET completion cannot replace a later result refresh or bring back a consumed plan', async () => {
  const { session, state, api } = setup();
  await session.refresh();
  const stale = deferred();
  api.loadMatches = () => stale.promise;
  const loading = session.refresh();
  await tick();
  api.loadMatches = async () => ({ ok: true, matches: [b], invalidCount: 2 });
  state.write = () => ({ ok: true });
  await session.submit(a.id, '6', '0');
  stale.resolve({ ok: true, matches: [a], invalidCount: 0 });
  await loading;
  assert.deepEqual(plain(session.view().records), [b]);
  assert.equal(session.view().invalidCount, 2);
});

test('parallel rows do not unlock each other and both confirmations remove their drafts', async () => {
  const { session, state } = setup();
  await session.refresh();
  const first = deferred(), second = deferred();
  state.write = record => record.id === a.id ? first.promise : second.promise;
  const one = session.submit(a.id, '6', '0'), two = session.submit(b.id, '7', '5');
  first.resolve({ ok: true });
  await one;
  assert.equal(session.view().drafts[b.id].pending, true);
  second.resolve({ ok: true });
  await two;
  assert.equal(session.view().records.length, 0);
  assert.equal(state.posts.length, 2);
});

test('disposing the page ignores pending completions and never updates a detached subscriber', async () => {
  const { session, state } = setup();
  await session.refresh();
  const gate = deferred();
  state.write = () => gate.promise;
  let updates = 0;
  session.subscribe(() => { updates++; });
  const pending = session.submit(a.id, '6', '0');
  session.dispose();
  const count = updates;
  gate.resolve({ ok: true });
  await pending;
  assert.equal(updates, count);
  assert.equal(session.view().records.length, 0);
  assert.equal(state.resultReads, 0);
});
