'use strict';
const FL = self.FocusLock;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------- saved toast ----------
const savedNote = document.getElementById('savedNote');
let savedTimer = null;
function flashSaved() {
  savedNote.hidden = false;
  savedNote.style.opacity = '1';
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { savedNote.style.opacity = '0'; }, 1500);
}

// ====================================================================== STATS
async function renderStats() {
  const { stats } = await FL.getAll();
  document.getElementById('statStreak').textContent = stats.streak || 0;
  document.getElementById('statResisted').textContent = stats.resisted || 0;
  document.getElementById('statBlocked').textContent = stats.blockedHits || 0;
  const hrs = (stats.focusMin || 0) / 60;
  document.getElementById('statFocus').textContent =
    hrs >= 1 ? `${Math.round(hrs)}h` : `${stats.focusMin || 0}m`;

  // last 7 days chart of committed focus minutes
  const chart = document.getElementById('chart');
  chart.innerHTML = '';
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const keyStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const rec = (stats.history && stats.history[keyStr]) || {};
    days.push({ label: DAY_LABELS[d.getDay()][0], min: rec.focusMin || 0 });
  }
  const max = Math.max(60, ...days.map(d => d.min));
  for (const d of days) {
    const wrap = document.createElement('div');
    wrap.className = 'bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'bar' + (d.min === 0 ? ' empty' : '');
    bar.style.height = Math.max(3, Math.round((d.min / max) * 100)) + '%';
    bar.title = `${d.min} min`;
    const lbl = document.createElement('span');
    lbl.className = 'bar-label';
    lbl.textContent = d.label;
    wrap.append(bar, lbl);
    chart.appendChild(wrap);
  }

  document.getElementById('statExtra').textContent =
    `Best streak: ${stats.bestStreak || 0} days · ${stats.sessionsStarted || 0} sessions started · broke through ${stats.brokeThrough || 0} times`;
}

// ================================================================== SCHEDULES
const scheduleList = document.getElementById('scheduleList');
const schedDomain = document.getElementById('schedDomain');
const daysEl = document.getElementById('days');
const schedStart = document.getElementById('schedStart');
const schedEnd = document.getElementById('schedEnd');
let pickedDays = [1, 2, 3, 4, 5];

function renderDayPicker() {
  daysEl.innerHTML = '';
  DAY_LABELS.forEach((label, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'day-btn' + (pickedDays.includes(i) ? ' sel' : '');
    b.textContent = label;
    b.addEventListener('click', () => {
      pickedDays = pickedDays.includes(i) ? pickedDays.filter(d => d !== i) : [...pickedDays, i];
      renderDayPicker();
    });
    daysEl.appendChild(b);
  });
}

function daysSummary(days) {
  const s = [...days].sort((a, b) => a - b).join();
  if (s === '1,2,3,4,5') return 'Weekdays';
  if (s === '0,6') return 'Weekends';
  if (days.length === 7) return 'Every day';
  return [...days].sort((a, b) => a - b).map(d => DAY_LABELS[d]).join(', ');
}

async function renderSchedules() {
  const { schedules } = await FL.getAll();
  scheduleList.innerHTML = '';
  for (const s of schedules) {
    scheduleList.appendChild(listItem(s.domain, `${daysSummary(s.days)} · ${s.start}–${s.end}`,
      () => removeSchedule(s.id)));
  }
}

document.getElementById('addSchedule').addEventListener('click', async () => {
  const domain = FL.normalizeDomain(schedDomain.value);
  if (!domain || !pickedDays.length) { schedDomain.focus(); return; }
  const { schedules } = await FL.getAll();
  schedules.push({
    id: FL.uid(), domain, label: domain,
    days: [...pickedDays].sort((a, b) => a - b),
    start: schedStart.value || '09:00', end: schedEnd.value || '17:00'
  });
  await FL.set({ schedules });
  schedDomain.value = '';
  renderSchedules(); flashSaved();
});

async function removeSchedule(id) {
  const { schedules } = await FL.getAll();
  await FL.set({ schedules: schedules.filter(s => s.id !== id) });
  renderSchedules();
}

// ==================================================================== PRESETS
const presetList = document.getElementById('presetList');
const presetName = document.getElementById('presetName');
const presetDomains = document.getElementById('presetDomains');

async function renderPresets() {
  const { presets } = await FL.getAll();
  presetList.innerHTML = '';
  for (const p of presets) {
    presetList.appendChild(listItem(p.name, p.domains.join(', '), () => removePreset(p.id)));
  }
}

document.getElementById('addPreset').addEventListener('click', async () => {
  const name = presetName.value.trim();
  const domains = presetDomains.value.split(/[,\s]+/).map(FL.normalizeDomain).filter(Boolean);
  if (!name || !domains.length) { presetName.focus(); return; }
  const { presets } = await FL.getAll();
  presets.push({ id: FL.uid(), name, domains: [...new Set(domains)] });
  await FL.set({ presets });
  presetName.value = ''; presetDomains.value = '';
  renderPresets(); flashSaved();
});

async function removePreset(id) {
  const { presets } = await FL.getAll();
  await FL.set({ presets: presets.filter(p => p.id !== id) });
  renderPresets();
}

// =========================================================== CUSTOM MESSAGES
const messageList = document.getElementById('messageList');
const msgDomain = document.getElementById('msgDomain');
const msgText = document.getElementById('msgText');

async function renderMessages() {
  const { domainMessages } = await FL.getAll();
  messageList.innerHTML = '';
  for (const [domain, text] of Object.entries(domainMessages)) {
    messageList.appendChild(listItem(domain, text, () => removeMessage(domain)));
  }
}

document.getElementById('addMessage').addEventListener('click', async () => {
  const domain = FL.normalizeDomain(msgDomain.value);
  const text = msgText.value.trim();
  if (!domain || !text) { msgDomain.focus(); return; }
  const { domainMessages } = await FL.getAll();
  domainMessages[domain] = text;
  await FL.set({ domainMessages });
  msgDomain.value = ''; msgText.value = '';
  renderMessages(); flashSaved();
});

async function removeMessage(domain) {
  const { domainMessages } = await FL.getAll();
  delete domainMessages[domain];
  await FL.set({ domainMessages });
  renderMessages();
}

// ================================================================ APPEARANCE
const themeSeg = document.getElementById('themeSeg');
themeSeg.addEventListener('click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const { settings } = await FL.getAll();
  settings.theme = btn.dataset.theme;
  await FL.set({ settings });
  markThemeSeg(settings.theme);
  flashSaved();
});
function markThemeSeg(theme) {
  [...themeSeg.children].forEach(b => b.classList.toggle('sel', b.dataset.theme === theme));
}

// =============================================================== FOCUS RULES
const hardened = document.getElementById('hardened');
const challengeEnabled = document.getElementById('challengeEnabled');
const captchaRounds = document.getElementById('captchaRounds');
const phraseNote = document.getElementById('phraseNote');

document.getElementById('phraseText').textContent = FL.COMMITMENT_PHRASE;

async function loadSettings() {
  const { settings } = await FL.getAll();
  hardened.checked = !!settings.hardened;
  challengeEnabled.checked = settings.challengeEnabled !== false;
  captchaRounds.value = settings.captchaRounds || 5;
  phraseNote.hidden = !hardened.checked;
  markThemeSeg(settings.theme || 'auto');
}

async function saveSettings() {
  const rounds = Math.max(1, Math.min(50, parseInt(captchaRounds.value, 10) || 5));
  captchaRounds.value = rounds;
  const { settings } = await FL.getAll();
  settings.hardened = hardened.checked;
  settings.challengeEnabled = challengeEnabled.checked;
  settings.captchaRounds = rounds;
  await FL.set({ settings });
  phraseNote.hidden = !hardened.checked;
  flashSaved();
}
hardened.addEventListener('change', saveSettings);
challengeEnabled.addEventListener('change', saveSettings);
captchaRounds.addEventListener('change', saveSettings);

// ==================================================================== shared
function listItem(title, sub, onRemove) {
  const li = document.createElement('li');
  li.className = 'list-item';
  const info = document.createElement('div');
  info.className = 'item-info';
  const t = document.createElement('span');
  t.className = 'item-title';
  t.textContent = title;
  const s = document.createElement('span');
  s.className = 'item-sub';
  s.textContent = sub;
  info.append(t, s);
  const rm = document.createElement('button');
  rm.className = 'btn-ghost remove-btn';
  rm.textContent = 'Remove';
  rm.addEventListener('click', onRemove);
  li.append(info, rm);
  return li;
}

// ==================================================================== init
renderStats();
renderDayPicker();
renderSchedules();
renderPresets();
renderMessages();
loadSettings();
