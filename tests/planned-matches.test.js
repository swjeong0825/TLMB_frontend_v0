const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const context = vm.createContext({ URLSearchParams, fetch() { throw new Error('Unexpected network request'); } });
context.window = context;
function load(file) { vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context); }
for (const file of ['js/i18n.js', 'js/i18n/en.js', 'js/i18n/ko.js', 'js/nicknames.js', 'js/league-navigation.js',
  'js/chat/roster-model.js', 'js/plan/model.js', 'js/plan/storage.js', 'js/plan/api.js']) load(file);
const plan = context.TLCHAT_PLAN;
const names = context.TLCHAT_NICKNAMES;
const plain = value => JSON.parse(JSON.stringify(value));
const id1 = 'd315f636-10e5-4265-9b19-fc260e1ed224';
const id2 = '719e28b2-bce7-4e48-92a7-204711504dc8';

test('normalizes surrounding whitespace and accepts English/Korean names', () => {
  for (const name of ['Alice', '민수', 'A-1', 'B_2', 'C.3', '  Alice\t']) assert.equal(names.isValid(name), true);
  assert.deepEqual(plain(names.assertNames(['  Alice ', ' 민수\n'])), ['Alice', '민수']);
});

test('rejects empty names, commas, and every documented internal whitespace character', () => {
  for (const value of ['', ' ', null, 42, 'Alice,Bob']) assert.equal(names.isValid(value), false);
  const codes = [9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279];
  for (const code of codes) assert.equal(names.isValid('A' + String.fromCharCode(code) + 'B'), false, String(code));
});

test('bulk delimiters separate names but never turn an internal space/tab into players', () => {
  assert.deepEqual(plain(names.splitList(' Alice, Bob\n민수\r\n')), ['Alice', 'Bob', '민수']);
  assert.throws(() => names.assertNames(names.splitList('Alice Smith,Bob')));
  assert.throws(() => names.assertNames(names.splitList('Alice\tSmith,Bob')));
});

test('the shared payload validator covers every nickname write field and leaves identifiers readable', () => {
  for (const field of ['nickname', 'alias', 'new_nickname', 'player1_nickname', 'player2_nickname',
    'pair1_nicknames', 'pair2_nicknames', 'pair1_player_nicknames', 'pair2_player_nicknames', 'nicknames', 'initial_players']) {
    assert.equal(names.validatePayload({ [field]: ['Alice', 'Bad Name'] }), false, field);
    assert.equal(names.validatePayload({ [field]: 'Bad,Name' }), false, field);
    assert.equal(names.validatePayload({ [field]: ['Alice', '민수'] }), true, field);
  }
  assert.equal(names.validatePayload({ current_nickname: 'Legacy Name', new_nickname: 'Fixed' }), true);
  assert.equal(names.validatePayload({ player1_score: '5', player2_score: '2' }), true);
});

test('rejects pasted line breaks before single-line input sanitization', () => {
  const handlers = {};
  const input = { dataset: {}, addEventListener(k, fn) { handlers[k] = fn; }, setCustomValidity(v) { this.error = v; }, reportValidity() {} };
  names.bindInput(input);
  let prevented = false;
  handlers.paste({ clipboardData: { getData: () => 'Alice\nBob' }, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.ok(input.error);
  handlers.input();
  assert.equal(input.error, '');
});

test('serializes and parses both formats, retaining case, Unicode, order, and repeated matchups', () => {
  for (const [format, sides, value] of [
    ['singles', [[' Alice '], ['민수']], 'Alice 민수'],
    ['doubles', [['Alice', 'Bob'], ['Charlie', 'Diana']], 'Alice,Bob Charlie,Diana'],
    ['singles', [['Alice'], ['Alice']], 'Alice Alice'],
  ]) {
    assert.equal(plan.serialize(format, sides), value);
    assert.deepEqual(plain(plan.parseValue(value)), { format, sides: sides.map(side => side.map(s => s.trim())) });
  }
  assert.throws(() => plan.serialize('both', [['A'], ['B']]));
  assert.throws(() => plan.serialize('doubles', [['A'], ['B']]));
  assert.throws(() => plan.serialize('singles', [['A,B'], ['C']]));
});

test('strict parser rejects invalid stored values instead of guessing participants', () => {
  for (const value of [null, {}, '', 'Alice', ' Alice Bob', 'Alice Bob ', 'Alice  Bob', 'Alice\tBob',
    'Alice\nBob', 'Alice, Bob,Charlie', 'Alice,Bob Charlie', 'Alice Bob,Charlie',
    'Alice,,Bob Charlie,Diana', 'Alice\u00a0Bob Charlie', 'Alice,Bob,Charlie Diana,Eve,Frank']) {
    assert.equal(plan.parseValue(value), null, JSON.stringify(value));
  }
});

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value) };
}

test('drafts survive new controllers, edit with a stable ID, keep insertion order, and remove individually', () => {
  const storage = memoryStorage();
  const store = plan.createDraftStore(() => storage, 'https://api.test', 'league1', () => id1);
  assert.equal(store.save('Alice Bob').ok, true);
  const reloaded = plan.createDraftStore(() => storage, 'https://api.test', 'league1', () => id2);
  assert.equal(reloaded.save('Charlie Diana').ok, true);
  assert.equal(reloaded.save('Alice 민수', id1).ok, true);
  assert.deepEqual(plain(store.read().records), [{ id: id1, value: 'Alice 민수' }, { id: id2, value: 'Charlie Diana' }]);
  assert.equal(store.remove(0, store.read().records[0]).ok, true);
  assert.deepEqual(plain(store.read().records), [{ id: id2, value: 'Charlie Diana' }]);
  assert.equal(store.save('Alice Bob', id1).error, 'planMissing');
});

test('scopes drafts by backend and league and does not persist route credentials', () => {
  const storage = memoryStorage();
  const store = plan.createDraftStore(() => storage, 'https://api.test/', 'league1', randomUUID);
  store.save('Alice Bob');
  assert.equal(plan.createDraftStore(() => storage, 'https://api.test', 'league1', randomUUID).read().records.length, 1);
  assert.equal(plan.createDraftStore(() => storage, 'https://other.test', 'league1', randomUUID).read().records.length, 0);
  assert.equal(plan.createDraftStore(() => storage, 'https://api.test', 'league2', randomUUID).read().records.length, 0);
  const raw = JSON.parse(storage.getItem(store.key));
  assert.deepEqual(Object.keys(raw), ['version', 'matches']);
  assert.deepEqual(Object.keys(raw.matches[0]), ['id', 'value']);
});

test('read-modify-write preserves drafts added by another controller and detects stale removals', () => {
  const storage = memoryStorage();
  const one = plan.createDraftStore(() => storage, 'api', 'league', () => id1);
  const two = plan.createDraftStore(() => storage, 'api', 'league', () => id2);
  one.save('Alice Bob');
  const previous = one.read().records[0];
  two.save('Charlie Diana');
  one.save('Alice Eve', id1);
  assert.equal(two.remove(0, previous).error, 'planMissing');
  assert.equal(two.read().records.length, 2);
});

test('malformed values remain removable; unreadable envelopes are never overwritten', () => {
  const storage = memoryStorage();
  const store = plan.createDraftStore(() => storage, 'api', 'league', randomUUID);
  storage.setItem(store.key, JSON.stringify({ version: 1, matches: [null, { id: id1, value: 'bad' }] }));
  assert.equal(store.read().records.length, 2);
  assert.equal(store.remove(0, null).ok, true);
  assert.equal(store.remove(0, store.read().records[0]).ok, true);
  for (const raw of ['{broken', '{}', '{"version":2,"matches":[]}']) {
    storage.setItem(store.key, raw);
    assert.equal(store.read().ok, false);
    assert.equal(store.save('Alice Bob').ok, false);
    assert.equal(storage.getItem(store.key), raw);
  }
});

test('storage and ID failures never claim success or discard previously saved data', () => {
  const blocked = plan.createDraftStore(() => { throw new Error('blocked'); }, 'api', 'league', randomUUID);
  assert.equal(blocked.read().error, 'storageUnavailable');
  assert.equal(blocked.save('Alice Bob').ok, false);
  const storage = memoryStorage();
  const store = plan.createDraftStore(() => storage, 'api', 'league', randomUUID);
  store.save('Alice Bob');
  const raw = storage.getItem(store.key);
  storage.setItem = () => { throw new Error('quota'); };
  assert.equal(store.save('Charlie Diana').error, 'storageWriteFailed');
  assert.equal(store.remove(0, store.read().records[0]).error, 'storageWriteFailed');
  assert.equal(storage.getItem(store.key), raw);
  const noUUID = plan.createDraftStore(() => memoryStorage(), 'api', 'league', () => { throw new Error('crypto'); });
  assert.equal(noUUID.save('Alice Bob').error, 'saveFailed');
});

test('registration warnings recognize aliases/case and never prevent saving unknown players', () => {
  const roster = { status: 'ok', rules: { auto_register_players_on_match: false }, players: [{ nickname: 'Alice', aliases: ['Ace'] }] };
  assert.deepEqual(plain(plan.registrationWarning('ACE Guest', roster)), { kind: 'unregistered', names: ['Guest'] });
  assert.equal(plan.registrationWarning('Alice,Guest ACE,Guest', roster).names.length, 1);
  assert.equal(plan.registrationWarning('Guest Other', { ...roster, rules: { auto_register_players_on_match: true } }).kind, 'none');
  for (const data of [null, { status: 'error' }, { status: 'ok' }, { ...roster, rules: {} }]) {
    assert.equal(plan.registrationWarning('Guest Other', data).kind, 'unavailable');
  }
  assert.equal(plan.createDraftStore(() => memoryStorage(), 'api', 'league', randomUUID).save('Guest Other').ok, true);
});

test('upload payload uses only id/value without mutating local records', () => {
  const records = Object.freeze([Object.freeze({ id: id1, value: 'Alice Bob', extra: 'ignored' })]);
  const payload = plan.uploadPayload(records);
  assert.deepEqual(plain(payload), { matches: [{ id: id1, value: 'Alice Bob' }] });
  for (const rows of [[], [null], [{ id: 'bad', value: 'Alice Bob' }], [{ id: id1, value: 'bad' }], [records[0], records[0]],
    [records[0], { id: id1.toUpperCase(), value: 'Alice Bob' }]]) {
    assert.throws(() => plan.uploadPayload(rows));
  }
  assert.equal(records[0].extra, 'ignored');
});

test('navigation preserves only league context, including language, token, and API overrides', () => {
  const link = context.TLCHAT_NAVIGATION.leagueUrl('/league/plan/', '?league_id=a&host_token=test-token&lang=ko&backendApi=http%3A%2F%2Flocal&chatApi=http%3A%2F%2Fchat&ignored=x', 'a');
  const url = new URL(link, 'https://frontend.test');
  assert.equal(url.pathname, '/league/plan/');
  assert.equal(url.searchParams.get('host_token'), 'test-token');
  assert.equal(url.searchParams.get('backendApi'), 'http://local');
  assert.equal(url.searchParams.get('chatApi'), 'http://chat');
  assert.equal(url.searchParams.get('lang'), 'ko');
  assert.equal(url.searchParams.has('ignored'), false);
});

test('registration/alias HTTP adapters reject invalid names before making requests', async () => {
  context.TLCHAT_CHAT.backendMainBase = () => 'https://api.test';
  load('js/chat/roster-actions.js');
  const roster = context.TLCHAT_CHAT.createRosterActionApi({ route: { leagueId: 'a', hostToken: 'test' } });
  await assert.rejects(roster.addPlayers(['Bad Name']), /whitespace/);
  await assert.rejects(roster.addAlias('player-id', 'Bad,Alias'), /whitespace/);
});

test('initial league player validation rejects invalid chips and pending text', () => {
  context.TLCHAT_CREATE_LEAGUE = { t: key => key };
  load('js/create-league/model.js');
  const pending = { value: '' };
  const form = { querySelector: () => ({ querySelector: () => pending }), auto_register_players_on_match: { checked: true } };
  const payload = { title: 'League', host_email: 'host@example.com', initial_players: ['Bad Name'] };
  assert.equal(context.TLCHAT_CREATE_LEAGUE.validateCreateLeagueForm(form, payload).ok, false);
  payload.initial_players = ['Alice'];
  assert.equal(context.TLCHAT_CREATE_LEAGUE.validateCreateLeagueForm(form, payload).ok, true);
  pending.value = 'Bad Name';
  assert.equal(context.TLCHAT_CREATE_LEAGUE.validateCreateLeagueForm(form, payload).ok, false);
});

test('recording and rename submissions reject invalid names before backend access', async () => {
  const errors = [];
  const chat = context.TLCHAT_CHAT;
  let payload;
  chat.collectWriteForm = () => payload;
  chat.validateWriteBody = () => [];
  load('js/chat/write-success.js');
  load('js/chat/write-errors.js');
  load('js/chat/write-actions.js');
  const controller = chat.createWriteActionController({ appendErrorPlain: message => errors.push(message) });
  for (const value of [{ player1_nickname: 'Bad Name', player2_nickname: 'Bob' },
    { pair1_nicknames: ['Alice', 'Bad,Name'], pair2_nicknames: ['Bob', 'Eve'] }, { new_nickname: 'Bad Name' }]) {
    payload = value;
    await controller.submitBackendAction(null, 'POST', '/matches', {});
  }
  assert.equal(errors.length, 3);
  assert.ok(errors.every(message => message.includes('whitespace')));
});
