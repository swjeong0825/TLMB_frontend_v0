const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const leagueId = '2166134f-934b-4f59-af2b-bdb1cb1b49db';
const matches = Object.freeze([
  Object.freeze({ id: 'd315f636-10e5-4265-9b19-fc260e1ed224', value: 'Alice Bob' }),
  Object.freeze({ id: '719e28b2-bce7-4e48-92a7-204711504dc8', value: 'Alice,민수 Guest1,Guest2' }),
]);
const payload = Object.freeze({ matches });
const plain = value => JSON.parse(JSON.stringify(value));
const success = data => ({ ok: true, status: 200, json: async () => data });

function setup(fetch, options = {}) {
  const timers = new Set();
  const context = vm.createContext({ fetch, AbortController,
    setTimeout(fn, ms) { const timer = { fn, ms }; timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); },
    TLCHAT_CHAT: { backendMainBase: () => options.base ?? 'https://backend.test/' },
  });
  for (const file of ['js/nicknames.js', 'js/plan/model.js', 'js/plan/storage.js', 'js/plan/api.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return { plan: context.TLCHAT_PLAN, timers };
}

test('uploads one compact batch to Backend Main without cookies or a host token', async () => {
  const calls = [];
  const { plan, timers } = setup(async (url, options) => {
    calls.push({ url, options });
    return success({ matches: matches.map(match => ({ ...match })) });
  });
  const result = await plan.uploadMatches(leagueId, payload);
  assert.deepEqual(plain(result), { ok: true, matches });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://backend.test/leagues/${leagueId}/planned-matches`);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.deepEqual(plain(calls[0].options.headers), { 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(timers.size, 0);
});

test('honors configured API prefixes and encodes the league path component', async () => {
  let requestUrl;
  const { plan } = setup(async url => { requestUrl = url; return success(payload); }, { base: 'http://localhost:3004/__fixture///' });
  assert.equal((await plan.uploadMatches('league/test?token=secret', payload)).ok, true);
  assert.equal(requestUrl, 'http://localhost:3004/__fixture/leagues/league%2Ftest%3Ftoken%3Dsecret/planned-matches');
});

test('bad local plans or missing configuration never reach the network', async () => {
  const fail = () => { throw new Error('Unexpected fetch'); };
  const { plan, timers } = setup(fail);
  for (const input of [null, {}, { matches: [] }, { matches: [{ id: 'bad', value: 'Alice Bob' }] },
    { matches: [matches[0], { ...matches[0], id: matches[0].id.toUpperCase() }] }]) {
    assert.equal((await plan.uploadMatches(leagueId, input)).error, 'invalidUpload');
  }
  assert.equal((await plan.uploadMatches('', payload)).error, 'uploadConfigError');
  assert.equal((await setup(fail, { base: '' }).plan.uploadMatches(leagueId, payload)).error, 'uploadConfigError');
  assert.equal(timers.size, 0);
});

for (const [status, error] of [[404, 'uploadLeagueMissing'], [422, 'uploadRejected'], [500, 'uploadFailed'], [429, 'uploadFailed']]) {
  test(`handles HTTP ${status} without depending on the backend error envelope`, async () => {
    const { plan, timers } = setup(async () => ({ ok: false, status, json() { throw new Error('Must not parse error copy'); } }));
    assert.deepEqual(plain(await plan.uploadMatches(leagueId, payload)), { ok: false, error, status });
    assert.equal(timers.size, 0);
  });
}

test('network, malformed JSON, and incomplete/mismatched acknowledgements remain unconfirmed', async () => {
  const cases = [
    async () => { throw new Error('Offline'); },
    async () => ({ ok: true, json: async () => { throw new Error('HTML response'); } }),
    ...[null, {}, { matches: [] }, { matches: [matches[0]] }, { matches: [matches[0], matches[0]] },
      { matches: [matches[0], { ...matches[1], value: 'Changed Value' }] },
      { matches: [matches[0], { ...matches[1], id: '00000000-0000-0000-0000-000000000000' }] }]
      .map(data => async () => success(data)),
  ];
  for (const fetch of cases) {
    const { plan, timers } = setup(fetch);
    assert.equal((await plan.uploadMatches(leagueId, payload)).error, 'uploadUnconfirmed');
    assert.equal(timers.size, 0);
  }
});

test('acknowledgement may normalize UUID case or reorder the batch', async () => {
  const data = { matches: matches.map(match => ({ id: match.id.toUpperCase(), value: match.value })).reverse() };
  const { plan } = setup(async () => success(data));
  assert.equal((await plan.uploadMatches(leagueId, payload)).ok, true);
});

test('slow requests time out, release busy resources, and can be retried', async () => {
  const { plan, timers } = setup((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  const pending = plan.uploadMatches(leagueId, payload);
  assert.equal(timers.size, 1);
  const [timer] = timers;
  assert.equal(timer.ms, 30000);
  timer.fn();
  assert.equal((await pending).error, 'uploadUnconfirmed');
  assert.equal(timers.size, 0);
});

test('successful uploads and retries preserve local IDs/values; later edits use the same ID', async () => {
  const requests = [];
  let attempt = 0;
  const { plan } = setup(async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (attempt++ === 0) throw new Error('Connection lost after commit');
    return success(body);
  });
  const memory = new Map();
  const store = plan.createDraftStore(() => ({ getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value) }), 'backend', leagueId, () => matches[0].id);
  store.save(matches[0].value);
  const before = memory.get(store.key);
  assert.equal((await plan.uploadMatches(leagueId, { matches: store.read().records })).ok, false);
  assert.equal(memory.get(store.key), before);
  assert.equal((await plan.uploadMatches(leagueId, { matches: store.read().records })).ok, true);
  assert.equal(memory.get(store.key), before);
  assert.deepEqual(requests[0], requests[1]);
  store.save('Alice Guest', matches[0].id);
  assert.equal((await plan.uploadMatches(leagueId, { matches: store.read().records })).ok, true);
  assert.deepEqual(requests[2].matches, [{ id: matches[0].id, value: 'Alice Guest' }]);
});
