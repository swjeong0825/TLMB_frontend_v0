/**
 * Vanilla i18n: shared dictionary + t() helper.
 * Locale: ?lang=en|ko (persisted), then localStorage tlchat-locale, then navigator.
 * Optional: load site-header.js before initPage() to inject the shared static header from #tlchat-site-header-root.
 *
 * Exposes window.TLCHAT_I18N { t, getLocale, setLocale, applyDom, initPage, wireLocaleSwitchers,
 *   renderLocaleDropdown, syncLocaleDropdown }
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
        h1: "Local Match Tracker",
        intro1: "Track match results and standings for your local tennis group.",
        pagesHeading: "Pages",
        linkCreate: "Create league",
        linkFind: "Find league",
      },
      common: {
        homeLink: "← Home",
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
        openPrefixPage: "Open shareable page",
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
          "Creates a new league on the main API. After creation you get a secret <strong>host token</strong> for admins (save it privately; it is not shown again) and links for the player and admin chat pages.",
        labelTitle: "League title",
        placeholderTitle: "e.g. Summer Doubles 2026",
        labelHostEmail: "Host email",
        placeholderHostEmail: "you@example.com",
        hostEmailHint:
          "We'll use this for league-related notifications. Players never see it.",
        labelDescription: "Description",
        optional: "(optional)",
        placeholderDescription: "Shown to organisers; optional.",
        advancedSummary: "Advanced options",
        advancedHint:
          "Optional description, league timezone, one-team-only restriction, auto-register behaviour, and extra tie-breaker columns.",
        labelMatchPair: "Rematch rule",
        optionOncePerDay: "Once per day — recommended",
        optionOncePerLeague: "Once per league",
        optionAllowMultiple: "Unlimited rematches",
        labelLeagueTimezone: "League timezone",
        oneTeamPerPlayer: "One team per player",
        labelOneTeamPerPlayer: "Can a player be on more than one team?",
        labelOneTeamPerPlayerToggle: "One team per player",
        oneTeamPerPlayerToggleHint:
          "Off by default — players can join multiple teams.\nTurn on to restrict each player to a single team.",
        optionOTPPTrue: "No — each player belongs to one team only",
        optionOTPPFalse: "Yes — a player can be on several teams (default)",
        labelAutoRegisterPlayersOnMatch: "Auto-add players",
        labelInitialPlayers: "Pre-register players",
        autoRegisterPlayersOnMatchHint:
          "Off by default \u2014 only names on the roster can play.\nTurn on to add new players automatically when a match is submitted.",
        initialPlayersChipsPlaceholder:
          "Type a nickname and press Enter",
        initialPlayersChipsAria: "Add player nicknames to the starting roster",
        initialPlayersChipsHint:
          "Type a nickname and press Enter.\nOr, paste a comma/space separated list like \"Federer, Sinner, Alcaraz, Djokovic\".",
        initialPlayersChipRemoveAria: "Remove {name} from the roster",
        initialPlayersRequiredError:
          "Auto-register is off, so add at least one nickname to pre-register, or turn auto-register back on.",
        labelRankingSubject: "Ranking Type",
        optionRankingSubjectTeam: "Teams",
        optionRankingSubjectPlayer: "Individual players (default)",
        crossRuleHint:
          "Turning this on forces Ranking Type to \u201cTeams\u201d.",
        labelTieBreakerPrimary: "Ranking Score",
        labelTieBreakerSecondary: "First TieBreaker",
        labelTieBreakerTertiary: "Second TieBreaker",
        metricNone: "(nothing — leave blank)",
        metricMatchesWon: "Matches won",
        metricMatchDiff: "Match wins minus losses",
        metricGamesWon: "Games won",
        metricGamesLost: "Games lost (fewer is better)",
        metricGamesDiff: "Games won minus games lost",
        metricWinPct: "Win rate (%)",
        help: {
          modalCloseAria: "Close help",
          matchPairAria: "Help: same two teams playing more than once",
          matchPairTitle: "Same two teams, more than one match?",
          matchPairBody:
            "By default, the same two teams can play once per league day. That keeps accidental double-submits out while still allowing a rematch tomorrow.\n\nOnce per day (recommended): one match per pair of teams on each league-local calendar day.\n\nOnce per league: the same two teams can only have one match for the whole league.\n\nUnlimited rematches: every submitted match counts.",
          leagueTimezoneAria: "Help: league timezone",
          leagueTimezoneTitle: "Which day does a match belong to?",
          leagueTimezoneBody:
            "The once-per-day rematch rule uses this timezone to decide where each calendar day starts and ends.\n\nBy default, the form picks your browser timezone. Existing and omitted values default to America/Los_Angeles.",
          oneTeamPerPlayerAria: "Help: players on multiple teams",
          oneTeamPerPlayerTitle: "Can someone be on more than one team?",
          oneTeamPerPlayerBody:
            "By default, players can join multiple teams in this league.\n\nTurn the toggle on to restrict each person to one team — the simpler setup most groups use.\n\nIf you rank individual players in the standings, multi-team membership must stay allowed. Counting points per player only makes sense when they can play for more than one side.",
          rankingSubjectAria: "Help: team vs player standings",
          rankingSubjectTitle: "Team table or player table?",
          rankingSubjectBody:
            "Choose what each row in the leaderboard represents.\n\nIndividual players (default): You compare people. The product needs players to be allowed on several teams for that to work, so this is the default and keeps the one-team-only restriction off.\n\nTeams: You compare whole teams—typical for doubles or fixed pairs.\n\nYou can\u2019t combine \u201cIndividual players\u201d with \u201cone team only\u201d—pick one story and stick with it.",
          tieBreakersAria: "Help: sorting and tie-breakers",
          tieBreakersTitle: "How standings are ordered",
          tieBreakersBody:
            "The first menu is the main sort: higher on the list means better in the table.\n\nUse the next two only when two rows are still tied. Leave them blank if you don\u2019t need extra rules.\n\nYou can\u2019t repeat the same stat twice; duplicates are dropped when the league is saved.\n\nA simple starting point is matches won, then wins minus losses, then something based on games—tweak to match how your group likes to read the table.",
          autoRegisterPlayersOnMatchAria: "Help: auto-register players on match",
          autoRegisterPlayersOnMatchTitle: "Auto-register new players on match",
          autoRegisterPlayersOnMatchBody:
            "Controls what happens when a match is submitted with a nickname that isn\u2019t on the league\u2019s roster yet.\n\nOn (default): The bot creates a Player record for the new nickname automatically and accepts the match. Great for open leagues where anyone can show up and play.\n\nOff: The bot rejects the match and tells you which names are missing. Only players that you (or the create-league bootstrap) added to the roster up front can be on a match. Use this for closed groups — members-only clubs, invite-only tournaments — where you want to control exactly who can play.",
        },
        submit: "Create league",
        successH2: "League created",
        successP:
          "Save the host token somewhere safe—it is required for admin actions and is not shown again. Share the player link with participants; bookmark the admin link for yourself.",
        hostToken: "Host token (admin)",
        copy: "Copy",
        openPages: "League pages",
        linkPlayer: "Player page",
        linkAdmin: "Admin page (host token included in link)",
        titleExists: "A league with this title already exists. Try a different name.",
        enterTitle: "Please enter a league title.",
        enterHostEmail: "Please enter your email address.",
        invalidHostEmail:
          "Please enter a valid email address (e.g. you@example.com).",
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
        duplicateMatchToday:
          "Those two teams already have a match today. Edit the existing result if you meant to change the score, or try again on another league day.",
        duplicateMatch:
          "This league only allows one match per pair of teams, and those two teams already have a match in this league.",
        invalidLeagueRules:
          "Those choices don\u2019t fit together. Individual-player standings need people on several teams. Either allow players on multiple teams, or switch standings back to teams.",
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
        rosterMembershipRequired:
          "One or more players are not on this league’s roster. Ask the host to add them before recording this match.",
      },
      chat: {
        panelStandings: "Standings",
        panelMatchHistory: "Match history",
        panelRoster: "Roster",
        panelPlayers: "Players",
        panelHelp: "Supported commands",
        panelDetails: "Details",
        helpEmpty: "No commands available.",
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
        formScoresHeading: "Scores",
        formScoreTeam1: "Team 1",
        formScoreTeam2: "Team 2",
        fieldMethod: "Method",
        fieldUrl: "URL",
        fieldNicknames: "Player nicknames",
        fieldNickname: "Player nickname",
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
        standingsStartDate: "Start date",
        standingsEndDate: "End date",
        standingsApplyFilter: "Apply",
        standingsClearFilter: "Clear",
        standingsDateRangeInvalid: "Start date must be on or before end date.",
        standingsFilterFailed: "Could not update standings for those dates.",
        matchesEmpty: "No matches recorded.",
        matchDateShow: "Show matches for {date}",
        matchDateHide: "Hide matches for {date}",
        tableRank: "Rank",
        tableTeam: "Team",
        tablePlayer: "Player",
        tableW: "W",
        tableL: "L",
        tableD: "D",
        tableGamesDiff: "Games \u00B1",
        tableMatchesWon: "Won",
        tableMatchDiff: "Match \u00B1",
        tableGamesWon: "Games won",
        tableGamesLost: "Games lost",
        tableWinPct: "Win %",
        tableMatchesPlayed: "Played",
        tableTeams: "Teams",
        tableScore: "Score",
        tableWhen: "When",
        tableActions: "Actions",
        updateButton: "Update",
        updateButtonDisabledTooltip:
          "This match can no longer be updated by players because it was recorded more than {minutes} minutes ago. Please ask your tennis group host to update it.",
        updateButtonDisabledTooltipUnknownWindow:
          "This match can no longer be updated by players. Please ask your tennis group host to update it.",
        matchEditWindowExpired:
          "This match can no longer be edited — the player edit window has expired. Ask your group host to update it.",
        deleteButton: "Delete",
        deleteButtonDisabledTooltip:
          "This match can no longer be deleted by players because it was recorded more than {minutes} minutes ago. Please ask your tennis group host to delete it.",
        deleteButtonDisabledTooltipUnknownWindow:
          "This match can no longer be deleted by players. Please ask your tennis group host to delete it.",
        deleteConfirmAction: "Confirm delete",
        deleteConfirmModalTitle: "Delete this match?",
        deleteConfirmModalWarning:
          "This action cannot be undone. The match will be permanently removed from league history and standings.",
        deleteConfirmModalCloseAria: "Close",
        cancel: "Cancel",
        matchDeleted: "Match deleted.",
        matchDeleteWindowExpired:
          "This match can no longer be deleted — the player delete window has expired. Ask your group host to delete it.",
        rematchConfirmAction: "Record rematch",
        rematchConfirmModalTitle: "Record another match today?",
        rematchConfirmModalWarning:
          "These two teams already have a match recorded today. Continue only if this is a separate rematch.",
        rematchConfirmModalExisting:
          "Existing result: {teams} · {score} · {when}",
        rematchConfirmModalCloseAria: "Close",
        vs: "vs",
        filterFor: "Showing results for {name}.",
        assistantForPlayer: "{title} for {name}",
        noBodyHint: "No request body. Confirm to send.",
        formP1: "P1",
        formP2: "P2",
        intentGetStandingsDesc:
          "League leaderboard (teams or players).",
        intentGetStandingsEx1: "show me the standings",
        intentGetStandingsEx2: "who's winning the league?",
        intentGetStandingsEx3: "what's the current leaderboard?",
        intentGetStandingsByPlayerDesc: "One player's standings row.",
        intentGetStandingsByPlayerEx1: "what's Alice's rank in the league?",
        intentGetStandingsByPlayerEx2: "where does Bob's team stand?",
        intentGetStandingsByPlayerEx3: "show me Charlie's standing",
        intentGetMatchHistoryDesc: "All match results, newest first.",
        intentGetMatchHistoryEx1: "show me all the matches",
        intentGetMatchHistoryEx2: "what matches have been played?",
        intentGetMatchHistoryEx3: "what were the recent results?",
        intentGetMatchHistoryByPlayerDesc: "One player's match history.",
        intentGetMatchHistoryByPlayerEx1: "show me Alice's match history",
        intentGetMatchHistoryByPlayerEx2: "what matches has Bob played?",
        intentGetMatchHistoryByPlayerEx3: "matches involving Charlie",
        intentGetRosterDesc: "All registered players and teams.",
        intentGetRosterEx1: "show me all the players",
        intentGetRosterEx2: "who's in the league?",
        intentGetRosterEx3: "list all teams",
        intentSubmitMatchDesc: "Record a doubles match result.",
        intentSubmitMatchEx1: "record a match",
        intentSubmitMatchEx2: "Jae + Jazz 6:4 DK + Casper",
        intentSubmitMatchEx3: "Alice and Bob beat Charlie and Diana 6 to 3",
        intentEditNickDesc: "Change a player's nickname.",
        intentEditNickEx1: "rename Alice to Alicia",
        intentEditNickEx2: "change John's nickname to Johnny",
        intentEditScoreDesc: "Fix a logged match score (via form).",
        intentEditScoreEx1: "edit match score for Alice",
        intentEditScoreEx2: "fix a match score involving Alice and Bob",
        intentEditScoreEx3: "correct the score of the match Alice and Bob vs Charlie and Diana",
        intentDeleteMatchDesc: "Delete a match (four nicknames).",
        intentDeleteMatchEx1: "delete the match between Alice/Bob and Charlie/Diana",
        intentDeleteTeamDesc: "Delete a team with no matches.",
        intentDeleteTeamEx1: "delete the team Alice and Bob",
        intentAddPlayersToRosterDesc: "Pre-register one or more players on the league roster.",
        intentAddPlayersToRosterEx1: "add Alex and Daniel to the roster",
        intentAddPlayersToRosterEx2: "register Jason as a player",
        intentRemovePlayerFromRosterDesc:
          "Remove one player from the roster (only if they have no teams and no matches).",
        intentRemovePlayerFromRosterEx1: "remove Michael from the roster",
        intentRemovePlayerFromRosterEx2: "drop Ryan from the league",
        groupPlayerCommands: "Player commands",
        groupAdminCommands: "Admin commands",
        supportedCommands: "Supported commands",
        helperHint: "or just type \"help\" in chat",
        intentCountOne: "{n} intent",
        intentCountMany: "{n} intents",
        quickActionsHeading: "Get started with a quick action",
        quickActionRecordMatchTitle: "Record Match Result",
        quickActionRecordMatchDesc: "Log a doubles match score",
        quickActionShowStandingsTitle: "Show Current Standings",
        quickActionShowStandingsDesc: "See the league leaderboard",
        quickActionShowMatchHistoryTitle: "Show Match History",
        quickActionShowMatchHistoryDesc: "Browse all recent matches",
        quickActionGetPlayersTitle: "Get Players",
        quickActionGetPlayersDesc: "Search and add players",
        quickActionShowMoreCommandsTitle: "Show More Commands",
        quickActionShowMoreCommandsDesc: "See everything I can do",
        placeholderMobile:
          'Type "help" to see all commands',
        placeholderDesktop: 'Type "help" to see all commands',
        h1: "Tennis League Management Bot",
        badgeAdmin: "Admin",
        badgePlayer: "Player",
        metaHostEmailLabel: "Host email:",
        themeToggle: "Toggle light/dark mode",
        themeLight: "Light",
        themeDark: "Dark",
        mentionPopoverLabel: "Mention a player",
        nickAcPopoverLabel: "Pick a player",
        send: "Send",
        mentionLoading: "Loading players…",
        mentionRosterError: "Could not load roster.",
        mentionNoMatch: "No matching players.",
        mentionMore: "Showing {cap} of {total}. Type to narrow down.",
        labelYou: "You",
        labelAssistant: "Assistant",
        assistantThinking: "Assistant is thinking",
        fillRequired: "Please fill required fields:",
        adminEndpointHint:
          "This action calls an admin endpoint. Open the Admin URL with your host token.",
        done: "Done.",
        actionCompleted: "Action completed:",
        matchRecorded: "Match recorded.",
        matchScoreUpdated: "Match score updated.",
        matchAlreadyExistsToday: "Those two teams already have a match today. Record not saved.",
        matchAlreadyExistsInLeague: "Those two teams already have a match in this league. Record not saved.",
        matchAlreadyExists: "Match already exists. Record not saved.",
        submitToLeague: "Submit to league API",
        adminUrlWarn:
          "This write targets an admin endpoint. Use the Admin URL with <code>X-Host-Token</code>.",
        clarifyFallback: "Could you clarify?",
        unknownResponseHint:
          "No details available for this response. Try asking in another way.",
        noLeagueHtml: 'No league specified. <a href="/">Go to home</a>.',
        requestFailed: "Request failed.",
        headerTitleLoading: "Loading league title…",
        playersPanelEmpty: "No players on the roster yet.",
        playersPanelLoading: "Loading players…",
        playersPanelError: "Could not load players.",
        playersPanelNoMatches: "No matching players.",
        playersPanelSearchPlaceholder: "Search players…",
        playersPanelAddPlaceholder: "e.g. alice, bob, charlie",
        playersPanelAddButton: "Add",
        playersPanelAddingButton: "Adding…",
        playersPanelRemovingButton: "Removing…",
        playersPanelAlreadyExists: "One or more nicknames are already on the roster.",
        playersPanelAddSuccess: "Added to roster.",
        playersPanelRemoveSuccess: "Removed from roster.",
        playersPanelRemoveBlockedByParticipation:
          "Can\u2019t remove this player: they already belong to a team or appear in a match. Delete those first.",
        playersPanelAddDisabledAdminOnly:
          "Adding players is available only in Admin mode.",
        rosterRemoveButton: "Remove",
        rosterRemoveAdminOnly: "Remove is available only in Admin mode.",
        rosterRemoveBlockedTeam:
          "{name} belongs to a team. Delete the team first.",
        rosterRemoveBlockedMatch:
          "{name} appears in a match. Delete the match first.",
        rosterRemoveBlockedTeamAndMatch:
          "{name} belongs to a team and appears in a match. Delete those first.",
        rosterMembershipRequiredHeadline:
          "{names} are not on this league's roster. Use '{atHint}' in chat to search for the player.",
        rosterMembershipAddButton: "+ Add to roster",
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
        h1: "로컬 매치 트래커",
        intro1: "동네 테니스 모임의 경기 결과와 순위를 기록하고 확인하세요.",
        pagesHeading: "페이지",
        linkCreate: "리그 만들기",
        linkFind: "리그 찾기",
      },
      common: {
        homeLink: "← 홈",
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
        openPrefixPage: "공유 페이지 열기",
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
          "메인 API에 새 리그를 만듭니다. 생성 후에는 관리자용 비밀 <strong>호스트 토큰</strong>(안전하게 보관하세요. 다시 표시되지 않습니다)과 플레이어·관리자 채팅 페이지 링크를 받습니다.",
        labelTitle: "리그 제목",
        placeholderTitle: "예: 2026 Summer Doubles",
        labelHostEmail: "운영자 이메일",
        placeholderHostEmail: "you@example.com",
        hostEmailHint:
          "리그 관련 안내에 사용되며, 다른 선수에게는 공개되지 않습니다.",
        labelDescription: "설명",
        optional: "(선택)",
        placeholderDescription: "주최자에게 보입니다. 선택 사항입니다.",
        advancedSummary: "고급 옵션",
        advancedHint:
          "선택 설명, 리그 시간대, 팀 소속 제한, 자동 등록 동작, 추가 동률 처리 기준입니다.",
        labelMatchPair: "재경기 규칙",
        optionOncePerDay: "하루에 한 번 — 권장",
        optionOncePerLeague: "리그 전체에서 한 번",
        optionAllowMultiple: "재경기 제한 없음",
        labelLeagueTimezone: "리그 시간대",
        oneTeamPerPlayer: "플레이어당 팀 하나",
        labelOneTeamPerPlayer: "한 사람이 여러 팀에 들어갈 수 있나요?",
        labelOneTeamPerPlayerToggle: "플레이어당 팀 하나",
        oneTeamPerPlayerToggleHint:
          "기본값은 꺼짐 — 여러 팀에 속할 수 있어요. 켜면 한 사람당 팀 하나로 제한합니다.",
        optionOTPPTrue: "아니요 — 한 사람은 팀 하나에만 소속돼요",
        optionOTPPFalse: "예 — 한 사람이 여러 팀에 속할 수 있어요(기본)",
        labelAutoRegisterPlayersOnMatch: "선수 자동 추가",
        labelInitialPlayers: "선수 사전 등록",
        autoRegisterPlayersOnMatchHint:
          "기본값은 꺼짐 \u2014 명단에 있는 이름만 경기에 들어갈 수 있어요. 켜면 경기가 제출될 때 새 이름이 자동으로 추가됩니다.",
        initialPlayersChipsPlaceholder:
          "닉네임을 입력하고 Enter를 누르세요",
        initialPlayersChipsAria: "시작 명단에 선수 닉네임 추가",
        initialPlayersChipsHint:
          "닉네임을 입력하고 Enter를 누르세요.\n또는 \"Federer, Sinner, Alcaraz, Djokovic\"처럼 쉼표나 공백으로 구분된 목록을 붙여 넣으세요.",
        initialPlayersChipRemoveAria: "{name}을(를) 명단에서 제거",
        initialPlayersRequiredError:
          "자동 등록이 꺼져 있어요. 사전 등록할 닉네임을 한 명 이상 추가하거나, 자동 등록을 다시 켜 주세요.",
        labelRankingSubject: "순위 유형",
        optionRankingSubjectTeam: "팀",
        optionRankingSubjectPlayer: "개인(플레이어)(기본)",
        crossRuleHint:
          "이 옵션을 켜면 순위 유형이 \u201c팀\u201d으로 바뀝니다.",
        labelTieBreakerPrimary: "순위 점수",
        labelTieBreakerSecondary: "첫 번째 동률 처리",
        labelTieBreakerTertiary: "두 번째 동률 처리",
        metricNone: "(없음 — 비워 두기)",
        metricMatchesWon: "승수",
        metricMatchDiff: "승수 − 패수",
        metricGamesWon: "딴 게임 수",
        metricGamesLost: "잃은 게임 수(적을수록 좋음)",
        metricGamesDiff: "딴 게임 − 잃은 게임",
        metricWinPct: "승률(%)",
        help: {
          modalCloseAria: "도움말 닫기",
          matchPairAria: "도움말: 같은 두 팀의 재경기",
          matchPairTitle: "같은 두 팀, 여러 번 경기?",
          matchPairBody:
            "기본값은 같은 두 팀이 리그 날짜 기준으로 하루에 한 번만 경기할 수 있는 방식이에요. 실수로 두 번 제출하는 일은 막고, 다음 날 재경기는 허용합니다.\n\n하루에 한 번(권장): 리그 시간대의 같은 날짜에는 팀 쌍당 경기 하나만 기록돼요.\n\n리그 전체에서 한 번: 같은 두 팀은 리그 전체에서 한 경기만 기록돼요.\n\n재경기 제한 없음: 제출된 모든 경기가 순위표에 반영돼요.",
          leagueTimezoneAria: "도움말: 리그 시간대",
          leagueTimezoneTitle: "경기가 어느 날짜에 속하나요?",
          leagueTimezoneBody:
            "하루에 한 번 재경기 규칙은 이 시간대를 기준으로 날짜의 시작과 끝을 계산합니다.\n\n기본값은 브라우저 시간대입니다. 기존 리그나 값이 생략된 경우 America/Los_Angeles로 저장됩니다.",
          oneTeamPerPlayerAria: "도움말: 여러 팀에 속한 플레이어",
          oneTeamPerPlayerTitle: "한 사람이 여러 팀에 들어갈 수 있나요?",
          oneTeamPerPlayerBody:
            "기본값은 한 사람이 여러 팀에 속할 수 있어요.\n\n토글을 켜면 한 사람당 팀 하나로 제한해요. 대부분의 모임이 쓰는 단순한 방식이에요.\n\n순위를 \u201c개인(플레이어)\u201d 기준으로 보려면 여러 팀 소속이 허용돼야 해요. 개인 점수는 여러 팀에 나갈 수 있을 때만 말이 맞아요.",
          rankingSubjectAria: "도움말: 팀 순위 vs 개인 순위",
          rankingSubjectTitle: "팀 표인가요, 개인 표인가요?",
          rankingSubjectBody:
            "순위표의 한 줄이 무엇을 뜻하는지 고르는 거예요.\n\n개인(플레이어)(기본): 사람끼리 비교해요. 여러 팀에 속할 수 있어야 해서 기본값이며, 팀 하나 제한은 꺼진 상태예요.\n\n팀: 팀끼리 비교해요. 더블스나 고정 페어에 잘 맞아요.\n\n\u201c개인 순위\u201d와 \u201c팀은 하나만\u201d은 같이 쓸 수 없어요. 운영 방식 하나를 정하면 돼요.",
          tieBreakersAria: "도움말: 정렬과 동점 처리",
          tieBreakersTitle: "순위를 어떻게 정렬할까요",
          tieBreakersBody:
            "첫 번째 메뉴가 기본 정렬이에요. 위에 있을수록 순위가 더 좋다는 뜻으로 쓰여요.\n\n여전히 동점이면 두 번째, 그다음 세 번째로 가르죠. 필요 없으면 비워 두세요.\n\n같은 지표를 두 번 고를 수는 없고, 저장할 때 중복은 빠져요.\n\n많은 리그는 승수 → 승패 차 → 게임 관련 숫자 순으로 시작해요. 그룹 취향에 맞게 조정하면 돼요.",
          autoRegisterPlayersOnMatchAria: "도움말: 경기 제출 시 자동 등록",
          autoRegisterPlayersOnMatchTitle: "경기 제출 시 새 선수 자동 등록",
          autoRegisterPlayersOnMatchBody:
            "리그 명단에 없는 닉네임으로 경기가 제출됐을 때의 동작을 정해요.\n\n켜짐(기본): 새 닉네임을 자동으로 선수로 등록하고 경기를 받아들여요. 누구나 와서 뛸 수 있는 열린 리그에 잘 맞아요.\n\n꺼짐: 명단에 없는 이름이 포함된 경기는 거부되고, 어떤 이름이 빠졌는지 알려줘요. 호스트가 미리 명단에 추가한 선수만 경기에 들어갈 수 있어요. 멤버십 클럽이나 초청 대회처럼 참가자를 정확히 통제하고 싶을 때 사용하세요.",
        },
        submit: "리그 만들기",
        successH2: "리그가 생성되었습니다",
        successP:
          "호스트 토큰은 관리 작업에 필요하며 다시 표시되지 않으므로 안전한 곳에 보관하세요. 플레이어 링크는 참가자에게 공유하고, 관리자 링크는 즐겨찾기에 두세요.",
        hostToken: "호스트 토큰 (관리자)",
        copy: "복사",
        openPages: "리그 페이지",
        linkPlayer: "플레이어 페이지",
        linkAdmin: "관리자 페이지 (링크에 호스트 토큰 포함)",
        titleExists: "이미 같은 제목의 리그가 있습니다. 다른 이름을 사용해 보세요.",
        enterTitle: "리그 제목을 입력하세요.",
        enterHostEmail: "이메일 주소를 입력하세요.",
        invalidHostEmail:
          "올바른 이메일 주소를 입력하세요 (예: you@example.com).",
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
        duplicateMatchToday:
          "오늘은 이미 이 두 팀의 경기가 기록되어 있어요. 점수만 바꾸려면 기존 결과를 수정하고, 다른 리그 날짜에 다시 기록하세요.",
        duplicateMatch:
          "이 리그는 팀 쌍당 경기를 한 번만 허용하며, 해당 두 팀의 경기가 리그에 이미 있습니다.",
        invalidLeagueRules:
          "이 조합은 함께 쓸 수 없어요. 개인 순위를 쓰려면 한 사람이 여러 팀에 들어갈 수 있어야 해요. 여러 팀을 허용하거나, 순위를 다시 \u201c팀\u201d으로 바꿔 보세요.",
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
        rosterMembershipRequired:
          "한 명 이상의 플레이어가 이 리그의 명단에 없습니다. 경기를 기록하기 전에 주최자에게 추가를 요청하세요.",
      },
      chat: {
        panelStandings: "순위",
        panelMatchHistory: "경기 기록",
        panelRoster: "명단",
        panelPlayers: "선수",
        panelHelp: "지원 명령",
        panelDetails: "세부 정보",
        helpEmpty: "사용 가능한 명령이 없습니다.",
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
        formScoresHeading: "점수",
        formScoreTeam1: "팀 1",
        formScoreTeam2: "팀 2",
        fieldMethod: "메서드",
        fieldUrl: "URL",
        fieldNicknames: "선수 닉네임",
        fieldNickname: "선수 닉네임",
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
        standingsStartDate: "시작일",
        standingsEndDate: "종료일",
        standingsApplyFilter: "적용",
        standingsClearFilter: "초기화",
        standingsDateRangeInvalid: "시작일은 종료일보다 늦을 수 없습니다.",
        standingsFilterFailed: "해당 날짜의 순위를 업데이트할 수 없습니다.",
        matchesEmpty: "기록된 경기가 없습니다.",
        matchDateShow: "{date} 경기 보기",
        matchDateHide: "{date} 경기 숨기기",
        tableRank: "순위",
        tableTeam: "팀",
        tablePlayer: "플레이어",
        tableW: "승",
        tableL: "패",
        tableD: "무",
        tableGamesDiff: "게임 \u00B1",
        tableMatchesWon: "승수",
        tableMatchDiff: "승패 \u00B1",
        tableGamesWon: "획득 게임",
        tableGamesLost: "잃은 게임",
        tableWinPct: "승률",
        tableMatchesPlayed: "경기 수",
        tableTeams: "팀",
        tableScore: "점수",
        tableWhen: "일시",
        tableActions: "동작",
        updateButton: "수정",
        updateButtonDisabledTooltip:
          "이 경기는 기록된 지 {minutes}분이 지나 더 이상 선수가 수정할 수 없습니다. 그룹 호스트에게 수정을 요청하세요.",
        updateButtonDisabledTooltipUnknownWindow:
          "이 경기는 더 이상 선수가 수정할 수 없습니다. 그룹 호스트에게 수정을 요청하세요.",
        matchEditWindowExpired:
          "수정 가능 시간이 지나 더 이상 이 경기를 수정할 수 없습니다. 그룹 호스트에게 수정을 요청하세요.",
        deleteButton: "삭제",
        deleteButtonDisabledTooltip:
          "이 경기는 기록된 지 {minutes}분이 지나 더 이상 선수가 삭제할 수 없습니다. 그룹 호스트에게 삭제를 요청하세요.",
        deleteButtonDisabledTooltipUnknownWindow:
          "이 경기는 더 이상 선수가 삭제할 수 없습니다. 그룹 호스트에게 삭제를 요청하세요.",
        deleteConfirmAction: "삭제 확인",
        deleteConfirmModalTitle: "이 경기를 삭제할까요?",
        deleteConfirmModalWarning:
          "되돌릴 수 없습니다. 경기가 리그 기록과 순위에서 영구적으로 제거됩니다.",
        deleteConfirmModalCloseAria: "닫기",
        cancel: "취소",
        matchDeleted: "경기가 삭제되었습니다.",
        matchDeleteWindowExpired:
          "삭제 가능 시간이 지나 더 이상 이 경기를 삭제할 수 없습니다. 그룹 호스트에게 삭제를 요청하세요.",
        rematchConfirmAction: "재경기 기록",
        rematchConfirmModalTitle: "오늘 같은 팀끼리 한 경기를 더 기록할까요?",
        rematchConfirmModalWarning:
          "오늘 이미 이 두 팀의 경기가 기록되어 있어요. 별도의 재경기일 때만 계속하세요.",
        rematchConfirmModalExisting:
          "기존 결과: {teams} · {score} · {when}",
        rematchConfirmModalCloseAria: "닫기",
        vs: "vs",
        filterFor: "{name}에 대한 결과를 표시합니다.",
        assistantForPlayer: "{name} — {title}",
        noBodyHint: "요청 본문이 없습니다. 전송할지 확인하세요.",
        formP1: "선수1",
        formP2: "선수2",
        intentGetStandingsDesc: "리그 순위(팀 또는 개인) 보기.",
        intentGetStandingsEx1: "순위 보여줘",
        intentGetStandingsEx2: "리그 1위가 누구야?",
        intentGetStandingsEx3: "현재 리더보드 어떻게 돼?",
        intentGetStandingsByPlayerDesc: "특정 선수 순위 한 줄.",
        intentGetStandingsByPlayerEx1: "앨리스 리그 순위가 어떻게 돼?",
        intentGetStandingsByPlayerEx2: "밥네 팀 몇 위야?",
        intentGetStandingsByPlayerEx3: "찰리 순위 보여줘",
        intentGetMatchHistoryDesc: "모든 경기 결과(최신순).",
        intentGetMatchHistoryEx1: "경기 전부 보여줘",
        intentGetMatchHistoryEx2: "어떤 경기들이 있었어?",
        intentGetMatchHistoryEx3: "최근 결과가 뭐야?",
        intentGetMatchHistoryByPlayerDesc: "특정 선수 경기 기록.",
        intentGetMatchHistoryByPlayerEx1: "앨리스 경기 기록 보여줘",
        intentGetMatchHistoryByPlayerEx2: "밥이 어떤 경기들 했어?",
        intentGetMatchHistoryByPlayerEx3: "찰리가 들어간 경기들",
        intentGetRosterDesc: "등록 선수와 팀 전체.",
        intentGetRosterEx1: "플레이어 다 보여줘",
        intentGetRosterEx2: "리그에 누가 있어?",
        intentGetRosterEx3: "팀 목록",
        intentSubmitMatchDesc: "복식 경기 결과 입력.",
        intentSubmitMatchEx1: "경기 기록할래",
        intentSubmitMatchEx2: "재 + 재즈 6:4 DK + 캐스퍼",
        intentSubmitMatchEx3: "앨리스랑 밥이 찰리랑 다이애나 이겼어 6대 3",
        intentEditNickDesc: "플레이어 닉네임 변경.",
        intentEditNickEx1: "앨리스를 알리샤로 바꿔줘",
        intentEditNickEx2: "존 닉네임을 조니로 변경",
        intentEditScoreDesc: "기록된 경기 점수 수정(양식).",
        intentEditScoreEx1: "앨리스 경기 점수 수정",
        intentEditScoreEx2: "앨리스랑 밥이 들어간 경기 점수 고쳐줘",
        intentEditScoreEx3: "앨리스·밥 vs 찰리·다이애나 경기 점수 수정",
        intentDeleteMatchDesc: "네 명 닉네임으로 경기 삭제.",
        intentDeleteMatchEx1: "앨리스/밥 vs 찰리/다이애나 경기 삭제",
        intentDeleteTeamDesc: "경기 없는 팀 삭제.",
        intentDeleteTeamEx1: "앨리스와 밥 팀 삭제",
        intentAddPlayersToRosterDesc: "선수를 리그 명단에 미리 등록합니다.",
        intentAddPlayersToRosterEx1: "Alex와 Daniel을 명단에 추가해줘",
        intentAddPlayersToRosterEx2: "Jason을 선수로 등록해줘",
        intentRemovePlayerFromRosterDesc:
          "명단에서 선수 한 명을 제거합니다(팀과 경기 기록이 모두 없을 때만 가능).",
        intentRemovePlayerFromRosterEx1: "Michael을 명단에서 제거해줘",
        intentRemovePlayerFromRosterEx2: "Ryan을 리그에서 빼줘",
        groupPlayerCommands: "플레이어 명령",
        groupAdminCommands: "관리자 명령",
        supportedCommands: "지원 명령",
        helperHint: "또는 채팅에 \"help\" 입력",
        intentCountOne: "의도 {n}개",
        intentCountMany: "의도 {n}개",
        quickActionsHeading: "빠른 작업으로 시작하기",
        quickActionRecordMatchTitle: "경기 결과 기록",
        quickActionRecordMatchDesc: "복식 경기 점수를 기록합니다",
        quickActionShowStandingsTitle: "현재 순위 보기",
        quickActionShowStandingsDesc: "리그 리더보드를 확인합니다",
        quickActionShowMatchHistoryTitle: "경기 기록 보기",
        quickActionShowMatchHistoryDesc: "최근 경기들을 살펴봅니다",
        quickActionGetPlayersTitle: "선수 보기",
        quickActionGetPlayersDesc: "선수 검색·추가",
        quickActionShowMoreCommandsTitle: "더 많은 명령 보기",
        quickActionShowMoreCommandsDesc: "할 수 있는 모든 작업 보기",
        placeholderMobile: '"help"를 입력하면 모든 명령을 볼 수 있습니다',
        placeholderDesktop: '"help"를 입력하면 모든 명령을 볼 수 있습니다',
        h1: "테니스 리그 관리 봇",
        badgeAdmin: "관리자",
        badgePlayer: "플레이어",
        metaHostEmailLabel: "운영자 이메일:",
        themeToggle: "라이트/다크 모드 전환",
        themeLight: "라이트",
        themeDark: "다크",
        mentionPopoverLabel: "플레이어 멘션",
        nickAcPopoverLabel: "플레이어 선택",
        send: "보내기",
        mentionLoading: "플레이어 불러오는 중…",
        mentionRosterError: "명단을 불러올 수 없습니다.",
        mentionNoMatch: "일치하는 플레이어가 없습니다.",
        mentionMore: "총 {total}명 중 {cap}명만 표시합니다. 더 입력해 좁히세요.",
        labelYou: "나",
        labelAssistant: "어시스턴트",
        assistantThinking: "어시스턴트가 응답을 준비 중입니다",
        fillRequired: "필수 항목을 입력하세요:",
        adminEndpointHint:
          "이 작업은 관리자 API를 호출합니다. 호스트 토큰이 포함된 관리자 URL로 여세요.",
        done: "완료.",
        actionCompleted: "작업 완료:",
        matchRecorded: "경기가 기록되었습니다.",
        matchScoreUpdated: "경기 점수가 수정되었습니다.",
        matchAlreadyExistsToday: "오늘은 해당 두 팀의 경기가 이미 있습니다. 기록되지 않았습니다.",
        matchAlreadyExistsInLeague: "이 리그에는 해당 두 팀의 경기가 이미 있습니다. 기록되지 않았습니다.",
        matchAlreadyExists: "경기가 이미 있습니다. 기록되지 않았습니다.",
        submitToLeague: "리그 API로 전송",
        adminUrlWarn:
          "이 작업은 관리자 엔드포인트입니다. <code>X-Host-Token</code>이 있는 관리자 URL을 사용하세요.",
        clarifyFallback: "조금 더 구체적으로 말씀해 주시겠어요?",
        unknownResponseHint:
          "이 응답에 대한 세부 정보가 없습니다. 다른 방식으로 질문해 보세요.",
        noLeagueHtml: '리그가 지정되지 않았습니다. <a href="/">홈으로</a>.',
        requestFailed: "요청이 실패했습니다.",
        headerTitleLoading: "리그 제목 불러오는 중…",
        playersPanelEmpty: "아직 명단에 선수가 없습니다.",
        playersPanelLoading: "선수 불러오는 중…",
        playersPanelError: "선수 명단을 불러올 수 없습니다.",
        playersPanelNoMatches: "일치하는 선수가 없습니다.",
        playersPanelSearchPlaceholder: "선수 검색…",
        playersPanelAddPlaceholder: "예: alice, bob, charlie",
        playersPanelAddButton: "추가",
        playersPanelAddingButton: "추가 중…",
        playersPanelRemovingButton: "제거 중…",
        playersPanelAlreadyExists: "이미 명단에 있는 닉네임이 포함되어 있습니다.",
        playersPanelAddSuccess: "명단에 추가되었습니다.",
        playersPanelRemoveSuccess: "명단에서 제거되었습니다.",
        playersPanelRemoveBlockedByParticipation:
          "이 선수는 이미 팀에 속해 있거나 경기에 등장해서 명단에서 제거할 수 없어요. 먼저 해당 팀이나 경기를 정리해 주세요.",
        playersPanelAddDisabledAdminOnly:
          "선수 추가는 관리자 모드에서만 사용할 수 있습니다.",
        rosterRemoveButton: "제거",
        rosterRemoveAdminOnly: "제거는 관리자 모드에서만 사용할 수 있습니다.",
        rosterRemoveBlockedTeam: "{name}은(는) 팀에 속해 있습니다. 먼저 팀을 삭제하세요.",
        rosterRemoveBlockedMatch: "{name}은(는) 경기 기록이 있습니다. 먼저 경기를 삭제하세요.",
        rosterRemoveBlockedTeamAndMatch:
          "{name}은(는) 팀에 속해 있고 경기 기록도 있습니다. 먼저 팀과 경기를 정리하세요.",
        rosterMembershipRequiredHeadline:
          "{names}은(는) 이 리그 명단에 없습니다. 경기를 기록하기 전에 주최자에게 추가를 요청하세요. 채팅에서 '{atHint}'를 입력하면 플레이어를 찾을 수 있습니다.",
        rosterMembershipAddButton: "+ 명단에 추가",
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
    global.document.addEventListener("change", function (ev) {
      var el = ev.target;
      if (!el || !el.matches || !el.matches("select.locale-dropdown")) return;
      var next = normalizeLocale(el.value);
      if (!SUPPORTED[next]) return;
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

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  /**
   * Native select: flag emoji + two-letter language code per option.
   * Chat: { compact: true } — tighter padding; aria-label from footer.language.
   * Static: optional visible label via data-i18n on sibling (see HTML).
   */
  function renderLocaleDropdown(options) {
    var compact = options && options.compact;
    var cur = getLocale();
    var optEn = cur === "en" ? " selected" : "";
    var optKo = cur === "ko" ? " selected" : "";
    var optionsHtml =
      '<option value="en"' +
      optEn +
      ">🇺🇸 EN</option>" +
      '<option value="ko"' +
      optKo +
      ">🇰🇷 KO</option>";
    var aria = escapeAttr(t("footer.language"));
    var cls = "locale-dropdown" + (compact ? " locale-dropdown--compact" : "");
    var sel =
      '<select class="' +
      cls +
      '"' +
      (compact
        ? ' aria-label="' + aria + '"'
        : ' id="tlchat-locale-select" data-i18n-aria-label="footer.language"') +
      ">" +
      optionsHtml +
      "</select>";
    return (
      '<div class="locale-dropdown-wrap' +
      (compact ? " locale-dropdown-wrap--compact" : "") +
      '">' +
      sel +
      "</div>"
    );
  }

  function syncLocaleDropdown(root) {
    var r = root || global.document;
    if (!r || !r.querySelectorAll) return;
    var cur = getLocale();
    if (!SUPPORTED[cur]) return;
    r.querySelectorAll("select.locale-dropdown").forEach(function (sel) {
      sel.value = cur;
    });
  }

  /**
   * Call from static pages after scripts: set title from body[data-i18n-title-key], translate DOM, wire switchers.
   */
  function initPage() {
    if (global.TLCHAT_SITE_HEADER && typeof global.TLCHAT_SITE_HEADER.mount === "function") {
      global.TLCHAT_SITE_HEADER.mount();
    }
    syncHtmlLang();
    var body = global.document && global.document.body;
    var titleKey = body && body.getAttribute("data-i18n-title-key");
    if (titleKey) applyDocumentTitle(titleKey);
    applyDom(global.document);
    syncLocaleDropdown(global.document);
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
    renderLocaleDropdown: renderLocaleDropdown,
    syncLocaleDropdown: syncLocaleDropdown,
  };
})(typeof window !== "undefined" ? window : this);
