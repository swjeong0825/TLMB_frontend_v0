(function (global) {
  "use strict";

  var api = global.TLCHAT_CHAT = global.TLCHAT_CHAT || {};

  function invalidFormula() {
    throw new Error("Invalid standings formula");
  }

  function finiteNumber(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) invalidFormula();
    return value;
  }

  function field(name) {
    return function (row) { return finiteNumber(row[name]); };
  }

  // English IDs are stable across locales; display labels remain translated.
  var STATS = [
    { id: "W", labelKey: "tableW", get: field("wins") },
    { id: "Won", labelKey: "tableMatchesWon", get: field("wins") },
    { id: "L", labelKey: "tableL", get: field("losses") },
    { id: "D", labelKey: "tableD", get: function (row) {
      return row.draws == null ? 0 : finiteNumber(row.draws);
    } },
    { id: "Played", labelKey: "tableMatchesPlayed", get: field("matches_played") },
    { id: "GamesWon", labelKey: "tableGamesWon", get: field("games_won") },
    { id: "GamesLost", labelKey: "tableGamesLost", get: field("games_lost") },
    { id: "MatchDiff", labelKey: "tableMatchDiff", get: function (row) {
      return finiteNumber(row.wins) - finiteNumber(row.losses);
    } },
    { id: "GamesDiff", labelKey: "tableGamesDiff", get: field("games_diff") },
  ];
  var statsById = Object.create(null);
  STATS.forEach(function (stat) { statsById[stat.id.toLowerCase()] = stat; });

  function precedence(operator) {
    if (operator === "u+" || operator === "u-") return 3;
    if (operator === "*" || operator === "/") return 2;
    return 1;
  }

  /** Compile only the supported arithmetic grammar to reverse Polish notation. */
  function compileStandingsFormula(text) {
    var formula = String(text == null ? "" : text).replace(/\s/g, "");
    if (!formula) invalidFormula();
    var output = [];
    var operators = [];
    var expectOperand = true;
    var i = 0;
    function popOperator() {
      output.push({ operator: operators.pop() });
    }
    while (i < formula.length) {
      var c = formula.charAt(i);
      if (c === "{") {
        if (!expectOperand) invalidFormula();
        var end = formula.indexOf("}", i + 1);
        if (end < 0) invalidFormula();
        var stat = statsById[formula.slice(i + 1, end).toLowerCase()];
        if (!stat) invalidFormula();
        output.push({ stat: stat });
        i = end + 1;
        expectOperand = false;
      } else if (/[0-9.]/.test(c)) {
        if (!expectOperand) invalidFormula();
        var number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(formula.slice(i));
        if (!number) invalidFormula();
        output.push({ number: finiteNumber(Number(number[0])) });
        i += number[0].length;
        expectOperand = false;
      } else if (c === "(") {
        if (!expectOperand) invalidFormula();
        operators.push(c);
        i++;
      } else if (c === ")") {
        if (expectOperand) invalidFormula();
        while (operators.length && operators[operators.length - 1] !== "(") popOperator();
        if (!operators.length) invalidFormula();
        operators.pop();
        i++;
        expectOperand = false;
      } else if (c === "+" || c === "-" || c === "*" || c === "/") {
        if (expectOperand) {
          if (c !== "+" && c !== "-") invalidFormula();
          operators.push("u" + c);
        } else {
          while (operators.length && operators[operators.length - 1] !== "(" &&
            precedence(operators[operators.length - 1]) >= precedence(c)) {
            popOperator();
          }
          operators.push(c);
          expectOperand = true;
        }
        i++;
      } else {
        invalidFormula();
      }
    }
    if (expectOperand) invalidFormula();
    while (operators.length) {
      if (operators[operators.length - 1] === "(") invalidFormula();
      popOperator();
    }
    // Catch invalid constant arithmetic even when the selected dates have no rows.
    evaluateFormulaTokens(output, null, true);
    return { formula: formula, tokens: output };
  }

  function evaluateFormulaTokens(tokens, row, constantsOnly) {
    var values = [];
    tokens.forEach(function (token) {
      if (token.stat) {
        values.push(constantsOnly ? undefined : finiteNumber(token.stat.get(row)));
      } else if (token.number != null) {
        values.push(token.number);
      } else {
        var right = values.pop();
        var result;
        if (token.operator === "u+" || token.operator === "u-") {
          result = right === undefined ? undefined : token.operator === "u-" ? -right : right;
        } else {
          var left = values.pop();
          if (token.operator === "/" && right === 0) invalidFormula();
          if (left === undefined || right === undefined) result = undefined;
          else if (token.operator === "+") result = left + right;
          else if (token.operator === "-") result = left - right;
          else if (token.operator === "*") result = left * right;
          else if (token.operator === "/") {
            result = left / right;
          } else invalidFormula();
        }
        values.push(constantsOnly && result === undefined ? undefined : finiteNumber(result));
      }
    });
    if (values.length !== 1) invalidFormula();
    return constantsOnly && values[0] === undefined ? undefined : finiteNumber(values[0]);
  }

  function evaluateStandingsFormula(compiled, row) {
    return evaluateFormulaTokens(compiled.tokens, row, false);
  }

  function standingsRowsWithMatches(rows) {
    return (rows || []).filter(function (row) {
      return (Number(row.matches_played) || 0) > 0;
    });
  }

  function rankStandingsByFormula(rows, compiled) {
    var scored = standingsRowsWithMatches(rows).map(function (row, index) {
      return { row: row, index: index, value: evaluateStandingsFormula(compiled, row) };
    });
    scored.sort(function (a, b) {
      if (a.value === b.value) return a.index - b.index;
      return a.value > b.value ? -1 : 1;
    });
    var rank = 0;
    return scored.map(function (entry, index) {
      if (!index || entry.value !== scored[index - 1].value) rank = index + 1;
      return Object.assign({}, entry.row, { rank: rank, _user_metric_value: entry.value });
    });
  }

  function formatUserMetric(value) {
    return String(Number(value.toFixed(4)));
  }

  /** Owned by one league-page controller; never persisted or sent to the API. */
  function createStandingsFormulaState() {
    var applied = null;
    return {
      apply: function (text, rows) {
        try {
          var candidate = compileStandingsFormula(text);
          rankStandingsByFormula(rows, candidate);
          applied = candidate;
          return true;
        } catch (_error) {
          return false;
        }
      },
      reset: function () { applied = null; },
      view: function (rows) {
        var view = { formula: applied ? applied.formula : "", active: false, error: false, rows: rows };
        if (applied) {
          try {
            view.rows = rankStandingsByFormula(rows, applied);
            view.active = true;
          } catch (_error) {
            view.error = true;
          }
        }
        return view;
      },
    };
  }

  api.STANDINGS_FORMULA_STATS = STATS;
  api.compileStandingsFormula = compileStandingsFormula;
  api.evaluateStandingsFormula = evaluateStandingsFormula;
  api.standingsRowsWithMatches = standingsRowsWithMatches;
  api.rankStandingsByFormula = rankStandingsByFormula;
  api.formatUserMetric = formatUserMetric;
  api.createStandingsFormulaState = createStandingsFormulaState;
})(typeof window !== "undefined" ? window : this);
