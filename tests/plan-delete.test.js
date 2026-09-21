const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const league = '2166134f-934b-4f59-af2b-bdb1cb1b49db';
const id = '719e28b2-bce7-4e48-92a7-204711504dc8';
const record = Object.freeze({ id, value: 'Alice,민수 Bob,Guest' });
const plain = value => JSON.parse(JSON.stringify(value));
function setup(fetch, base = 'https://backend.test/prefix///') {
  const timers = new Set();
  const context = vm.createContext({ fetch, AbortController,
    setTimeout(fn, ms) { const timer = { fn, ms }; timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); },
    TLCHAT_CHAT: { backendMainBase: () => base },
  });
  for (const file of ['js/nicknames.js', 'js/plan/model.js', 'js/plan/api.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return { api: context.TLCHAT_PLAN, timers };
}

test('DELETE uses the configured backend, league and ID only; empty 204 is never parsed', async () => {
  const calls = [];
  const { api, timers } = setup(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 204, json() { assert.fail('204 has no JSON body'); } };
  });
  for (const value of ['Alice Bob', record.value, 'malformed']) {
    assert.deepEqual(plain(await api.deleteMatch(league, { id, value })), { ok: true });
  }
  for (const call of calls) {
    assert.equal(call.url, `https://backend.test/prefix/leagues/${league}/planned-matches/${id}`);
    assert.equal(call.options.method, 'DELETE');
    assert.equal(call.options.credentials, 'omit');
    assert.deepEqual(plain(call.options.headers), { Accept: 'application/json' });
    assert.equal('body' in call.options, false);
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  assert.equal(timers.size, 0);
});

test('invalid plan IDs and missing configuration never send deletion requests', async () => {
  const fail = () => assert.fail('Unexpected request');
  const { api, timers } = setup(fail);
  for (const entry of [null, {}, { id: 1 }, { id: 'bad/path' }, { id: id + '?token=secret' }]) {
    assert.equal((await api.deleteMatch(league, entry)).error, 'deleteRejected');
  }
  assert.equal((await api.deleteMatch('', record)).error, 'deleteConfigError');
  assert.equal((await setup(fail, '').api.deleteMatch(league, record)).error, 'deleteConfigError');
  assert.equal(timers.size, 0);
});

test('league path components are encoded and uppercase UUIDs retain their spelling', async () => {
  let requested;
  const { api } = setup(async url => { requested = url; return { status: 204 }; });
  await api.deleteMatch('league/other?x=1', { id: id.toUpperCase() });
  assert.equal(requested, `https://backend.test/prefix/leagues/league%2Fother%3Fx%3D1/planned-matches/${id.toUpperCase()}`);
});

for (const [status, body, error, unconfirmed] of [
  [404, { error: 'LeagueNotFoundError' }, 'deleteLeagueMissing', false],
  [404, { error: 'PlannedMatchNotFoundError' }, 'deletePlanMissing', false],
  [404, { detail: 'Not Found' }, 'deleteUnavailable', false],
  [405, null, 'deleteUnavailable', false],
  [422, { detail: [{ msg: 'Invalid UUID' }] }, 'deleteRejected', false],
  [429, {}, 'deleteRateLimited', false],
  [403, {}, 'deleteFailed', false],
  [500, { error: 'PlannedMatchNotFoundError' }, 'deleteUnconfirmed', true],
  [503, null, 'deleteUnconfirmed', true],
  [200, { ok: true }, 'deleteUnconfirmed', true],
  [202, {}, 'deleteUnconfirmed', true],
]) {
  test(`deletion classifies ${status} ${JSON.stringify(body)} as ${error}`, async () => {
    const { api, timers } = setup(async () => ({ status, ok: status < 300,
      async json() { if (body === null) throw new Error('Non-JSON proxy response'); return body; },
    }));
    assert.deepEqual(plain(await api.deleteMatch(league, record)), { ok: false, status, error, unconfirmed });
    assert.equal(timers.size, 0);
  });
}

test('network loss and timeout are unconfirmed and do not automatically retry', async () => {
  const { api } = setup(async () => { throw new Error('Connection lost after commit'); });
  assert.equal((await api.deleteMatch(league, record)).unconfirmed, true);
  let calls = 0;
  const slow = setup((_url, options) => new Promise((_resolve, reject) => {
    calls++;
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  const pending = slow.api.deleteMatch(league, record);
  const [timer] = slow.timers;
  assert.equal(timer.ms, 30000);
  timer.fn();
  assert.equal((await pending).unconfirmed, true);
  assert.equal(slow.timers.size, 0);
  assert.equal(calls, 1);
});
