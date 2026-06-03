'use strict';
const FL = self.FocusLock;

const siteInput = document.getElementById('siteInput');
const chipsEl = document.getElementById('chips');
const presetRow = document.getElementById('presetRow');
const presetsEl = document.getElementById('presets');
const customHours = document.getElementById('customHours');
const startBtn = document.getElementById('startBtn');
const activeCard = document.getElementById('activeCard');
const activeList = document.getElementById('activeList');

let sites = [];
let durationMin = 0;

// ---------------------------------------------------------------- commitment
const commitModal = document.getElementById('commitModal');
const commitWhy = document.getElementById('commitWhy');
const commitPhrase = document.getElementById('commitPhrase');
const commitInput = document.getElementById('commitInput');
const commitOk = document.getElementById('commitOk');
const commitCancel = document.getElementById('commitCancel');

function requireCommitment(why) {
  return new Promise(resolve => {
    commitWhy.textContent = why;
    commitPhrase.textContent = FL.COMMITMENT_PHRASE;
    commitInput.value = '';
    commitOk.disabled = true;
    commitModal.hidden = false;
    commitInput.focus();

    const onInput = () => { commitOk.disabled = commitInput.value.trim() !== FL.COMMITMENT_PHRASE; };
    const cleanup = () => {
      commitModal.hidden = true;
      commitInput.removeEventListener('input', onInput);
      commitOk.onclick = null;
      commitCancel.onclick = null;
    };
    commitInput.addEventListener('input', onInput);
    commitOk.onclick = () => { if (commitInput.value.trim() === FL.COMMITMENT_PHRASE) { cleanup(); resolve(true); } };
    commitCancel.onclick = () => { cleanup(); resolve(false); };
  });
}

// ---------------------------------------------------------------- presets
async function renderPresets() {
  const { presets } = await FL.getAll();
  presetRow.innerHTML = '';
  for (const p of presets) {
    if (!p.domains || !p.domains.length) continue;
    const b = document.createElement('button');
    b.className = 'preset-btn';
    b.textContent = p.name;
    b.title = p.domains.join(', ');
    b.addEventListener('click', () => {
      for (const d of p.domains) if (!sites.includes(d)) sites.push(d);
      renderChips(); syncStart();
    });
    presetRow.appendChild(b);
  }
}

// ---------------------------------------------------------------- staging
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

// ---------------------------------------------------------------- duration
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

// ---------------------------------------------------------------- start
startBtn.addEventListener('click', async () => {
  if (startBtn.disabled) return;
  const now = Date.now();
  const endTime = now + durationMin * 60000;
  const state = await FL.getAll();
  for (const domain of sites) {
    state.blocks.push({ id: FL.uid(), domain, label: domain, createdAt: now, endTime, unlockedUntil: 0 });
  }
  await FL.set({ blocks: state.blocks });
  await FL.recordEvent({ sessions: 1, focusMin: durationMin, markFocusDay: true });

  sites = []; durationMin = 0; customHours.value = '';
  [...presetsEl.children].forEach(b => b.classList.remove('sel'));
  renderChips(); syncStart(); renderActive();
});

// ---------------------------------------------------------------- active list
async function renderActive() {
  const state = await FL.getAll();
  const now = Date.now();
  const items = [];

  // Sessions — skip any that have been unlocked.
  for (const b of state.blocks) {
    if (b.endTime > now && !(b.unlockedUntil && b.unlockedUntil > now)) {
      items.push({ kind: 'session', id: b.id, domain: b.domain, endTime: b.endTime });
    }
  }
  // Schedules — one row per still-locked domain; skip unlocked schedules.
  for (const s of state.schedules) {
    if (!FL.scheduleActive(s, now)) continue;
    const u = state.scheduleUnlocks[s.id];
    if (u && u > now) continue; // unlocked → drop
    for (const d of (s.domains || [])) {
      items.push({ kind: 'schedule', id: s.id, domain: d, endTime: FL.scheduleWindowEnd(s, now) });
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
    meta.appendChild(dom);

    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:10px';

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
  if (state.settings.hardened) {
    const ok = await requireCommitment('Hardened mode is on. To end this lock early, type the phrase below.');
    if (!ok) return;
  }
  state.blocks = state.blocks.filter(b => b.id !== id);
  await FL.set({ blocks: state.blocks });
  renderActive();
}

// ---------------------------------------------------------------- ticking
setInterval(() => {
  const now = Date.now();
  let stale = false;
  activeList.querySelectorAll('.active-time').forEach(el => {
    const left = Number(el.dataset.end) - now;
    if (left <= 0) stale = true;
    el.textContent = FL.formatRemaining(left);
  });
  if (stale) renderActive();
}, 1000);

document.getElementById('openOptions').addEventListener('click', e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

renderPresets();
renderChips();
syncStart();
renderActive();
