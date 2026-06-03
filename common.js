/*
 * common.js — shared utilities + storage layer for Focus Lock.
 * Loaded by the service worker via importScripts() and by every
 * extension page via a <script> tag. Everything hangs off self.FocusLock.
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    blocks: [],            // [{ id, domain, label, endTime, createdAt, unlockedUntil }]
    schedules: [],         // [{ id, domain, label, days:[0-6], start:"HH:MM", end:"HH:MM" }]
    scheduleUnlocks: {},    // { [scheduleId]: timestampMs }  — unlocked until this time
    settings: { captchaRounds: 10, challengeEnabled: true }
  };

  // ---- storage helpers (promise-based, MV3) ------------------------------
  function getAll() {
    return chrome.storage.local.get(DEFAULTS);
  }
  function set(partial) {
    return chrome.storage.local.set(partial);
  }

  // ---- domain helpers ----------------------------------------------------
  // Turn whatever the user typed (a full URL, "www.youtube.com", "youtube.com/foo")
  // into a bare registrable host like "youtube.com".
  function normalizeDomain(input) {
    if (!input) return '';
    let s = String(input).trim().toLowerCase();
    s = s.replace(/^[a-z]+:\/\//, ''); // strip protocol
    s = s.split('/')[0];               // strip path
    s = s.split('?')[0];
    s = s.split('#')[0];
    s = s.split(':')[0];               // strip port
    s = s.replace(/^www\./, '');       // strip leading www.
    return s;
  }

  function getHost(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch (e) {
      return '';
    }
  }

  // Does a page host fall under a blocked domain? Matches the domain itself
  // and any subdomain. "m.youtube.com" and "youtube.com" both match "youtube.com".
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

  function scheduleActive(s, now) {
    const dt = new Date(now);
    const day = dt.getDay(); // 0 = Sunday
    if (!Array.isArray(s.days) || !s.days.includes(day)) {
      // For overnight windows the active part can spill into the next day,
      // but we keep the model simple: a schedule is keyed to the days it starts.
      // Overnight wrap is still handled below for the time comparison.
    }
    const mins = dt.getHours() * 60 + dt.getMinutes();
    const startM = toMinutes(s.start);
    const endM = toMinutes(s.end);
    const isDay = Array.isArray(s.days) && s.days.includes(day);
    if (endM <= startM) {
      // Overnight window, e.g. 22:00 -> 06:00.
      return isDay && (mins >= startM || mins < endM);
    }
    return isDay && mins >= startM && mins < endM;
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
  // Returns null if allowed, otherwise { key, kind, domain, endTime }.
  async function evaluate(url, state, now) {
    if (!state) state = await getAll();
    if (typeof now !== 'number') now = Date.now();

    const host = getHost(url);
    if (!host) return null;

    const candidates = []; // active locks that are NOT currently unlocked

    // One-off / focus-session blocks
    for (const b of state.blocks) {
      if (b.endTime > now && hostMatches(host, b.domain)) {
        const unlocked = b.unlockedUntil && b.unlockedUntil > now;
        if (!unlocked) {
          candidates.push({ key: b.id, kind: 'session', domain: b.domain, endTime: b.endTime });
        }
      }
    }

    // Recurring schedules
    for (const s of state.schedules) {
      if (scheduleActive(s, now) && hostMatches(host, s.domain)) {
        const u = state.scheduleUnlocks[s.id];
        const unlocked = u && u > now;
        if (!unlocked) {
          candidates.push({
            key: 'sched:' + s.id,
            kind: 'schedule',
            domain: s.domain,
            endTime: scheduleWindowEnd(s, now)
          });
        }
      }
    }

    if (!candidates.length) return null;
    // Pick the lock that ends latest so the countdown shown is accurate.
    candidates.sort((a, b) => b.endTime - a.endTime);
    return candidates[0];
  }

  // ---- unlock (challenge passed) -----------------------------------------
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
      if (b) {
        b.unlockedUntil = b.endTime;
        await set({ blocks: state.blocks });
      }
    }
  }

  // ---- formatting --------------------------------------------------------
  function formatRemaining(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function formatRemainingWords(ms) {
    if (ms < 0) ms = 0;
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  function uid() {
    return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  global.FocusLock = {
    DEFAULTS,
    getAll,
    set,
    normalizeDomain,
    getHost,
    hostMatches,
    scheduleActive,
    scheduleWindowEnd,
    evaluate,
    unlock,
    formatRemaining,
    formatRemainingWords,
    uid
  };
})(typeof self !== 'undefined' ? self : this);
