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
const plain = value => JSON.parse(JSON.stringify(value));
const success = data => ({ ok: true, status: 200, json: async () => data });

function setup(fetch, options = {}) {
  const timers = new Set();
  const context = vm.createContext({ fetch, AbortController,
    localStorage: { setItem() { assert.fail('Must not write storage'); }, removeItem() { assert.fail('Must not remove drafts'); } },
    setTimeout(fn, ms) { const timer = { fn, ms }; timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); },
    document: { createElement() { return { textContent: '', get innerHTML() {
      return String(this.textContent).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    } }; } },
  });
  for (const file of ['js/nicknames.js', 'js/chat/core.js', 'js/plan/model.js', 'js/plan/api.js',
    'js/plan/record.js', 'js/chat/render-forms.js', 'js/chat/planned-match-interactions.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  context.TLCHAT_CHAT.backendMainBase = () => options.base ?? 'https://backend.test/';
  context.TLCHAT_CHAT.tr = (key, params) => params ? `${key}:${Object.values(params).join(',')}` : key;
  return { plan: context.TLCHAT_PLAN, chat: context.TLCHAT_CHAT, timers };
}

test('loads compact server plans directly from Backend Main without credentials or mutation', async () => {
  const calls = [];
  const { plan, timers } = setup(async (url, options) => {
    calls.push({ url, options });
    return success({ matches });
  });
  const result = await plan.loadMatches(leagueId);
  assert.deepEqual(plain(result), { ok: true, matches, invalidCount: 0 });
  assert.notEqual(result.matches[0], matches[0]);
  assert.deepEqual(plain(plan.parseValue(result.matches[1].value)), {
    format: 'doubles', sides: [['Alice', '민수'], ['Guest1', 'Guest2']],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://backend.test/leagues/${leagueId}/planned-matches`);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.deepEqual(plain(calls[0].options.headers), { Accept: 'application/json' });
  assert.equal(calls[0].options.body, undefined);
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(timers.size, 0);
});

test('GET honors API overrides and encodes the league path component', async () => {
  let requestUrl;
  const { plan } = setup(async url => { requestUrl = url; return success({ matches: [] }); },
    { base: 'http://localhost:3005/__fixture///' });
  assert.equal((await plan.loadMatches('league/test')).ok, true);
  assert.equal(requestUrl, 'http://localhost:3005/__fixture/leagues/league%2Ftest/planned-matches');
});

test('an empty server list is a successful response', async () => {
  const { plan } = setup(async () => success({ matches: [] }));
  assert.deepEqual(plain(await plan.loadMatches(leagueId)), { ok: true, matches: [], invalidCount: 0 });
});

test('skips malformed and duplicate rows while preserving valid spelling, side order, and server data', async () => {
  const data = { matches: [matches[1], null, {}, { id: 'bad', value: 'Alice Bob' },
    { ...matches[0], value: 'Alice  Bob' }, matches[0],
    { ...matches[0], id: matches[0].id.toUpperCase(), value: 'Other Teams' }] };
  const before = JSON.stringify(data);
  const { plan } = setup(async () => success(data));
  assert.deepEqual(plain(await plan.loadMatches(leagueId)), {
    ok: true, matches: [matches[1], matches[0]], invalidCount: 5,
  });
  assert.equal(JSON.stringify(data), before);
});

test('unknown players are loadable without roster validation or player creation', async () => {
  const data = { matches: [{ ...matches[0], value: 'Unknown1 Unknown2' }] };
  const { plan } = setup(async () => success(data));
  assert.deepEqual(plain((await plan.loadMatches(leagueId)).matches), data.matches);
});

test('missing configuration does not fetch', async () => {
  const fail = () => assert.fail('Must not fetch');
  assert.equal((await setup(fail).plan.loadMatches('')).error, 'plannedLoadFailed');
  assert.equal((await setup(fail, { base: '' }).plan.loadMatches(leagueId)).error, 'plannedLoadFailed');
});

test('HTTP, offline, bad JSON, and bad envelopes produce a recoverable loading error', async () => {
  const cases = [async () => { throw new Error('Offline'); },
    async () => ({ ok: false, status: 500 }), async () => ({ ok: false, status: 429 }),
    async () => ({ ok: true, json: async () => { throw new Error('Bad JSON'); } }),
    ...[null, {}, { matches: null }, { matches: {} }].map(data => async () => success(data)),
  ];
  for (const fetch of cases) {
    const { plan, timers } = setup(fetch);
    assert.equal((await plan.loadMatches(leagueId)).error, 'plannedLoadFailed');
    assert.equal(timers.size, 0);
  }
  const { plan } = setup(async () => ({ ok: false, status: 404 }));
  assert.equal((await plan.loadMatches(leagueId)).error, 'plannedLeagueMissing');
});

test('slow reads time out and can be retried', async () => {
  let attempt = 0;
  const { plan, timers } = setup((_url, options) => attempt++ ? success({ matches }) :
    new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted')))));
  const pending = plan.loadMatches(leagueId);
  const [timer] = timers;
  assert.equal(timer.ms, 30000);
  timer.fn();
  assert.equal((await pending).error, 'plannedLoadFailed');
  assert.equal(timers.size, 0);
  assert.equal((await plan.loadMatches(leagueId)).ok, true);
});

test('recording stub keeps plans intact and never sends HTTP or storage writes, including on retries', async () => {
  const { plan } = setup(() => assert.fail('The recording stub must not fetch'));
  const before = JSON.stringify(matches);
  for (const match of matches) {
    assert.deepEqual(plain(plan.recordPayload(match, 0, '21')), {
      expected_value: match.value, side1_score: '0', side2_score: '21',
    });
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(plain(await plan.recordMatch(leagueId, match, '6', '3')),
        { ok: false, error: 'plannedRecordUnavailable' });
    }
  }
  assert.equal(JSON.stringify(matches), before);
});

test('recording stub requires two valid scores and a valid selected plan', async () => {
  const { plan } = setup(() => assert.fail('Must not fetch'));
  for (const invalid of ['', null, undefined, -1, 22, 1.5, '6-3', 'NaN', ' 6', '06']) {
    assert.equal((await plan.recordMatch(leagueId, matches[0], invalid, '3')).error, 'plannedScoreRequired');
    assert.equal((await plan.recordMatch(leagueId, matches[0], '6', invalid)).error, 'plannedScoreRequired');
  }
  assert.equal((await plan.recordMatch(leagueId, { ...matches[0], value: 'bad' }, '6', '3')).error, 'plannedLoadFailed');
  assert.equal((await plan.recordMatch('', matches[0], '6', '3')).error, 'plannedLoadFailed');
});

test('concise score list fixes both teams, escapes nicknames, and has no participant editing controls', () => {
  const { chat } = setup(() => assert.fail('Rendering must not fetch'));
  const records = [matches[0], { ...matches[1], value: 'Alice,민수 <img>,"Guest"' }];
  const html = chat.renderPlannedScoreList(records, {});
  assert.equal((html.match(/<select /g) || []).length, 4);
  assert.equal((html.match(/type="submit"/g) || []).length, 2);
  assert.match(html, /Alice \+ 민수/);
  assert.match(html, /&lt;img&gt; \+ "Guest"/);
  assert.match(html, /&lt;img> \+ &quot;Guest&quot;/); // Attribute escaping follows core.js.
  assert.doesNotMatch(html, /<img>|<input|contenteditable|data-plan-edit|data-plan-remove/);
  assert.doesNotMatch(html, /d315f636|719e28b2/);
});

test('score rendering restores only drafts for the same id and exact matchup value', () => {
  const { chat } = setup(() => assert.fail('Must not fetch'));
  const drafts = { [matches[0].id]: { value: matches[0].value, scores: ['6', '0'] } };
  const html = chat.renderPlannedScoreList([matches[0]], drafts);
  assert.match(html, /value="6" selected/);
  assert.match(html, /value="0" selected/);
  const changed = chat.renderPlannedScoreList([{ ...matches[0], value: 'Alice Guest' }], drafts);
  assert.equal((changed.match(/value="" disabled selected/g) || []).length, 2);
  assert.doesNotMatch(changed, /value="6" selected/);
  assert.match(chat.renderPlannedScoreList([], drafts), /plannedEmpty/);
});
