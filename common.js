/*
 * common.js — shared utilities + storage layer for Focus Lock.
 * Loaded by the service worker via importScripts() and by every
 * extension page via a <script> tag. Everything hangs off self.FocusLock.
 */
(function (global) {
  'use strict';

  // Typed exactly to end a lock early or break through when Hardened mode is on.
  const COMMITMENT_PHRASE = 'I am choosing to break my own focus';

  const DEFAULTS = {
    blocks: [],            // [{ id, domain, label, endTime, createdAt, unlockedUntil }]
    schedules: [],         // [{ id, label, domains:[], days:[0-6], start:"HH:MM", end:"HH:MM" }]
    scheduleUnlocks: {},    // { [scheduleId]: timestampMs }
    presets: [],           // [{ id, name, domains:[] }]
    settings: {
      captchaRounds: 5,
      challengeEnabled: true,
      hardened: false,         // commitment-phrase required to end early / break through
      theme: 'auto'            // 'auto' | 'light' | 'dark'
    },
    stats: {
      blockedHits: 0,          // times a navigation was sent to the lock screen
      resisted: 0,             // times the user chose to stay focused mid-challenge
      brokeThrough: 0,         // times the user unlocked via the challenge
      sessionsStarted: 0,
      focusMin: 0,             // committed focus minutes (sum of session durations)
      streak: 0,
      bestStreak: 0,
      lastActiveDay: '',        // 'YYYY-MM-DD'
      history: {}              // { 'YYYY-MM-DD': { blockedHits, resisted, brokeThrough, focusMin, sessions } }
    }
  };

  // ---- storage helpers (promise-based, MV3) ------------------------------
  // get() merges defaults into nested objects so older saved data picks up
  // newly-added settings/stats keys without a migration step.
  async function getAll() {
    const raw = await chrome.storage.local.get(DEFAULTS);
    raw.settings = Object.assign({}, DEFAULTS.settings, raw.settings);
    raw.stats = Object.assign({}, DEFAULTS.stats, raw.stats);
    // Migrate older single-domain schedules to the domains[] shape.
    raw.schedules = (raw.schedules || []).map(s =>
      Array.isArray(s.domains) ? s : Object.assign({}, s, { domains: s.domain ? [s.domain] : [] }));
    return raw;
  }
  function set(partial) {
    return chrome.storage.local.set(partial);
  }

  // ---- date helpers ------------------------------------------------------
  function pad(n) { return String(n).padStart(2, '0'); }
  function dayStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function todayStr() { return dayStr(new Date()); }
  function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return dayStr(d); }

  // ---- domain helpers ----------------------------------------------------
  function normalizeDomain(input) {
    if (!input) return '';
    let s = String(input).trim().toLowerCase();
    s = s.replace(/^[a-z]+:\/\//, '');
    s = s.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
    s = s.replace(/^www\./, '');
    return s;
  }

  function getHost(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
    catch (e) { return ''; }
  }

  function hostMatches(host, domain) {
    if (!host || !domain) return false;
    host = host.replace(/^www\./, '');
    return host === domain || host.endsWith('.' + domain);
  }

  // ---- schedule helpers --------------------------------------------------
  function toMinutes(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  // True overnight support: a window whose end is <= start spills past midnight.
  function scheduleActive(s, now) {
    const dt = new Date(now);
    const day = dt.getDay(); // 0 = Sunday
    const mins = dt.getHours() * 60 + dt.getMinutes();
    const startM = toMinutes(s.start);
    const endM = toMinutes(s.end);
    const days = Array.isArray(s.days) ? s.days : [];
    if (endM > startM) {                       // same-day window
      return days.includes(day) && mins >= startM && mins < endM;
    }
    if (endM < startM) {                       // overnight window
      const prevDay = (day + 6) % 7;
      return (days.includes(day) && mins >= startM) ||
             (days.includes(prevDay) && mins < endM);
    }
    return false;                              // start === end → zero length
  }

  // Timestamp (ms) of the next moment this schedule's window ends.
  function scheduleWindowEnd(s, now) {
    const dt = new Date(now);
    const [eh, em] = String(s.end).split(':').map(Number);
    const end = new Date(dt);
    end.setHours(eh || 0, em || 0, 0, 0);
    if (end.getTime() <= now) end.setDate(end.getDate() + 1);
    return end.getTime();
  }

  // ---- the core question: is this URL currently locked? ------------------
  async function evaluate(url, state, now) {
    if (!state) state = await getAll();
    if (typeof now !== 'number') now = Date.now();

    const host = getHost(url);
    if (!host) return null;

    const candidates = [];

    for (const b of state.blocks) {
      if (b.endTime > now && hostMatches(host, b.domain)) {
        const unlocked = b.unlockedUntil && b.unlockedUntil > now;
        if (!unlocked) candidates.push({ key: b.id, kind: 'session', domain: b.domain, endTime: b.endTime });
      }
    }

    for (const s of state.schedules) {
      const domains = Array.isArray(s.domains) ? s.domains : (s.domain ? [s.domain] : []);
      const matched = scheduleActive(s, now) && domains.find(d => hostMatches(host, d));
      if (matched) {
        const u = state.scheduleUnlocks[s.id];
        if (!(u && u > now)) {
          candidates.push({ key: 'sched:' + s.id, kind: 'schedule', domain: matched, endTime: scheduleWindowEnd(s, now) });
        }
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.endTime - a.endTime);
    return candidates[0];
  }

  async function unlock(key) {
    const state = await getAll();
    const now = Date.now();
    if (key.startsWith('sched:')) {
      const id = key.slice('sched:'.length);
      const sched = state.schedules.find(s => s.id === id);
      if (sched) {
        state.scheduleUnlocks[id] = scheduleWindowEnd(sched, now);
        await set({ scheduleUnlocks: state.scheduleUnlocks });
      }
    } else {
      const b = state.blocks.find(x => x.id === key);
      if (b) { b.unlockedUntil = b.endTime; await set({ blocks: state.blocks }); }
    }
  }

  // ---- stats -------------------------------------------------------------
  async function recordEvent(ev) {
    const { stats } = await getAll();
    const t = todayStr();
    stats.history = stats.history || {};
    const day = stats.history[t] || { blockedHits: 0, resisted: 0, brokeThrough: 0, focusMin: 0, sessions: 0 };

    const bump = (k, field) => {
      if (ev[k]) { stats[field] = (stats[field] || 0) + ev[k]; day[k] = (day[k] || 0) + ev[k]; }
    };
    bump('blockedHits', 'blockedHits');
    bump('resisted', 'resisted');
    bump('brokeThrough', 'brokeThrough');
    bump('focusMin', 'focusMin');
    if (ev.sessions) { stats.sessionsStarted = (stats.sessionsStarted || 0) + ev.sessions; day.sessions += ev.sessions; }

    if (ev.markFocusDay && stats.lastActiveDay !== t) {
      stats.streak = (stats.lastActiveDay === yesterdayStr()) ? (stats.streak || 0) + 1 : 1;
      stats.lastActiveDay = t;
      stats.bestStreak = Math.max(stats.bestStreak || 0, stats.streak);
    }

    stats.history[t] = day;
    await set({ stats });
  }

  // ---- theming -----------------------------------------------------------
  function applyTheme(theme) {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    el.dataset.theme = (theme === 'light' || theme === 'dark') ? theme : 'auto';
  }

  // ---- formatting --------------------------------------------------------
  function formatRemaining(ms) {
    if (ms < 0) ms = 0;
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function formatRemainingWords(ms) {
    if (ms < 0) ms = 0;
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }
  function uid() {
    return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  global.FocusLock = {
    COMMITMENT_PHRASE, DEFAULTS,
    getAll, set,
    normalizeDomain, getHost, hostMatches,
    scheduleActive, scheduleWindowEnd,
    evaluate, unlock,
    recordEvent, todayStr,
    applyTheme,
    formatRemaining, formatRemainingWords, uid
  };

  // Auto-apply theme on every page (no-op in the service worker).
  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.storage) {
    const initTheme = () => getAll().then(s => applyTheme(s.settings.theme)).catch(() => {});
    initTheme();
    document.addEventListener('DOMContentLoaded', initTheme);
    chrome.storage.onChanged.addListener(changes => { if (changes.settings) initTheme(); });
  }
})(typeof self !== 'undefined' ? self : this);
