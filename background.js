/*
 * background.js — the service worker.
 * Its only jobs: intercept navigations to locked sites and redirect them to
 * the lock screen, keep the toolbar badge fresh, and tidy up expired locks.
 * All editing of locks/schedules happens directly from the UI pages.
 */
importScripts('common.js');
const FL = self.FocusLock;

const SCHEMES = /^https?:\/\//i;

// Redirect a tab to the lock screen, carrying the info the page needs.
function lockScreenUrl(match, originalUrl) {
  const params = new URLSearchParams({
    d: match.domain,
    key: match.key,
    until: String(match.endTime),
    from: originalUrl
  });
  return chrome.runtime.getURL('blocked.html') + '?' + params.toString();
}

async function handleNavigation(tabId, url, frameId, countHit) {
  if (frameId !== 0) return;          // only top-level frames
  if (!url || !SCHEMES.test(url)) return; // ignore chrome://, extension pages, etc.

  const match = await FL.evaluate(url);
  if (match) {
    if (countHit) {
      // record one "blocked hit" + mark today as an active focus day (for streaks)
      FL.recordEvent({ blockedHits: 1, markFocusDay: true });
    }
    try {
      await chrome.tabs.update(tabId, { url: lockScreenUrl(match, url) });
    } catch (e) {
      // tab may have closed; ignore
    }
  }
}

// Full page loads — these count as a blocked hit.
chrome.webNavigation.onBeforeNavigate.addListener(d => {
  handleNavigation(d.tabId, d.url, d.frameId, true);
});

// In-app (SPA) navigations — catches moving around inside YouTube after a lock
// begins. Not counted as a hit to avoid inflating stats on a single visit.
chrome.webNavigation.onHistoryStateUpdated.addListener(d => {
  handleNavigation(d.tabId, d.url, d.frameId, false);
});

// ---- badge: show how many sites are locked right now --------------------
async function refreshBadge() {
  try {
    const state = await FL.getAll();
    const now = Date.now();
    if (state.pause && state.pause.until > now) {
      await chrome.action.setBadgeBackgroundColor({ color: '#9DACA3' });
      await chrome.action.setBadgeText({ text: '||' });
      return;
    }
    let count = 0;
    for (const b of state.blocks) {
      if (b.endTime > now && !(b.unlockedUntil && b.unlockedUntil > now)) count++;
    }
    for (const s of state.schedules) {
      if (FL.scheduleActive(s, now)) {
        const u = state.scheduleUnlocks[s.id];
        if (!(u && u > now)) count++;
      }
    }
    await chrome.action.setBadgeBackgroundColor({ color: '#6B9080' });
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  } catch (e) {
    /* ignore */
  }
}

// ---- housekeeping: drop expired locks & stale unlocks -------------------
async function cleanup() {
  const state = await FL.getAll();
  const now = Date.now();

  const blocks = state.blocks.filter(b => b.endTime > now);

  const scheduleUnlocks = {};
  for (const [id, ts] of Object.entries(state.scheduleUnlocks)) {
    if (ts > now) scheduleUnlocks[id] = ts;
  }

  const changed =
    blocks.length !== state.blocks.length ||
    Object.keys(scheduleUnlocks).length !== Object.keys(state.scheduleUnlocks).length;

  if (changed) await FL.set({ blocks, scheduleUnlocks });
  await refreshBadge();
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('tick', { periodInMinutes: 1 });
  cleanup();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('tick', { periodInMinutes: 1 });
  cleanup();
});
chrome.alarms.onAlarm.addListener(a => {
  if (a.name === 'tick') cleanup();
});

// Keep the badge in sync the moment locks change.
chrome.storage.onChanged.addListener(refreshBadge);
