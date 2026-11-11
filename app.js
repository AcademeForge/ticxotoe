(function () {
  'use strict';

  var Store = window.TTTStorage;
  var Engine = window.TTTEngine;
  if (!Store || !Engine) {
    throw new Error('Tic Tac Toe: required modules failed to load.');
  }

  /* ------------------------------------------------------------------ */
  /* Constants                                                          */
  /* ------------------------------------------------------------------ */

  var AVATARS = ['😀', '😎', '🤓', '🧠', '🦊', '🐼', '🐯', '🦁', '🐸', '🐵', '🦄', '🐙',
    '🚀', '⚡', '🔥', '🌟', '🎯', '🏆', '👾', '🤖', '🎩', '🌈', '🍀', '🎲'];
  var BOT_DELAY_MS = 550;
  var RESULT_MODAL_DELAY_MS = 750;
  var TOAST_MS = 2600;
  var SCREENS = ['homeScreen', 'playScreen', 'statsScreen', 'settingsScreen'];
  var DIFFS = {
    easy: { label: 'Easy', hint: 'Makes plenty of mistakes — great for warming up.' },
    medium: { label: 'Medium', hint: 'Plays well most of the time, but can slip.' },
    hard: { label: 'Hard', hint: 'Unbeatable. The best you can do is draw.' }
  };
  var ONBOARD_STEPS = [
    {
      ico: '❌⭕',
      title: 'Welcome to Tic Tac Toe',
      desc: 'Get three of your marks in a row — across, down or diagonally — before your opponent does.'
    },
    {
      ico: '🎮',
      title: 'Two ways to play',
      desc: 'Challenge the computer on Easy, Medium or Hard, or hand the device to a friend for a 1 vs 1 match. Players swap who moves first after every round.'
    },
    {
      ico: '⚠️',
      title: 'This is an offline game',
      desc: 'There is no account, no server and no cloud backup. Your name, avatar, stats and history are saved only inside this browser, on this device.',
      warn: [
        'If you clear your browser data or site data, your progress is permanently erased.',
        'If you uninstall this app (or the browser), your progress is permanently erased.',
        'Private/incognito windows, other browsers and other devices each have their own, empty progress.',
        'There is no way to restore lost progress.'
      ],
      nextLabel: 'I understand'
    },
    {
      ico: '🚀',
      title: "You're all set",
      desc: 'Pick a mode and start playing. You can replay this tutorial any time from the More tab.'
    }
  ];
  var WARN_STEP_INDEX = 2;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : String(value));
      });
    }
    if (children) {
      [].concat(children).forEach(function (child) {
        if (child !== null && child !== undefined) node.append(child);
      });
    }
    return node;
  }

  function cleanName(raw, fallback) {
    var s = typeof raw === 'string' ? raw : '';
    s = s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    s = Array.from(s).slice(0, Store.MAX_NAME).join('');
    return s || fallback;
  }

  function pct(wins, played) {
    return played > 0 ? Math.round((wins / played) * 100) + '%' : '—';
  }

  function toast(message) {
    var wrap = $('toastWrap');
    var node = el('div', { class: 'toast', text: message });
    wrap.appendChild(node);
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, TOAST_MS);
  }

  function formatDate(ts) {
    try {
      return new Date(ts).toLocaleString(undefined, {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    } catch (err) {
      return '';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Modals                                                             */
  /* ------------------------------------------------------------------ */

  var lastFocus = null;

  function openModal(id) {
    var modal = $(id);
    if (!modal) return;
    if (!document.querySelector('.modal.open')) lastFocus = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    var focusTarget = modal.querySelector('[data-autofocus]') || modal.querySelector('button, input');
    if (focusTarget) setTimeout(function () { focusTarget.focus(); }, 30);
  }

  function closeModal(id) {
    var modal = $(id);
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal.open') && lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch (err) { /* element may be gone */ }
      lastFocus = null;
    }
  }

  function topOpenModal() {
    var open = document.querySelectorAll('.modal.open');
    return open.length ? open[open.length - 1] : null;
  }

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var modal = topOpenModal();
    if (modal && modal.getAttribute('data-locked') !== 'true') closeModal(modal.id);
  });

  Array.prototype.forEach.call(document.querySelectorAll('.modal'), function (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal && modal.getAttribute('data-locked') !== 'true') closeModal(modal.id);
    });
  });

  var confirmHandler = null;

  function confirmDialog(options) {
    $('confirmIcon').textContent = options.icon || '⚠️';
    $('confirmTitle').textContent = options.title;
    $('confirmMsg').textContent = options.message;
    $('confirmOk').textContent = options.okLabel || 'Confirm';
    confirmHandler = options.onConfirm;
    openModal('confirmModal');
  }

  /* ------------------------------------------------------------------ */
  /* Theme                                                              */
  /* ------------------------------------------------------------------ */

  function applyTheme(theme) {
    var t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#f4f5fb' : '#0f0f1a');
    $('themeToggle').setAttribute('aria-checked', String(t === 'dark'));
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                         */
  /* ------------------------------------------------------------------ */

  var currentScreen = 'homeScreen';

  function openScreen(id) {
    if (SCREENS.indexOf(id) === -1) return;
    currentScreen = id;
    SCREENS.forEach(function (s) {
      $(s).classList.toggle('active', s === id);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (btn) {
      var active = btn.getAttribute('data-screen') === id;
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    if (id === 'statsScreen') renderStats();
    if (id === 'settingsScreen') renderSettings();
    if (id === 'homeScreen') renderHome();
    if (id === 'playScreen' && !game) renderSetup();
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Home / profile / settings / stats rendering                        */
  /* ------------------------------------------------------------------ */

  function totals(data) {
    var played = 0;
    var wins = 0;
    Store.DIFFICULTIES.forEach(function (d) {
      played += data.stats.bot[d].played;
      wins += data.stats.bot[d].wins;
    });
    return { played: played, wins: wins };
  }

  function renderHeader(data) {
    $('headerAvatarBtn').textContent = data.profile.avatar;
  }

  function renderHome() {
    var data = Store.get();
    var t = totals(data);
    renderHeader(data);
    $('heroAvatar').textContent = data.profile.avatar;
    $('heroName').textContent = data.profile.name;
    $('hsPlayed').textContent = String(t.played + data.stats.pvp.played);
    $('hsWins').textContent = String(t.wins);
    $('hsStreak').textContent = String(data.stats.streak);
    $('hsBest').textContent = String(data.stats.bestStreak);
  }

  function renderSettings() {
    var persistent = Store.isPersistent();
    $('persistStatus').textContent = persistent
      ? 'Saved in this browser only'
      : 'Unavailable — stats will not be saved';
    $('storageWarn').hidden = persistent;
  }

  function statCard(value, label) {
    return el('div', { class: 'stat-card' }, [
      el('div', { class: 'stat-val', text: String(value) }),
      el('div', { class: 'stat-lbl', text: label })
    ]);
  }

  function historyLabel(entry) {
    if (entry.mode === 'bot') {
      var diff = DIFFS[entry.diff] ? DIFFS[entry.diff].label : 'Medium';
      var text = entry.result === 'win' ? 'Won' : entry.result === 'loss' ? 'Lost' : 'Draw';
      return { left: 'vs Computer · ' + diff, result: text, cls: 'res-' + entry.result };
    }
    var label = entry.result === 'x' ? 'X won' : entry.result === 'o' ? 'O won' : 'Draw';
    return { left: '1 vs 1', result: label, cls: entry.result === 'draw' ? 'res-draw' : 'res-win' };
  }

  function renderStats() {
    var data = Store.get();
    var t = totals(data);
    var pvp = data.stats.pvp;
    var body = $('statsBody');
    body.textContent = '';

    $('statsAvatar').textContent = data.profile.avatar;
    $('statsName').textContent = data.profile.name;
    renderHeader(data);

    body.appendChild(el('div', { class: 'stat-grid' }, [
      statCard(t.played, 'Games vs Computer'),
      statCard(pct(t.wins, t.played), 'Win rate'),
      statCard(data.stats.streak, 'Win streak'),
      statCard(data.stats.bestStreak, 'Best streak')
    ]));

    body.appendChild(el('div', { class: 'sec-lbl', text: 'vs Computer' }));
    var rows = Store.DIFFICULTIES.map(function (d) {
      var b = data.stats.bot[d];
      return el('tr', null, [
        el('td', { text: DIFFS[d].label }),
        el('td', { text: String(b.played) }),
        el('td', { text: String(b.wins) }),
        el('td', { text: String(b.losses) }),
        el('td', { text: String(b.draws) }),
        el('td', { text: pct(b.wins, b.played) })
      ]);
    });
    body.appendChild(el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, [
      el('thead', null, el('tr', null, ['Level', 'Played', 'Won', 'Lost', 'Draw', 'Win %'].map(function (h) {
        return el('th', { scope: 'col', text: h });
      }))),
      el('tbody', null, rows)
    ])));

    body.appendChild(el('div', { class: 'sec-lbl', text: '1 vs 1' }));
    body.appendChild(el('div', { class: 'stat-grid' }, [
      statCard(pvp.played, 'Matches'),
      statCard(pvp.draws, 'Draws'),
      statCard(pvp.xWins, 'X wins'),
      statCard(pvp.oWins, 'O wins')
    ]));

    body.appendChild(el('div', { class: 'sec-lbl', text: 'Recent games' }));
    if (data.history.length === 0) {
      body.appendChild(el('div', { class: 'empty', text: 'No games yet. Play a round to see it here!' }));
    } else {
      body.appendChild(el('ul', { class: 'history' }, data.history.map(function (entry) {
        var info = historyLabel(entry);
        return el('li', null, [
          el('span', null, [
            el('span', { text: info.left }),
            el('div', { class: 'h-date', text: formatDate(entry.t) })
          ]),
          el('span', { class: info.cls, text: info.result })
        ]);
      })));
    }

    body.appendChild(el('p', {
      class: 'data-warning',
      text: '⚠️ Stats are stored only in this browser. Clearing browser data or uninstalling the app erases them permanently, and they cannot be restored.'
    }));
  }

  /* ------------------------------------------------------------------ */
  /* Setup view                                                         */
  /* ------------------------------------------------------------------ */

  var setup = { mode: null, difficulty: 'medium', humanMark: 'X' };

  function buildDiffButtons() {
    var group = $('diffGroup');
    group.textContent = '';
    Store.DIFFICULTIES.forEach(function (d) {
      group.appendChild(el('button', {
        type: 'button',
        class: 'seg-btn',
        'data-diff': d,
        'aria-pressed': String(setup.difficulty === d),
        text: DIFFS[d].label
      }));
    });
  }

  function renderSetup() {
    $('setupView').hidden = false;
    $('gameView').hidden = true;

    Array.prototype.forEach.call(document.querySelectorAll('.mode-card'), function (card) {
      card.setAttribute('aria-pressed', String(card.getAttribute('data-mode') === setup.mode));
    });
    $('botOptions').hidden = setup.mode !== 'bot';
    $('friendOptions').hidden = setup.mode !== 'pvp';
    $('startBtn').disabled = !setup.mode;

    Array.prototype.forEach.call($('diffGroup').querySelectorAll('.seg-btn'), function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-diff') === setup.difficulty));
    });
    Array.prototype.forEach.call($('markGroup').querySelectorAll('.seg-btn'), function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-mark') === setup.humanMark));
    });
    $('diffHint').textContent = DIFFS[setup.difficulty].hint;

    var nameA = $('nameA');
    if (!nameA.value) nameA.value = Store.get().profile.name;
  }

  function selectMode(mode) {
    if (mode !== 'bot' && mode !== 'pvp') return;
    setup.mode = mode;
    renderSetup();
  }

  /* ------------------------------------------------------------------ */
  /* Game                                                               */
  /* ------------------------------------------------------------------ */

  var game = null;
  var botTimer = null;
  var resultTimer = null;
  var boardCells = [];

  function clearTimers() {
    if (botTimer !== null) { clearTimeout(botTimer); botTimer = null; }
    if (resultTimer !== null) { clearTimeout(resultTimer); resultTimer = null; }
  }

  function markOf(playerIndex) {
    return (playerIndex === 0) !== game.swapped ? 'X' : 'O';
  }

  function playerIndexOfMark(mark) {
    return markOf(0) === mark ? 0 : 1;
  }

  function buildBoard() {
    var board = $('board');
    board.textContent = '';
    boardCells = [];
    for (var i = 0; i < 9; i++) {
      (function (index) {
        var cell = el('button', {
          type: 'button',
          class: 'cell',
          role: 'gridcell',
          'data-index': index,
          onclick: function () { onCellClick(index); }
        });
        boardCells.push(cell);
        board.appendChild(cell);
      })(i);
    }
  }

  function cellLabel(index, mark) {
    return 'Row ' + (Math.floor(index / 3) + 1) + ', column ' + ((index % 3) + 1) + ', ' + (mark || 'empty');
  }

  function renderBoard(winLine) {
    for (var i = 0; i < 9; i++) {
      var cell = boardCells[i];
      var mark = game.board[i];
      cell.textContent = mark || '';
      if (mark) cell.setAttribute('data-mark', mark);
      else cell.removeAttribute('data-mark');
      cell.classList.toggle('win', !!winLine && winLine.indexOf(i) !== -1);
      cell.setAttribute('aria-label', cellLabel(i, mark));
      cell.setAttribute('aria-disabled', String(game.over || game.locked || mark !== null));
    }
  }

  function renderScoreboard() {
    var a = game.players[0];
    var b = game.players[1];
    $('scoreNameA').textContent = a.name + ' (' + markOf(0) + ')';
    $('scoreNameB').textContent = b.name + ' (' + markOf(1) + ')';
    $('scoreA').textContent = String(game.scores[0]);
    $('scoreB').textContent = String(game.scores[1]);
    $('scoreD').textContent = String(game.draws);
    var turnIdx = game.over ? -1 : playerIndexOfMark(game.turn);
    $('scoreCellA').classList.toggle('turn', turnIdx === 0);
    $('scoreCellB').classList.toggle('turn', turnIdx === 1);
  }

  function setStatus(text) {
    $('statusLine').textContent = text;
  }

  function renderTurnStatus() {
    var idx = playerIndexOfMark(game.turn);
    var p = game.players[idx];
    if (game.mode === 'bot') {
      setStatus(p.isBot ? 'Computer is thinking…' : 'Your turn (' + game.turn + ')');
    } else {
      setStatus(p.name + "'s turn (" + game.turn + ')');
    }
  }

  function startRound() {
    clearTimers();
    game.id += 1;
    game.board = [null, null, null, null, null, null, null, null, null];
    game.turn = 'X';
    game.over = false;
    game.locked = false;
    game.moves = 0;
    game.recorded = false;
    $('nextRoundBtn').disabled = true;
    closeModal('resultModal');
    renderBoard(null);
    renderScoreboard();
    renderTurnStatus();
    if (game.players[playerIndexOfMark('X')].isBot) scheduleBotMove();
  }

  function startGame() {
    if (!setup.mode) return;
    var data = Store.get();
    var players;
    var title;
    var subtitle;

    if (setup.mode === 'bot') {
      var diff = DIFFS[setup.difficulty] ? setup.difficulty : 'medium';
      players = [
        { name: cleanName(data.profile.name, 'You'), isBot: false },
        { name: 'Computer', isBot: true }
      ];
      title = '🤖 vs Computer';
      subtitle = DIFFS[diff].label + ' · You are ' + setup.humanMark;
      game = { mode: 'bot', difficulty: diff, swapped: setup.humanMark === 'O' };
    } else {
      var nameA = cleanName($('nameA').value, 'Player 1');
      var nameB = cleanName($('nameB').value, 'Player 2');
      if (nameA.toLowerCase() === nameB.toLowerCase()) {
        nameB = Array.from(nameB).slice(0, Store.MAX_NAME - 4).join('') + ' (2)';
      }
      players = [{ name: nameA, isBot: false }, { name: nameB, isBot: false }];
      title = '👥 1 vs 1';
      subtitle = 'Two players · X moves first';
      game = { mode: 'pvp', difficulty: null, swapped: false };
    }

    game.players = players;
    game.scores = [0, 0];
    game.draws = 0;
    game.id = 0;

    $('gameTitle').textContent = title;
    $('gameSubtitle').textContent = subtitle;
    $('setupView').hidden = true;
    $('gameView').hidden = false;
    buildBoard();
    startRound();
  }

  function endGameSession() {
    clearTimers();
    game = null;
    closeModal('resultModal');
    renderSetup();
  }

  function quitGame() {
    if (!game) return;
    if (!game.over && game.moves > 0) {
      confirmDialog({
        icon: '🚪',
        title: 'Quit this game?',
        message: 'The round in progress will not be counted.',
        okLabel: 'Quit',
        onConfirm: endGameSession
      });
    } else {
      endGameSession();
    }
  }

  function onCellClick(index) {
    if (!game || game.over || game.locked) return;
    if (game.board[index] !== null) return;
    if (game.players[playerIndexOfMark(game.turn)].isBot) return;
    placeMark(index);
  }

  function placeMark(index) {
    game.board[index] = game.turn;
    game.moves += 1;

    var result = Engine.getWinner(game.board);
    if (result) {
      finishRound(result.mark, result.line);
      return;
    }
    if (Engine.isFull(game.board)) {
      finishRound(null, null);
      return;
    }

    game.turn = Engine.opponent(game.turn);
    renderBoard(null);
    renderScoreboard();
    renderTurnStatus();
    if (game.players[playerIndexOfMark(game.turn)].isBot) scheduleBotMove();
  }

  function scheduleBotMove() {
    game.locked = true;
    renderBoard(null);
    var token = game.id;
    botTimer = setTimeout(function () {
      botTimer = null;
      if (!game || game.id !== token || game.over) return;
      var move = Engine.chooseMove(game.board, game.turn, game.difficulty);
      game.locked = false;
      if (move >= 0) placeMark(move);
    }, BOT_DELAY_MS);
  }

  function recordResult(winnerMark) {
    if (game.recorded) return;
    game.recorded = true;
    try {
      if (game.mode === 'bot') {
        var humanMark = markOf(0);
        var outcome = winnerMark === null ? 'draw' : winnerMark === humanMark ? 'win' : 'loss';
        Store.recordBotResult(game.difficulty, outcome);
      } else {
        Store.recordPvpResult(winnerMark === null ? 'draw' : winnerMark.toLowerCase());
      }
    } catch (err) {
      if (window.console) window.console.error('[TTT] Failed to record result:', err);
      toast('Could not save this result');
    }
  }

  function finishRound(winnerMark, line) {
    game.over = true;
    game.locked = false;

    var winnerIdx = winnerMark ? playerIndexOfMark(winnerMark) : -1;
    if (winnerIdx >= 0) game.scores[winnerIdx] += 1;
    else game.draws += 1;

    recordResult(winnerMark);
    renderBoard(line);
    renderScoreboard();
    $('nextRoundBtn').disabled = false;

    var title;
    var body;
    var icon;
    if (winnerIdx === -1) {
      title = "It's a draw";
      body = 'Nobody wins this round.';
      icon = '🤝';
    } else if (game.mode === 'bot') {
      if (winnerIdx === 0) {
        title = 'You win!';
        body = 'Nice play against the computer (' + DIFFS[game.difficulty].label + ').';
        icon = '🎉';
      } else {
        title = 'Computer wins';
        body = 'Better luck next round!';
        icon = '🤖';
      }
    } else {
      title = game.players[winnerIdx].name + ' wins!';
      body = 'Playing ' + winnerMark + ' — congratulations.';
      icon = '🏆';
    }
    setStatus(title);

    $('resultIcon').textContent = icon;
    $('resultTitle').textContent = title;
    $('resultBody').textContent = body;

    var token = game.id;
    resultTimer = setTimeout(function () {
      resultTimer = null;
      if (!game || game.id !== token || currentScreen !== 'playScreen') return;
      openModal('resultModal');
    }, RESULT_MODAL_DELAY_MS);
  }

  function nextRound() {
    if (!game || !game.over) return;
    game.swapped = !game.swapped;
    startRound();
  }

  /* ------------------------------------------------------------------ */
  /* Profile editing                                                    */
  /* ------------------------------------------------------------------ */

  var pendingAvatar = null;

  function openEditProfile() {
    var data = Store.get();
    pendingAvatar = data.profile.avatar;
    $('editUsername').value = data.profile.name;
    var grid = $('editAvatarGrid');
    grid.textContent = '';
    AVATARS.forEach(function (emoji) {
      grid.appendChild(el('button', {
        type: 'button',
        class: 'avatar-btn',
        'data-avatar': emoji,
        'aria-label': 'Avatar ' + emoji,
        'aria-pressed': String(emoji === pendingAvatar),
        text: emoji
      }));
    });
    openModal('profileModal');
  }

  function saveProfileEdit() {
    var name = cleanName($('editUsername').value, 'Player');
    var avatar = AVATARS.indexOf(pendingAvatar) !== -1 ? pendingAvatar : AVATARS[0];
    Store.update(function (d) {
      d.profile.name = name;
      d.profile.avatar = avatar;
    });
    closeModal('profileModal');
    renderHome();
    if (currentScreen === 'statsScreen') renderStats();
    $('nameA').value = '';
    toast('Profile saved');
  }

  /* ------------------------------------------------------------------ */
  /* Onboarding                                                         */
  /* ------------------------------------------------------------------ */

  var obStep = 0;

  function renderOnboarding() {
    var step = ONBOARD_STEPS[obStep];
    var dots = $('obDots');
    dots.textContent = '';
    ONBOARD_STEPS.forEach(function (unused, i) {
      dots.appendChild(el('span', { class: 'ob-dot' + (i === obStep ? ' on' : '') }));
    });
    $('obIco').textContent = step.ico;
    $('obTitle').textContent = step.title;
    $('obDesc').textContent = step.desc;

    var warn = $('obWarn');
    warn.textContent = '';
    if (step.warn) {
      warn.appendChild(el('ul', null, step.warn.map(function (line) { return el('li', { text: line }); })));
      warn.hidden = false;
    } else {
      warn.hidden = true;
    }

    var last = obStep === ONBOARD_STEPS.length - 1;
    $('obNext').textContent = step.nextLabel || (last ? "Let's play" : 'Next →');
    // The data-loss warning must be seen: Skip is hidden on and after that step.
    $('obSkip').hidden = obStep >= WARN_STEP_INDEX;
  }

  function showOnboarding() {
    obStep = 0;
    renderOnboarding();
    openModal('onboardModal');
  }

  function finishOnboarding() {
    Store.update(function (d) { d.onboarded = true; });
    closeModal('onboardModal');
  }

  function nextOnboardStep() {
    if (obStep >= ONBOARD_STEPS.length - 1) {
      finishOnboarding();
      return;
    }
    obStep += 1;
    renderOnboarding();
  }

  function skipOnboarding() {
    if (obStep < WARN_STEP_INDEX) {
      obStep = WARN_STEP_INDEX;
      renderOnboarding();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Event wiring                                                       */
  /* ------------------------------------------------------------------ */

  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (btn) {
      btn.addEventListener('click', function () { openScreen(btn.getAttribute('data-screen')); });
    });
    $('headerAvatarBtn').addEventListener('click', function () { openScreen('statsScreen'); });

    $('homeBotBtn').addEventListener('click', function () {
      if (!game) selectMode('bot');
      openScreen('playScreen');
    });
    $('homeFriendBtn').addEventListener('click', function () {
      if (!game) selectMode('pvp');
      openScreen('playScreen');
    });

    Array.prototype.forEach.call(document.querySelectorAll('.mode-card'), function (card) {
      card.addEventListener('click', function () { selectMode(card.getAttribute('data-mode')); });
    });
    $('diffGroup').addEventListener('click', function (event) {
      var btn = event.target.closest('[data-diff]');
      if (!btn) return;
      var diff = btn.getAttribute('data-diff');
      if (!DIFFS[diff]) return;
      setup.difficulty = diff;
      renderSetup();
    });
    $('markGroup').addEventListener('click', function (event) {
      var btn = event.target.closest('[data-mark]');
      if (!btn) return;
      var mark = btn.getAttribute('data-mark');
      if (mark !== 'X' && mark !== 'O') return;
      setup.humanMark = mark;
      renderSetup();
    });
    $('startBtn').addEventListener('click', startGame);
    $('nextRoundBtn').addEventListener('click', nextRound);
    $('quitBtn').addEventListener('click', quitGame);

    $('resultAgain').addEventListener('click', nextRound);
    $('resultClose').addEventListener('click', function () { closeModal('resultModal'); });

    $('confirmOk').addEventListener('click', function () {
      var handler = confirmHandler;
      confirmHandler = null;
      closeModal('confirmModal');
      if (typeof handler === 'function') handler();
    });
    $('confirmCancel').addEventListener('click', function () {
      confirmHandler = null;
      closeModal('confirmModal');
    });

    $('editProfileBtn').addEventListener('click', openEditProfile);
    $('profileCancel').addEventListener('click', function () { closeModal('profileModal'); });
    $('profileSave').addEventListener('click', saveProfileEdit);
    $('editUsername').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') saveProfileEdit();
    });
    $('editAvatarGrid').addEventListener('click', function (event) {
      var btn = event.target.closest('[data-avatar]');
      if (!btn) return;
      pendingAvatar = btn.getAttribute('data-avatar');
      Array.prototype.forEach.call($('editAvatarGrid').children, function (child) {
        child.setAttribute('aria-pressed', String(child === btn));
      });
    });

    $('themeToggle').addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      Store.update(function (d) { d.theme = next; });
      applyTheme(next);
    });
    $('tutorialBtn').addEventListener('click', showOnboarding);
    $('resetBtn').addEventListener('click', function () {
      confirmDialog({
        icon: '🗑️',
        title: 'Erase all data?',
        message: 'This permanently deletes your profile, stats and history from this browser. It cannot be undone or restored.',
        okLabel: 'Erase everything',
        onConfirm: function () {
          clearTimers();
          Store.reset();
          window.location.reload();
        }
      });
    });

    $('obNext').addEventListener('click', nextOnboardStep);
    $('obSkip').addEventListener('click', skipOnboarding);

    window.addEventListener('storage', function () {
      if (currentScreen === 'homeScreen') renderHome();
      if (currentScreen === 'statsScreen') renderStats();
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var secure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    if (!secure) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        if (window.console) window.console.warn('[TTT] Service worker registration failed:', err);
      });
    });
  }

  function init() {
    var data = Store.get();
    applyTheme(data.theme);
    buildDiffButtons();
    wire();
    renderHome();
    renderSettings();
    openScreen('homeScreen');
    if (!data.onboarded) showOnboarding();
    registerServiceWorker();
  }

  init();
})();
