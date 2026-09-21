const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ids = ['d315f636-10e5-4265-9b19-fc260e1ed224', '719e28b2-bce7-4e48-92a7-204711504dc8',
  '829e28b2-bce7-4e48-92a7-204711504dc8'];
const original = Object.freeze({ id: ids[0], value: 'Alice Bob' });
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; }

function setup() {
  const context = vm.createContext({ fetch() { assert.fail('Unexpected HTTP request'); } });
  for (const file of ['js/nicknames.js', 'js/plan/model.js', 'js/plan/storage.js', 'js/plan/api.js', 'js/plan/controller.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  const api = context.TLCHAT_PLAN;
  let server = [];
  let nextId = 0;
  const calls = [];
  api.loadMatches = async league => { calls.push({ method: 'GET', league }); return { ok: true, matches: plain(server), invalidCount: 0 }; };
  api.uploadMatches = async (league, body) => {
    calls.push({ method: 'POST', league, body: plain(body) });
    for (const record of body.matches) {
      server = server.filter(item => item.id.toLowerCase() !== record.id.toLowerCase()).concat(plain(record));
    }
    return { ok: true, matches: plain(body.matches) };
  };
  api.deleteMatch = async (league, record) => {
    calls.push({ method: 'DELETE', league, id: record.id });
    server = server.filter(item => item.id.toLowerCase() !== record.id.toLowerCase());
    return { ok: true };
  };
  const manager = api.createPlanManager({ leagueId: 'league-a', newId: () => ids[nextId++] });
  return { api, manager, calls, setServer(records) { server = plain(records); } };
}

test('draft creation/edit/removal is local; server plans load separately and snapshots are independent', async () => {
  const { manager, calls, setServer } = setup();
  setServer([original]);
  manager.saveDraft('Guest Other');
  manager.saveDraft('Guest 민수', ids[0]);
  assert.equal(calls.length, 0);
  await manager.loadSaved();
  const view = manager.view();
  assert.deepEqual(plain(view.saved), [original]);
  assert.equal(view.drafts[0].value, 'Guest 민수');
  view.saved[0].value = 'Outside Mutation';
  assert.equal(manager.view().saved[0].value, original.value);
  manager.removeDraft(0, manager.view().drafts[0]);
  assert.equal(manager.view().drafts.length, 0);
  assert.equal(manager.view().saved.length, 1);
  assert.deepEqual(calls.map(c => c.method), ['GET']);
});

test('confirmed uploads move matching drafts to saved, then refresh without duplicate IDs', async () => {
  const { manager, calls } = setup();
  manager.saveDraft('Alice Bob');
  const result = await manager.uploadDrafts();
  await tick();
  assert.equal(result.ok, true);
  assert.deepEqual(plain(manager.view().drafts), []);
  assert.deepEqual(plain(manager.view().saved), [original]);
  assert.deepEqual(calls.map(c => c.method), ['POST', 'GET']);
  assert.deepEqual(calls[0].body, { matches: [original] });
});

test('upload snapshots preserve edits/new drafts made in flight and reject concurrent writes', async () => {
  const { api, manager } = setup();
  const pending = deferred();
  let submitted;
  let writes = 0;
  api.uploadMatches = (_league, body) => { writes++; submitted = plain(body); return pending.promise; };
  api.loadMatches = async () => ({ ok: false, error: 'plannedLoadFailed' });
  manager.saveDraft('Alice Bob');
  const upload = manager.uploadDrafts();
  assert.equal(manager.view().writing, 'upload');
  assert.equal((await manager.uploadDrafts()).error, 'requestBusy');
  manager.saveDraft('Alice Guest', ids[0]);
  manager.saveDraft('민수 Guest');
  assert.deepEqual(submitted, { matches: [original] });
  pending.resolve({ ok: true, matches: [{ ...original, id: ids[0].toUpperCase() }] });
  await upload;
  await tick();
  assert.equal(writes, 1);
  assert.deepEqual(plain(manager.view().drafts), [{ id: ids[0], value: 'Alice Guest' }, { id: ids[1], value: '민수 Guest' }]);
  assert.equal(manager.view().saved[0].value, 'Alice Bob');
  assert.equal(manager.view().loadError, 'plannedLoadFailed');
});

test('failed or uncertain uploads leave drafts intact for safe retries', async () => {
  for (const error of ['uploadUnconfirmed', 'uploadRejected', 'uploadConflict']) {
    const { api, manager } = setup();
    api.uploadMatches = async () => ({ ok: false, error });
    manager.saveDraft('Alice Bob');
    assert.equal((await manager.uploadDrafts()).error, error);
    assert.deepEqual(plain(manager.view().drafts), [original]);
    assert.deepEqual(plain(manager.view().saved), []);
    assert.equal(manager.view().writing, '');
  }
});

test('saved edits use one existing ID and do not affect drafts or change rows before acknowledgement', async () => {
  const { api, manager, calls, setServer } = setup();
  setServer([original]);
  await manager.loadSaved();
  manager.saveDraft('Local Guest');
  const pending = deferred();
  const updated = { ...original, value: 'Alice,민수 Bob,Guest' };
  api.uploadMatches = (league, body) => { calls.push({ method: 'POST', league, body: plain(body) }); return pending.promise; };
  const saving = manager.updateSaved(updated);
  assert.equal(manager.view().writing, 'edit');
  assert.equal(manager.view().saved[0].value, original.value);
  assert.equal((await manager.updateSaved(updated)).error, 'requestBusy');
  assert.equal((await manager.uploadDrafts()).error, 'requestBusy');
  setServer([updated]);
  pending.resolve({ ok: true, matches: [updated] });
  assert.equal((await saving).ok, true);
  await tick();
  assert.deepEqual(plain(manager.view().saved), [updated]);
  assert.equal(manager.view().drafts[0].value, 'Local Guest');
  assert.deepEqual(calls.find(call => call.method === 'POST').body, { matches: [updated] });
});

test('failed edits preserve original saved rows and permit a later retry', async () => {
  const { api, manager, setServer } = setup();
  setServer([original]);
  await manager.loadSaved();
  api.uploadMatches = async () => { throw new Error('Connection lost'); };
  const change = { ...original, value: 'Alice Guest' };
  assert.equal((await manager.updateSaved(change)).error, 'uploadUnconfirmed');
  assert.deepEqual(plain(manager.view().saved), [original]);
  assert.equal(manager.view().writing, '');
  api.uploadMatches = async () => ({ ok: false, error: 'uploadRejected' });
  assert.equal((await manager.updateSaved(change)).error, 'uploadRejected');
  assert.equal((await manager.updateSaved({ ...change, id: ids[1] })).error, 'planMissing');
});

test('saved edits accept equivalent UUID casing and reject invalid records before sending', async () => {
  const { manager, calls, setServer } = setup();
  setServer([original]);
  await manager.loadSaved();
  const invalid = await manager.updateSaved({ ...original, value: 'bad' });
  assert.equal(invalid.error, 'invalidPlan');
  assert.equal(calls.length, 1);
  const result = await manager.updateSaved({ id: ids[0].toUpperCase(), value: 'Alice Guest' });
  assert.equal(result.ok, true);
  await tick();
  assert.equal(manager.view().saved.length, 1);
});

test('read failures preserve the existing list and malformed-row warnings survive until a successful refresh', async () => {
  const { api, manager } = setup();
  api.loadMatches = async () => ({ ok: true, matches: [original], invalidCount: 2 });
  await manager.loadSaved();
  assert.equal(manager.view().invalidCount, 2);
  api.loadMatches = async () => { throw new Error('Offline'); };
  await manager.loadSaved();
  assert.equal(manager.view().loadError, 'plannedLoadFailed');
  assert.deepEqual(plain(manager.view().saved), [original]);
  api.loadMatches = async () => ({ ok: true, matches: [], invalidCount: 0 });
  await manager.loadSaved();
  assert.equal(manager.view().loadError, '');
  assert.equal(manager.view().invalidCount, 0);
  assert.deepEqual(plain(manager.view().saved), []);
});

test('a GET started before an upload cannot overwrite confirmed saved plans', async () => {
  const { api, manager } = setup();
  const oldRead = deferred();
  const newRead = deferred();
  let reads = 0;
  api.loadMatches = () => reads++ ? newRead.promise : oldRead.promise;
  const first = manager.loadSaved();
  assert.equal((await manager.loadSaved()).error, 'requestBusy');
  manager.saveDraft('Alice Bob');
  await manager.uploadDrafts();
  oldRead.resolve({ ok: true, matches: [], invalidCount: 0 });
  await first;
  assert.deepEqual(plain(manager.view().saved), [original]);
  assert.equal(manager.view().loading, true);
  newRead.resolve({ ok: true, matches: [original], invalidCount: 0 });
  await tick();
  assert.equal(manager.view().loading, false);
});

test('navigation disposal clears drafts and ignores late reads/writes; a new page starts empty', async () => {
  const { api, manager } = setup();
  const pending = deferred();
  manager.saveDraft('Alice Bob');
  api.uploadMatches = () => pending.promise;
  const upload = manager.uploadDrafts();
  manager.dispose();
  pending.resolve({ ok: true, matches: [original] });
  assert.equal((await upload).error, 'pageClosed');
  assert.deepEqual(plain(manager.view().drafts), []);
  assert.deepEqual(plain(manager.view().saved), []);
  assert.equal(manager.saveDraft('Alice Guest').error, 'pageClosed');
  const fresh = api.createPlanManager({ leagueId: 'league-a', newId: () => ids[1] });
  assert.deepEqual(plain(fresh.view().drafts), []);
  const late = deferred();
  api.loadMatches = () => late.promise;
  const read = fresh.loadSaved();
  fresh.dispose();
  late.resolve({ ok: true, matches: [original], invalidCount: 0 });
  await read;
  assert.deepEqual(plain(fresh.view().saved), []);
});

test('confirmed deletion removes only the captured ID and refreshes, preserving drafts', async () => {
  const { manager, calls, setServer } = setup();
  const other = { id: ids[1], value: 'Guest Other' };
  setServer([original, other]);
  await manager.loadSaved();
  manager.saveDraft('Local Guest');
  assert.equal((await manager.deleteSaved({ id: ids[0].toUpperCase(), value: 'Changed Elsewhere' })).ok, true);
  await tick();
  assert.deepEqual(plain(manager.view().saved), [other]);
  assert.equal(manager.view().drafts[0].value, 'Local Guest');
  assert.deepEqual(calls.map(c => c.method), ['GET', 'DELETE', 'GET']);
  assert.deepEqual(calls[1], { method: 'DELETE', league: 'league-a', id: ids[0].toUpperCase() });
});

test('pending deletion preserves rows, blocks duplicate writes, and permits local draft changes', async () => {
  const { api, manager, setServer } = setup();
  setServer([original]);
  await manager.loadSaved();
  const pending = deferred();
  let deletes = 0;
  api.deleteMatch = () => { deletes++; return pending.promise; };
  const removing = manager.deleteSaved(original);
  assert.equal(manager.view().writing, 'delete');
  assert.equal(manager.view().saved.length, 1);
  manager.saveDraft('Local Guest');
  assert.equal((await manager.deleteSaved(original)).error, 'requestBusy');
  assert.equal((await manager.updateSaved(original)).error, 'requestBusy');
  assert.equal((await manager.uploadDrafts()).error, 'requestBusy');
  assert.equal((await manager.loadSaved()).error, 'requestBusy');
  pending.resolve({ ok: false, error: 'deleteRejected' });
  await removing;
  assert.equal(deletes, 1);
  assert.deepEqual(plain(manager.view().saved), [original]);
  assert.equal(manager.view().drafts.length, 1);
  assert.equal(manager.view().writing, '');
});

test('ordinary deletion failures keep the row without interpreting generic 404 as success', async () => {
  for (const error of ['deleteLeagueMissing', 'deleteUnavailable', 'deleteRejected', 'deleteRateLimited', 'deleteFailed']) {
    const { api, manager, calls, setServer } = setup();
    setServer([original]);
    await manager.loadSaved();
    api.deleteMatch = async () => ({ ok: false, error });
    assert.equal((await manager.deleteSaved(original)).error, error);
    assert.deepEqual(plain(manager.view().saved), [original]);
    assert.equal(manager.view().deleteNeedsRefresh, false);
    assert.equal(calls.length, 1);
  }
});

test('a failed refresh after 204 leaves the confirmed deletion in place and never repeats it', async () => {
  const { api, manager, calls, setServer } = setup();
  setServer([original]);
  await manager.loadSaved();
  api.loadMatches = async () => ({ ok: false, error: 'plannedLoadFailed' });
  assert.equal((await manager.deleteSaved(original)).ok, true);
  await tick();
  assert.deepEqual(plain(manager.view().saved), []);
  assert.equal(manager.view().loadError, 'plannedLoadFailed');
  assert.equal(calls.filter(c => c.method === 'DELETE').length, 1);
});

test('missing-plan and uncertain deletions refresh before another write; no automatic recreation', async () => {
  for (const result of [{ ok: false, error: 'deletePlanMissing' }, { ok: false, error: 'deleteUnconfirmed', unconfirmed: true }]) {
    const { api, manager, setServer } = setup();
    setServer([original]);
    await manager.loadSaved();
    const refresh = deferred();
    let deletes = 0;
    api.deleteMatch = async () => { deletes++; return result; };
    api.loadMatches = () => refresh.promise;
    const removing = manager.deleteSaved(original);
    await tick();
    assert.equal(manager.view().deleteNeedsRefresh, true);
    assert.equal(manager.view().saved.length, 1);
    assert.equal((await manager.deleteSaved(original)).error, 'deleteRefreshRequired');
    refresh.resolve({ ok: true, matches: [], invalidCount: 0 });
    assert.equal((await removing).error, result.error);
    assert.deepEqual(plain(manager.view().saved), []);
    assert.equal(manager.view().deleteNeedsRefresh, false);
    assert.equal(deletes, 1);
  }
});

test('uncertain deletion plus failed refresh retains the row and blocks writes until a successful refresh', async () => {
  const { api, manager, setServer } = setup();
  setServer([original]);
  await manager.loadSaved();
  api.deleteMatch = async () => { throw new Error('Timeout'); };
  api.loadMatches = async () => ({ ok: false, error: 'plannedLoadFailed' });
  assert.equal((await manager.deleteSaved(original)).unconfirmed, true);
  assert.deepEqual(plain(manager.view().saved), [original]);
  assert.equal(manager.view().deleteNeedsRefresh, true);
  manager.saveDraft('Local Guest');
  assert.equal((await manager.uploadDrafts()).error, 'deleteRefreshRequired');
  assert.equal((await manager.updateSaved(original)).error, 'deleteRefreshRequired');
  assert.equal((await manager.deleteSaved(original)).error, 'deleteRefreshRequired');
  api.loadMatches = async () => ({ ok: true, matches: [original], invalidCount: 0 });
  await manager.loadSaved();
  assert.equal(manager.view().deleteNeedsRefresh, false);
  api.deleteMatch = async () => ({ ok: false, error: 'deleteRateLimited' });
  assert.equal((await manager.deleteSaved(original)).error, 'deleteRateLimited');
});

test('GET started before DELETE cannot resurrect a deleted row or unlock a newer read', async () => {
  const { api, manager, setServer } = setup();
  setServer([original]);
  await manager.loadSaved();
  const oldRead = deferred();
  const newRead = deferred();
  let reads = 0;
  api.loadMatches = () => reads++ ? newRead.promise : oldRead.promise;
  const first = manager.loadSaved();
  await manager.deleteSaved(original);
  oldRead.resolve({ ok: true, matches: [original], invalidCount: 0 });
  await first;
  assert.deepEqual(plain(manager.view().saved), []);
  assert.equal(manager.view().loading, true);
  newRead.resolve({ ok: true, matches: [], invalidCount: 0 });
  await tick();
  assert.equal(manager.view().loading, false);
});

test('navigation ignores a late delete result and a fresh manager starts normally', async () => {
  const { api, manager, calls, setServer } = setup();
  setServer([original]);
  await manager.loadSaved();
  const pending = deferred();
  api.deleteMatch = () => pending.promise;
  const removing = manager.deleteSaved(original);
  manager.dispose();
  pending.resolve({ ok: true });
  assert.equal((await removing).error, 'pageClosed');
  assert.deepEqual(plain(manager.view().saved), []);
  assert.equal(calls.length, 1);
  assert.equal(manager.view().deleteNeedsRefresh, false);
});

test('invalid or stale delete IDs make no request; stored value is not a deletion precondition', async () => {
  const { manager, calls, setServer } = setup();
  setServer([{ id: ids[0], value: 'malformed' }]);
  await manager.loadSaved();
  assert.equal((await manager.deleteSaved(null)).error, 'deleteRejected');
  assert.equal((await manager.deleteSaved({ id: ids[1] })).error, 'planMissing');
  assert.equal(calls.length, 1);
  assert.equal((await manager.deleteSaved({ id: ids[0] })).ok, true);
});
