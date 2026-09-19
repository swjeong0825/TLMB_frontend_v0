(function (global) {
  "use strict";

  function normalize(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function isValid(value) {
    var name = normalize(value);
    return !!name && !/[\s,]/u.test(name);
  }

  function message() {
    return global.TLCHAT_I18N
      ? global.TLCHAT_I18N.t("common.invalidNickname")
      : "Player names must not be empty or contain whitespace or commas.";
  }

  function assertNames(names) {
    if (!Array.isArray(names) || !names.length || names.some(function (name) { return !isValid(name); })) {
      throw new Error(message());
    }
    return names.map(normalize);
  }

  function splitList(text) {
    return String(text || "").split(/[,\r\n]+/).map(normalize).filter(Boolean);
  }

  function bindInput(input) {
    if (input.dataset.nicknameValidationBound) return;
    input.dataset.nicknameValidationBound = "1";
    input.addEventListener("input", function () { input.setCustomValidity(""); });
    input.addEventListener("paste", function (event) {
      var text = event.clipboardData && event.clipboardData.getData("text");
      // Text inputs silently strip pasted line breaks; reject before that happens.
      if (text && !isValid(text)) {
        event.preventDefault();
        input.setCustomValidity(message());
        input.reportValidity();
      }
    });
  }

  // current_nickname identifies an existing player, so legacy names can still be renamed.
  function validatePayload(payload) {
    var fields = ["nickname", "alias", "new_nickname", "player1_nickname", "player2_nickname",
      "pair1_nicknames", "pair2_nicknames", "pair1_player_nicknames", "pair2_player_nicknames",
      "nicknames", "initial_players"];
    return fields.every(function (key) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) return true;
      var values = Array.isArray(payload[key]) ? payload[key] : [payload[key]];
      return values.length > 0 && values.every(isValid);
    });
  }

  global.TLCHAT_NICKNAMES = {
    normalize: normalize, isValid: isValid, message: message,
    assertNames: assertNames, splitList: splitList, validatePayload: validatePayload,
    bindInput: bindInput,
  };
})(typeof window !== "undefined" ? window : this);
