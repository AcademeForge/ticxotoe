(function (global) {
  'use strict';

  var KEY = 'af_tictactoe_v1';
  var VERSION = 1;
  var MAX_HISTORY = 20;
  var MAX_NAME = 16;
  var DIFFICULTIES = ['easy', 'medium', 'hard'];
  var DEFAULT_AVATAR = '😀';
  var DEFAULT_NAME = 'Player';
  var MAX_COUNTER = 1000000000;

  var memoryData = null;
  var persistent = detectStorage();

  function detectStorage() {
    try {
      var probe = '__af_ttt_probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  }

  function toInt(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.min(Math.floor(n), MAX_COUNTER);
  }

  function toText(value, fallback, maxLen) {
    var s = typeof value === 'string' ? value : '';
    s = s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    s = Array.from(s).slice(0, maxLen).join('');
    return s || fallback;
  }

  function bucket(src) {
    var s = src && typeof src === 'object' ? src : {};
    return {
      played: toInt(s.played),
      wins: toInt(s.wins),
      losses: toInt(s.losses),
      draws: toInt(s.draws)
    };
  }

  function defaults() {
    return {
      version: VERSION,
      onboarded: false,
      theme: 'dark',
      profile: { name: DEFAULT_NAME, avatar: DEFAULT_AVATAR },
      stats: {
        bot: { easy: bucket(), medium: bucket(), hard: bucket() },
        pvp: { played: 0, xWins: 0, oWins: 0, draws: 0 },
        streak: 0,
        bestStreak: 0
      },
      history: []
    };
  }

  function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    var mode = entry.mode === 'pvp' ? 'pvp' : entry.mode === 'bot' ? 'bot' : null;
    if (!mode) return null;
    var allowed = mode === 'bot' ? ['win', 'loss', 'draw'] : ['x', 'o', 'draw'];
    if (allowed.indexOf(entry.result) === -1) return null;
    var diff = DIFFICULTIES.indexOf(entry.diff) !== -1 ? entry.diff : null;
    var t = Number(entry.t);
    return {
      t: isFinite(t) && t > 0 ? Math.floor(t) : Date.now(),
      mode: mode,
      diff: mode === 'bot' ? diff || 'medium' : null,
      result: entry.result
    };
  }

  function normalize(raw) {
    var base = defaults();
    if (!raw || typeof raw !== 'object') return base;

    base.onboarded = raw.onboarded === true;
    base.theme = raw.theme === 'light' ? 'light' : 'dark';

    var profile = raw.profile && typeof raw.profile === 'object' ? raw.profile : {};
    base.profile.name = toText(profile.name, DEFAULT_NAME, MAX_NAME);
    base.profile.avatar = toText(profile.avatar, DEFAULT_AVATAR, 4);

    var stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
    var bot = stats.bot && typeof stats.bot === 'object' ? stats.bot : {};
    DIFFICULTIES.forEach(function (d) {
      base.stats.bot[d] = bucket(bot[d]);
    });

    var pvp = stats.pvp && typeof stats.pvp === 'object' ? stats.pvp : {};
    base.stats.pvp = {
      played: toInt(pvp.played),
      xWins: toInt(pvp.xWins),
      oWins: toInt(pvp.oWins),
      draws: toInt(pvp.draws)
    };

    base.stats.streak = toInt(stats.streak);
    base.stats.bestStreak = Math.max(toInt(stats.bestStreak), base.stats.streak);

    if (Array.isArray(raw.history)) {
      base.history = raw.history
        .map(normalizeHistoryEntry)
        .filter(Boolean)
        .slice(0, MAX_HISTORY);
    }
    return base;
  }

  function read() {
    if (!persistent) return normalize(memoryData);
    try {
      var text = global.localStorage.getItem(KEY);
      if (!text) return normalize(memoryData);
      return normalize(JSON.parse(text));
    } catch (err) {
      if (global.console) global.console.warn('[TTT] Could not read saved data:', err);
      return normalize(memoryData);
    }
  }

  function write(data) {
    memoryData = data;
    if (!persistent) return false;
    try {
      global.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      if (global.console) global.console.warn('[TTT] Could not save data:', err);
      persistent = false;
      return false;
    }
  }

  function update(mutator) {
    var data = read();
    mutator(data);
    var next = normalize(data);
    write(next);
    return next;
  }

  function pushHistory(data, entry) {
    data.history.unshift({
      t: Date.now(),
      mode: entry.mode,
      diff: entry.diff || null,
      result: entry.result
    });
    if (data.history.length > MAX_HISTORY) data.history.length = MAX_HISTORY;
  }

  function recordBotResult(difficulty, result) {
    var diff = DIFFICULTIES.indexOf(difficulty) !== -1 ? difficulty : 'medium';
    if (['win', 'loss', 'draw'].indexOf(result) === -1) {
      throw new Error('Invalid bot result: ' + result);
    }
    return update(function (d) {
      var b = d.stats.bot[diff];
      b.played += 1;
      if (result === 'win') {
        b.wins += 1;
        d.stats.streak += 1;
        if (d.stats.streak > d.stats.bestStreak) d.stats.bestStreak = d.stats.streak;
      } else if (result === 'loss') {
        b.losses += 1;
        d.stats.streak = 0;
      } else {
        b.draws += 1;
      }
      pushHistory(d, { mode: 'bot', diff: diff, result: result });
    });
  }

  function recordPvpResult(result) {
    if (['x', 'o', 'draw'].indexOf(result) === -1) {
      throw new Error('Invalid PvP result: ' + result);
    }
    return update(function (d) {
      d.stats.pvp.played += 1;
      if (result === 'x') d.stats.pvp.xWins += 1;
      else if (result === 'o') d.stats.pvp.oWins += 1;
      else d.stats.pvp.draws += 1;
      pushHistory(d, { mode: 'pvp', result: result });
    });
  }

  function reset() {
    memoryData = null;
    if (persistent) {
      try {
        global.localStorage.removeItem(KEY);
      } catch (err) {
        if (global.console) global.console.warn('[TTT] Could not clear data:', err);
      }
    }
  }

  global.TTTStorage = Object.freeze({
    get: read,
    update: update,
    recordBotResult: recordBotResult,
    recordPvpResult: recordPvpResult,
    reset: reset,
    isPersistent: function () {
      return persistent;
    },
    DIFFICULTIES: DIFFICULTIES,
    MAX_NAME: MAX_NAME
  });
})(window);
