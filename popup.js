'use strict';
const FL = self.FocusLock;

const siteInput = document.getElementById('siteInput');
const chipsEl = document.getElementById('chips');
const presetsEl = document.getElementById('presets');
const customHours = document.getElementById('customHours');
const startBtn = document.getElementById('startBtn');
const activeCard = document.getElementById('activeCard');
const activeList = document.getElementById('activeList');

let sites = [];          // staged domains for the new session
let durationMin = 0;     // chosen duration in minutes
let tickTimer = null;

// ---- staging the site list ----------------------------------------------
function renderChips() {
  chipsEl.innerHTML = '';
  sites.forEach((d, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = d;
    const x = document.createElement('button');
    x.textContent = '×';
    x.title = 'Remove';
    x.addEventListener('click', () => { sites.splice(i, 1); renderChips(); syncStart(); });
    chip.appendChild(x);
    chipsEl.appendChild(chip);
  });
}

function addSite() {
  const d = FL.normalizeDomain(siteInput.value);
  siteInput.value = '';
  if (d && !sites.includes(d)) { sites.push(d); renderChips(); syncStart(); }
}

siteInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSite(); }
});
siteInput.addEventListener('blur', addSite);

// ---- duration -----------------------------------------------------------
presetsEl.addEventListener('click', e => {
  const btn = e.target.closest('.chip-btn');
  if (!btn) return;
  customHours.value = '';
  durationMin = Number(btn.dataset.min);
  [...presetsEl.children].forEach(b => b.classList.toggle('sel', b === btn));
  syncStart();
});

customHours.addEventListener('input', () => {
  [...presetsEl.children].forEach(b => b.classList.remove('sel'));
  const h = parseFloat(customHours.value);
  durationMin = isFinite(h) && h > 0 ? Math.round(h * 60) : 0;
  syncStart();
});

function syncStart() {
  const ready = sites.length > 0 && durationMin > 0;
  startBtn.disabled = !ready;
  startBtn.textContent = durationMin > 0
    ? `Lock for ${FL.formatRemainingWords(durationMin * 60000)}`
    : 'Lock for —';
}

// ---- start a session ----------------------------------------------------
startBtn.addEventListener('click', async () => {
  if (startBtn.disabled) return;
  const now = Date.now();
  const endTime = now + durationMin * 60000;
  const state = await FL.getAll();
  for (const domain of sites) {
    state.blocks.push({
      id: FL.uid(),
      domain,
      label: domain,
      createdAt: now,
      endTime,
      unlockedUntil: 0
    });
  }
  await FL.set({ blocks: state.blocks });
  // reset staging
  sites = [];
  durationMin = 0;
  customHours.value = '';
  [...presetsEl.children].forEach(b => b.classList.remove('sel'));
  renderChips();
  syncStart();
  renderActive();
});

// ---- the "locked right now" list ----------------------------------------
async function renderActive() {
  const state = await FL.getAll();
  const now = Date.now();
  const items = [];

  for (const b of state.blocks) {
    if (b.endTime > now) {
      const unlocked = b.unlockedUntil && b.unlockedUntil > now;
      items.push({
        kind: 'session', id: b.id, domain: b.domain,
        endTime: b.endTime, unlocked
      });
    }
  }
  for (const s of state.schedules) {
    if (FL.scheduleActive(s, now)) {
      const u = state.scheduleUnlocks[s.id];
      items.push({
        kind: 'schedule', id: s.id, domain: s.domain,
        endTime: FL.scheduleWindowEnd(s, now), unlocked: !!(u && u > now)
      });
    }
  }

  if (!items.length) { activeCard.hidden = true; return; }
  activeCard.hidden = false;
  items.sort((a, b) => a.endTime - b.endTime);

  activeList.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'active-item';

    const meta = document.createElement('div');
    meta.className = 'active-meta';
    const dom = document.createElement('span');
    dom.className = 'active-domain';
    dom.textContent = it.domain;
    if (it.kind === 'schedule') {
      const tag = document.createElement('span');
      tag.className = 'sched-tag';
      tag.textContent = 'scheduled';
      dom.appendChild(tag);
    }
    const sub = document.createElement('span');
    sub.className = 'active-sub muted';
    sub.textContent = it.unlocked ? 'unlocked for this session' : 'locked';
    meta.append(dom, sub);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '10px';

    const time = document.createElement('span');
    time.className = 'active-time';
    time.dataset.end = String(it.endTime);
    time.textContent = FL.formatRemaining(it.endTime - now);
    right.appendChild(time);

    if (it.kind === 'session') {
      const end = document.createElement('button');
      end.className = 'btn-ghost end-btn';
      end.textContent = 'End';
      end.title = 'End this lock early';
      end.addEventListener('click', () => endSession(it.id));
      right.appendChild(end);
    }

    li.append(meta, right);
    activeList.appendChild(li);
  }
}

async function endSession(id) {
  const state = await FL.getAll();
  state.blocks = state.blocks.filter(b => b.id !== id);
  await FL.set({ blocks: state.blocks });
  renderActive();
}

// live countdown for the active list
function startTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    const now = Date.now();
    let stale = false;
    activeList.querySelectorAll('.active-time').forEach(el => {
      const end = Number(el.dataset.end);
      const left = end - now;
      if (left <= 0) stale = true;
      el.textContent = FL.formatRemaining(left);
    });
    if (stale) renderActive();
  }, 1000);
}

document.getElementById('openOptions').addEventListener('click', e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

renderChips();
syncStart();
renderActive();
startTick();
