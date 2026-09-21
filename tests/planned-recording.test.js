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
  const context = vm.createContext({ fetch: (url, init) => {
    if (url.endsWith('/openapi.json') && !options.rawFetch) return Promise.resolve(success({ paths: Object.fromEntries(
      ['matches', 'singles-matches'].map(endpoint => ['/leagues/{league_id}/' + endpoint, { post: {
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Result' } } } },
      } }])
    ), components: { schemas: { Result: { properties: { planned_match_id: {} } } } } }));
    return fetch(url, init);
  }, AbortController,
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

test('singles and doubles POST the saved ID, exact sides and string scores to the existing endpoints', async () => {
  const calls = [];
  const resultBody = { match_id: '3e846a0f-6ef1-42f6-971b-45e2fa920697', created_at: '2026-09-20T12:34:56.123456Z' };
  const { plan, timers } = setup(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 201, json: async () => resultBody };
  });
  const before = JSON.stringify(matches);
  for (const record of matches) assert.deepEqual(plain(await plan.recordMatch('league/test', record, 0, '21')), { ok: true, ...resultBody });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.url), ['https://backend.test/leagues/league%2Ftest/singles-matches', 'https://backend.test/leagues/league%2Ftest/matches']);
  assert.deepEqual(JSON.parse(calls[0].options.body), { player1_nickname: 'Alice', player2_nickname: 'Bob', player1_score: '0', player2_score: '21', planned_match_id: matches[0].id });
  assert.deepEqual(JSON.parse(calls[1].options.body), { pair1_nicknames: ['Alice', '민수'], pair2_nicknames: ['Guest1', 'Guest2'], pair1_score: '0', pair2_score: '21', planned_match_id: matches[1].id });
  for (const { options } of calls) {
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'omit');
    assert.deepEqual(plain(options.headers), { 'Content-Type': 'application/json', Accept: 'application/json' });
    assert.ok(options.signal instanceof AbortSignal);
  }
  assert.equal(timers.size, 0);
  assert.equal(JSON.stringify(matches), before);
});

test('recording distinguishes backend errors and safely handles alternate envelopes', async () => {
  const cases = [
    [404, 'LeagueNotFoundError', 'plannedLeagueMissing'], [404, 'PlannedMatchNotFoundError', 'plannedMissing'],
    [409, 'PlannedMatchMismatchError', 'plannedMismatch'], [422, 'InvalidPlannedMatchError', 'plannedInvalidMatch'],
    [422, 'InvalidPlayerNicknameError', 'plannedInvalidNickname'], [422, 'InvalidSetScoreError', 'plannedScoreRequired'],
    [422, 'RosterMembershipRequiredError', 'plannedRosterRequired'],
    ...['SamePlayerWithinSinglePairError', 'SamePlayerOnBothPairsError', 'SamePlayerOnBothSidesError'].map(code => [422, code, 'plannedRepeatedPlayer']),
    ...['PairConflictError', 'SamePairOnBothSidesError'].map(code => [409, code, 'plannedRuleConflict']),
    ...['DuplicatePairMatchupMatchError', 'DuplicateSinglesMatchupMatchError'].map(code => [409, code, 'plannedRematchConflict']),
    [429, '', 'plannedRateLimited'], [422, '', 'plannedRejected'], [422, 'constructor', 'plannedRejected'],
  ];
  for (const [status, code, error] of cases) {
    const { plan, timers } = setup(async () => ({ status, json: async () => ({ error: code, detail: [{ msg: 'bad' }], missing_nicknames: ['Guest', null, 6] }) }));
    const result = await plan.recordMatch(leagueId, matches[0], '6', '3');
    assert.equal(result.error, error);
    assert.equal(result.unconfirmed, false);
    assert.equal(result.detail, '');
    assert.deepEqual(plain(result.missing), ['Guest']);
    assert.equal(timers.size, 0);
  }
});

test('unreadable or incomplete success, 5xx, and network errors are unconfirmed without automatic retry', async () => {
  const bodies = [null, {}, { match_id: 'bad', created_at: '2026-09-20T12:00:00Z' },
    { match_id: matches[0].id, created_at: 'bad' }, { match_id: matches[0].id }];
  const variants = bodies.map(body => async () => ({ status: 201, json: async () => body }));
  variants.push(async () => { throw new Error('Offline'); },
    async () => ({ status: 201, json: async () => { throw new Error('JSON'); } }),
    async () => ({ status: 503, json: async () => ({ detail: '<b>error</b>' }) }),
    async () => ({ status: 200, json: async () => ({ match_id: matches[0].id, created_at: '2026-09-20T12:00:00Z' }) }));
  for (const variant of variants) {
    let count = 0;
    const { plan, timers } = setup((...args) => { count++; return variant(...args); });
    const result = await plan.recordMatch(leagueId, matches[0], '6', '3');
    assert.equal(result.error, 'plannedUnconfirmed');
    assert.equal(result.unconfirmed, true);
    assert.equal(result.reconcile, true);
    assert.equal(result.review, true);
    assert.equal(count, 1);
    assert.equal(timers.size, 0);
  }
});

test('recording times out after 30 seconds without claiming cancellation or retrying', async () => {
  let count = 0;
  const { plan, timers } = setup((_url, options) => {
    count++;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Abort'))));
  });
  const pending = plan.recordMatch(leagueId, matches[1], '6', '6');
  await new Promise(resolve => setImmediate(resolve));
  const [timer] = timers;
  assert.equal(timer.ms, 30000);
  timer.fn();
  assert.equal((await pending).unconfirmed, true);
  assert.equal(count, 1);
  assert.equal(timers.size, 0);
});

test('recording requires two valid scores and a valid selected plan', async () => {
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
  assert.match(html, /data-planned-id=/);
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

test('pending rows lock both scores and submit, and backend error details are escaped', () => {
  const { chat } = setup(() => assert.fail('Must not fetch'));
  const html = chat.renderPlannedScoreList([matches[0]], { [matches[0].id]: {
    value: matches[0].value, scores: ['6','0'], pending: true, disabled: true,
    error: { error: 'plannedRejected', detail: '<script>bad</script>' },
  } });
  assert.equal((html.match(/<select disabled/g) || []).length, 2);
  assert.match(html, /type="submit" class="btn-secondary" disabled/);
  assert.match(html, /plannedRecording/);
  assert.match(html, /&lt;script&gt;bad/);
  assert.doesNotMatch(html, /<script>/);
});

test('an outdated, unavailable, or malformed API schema prevents any result POST', async () => {
  for (const response of [success({ paths: {} }), { ok: false, status: 404 }, success(null),
    success({ paths: { '/leagues/{league_id}/singles-matches': { post: { requestBody: { content: { 'application/json': { schema: { properties: { player1_score: {} } } } } } } } } })]) {
    const calls = [];
    const { plan } = setup(async (url, options) => { calls.push({ url, options }); return response; }, { rawFetch: true });
    const result = await plan.recordMatch(leagueId, matches[0], '6', '3');
    assert.equal(result.error, 'plannedBackendUnavailable');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://backend.test/openapi.json');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.credentials, 'omit');
    assert.equal(calls[0].options.cache, 'no-store');
  }
});

test('history reconciliation rejects malformed envelopes instead of treating them as an empty history', async () => {
  for (const body of [null, {}, { matches: {} }, { matches: null }]) {
    const context = vm.createContext({ URLSearchParams, fetch: async () => ({ ok: true, text: async () => JSON.stringify(body) }),
      TLCHAT_CHAT: { backendMainBase: () => 'https://backend.test' } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/chat/api.js'), 'utf8'), context);
    assert.equal((await context.TLCHAT_CHAT.fetchLeagueMatchHistory(leagueId, 'both')).ok, false);
  }
});

test('completed cards show escaped plain scores and a disabled Recorded button with no score inputs', () => {
  const { chat } = setup(() => assert.fail('Rendering must not fetch'));
  for (const record of matches) {
    const html = chat.renderPlannedScoreList([record], { [record.id]: {
      value: record.value, scores: ['6', '0'], recorded: true,
    } });
    assert.match(html, /class="planned-score-row is-recorded"/);
    assert.match(html, /data-planned-recorded="true"/);
    assert.match(html, /class="planned-score-value">6<\/span>/);
    assert.match(html, /class="planned-score-value">0<\/span>/);
    assert.match(html, /type="button" class="btn-secondary" disabled>plannedRecordedButton/);
    assert.doesNotMatch(html, /<select|<input|type="submit"/);
  }
  const html = chat.renderPlannedScoreList(matches, { [matches[0].id]: {
    value: matches[0].value, scores: ['0', '6'], recorded: true, disabled: true,
  } });
  assert.equal((html.match(/<select /g) || []).length, 2);
  assert.equal((html.match(/type="submit"/g) || []).length, 1);
  assert.equal((html.match(/plannedRecordedButton/g) || []).length, 1);
});
