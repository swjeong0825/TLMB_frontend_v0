const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/chat/standings-formula.js'), 'utf8'), context);
const api = context.TLCHAT_CHAT;
const row = Object.freeze({ rank: 8, nickname: 'Alice', subject_kind: 'player', wins: 4, losses: 2,
  draws: 1, matches_played: 7, games_won: 30, games_lost: 20, games_diff: 10, win_pct: 4 / 7 });
const compute = (formula, stats = row) => api.evaluateStandingsFormula(api.compileStandingsFormula(formula), stats);
const plain = value => JSON.parse(JSON.stringify(value));

for (const [id, expected] of Object.entries({ W: 4, Won: 4, L: 2, D: 1, Played: 7,
  GamesWon: 30, GamesLost: 20, MatchDiff: 2, GamesDiff: 10 })) {
  test(`reads {${id}}`, () => assert.equal(compute(`{${id}}`), expected));
}

test('strips all whitespace, including inside IDs, and ignores case', () => {
  const source = '\t ( { G a M e S w O n }\n - { games LOST } )\u00a0 / {Played} + 3 * {w} ';
  assert.equal(compute(source), 10 / 7 + 12);
  assert.equal(api.compileStandingsFormula(source).formula, '({GaMeSwOn}-{gamesLOST})/{Played}+3*{w}');
});

for (const [expression, expected] of [
  ['2+3*4', 14], ['(2+3)*4', 20], ['8/2/2', 2], ['8-3-2', 3],
  ['-(2+3)*+4', -20], ['2*-3', -6], ['--{W}', 4], ['{W}--{L}', 6],
  ['1.5+.25*2', 2], ['1.', 1], ['-(-(-{L}))', -2], ['2/-(1+1)', -1],
]) {
  test(`evaluates ${expression}`, () => assert.equal(compute(expression), expected));
}

for (const expression of ['', ' ', '{Games}', '{GameLost}', '{Win%}', '{Rank}', '{UserMetric}',
  '{Match±}', '{Games±}', '{Unknown}', '{__proto__}', '{constructor}', '{W', 'W}', '{}', '{{W}}',
  '(1+2', '1+2)', '()', '{W}+', '*2', '2**3', '2^3', '2%3', '2(3)', '(2)(3)', '{W}{L}',
  '1.2.3', '.', '1e2', '0x10', 'Infinity', 'NaN', 'Math.max(1,2)', 'alert(1)', '1;2', '<script>']) {
  test(`rejects unsupported or malformed input ${JSON.stringify(expression)}`, () => {
    assert.throws(() => api.compileStandingsFormula(expression));
  });
}

test('rejects non-finite constants and arithmetic results', () => {
  assert.throws(() => compute('9'.repeat(400)));
  assert.throws(() => compute('{W}*2', { ...row, wins: Number.MAX_VALUE }));
  assert.throws(() => compute('{MatchDiff}', { ...row, wins: Number.MAX_VALUE, losses: -Number.MAX_VALUE }));
});

test('rejects division by zero including negative and computed zero', () => {
  for (const expression of ['1/0', '1/-0', '{W}/({L}-2)', '0/0']) assert.throws(() => compute(expression));
});

test('rejects missing/non-numeric referenced values without coercion', () => {
  for (const value of [undefined, null, '4', '', true, {}, NaN, Infinity]) {
    assert.throws(() => compute('{W}', { ...row, wins: value }));
  }
  assert.throws(() => compute('{MatchDiff}', { ...row, losses: undefined }));
  assert.equal(compute('{W}', { wins: 4 }), 4); // Unreferenced stats are irrelevant.
});

test('omitted/null draws count as zero, but non-numeric draws are invalid', () => {
  assert.equal(compute('{D}', {}), 0);
  assert.equal(compute('{D}', { draws: null }), 0);
  assert.throws(() => compute('{D}', { draws: '0' }));
});

const rows = Object.freeze([
  row,
  Object.freeze({ ...row, rank: 2, nickname: 'Bob', games_diff: 20 }),
  Object.freeze({ ...row, rank: 3, nickname: 'Charlie', games_diff: 10 }),
  Object.freeze({ ...row, rank: 4, nickname: 'Diana', games_diff: -5 }),
  Object.freeze({ rank: 5, nickname: 'No matches', matches_played: 0 }),
]);

test('ranks descending with stable competition ties and no mutation', () => {
  const before = JSON.stringify(rows);
  const ranked = api.rankStandingsByFormula(rows, api.compileStandingsFormula('{GamesDiff}'));
  assert.deepEqual(plain(ranked.map(r => [r.nickname, r.rank, r._user_metric_value])), [
    ['Bob', 1, 20], ['Alice', 2, 10], ['Charlie', 2, 10], ['Diana', 4, -5],
  ]);
  assert.equal(JSON.stringify(rows), before);
  assert.notEqual(ranked[1], row);
});

test('does not use display rounding to sort or tie', () => {
  const ranked = api.rankStandingsByFormula([
    { ...row, wins: 1.00001 }, { ...row, wins: 1.00002 },
  ], api.compileStandingsFormula('{W}'));
  assert.deepEqual(plain(ranked.map(r => [r.wins, r.rank])), [[1.00002, 1], [1.00001, 2]]);
  assert.equal(api.formatUserMetric(ranked[0]._user_metric_value), '1');
  assert.equal(api.formatUserMetric(1.234567), '1.2346');
  assert.equal(api.formatUserMetric(-0.000001), '0');
  assert.equal(api.formatUserMetric(-2.5), '-2.5');
});

test('invalid replacements preserve the previously applied formula and ranking', () => {
  const state = api.createStandingsFormulaState();
  assert.equal(state.apply('{ Games Diff }', rows), true);
  const before = plain(state.view(rows));
  assert.equal(state.apply('{W}/0', rows), false);
  assert.deepEqual(plain(state.view(rows)), before);
  assert.equal(state.apply('{W}+', rows), false);
  assert.deepEqual(plain(state.view(rows)), before);
  assert.equal(state.apply('-{GamesDiff}', rows), true);
  assert.equal(state.view(rows).rows[0].nickname, 'Diana');
});

test('one failing row prevents the entire formula from being applied', () => {
  const state = api.createStandingsFormulaState();
  assert.equal(state.apply('{W}/{L}', [row, { ...row, losses: 0 }]), false);
  assert.equal(state.view(rows).active, false);
});

test('reset restores the exact backend dataset and a fresh controller forgets formulas', () => {
  const state = api.createStandingsFormulaState();
  state.apply('{GamesDiff}', rows);
  state.reset();
  const view = state.view(rows);
  assert.equal(view.rows, rows);
  assert.equal(view.active, false);
  assert.equal(view.formula, '');
  assert.equal(view.error, false);
  assert.equal(api.createStandingsFormulaState().view(rows).formula, '');
});

test('data refresh errors suspend ranking without losing the formula; later data recovers', () => {
  const state = api.createStandingsFormulaState();
  assert.equal(state.apply('{W}/{L}', rows), true);
  const invalidData = [{ ...row, losses: 0 }];
  const failed = state.view(invalidData);
  assert.equal(failed.rows, invalidData);
  assert.equal(failed.formula, '{W}/{L}');
  assert.equal(failed.error, true);
  assert.equal(failed.active, false);
  const recovered = state.view([{ ...row, losses: 4 }]);
  assert.equal(recovered.error, false);
  assert.equal(recovered.active, true);
  assert.equal(recovered.rows[0]._user_metric_value, 1);
});

test('rejects constant division by zero even with no eligible rows', () => {
  const state = api.createStandingsFormulaState();
  for (const expression of ['1/0', '{W}/0', '{W}/(2-2)']) {
    assert.equal(state.apply(expression, []), false);
  }
});

test('supports empty filtered datasets and pair rows', () => {
  const state = api.createStandingsFormulaState();
  assert.equal(state.apply('{W}', []), true);
  assert.equal(state.view([]).rows.length, 0);
  const pair = { ...row, subject_kind: 'pair', player1_nickname: 'Alice', player2_nickname: 'Bob' };
  assert.equal(state.view([pair]).rows[0].player2_nickname, 'Bob');
});

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
Object.assign(api, { tr: () => '', escapeHtml: escape, escapeAttr: escape });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/chat/render-standings.js'), 'utf8'), context);

test('renders one highlighted User Metric column after the subject; Win % stays visible', () => {
  const state = api.createStandingsFormulaState();
  state.apply('{GamesDiff}', rows);
  const view = state.view(rows);
  const html = api.renderStandings({ standings: view.rows, tie_breakers: ['matches_won'], _standings_formula: view });
  assert.match(html, /Player<\/th><th class="standings-metric-rank" aria-sort="descending"><strong>User Metric/);
  assert.match(html, /<th>Won<\/th>/);
  assert.match(html, /Win %/);
  assert.equal((html.match(/User Metric/g) || []).length, 1);
  state.reset();
  const original = api.renderStandings({ standings: rows, tie_breakers: ['matches_won'] });
  assert.doesNotMatch(original, /User Metric/);
  assert.match(original, /standings-metric-rank"><strong>Won/);
});

test('escapes formula input and offers only supported identifiers', () => {
  const html = api.renderStandingsFormulaControls({ _standings_formula: { formula: '\"><script>alert(1)</script>' } });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
  assert.match(html, /\{MatchDiff\}/);
  assert.match(html, /\{GamesDiff\}/);
  assert.doesNotMatch(html, /\{Win%\}|\{Games\}|\{GameLost\}/);
});
