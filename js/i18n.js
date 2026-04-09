/**
 * Vanilla i18n: shared dictionary + t() helper.
 * Locale: ?lang=en|ko (persisted), then localStorage tlchat-locale, then navigator.
 *
 * Exposes window.TLCHAT_I18N { t, getLocale, setLocale, applyDom, initPage, wireLocaleSwitchers }
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "tlchat-locale";
  var SUPPORTED = { en: true, ko: true };

  var STRINGS = {
    en: {
      meta: {
        titleHome: "Tennis League Management Bot",
        titleFindLeague: "Find a league — Tennis League Management Bot",
        titleCreateLeague: "Create league — Tennis League Management Bot",
        titleFindLeaguePrefix: "League search — Tennis League Management Bot",
        titleDemo: "Demo — Tennis League Management Bot",
        titleLeagueChat: "Tennis League Management Bot",
      },
      footer: {
        backendSource: "Backend source:",
        language: "Language",
      },
      home: {
        h1: "Tennis League Management Bot",
        intro1: "Vanilla client for the chat-to-intent server. Open a league-specific URL to start chatting.",
        intro2: "Chat API base URL is configured in",
        pagesHeading: "Pages",
        linkCreate: "Create league",
        linkFind: "Find league",
        linkFindPrefix: "Find league (URL prefix only)",
        linkDemo: "Demo",
        linkPlayer: "Player",
        linkAdmin: "Admin",
        codeHintPlayer: "/league?league_id={league_id}",
        codeHintAdmin: "/league?league_id={league_id}&host_token={host_token}",
      },
      common: {
        homeLink: "← Home",
        configJs: "js/config.js",
        configHint:
          "API base URL is set in <code>js/config.js</code> or override with <code>?backendApi=https://your-host</code>.",
      },
      findLeague: {
        h1: "Find a league",
        introHtml:
          "Search by the <strong>start of the league title</strong> (case-insensitive). Open the player chat for a league you recognise. Admin access still requires the host token from the organiser.",
        labelTitlePrefix: "Title prefix",
        placeholderPrefix: "e.g. Summer",
        labelMaxResults: "Max results",
        labelMaxResultsHint: "(1–100, default 50)",
        submit: "Search",
        resultsHeading: "Results",
      },
      findLeagueJs: {
        backendNotConfigured: "Backend URL is not configured.",
        enterPrefix: "Enter at least one non-space character to search.",
        unexpectedResponse: "The server returned an unexpected response.",
        missingLeaguesList: "The server response was missing a leagues list.",
        noMatch: "No leagues matched that prefix.",
        oneMatch: "1 league matched.",
        manyMatches: "{n} leagues matched (up to your max results).",
        openPlayerChat: "Open player chat",
        chatTitle: "Chat",
        genericError: "Something went wrong. Please try again.",
        networkError: "We couldn’t reach the server.",
        addPrefixHint: "Add a search prefix to the URL, for example ?prefix=MTB",
        unexpectedResponseShort: "Unexpected response from server.",
        invalidMissingLeagues: "Invalid response: missing leagues list.",
      },
      createLeague: {
        h1: "Create a league",
        introHtml:
          "Creates a new league on the main API and returns your <strong>league ID</strong> and <strong>host token</strong>. Save the host token privately; it is required for admin actions.",
        labelTitle: "League title",
        placeholderTitle: "e.g. Summer Doubles 2026",
        labelDescription: "Description",
        optional: "(optional)",
        placeholderDescription: "Shown to organisers; optional.",
        advancedSummary: "Advanced: custom rules",
        advancedHint:
          "If you leave this closed, the server uses product defaults (one match per team pair, one team per player). Open only if you need different behaviour.",
        labelMatchPair: "Match pair idempotency",
        optionOncePerLeague: "Once per league (recommended)",
        optionAllowMultiple: "Allow multiple matches between the same two teams",
        oneTeamPerPlayer: "One team per player",
        submit: "Create league",
        successH2: "League created",
        successP: "Copy these values somewhere safe. The host token is not shown again.",
        leagueId: "League ID",
        hostToken: "Host token",
        copy: "Copy",
        openChat: "Open chat",
        linkPlayer: "Player (league ID only)",
        linkAdmin: "Admin (includes host token)",
        titleExists: "A league with this title already exists. Try a different name.",
        enterTitle: "Please enter a league title.",
        missingIds: "The server response was missing league_id or host_token.",
        copied: "Copied",
        failed: "Failed",
      },
      errors: {
        generic:
          "Something went wrong. Please try again in a moment, or rephrase your question.",
        network:
          "We couldn’t reach the server. Check your internet connection and try again.",
        cors:
          "The browser blocked the connection to the chat service. If this keeps happening, contact your league admin.",
        leagueNotFound:
          "This league doesn’t exist or isn’t available from this link. Check the league ID or ask your organiser for the correct URL.",
        playerNotFound:
          "We couldn’t find that player in this league. Check the spelling of their nickname.",
        teamNotFound:
          "We couldn’t find a team with those players in this league. Check both nicknames on the roster.",
        matchNotFound:
          "We couldn’t find a match between those teams. Check the four nicknames, or browse the full match list for this league.",
        notFoundFallback:
          "We couldn’t find what you asked for. Double-check spelling and names, or try asking in another way.",
        duplicateMatch:
          "This league only allows one match per pair of teams, and those two teams already have a match. Edit the existing result if you meant to change the score, or use different players if it was a new matchup.",
        titleExists: "A league with this title already exists. Try a different name.",
        forbidden:
          "You don’t have permission for that action. Admins should use the league link that includes the host token.",
        timeout: "The request took too long. Please try again.",
        rateLimit: "Too many requests right now. Wait a short while and try again.",
        serviceUnavailable:
          "The service is temporarily unavailable. Please try again in a little while.",
        badRequest:
          "We couldn’t process that request. Try rephrasing or check the details you entered.",
        serverError: "The service hit a problem. Please try again shortly.",
        loadInfo:
          "We couldn’t load that information right now. Try again in a moment, or ask for something else.",
        unexpectedChat:
          "The chat service didn’t respond as expected. Check your setup or try again later.",
      },
      chat: {
        panelStandings: "Standings",
        panelMatchHistory: "Match history",
        panelRoster: "Roster",
        panelDetails: "Details",
        fieldTeamId: "Team reference",
        fieldMatchId: "Match reference",
        fieldPlayerId: "Player reference",
        fieldCurrentNickname: "Current name",
        fieldNewNickname: "New name",
        fieldTeam1Players: "Team 1 players",
        fieldTeam2Players: "Team 2 players",
        fieldTeam1Nicknames: "Team 1 nicknames",
        fieldTeam2Nicknames: "Team 2 nicknames",
        fieldTeam1Score: "Team 1 score",
        fieldTeam2Score: "Team 2 score",
        fieldMethod: "Method",
        fieldUrl: "URL",
        emDash: "—",
        changesSaved: "Changes were saved.",
        noDetails: "No additional details to show.",
        rosterLoadingNotes:
          "League roster is still loading or could not be loaded; registration previews are unavailable.",
        rosterWarnPlayerTeam:
          "Player {player} is already in the following team: <strong>{team}</strong>",
        newPlayerRegLine:
          "<p class=\"hint roster-note-info\"><strong>New player registration:</strong> Following players will be registered: {list}</p>",
        newTeamLineOne:
          "<p class=\"hint roster-note-info\"><strong>New team registration:</strong> Following team will be created: {team}</p>",
        newTeamLineMany:
          "<p class=\"hint roster-note-info\"><strong>New team registration:</strong> Following teams will be created: {teams}</p>",
        warning: "Warning:",
        rosterHeadingTeams: "Teams",
        rosterHeadingPlayers: "Players",
        rosterEmpty: "Roster is empty.",
        standingsEmpty: "No standings yet.",
        matchesEmpty: "No matches recorded.",
        tableRank: "Rank",
        tableTeam: "Team",
        tableW: "W",
        tableL: "L",
        tableTeams: "Teams",
        tableScore: "Score",
        tableWhen: "When",
        vs: "vs",
        filterFor: "Showing results for {name}.",
        assistantForPlayer: "{title} for {name}",
        noBodyHint: "No request body. Confirm to send.",
        formP1: "P1",
        formP2: "P2",
        intentGetStandingsDesc: "View current win/loss standings for all teams.",
        intentGetStandingsEx1: "show me the standings",
        intentGetStandingsEx2: "who's winning the league?",
        intentGetStandingsEx3: "what's the current leaderboard?",
        intentGetMatchHistoryDesc: "View all recorded match results, most recent first.",
        intentGetMatchHistoryEx1: "show me all the matches",
        intentGetMatchHistoryEx2: "what matches have been played?",
        intentGetMatchHistoryEx3: "what were the recent results?",
        intentGetRosterDesc: "View all registered players and teams.",
        intentGetRosterEx1: "show me all the players",
        intentGetRosterEx2: "who's in the league?",
        intentGetRosterEx3: "list all teams",
        intentSubmitMatchDesc:
          "Record a doubles match result. New players are registered automatically.",
        intentSubmitMatchEx1: "Jae + Jazz 6:4 DK + Casper",
        intentSubmitMatchEx2: "Alice and Bob beat Charlie and Diana 6 to 3",
        intentSubmitMatchEx3:
          "record a match: John and Sarah vs Mike and Emma, 7-5",
        intentEditNickDesc: "Correct or update a player's nickname.",
        intentEditNickEx1: "rename Alice to Alicia",
        intentEditNickEx2: "change John's nickname to Johnny",
        intentEditScoreDesc: "Correct the score of a previously recorded match.",
        intentEditScoreEx1:
          "fix the score for Alice and Bob vs Charlie and Diana — it should be 6-2 not 6-3",
        intentDeleteMatchDesc: "Permanently delete a match record.",
        intentDeleteMatchEx1: "delete the match between Alice/Bob and Charlie/Diana",
        intentDeleteTeamDesc: "Permanently delete a team from the roster.",
        intentDeleteTeamEx1: "delete the team Alice and Bob",
        groupPlayerCommands: "Player commands",
        groupAdminCommands: "Admin commands",
        supportedCommands: "Supported commands",
        intentCountOne: "{n} intent",
        intentCountMany: "{n} intents",
        placeholderMobile:
          "Report Match Result, or Ask about standings, match history, or the roster.",
        placeholderDesktop:
          'Report Match Result, or Ask about standings, match history, or the roster.\nCheck "Supported Commands" for more details.',
        h1: "Tennis League Management Bot",
        badgeAdmin: "Admin",
        badgePlayer: "Player",
        metaLeague: "League",
        metaHostToken: " · host token in URL",
        themeToggle: "Toggle light/dark mode",
        themeLight: "Light",
        themeDark: "Dark",
        mentionPopoverLabel: "Mention a player",
        send: "Send",
        mentionLoading: "Loading players…",
        mentionRosterError: "Could not load roster.",
        mentionNoMatch: "No matching players.",
        mentionMore: "Showing {cap} of {total}. Type to narrow down.",
        labelYou: "You",
        labelAssistant: "Assistant",
        fillRequired: "Please fill required fields:",
        adminEndpointHint:
          "This action calls an admin endpoint. Open the Admin URL with your host token.",
        done: "Done.",
        actionCompleted: "Action completed:",
        submitToLeague: "Submit to league API",
        adminUrlWarn:
          "This write targets an admin endpoint. Use the Admin URL with <code>X-Host-Token</code>.",
        clarifyFallback: "Could you clarify?",
        unknownResponseHint:
          "No details available for this response. Try asking in another way.",
        noLeagueHtml: 'No league specified. <a href="/">Go to home</a>.',
        requestFailed: "Request failed.",
      },
    },
    ko: {
      meta: {
        titleHome: "테니스 리그 관리 봇",
        titleFindLeague: "리그 찾기 — 테니스 리그 관리 봇",
        titleCreateLeague: "리그 만들기 — 테니스 리그 관리 봇",
        titleFindLeaguePrefix: "리그 검색 — 테니스 리그 관리 봇",
        titleDemo: "데모 — 테니스 리그 관리 봇",
        titleLeagueChat: "테니스 리그 관리 봇",
      },
      footer: {
        backendSource: "백엔드 소스:",
        language: "언어",
      },
      home: {
        h1: "테니스 리그 관리 봇",
        intro1:
          "채팅-의도(chat-to-intent) 서버용 바닐라 클라이언트입니다. 리그 전용 URL을 열어 채팅을 시작하세요.",
        intro2: "채팅 API 기본 URL은 다음 파일에서 설정합니다:",
        pagesHeading: "페이지",
        linkCreate: "리그 만들기",
        linkFind: "리그 찾기",
        linkFindPrefix: "리그 찾기(URL 접두어만)",
        linkDemo: "데모",
        linkPlayer: "플레이어",
        linkAdmin: "관리자",
        codeHintPlayer: "/league?league_id={league_id}",
        codeHintAdmin: "/league?league_id={league_id}&host_token={host_token}",
      },
      common: {
        homeLink: "← 홈",
        configJs: "js/config.js",
        configHint:
          "API 기본 URL은 <code>js/config.js</code>에 설정하거나 <code>?backendApi=https://your-host</code>로 덮어쓸 수 있습니다.",
      },
      findLeague: {
        h1: "리그 찾기",
        introHtml:
          "<strong>리그 제목의 앞부분</strong>으로 검색합니다(대소문자 구분 없음). 아는 리그의 플레이어 채팅을 여세요. 관리자 기능은 주최자에게 받은 호스트 토큰이 필요합니다.",
        labelTitlePrefix: "제목 접두어",
        placeholderPrefix: "예: Summer",
        labelMaxResults: "최대 결과 수",
        labelMaxResultsHint: "(1–100, 기본 50)",
        submit: "검색",
        resultsHeading: "결과",
      },
      findLeagueJs: {
        backendNotConfigured: "백엔드 URL이 설정되어 있지 않습니다.",
        enterPrefix: "검색하려면 공백이 아닌 문자를 최소 한 글자 입력하세요.",
        unexpectedResponse: "서버가 예상과 다른 응답을 반환했습니다.",
        missingLeaguesList: "응답에 리그 목록(leagues)이 없습니다.",
        noMatch: "해당 접두어와 일치하는 리그가 없습니다.",
        oneMatch: "리그 1개가 일치했습니다.",
        manyMatches: "리그 {n}개가 일치했습니다(설정한 최대 결과 수까지).",
        openPlayerChat: "플레이어 채팅 열기",
        chatTitle: "채팅",
        genericError: "문제가 발생했습니다. 다시 시도해 주세요.",
        networkError: "서버에 연결할 수 없습니다.",
        addPrefixHint: "URL에 검색 접두어를 추가하세요. 예: ?prefix=MTB",
        unexpectedResponseShort: "서버 응답이 예상과 다릅니다.",
        invalidMissingLeagues: "잘못된 응답: 리그 목록이 없습니다.",
      },
      createLeague: {
        h1: "리그 만들기",
        introHtml:
          "메인 API에 새 리그를 만들고 <strong>리그 ID</strong>와 <strong>호스트 토큰</strong>을 돌려줍니다. 호스트 토큰은 안전하게 보관하세요. 관리 작업에 필요하며 다시 표시되지 않습니다.",
        labelTitle: "리그 제목",
        placeholderTitle: "예: 2026 Summer Doubles",
        labelDescription: "설명",
        optional: "(선택)",
        placeholderDescription: "주최자에게 보입니다. 선택 사항입니다.",
        advancedSummary: "고급: 사용자 정의 규칙",
        advancedHint:
          "닫아 두면 서버 기본값을 사용합니다(팀 쌍당 경기 1회, 플레이어당 팀 1개). 다른 규칙이 필요할 때만 여세요.",
        labelMatchPair: "같은 팀 쌍 경기 중복 허용",
        optionOncePerLeague: "리그당 한 번(권장)",
        optionAllowMultiple: "같은 두 팀 간 경기 여러 번 허용",
        oneTeamPerPlayer: "플레이어당 팀 하나",
        submit: "리그 만들기",
        successH2: "리그가 생성되었습니다",
        successP: "아래 값을 안전한 곳에 복사해 두세요. 호스트 토큰은 다시 표시되지 않습니다.",
        leagueId: "리그 ID",
        hostToken: "호스트 토큰",
        copy: "복사",
        openChat: "채팅 열기",
        linkPlayer: "플레이어(리그 ID만)",
        linkAdmin: "관리자(호스트 토큰 포함)",
        titleExists: "이미 같은 제목의 리그가 있습니다. 다른 이름을 사용해 보세요.",
        enterTitle: "리그 제목을 입력하세요.",
        missingIds: "응답에 league_id 또는 host_token이 없습니다.",
        copied: "복사됨",
        failed: "실패",
      },
      errors: {
        generic: "문제가 발생했습니다. 잠시 후 다시 시도하거나 질문을 바꿔 보세요.",
        network: "서버에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.",
        cors:
          "브라우저가 채팅 서비스 연결을 차단했습니다. 계속되면 리그 관리자에게 문의하세요.",
        leagueNotFound:
          "리그가 없거나 이 링크로는 이용할 수 없습니다. 리그 ID를 확인하거나 주최자에게 올바른 URL을 요청하세요.",
        playerNotFound:
          "해당 리그에서 플레이어를 찾지 못했습니다. 닉네임 철자를 확인하세요.",
        teamNotFound:
          "해당 선수들로 구성된 팀을 이 리그에서 찾지 못했습니다. 명단의 두 닉네임을 확인하세요.",
        matchNotFound:
          "해당 팀들 사이의 경기를 찾지 못했습니다. 네 닉네임을 확인하거나 이 리그의 전체 경기 목록을 찾아보세요.",
        notFoundFallback:
          "요청하신 내용을 찾지 못했습니다. 철자와 이름을 다시 확인하거나 다른 방식으로 질문해 보세요.",
        duplicateMatch:
          "이 리그는 팀 쌍당 경기를 한 번만 허용하며, 해당 두 팀의 경기가 이미 있습니다. 점수만 바꾸려면 기존 결과를 수정하고, 새로운 대결이면 다른 선수 조합을 사용하세요.",
        titleExists: "이미 같은 제목의 리그가 있습니다. 다른 이름을 사용해 보세요.",
        forbidden:
          "해당 작업을 할 권한이 없습니다. 관리자는 호스트 토큰이 포함된 리그 링크를 사용하세요.",
        timeout: "요청 시간이 초과되었습니다. 다시 시도하세요.",
        rateLimit: "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
        serviceUnavailable: "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하세요.",
        badRequest: "요청을 처리할 수 없습니다. 입력 내용을 확인하거나 다시 말해 보세요.",
        serverError: "서버에 문제가 발생했습니다. 잠시 후 다시 시도하세요.",
        loadInfo: "지금은 정보를 불러올 수 없습니다. 잠시 후 다시 시도하거나 다른 질문을 해 보세요.",
        unexpectedChat:
          "채팅 서비스가 예상대로 응답하지 않습니다. 설정을 확인하거나 나중에 다시 시도하세요.",
      },
      chat: {
        panelStandings: "순위",
        panelMatchHistory: "경기 기록",
        panelRoster: "명단",
        panelDetails: "세부 정보",
        fieldTeamId: "팀 참조",
        fieldMatchId: "경기 참조",
        fieldPlayerId: "플레이어 참조",
        fieldCurrentNickname: "현재 이름",
        fieldNewNickname: "새 이름",
        fieldTeam1Players: "팀 1 선수",
        fieldTeam2Players: "팀 2 선수",
        fieldTeam1Nicknames: "팀 1 닉네임",
        fieldTeam2Nicknames: "팀 2 닉네임",
        fieldTeam1Score: "팀 1 점수",
        fieldTeam2Score: "팀 2 점수",
        fieldMethod: "메서드",
        fieldUrl: "URL",
        emDash: "—",
        changesSaved: "저장되었습니다.",
        noDetails: "추가로 표시할 세부 정보가 없습니다.",
        rosterLoadingNotes:
          "리그 명단을 불러오는 중이거나 불러오지 못했습니다. 등록 미리보기를 사용할 수 없습니다.",
        rosterWarnPlayerTeam:
          "선수 {player}은(는) 이미 다음 팀에 소속되어 있습니다: <strong>{team}</strong>",
        newPlayerRegLine:
          "<p class=\"hint roster-note-info\"><strong>신규 플레이어 등록:</strong> 다음 플레이어가 등록됩니다: {list}</p>",
        newTeamLineOne:
          "<p class=\"hint roster-note-info\"><strong>신규 팀 등록:</strong> 다음 팀이 생성됩니다: {team}</p>",
        newTeamLineMany:
          "<p class=\"hint roster-note-info\"><strong>신규 팀 등록:</strong> 다음 팀들이 생성됩니다: {teams}</p>",
        warning: "주의:",
        rosterHeadingTeams: "팀",
        rosterHeadingPlayers: "플레이어",
        rosterEmpty: "명단이 비어 있습니다.",
        standingsEmpty: "아직 순위가 없습니다.",
        matchesEmpty: "기록된 경기가 없습니다.",
        tableRank: "순위",
        tableTeam: "팀",
        tableW: "승",
        tableL: "패",
        tableTeams: "팀",
        tableScore: "점수",
        tableWhen: "일시",
        vs: "vs",
        filterFor: "{name}에 대한 결과를 표시합니다.",
        assistantForPlayer: "{name} — {title}",
        noBodyHint: "요청 본문이 없습니다. 전송할지 확인하세요.",
        formP1: "선수1",
        formP2: "선수2",
        intentGetStandingsDesc: "모든 팀의 현재 승패 순위를 봅니다.",
        intentGetStandingsEx1: "순위 보여줘",
        intentGetStandingsEx2: "리그 1위가 누구야?",
        intentGetStandingsEx3: "현재 리더보드 어떻게 돼?",
        intentGetMatchHistoryDesc: "기록된 경기 결과를 최신순으로 봅니다.",
        intentGetMatchHistoryEx1: "경기 전부 보여줘",
        intentGetMatchHistoryEx2: "어떤 경기들이 있었어?",
        intentGetMatchHistoryEx3: "최근 결과가 뭐야?",
        intentGetRosterDesc: "등록된 플레이어와 팀을 봅니다.",
        intentGetRosterEx1: "플레이어 다 보여줘",
        intentGetRosterEx2: "리그에 누가 있어?",
        intentGetRosterEx3: "팀 목록",
        intentSubmitMatchDesc: "복식 경기 결과를 기록합니다. 새 플레이어는 자동 등록됩니다.",
        intentSubmitMatchEx1: "재 + 재즈 6:4 DK + 캐스퍼",
        intentSubmitMatchEx2: "앨리스랑 밥이 찰리랑 다이애나 이겼어 6대 3",
        intentSubmitMatchEx3: "경기 기록: 존·사라 vs 마이크·엠마, 7-5",
        intentEditNickDesc: "플레이어 닉네임을 수정합니다.",
        intentEditNickEx1: "앨리스를 알리샤로 바꿔줘",
        intentEditNickEx2: "존 닉네임을 조니로 변경",
        intentEditScoreDesc: "이미 기록된 경기의 점수를 수정합니다.",
        intentEditScoreEx1:
          "앨리스·밥 vs 찰리·다이애나 경기 점수 6-3이 아니라 6-2로 고쳐줘",
        intentDeleteMatchDesc: "경기 기록을 영구 삭제합니다.",
        intentDeleteMatchEx1: "앨리스/밥 vs 찰리/다이애나 경기 삭제",
        intentDeleteTeamDesc: "명단에서 팀을 영구 삭제합니다.",
        intentDeleteTeamEx1: "앨리스와 밥 팀 삭제",
        groupPlayerCommands: "플레이어 명령",
        groupAdminCommands: "관리자 명령",
        supportedCommands: "지원 명령",
        intentCountOne: "의도 {n}개",
        intentCountMany: "의도 {n}개",
        placeholderMobile: "경기 결과를 입력하거나 순위·경기 기록·명단을 물어보세요.",
        placeholderDesktop:
          '경기 결과를 입력하거나 순위·경기 기록·명단을 물어보세요.\n자세한 예시는 "지원 명령"을 확인하세요.',
        h1: "테니스 리그 관리 봇",
        badgeAdmin: "관리자",
        badgePlayer: "플레이어",
        metaLeague: "리그",
        metaHostToken: " · URL에 호스트 토큰 포함",
        themeToggle: "라이트/다크 모드 전환",
        themeLight: "라이트",
        themeDark: "다크",
        mentionPopoverLabel: "플레이어 멘션",
        send: "보내기",
        mentionLoading: "플레이어 불러오는 중…",
        mentionRosterError: "명단을 불러올 수 없습니다.",
        mentionNoMatch: "일치하는 플레이어가 없습니다.",
        mentionMore: "총 {total}명 중 {cap}명만 표시합니다. 더 입력해 좁히세요.",
        labelYou: "나",
        labelAssistant: "어시스턴트",
        fillRequired: "필수 항목을 입력하세요:",
        adminEndpointHint:
          "이 작업은 관리자 API를 호출합니다. 호스트 토큰이 포함된 관리자 URL로 여세요.",
        done: "완료.",
        actionCompleted: "작업 완료:",
        submitToLeague: "리그 API로 전송",
        adminUrlWarn:
          "이 작업은 관리자 엔드포인트입니다. <code>X-Host-Token</code>이 있는 관리자 URL을 사용하세요.",
        clarifyFallback: "조금 더 구체적으로 말씀해 주시겠어요?",
        unknownResponseHint:
          "이 응답에 대한 세부 정보가 없습니다. 다른 방식으로 질문해 보세요.",
        noLeagueHtml: '리그가 지정되지 않았습니다. <a href="/">홈으로</a>.',
        requestFailed: "요청이 실패했습니다.",
      },
    },
  };

  function normalizeLocale(raw) {
    var s = String(raw || "")
      .trim()
      .toLowerCase();
    if (s.indexOf("ko") === 0) return "ko";
    if (s.indexOf("en") === 0) return "en";
    return "";
  }

  function localeFromNavigator() {
    try {
      var list = global.navigator.languages || [];
      for (var i = 0; i < list.length; i++) {
        var n = normalizeLocale(list[i]);
        if (n && SUPPORTED[n]) return n;
      }
      return normalizeLocale(global.navigator.language) || "en";
    } catch (e) {
      return "en";
    }
  }

  function getLocale() {
    try {
      var params = new URLSearchParams(global.location.search || "");
      var q = normalizeLocale(params.get("lang"));
      if (q && SUPPORTED[q]) {
        try {
          global.localStorage.setItem(STORAGE_KEY, q);
        } catch (e2) {
          /* ignore */
        }
        return q;
      }
    } catch (e) {
      /* ignore */
    }
    try {
      var stored = normalizeLocale(global.localStorage.getItem(STORAGE_KEY));
      if (stored && SUPPORTED[stored]) return stored;
    } catch (e) {
      /* ignore */
    }
    return localeFromNavigator();
  }

  function setLocale(locale) {
    var loc = normalizeLocale(locale);
    if (!SUPPORTED[loc]) loc = "en";
    try {
      global.localStorage.setItem(STORAGE_KEY, loc);
    } catch (e) {
      /* ignore */
    }
    if (global.document && global.document.documentElement) {
      global.document.documentElement.lang = loc === "ko" ? "ko" : "en";
      global.document.documentElement.setAttribute("data-locale", loc);
    }
    return loc;
  }

  function resolvePath(obj, parts) {
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  /**
   * @param {string} key dot-separated path, e.g. "findLeague.h1"
   * @param {Record<string, string|number>=} params placeholders {name}
   */
  function t(key, params) {
    var loc = getLocale();
    var parts = String(key || "").split(".").filter(Boolean);
    var val = resolvePath(STRINGS[loc], parts);
    if (typeof val !== "string") val = resolvePath(STRINGS.en, parts);
    if (typeof val !== "string") return String(key || "");

    if (params && typeof params === "object") {
      Object.keys(params).forEach(function (k) {
        val = val.split("{" + k + "}").join(String(params[k]));
      });
    }
    return val;
  }

  function applyDom(root) {
    var r = root || global.document;
    if (!r || !r.querySelectorAll) return;

    r.querySelectorAll("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      if (!k) return;
      el.textContent = t(k);
    });

    r.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-html");
      if (!k) return;
      el.innerHTML = t(k);
    });

    r.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-placeholder");
      if (!k) return;
      el.setAttribute("placeholder", t(k));
    });

    r.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-aria-label");
      if (!k) return;
      el.setAttribute("aria-label", t(k));
    });

    r.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-title");
      if (!k) return;
      el.setAttribute("title", t(k));
    });
  }

  function applyDocumentTitle(key) {
    if (!global.document) return;
    var title = t(key);
    if (title) global.document.title = title;
  }

  function wireLocaleSwitchers() {
    if (!global.document || global.document.documentElement.dataset.localeSwitchWired === "1") {
      return;
    }
    global.document.documentElement.dataset.localeSwitchWired = "1";
    global.document.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-locale-switch]");
      if (!btn) return;
      var next = normalizeLocale(btn.getAttribute("data-locale-switch"));
      if (!SUPPORTED[next]) return;
      ev.preventDefault();
      var cur = getLocale();
      if (cur === next) return;
      setLocale(next);
      global.location.reload();
    });
  }

  function syncHtmlLang() {
    var loc = getLocale();
    setLocale(loc);
  }

  function renderFooterLangSwitch() {
    return (
      '<span class="footer-lang-group">' +
      escapeAttr(t("footer.language")) +
      ': <button type="button" class="lang-switch" data-locale-switch="en">English</button>' +
      ' · ' +
      '<button type="button" class="lang-switch" data-locale-switch="ko">한국어</button></span>'
    );
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  /**
   * Call from static pages after scripts: set title from body[data-i18n-title-key], translate DOM, wire switchers.
   */
  function initPage() {
    syncHtmlLang();
    var body = global.document && global.document.body;
    var titleKey = body && body.getAttribute("data-i18n-title-key");
    if (titleKey) applyDocumentTitle(titleKey);
    applyDom(global.document);
    wireLocaleSwitchers();
  }

  syncHtmlLang();

  global.TLCHAT_I18N = {
    t: t,
    getLocale: getLocale,
    setLocale: setLocale,
    applyDom: applyDom,
    applyDocumentTitle: applyDocumentTitle,
    initPage: initPage,
    wireLocaleSwitchers: wireLocaleSwitchers,
    renderFooterLangSwitch: renderFooterLangSwitch,
  };
})(typeof window !== "undefined" ? window : this);
