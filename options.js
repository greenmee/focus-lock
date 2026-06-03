'use strict';
const FL = self.FocusLock;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const scheduleList = document.getElementById('scheduleList');
const schedDomain = document.getElementById('schedDomain');
const daysEl = document.getElementById('days');
const schedStart = document.getElementById('schedStart');
const schedEnd = document.getElementById('schedEnd');
const addScheduleBtn = document.getElementById('addSchedule');
const challengeEnabled = document.getElementById('challengeEnabled');
const captchaRounds = document.getElementById('captchaRounds');
const savedNote = document.getElementById('savedNote');

let pickedDays = [1, 2, 3, 4, 5]; // default weekdays

// ---- day picker ----------------------------------------------------------
function renderDayPicker() {
  daysEl.innerHTML = '';
  DAY_LABELS.forEach((label, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'day-btn' + (pickedDays.includes(i) ? ' sel' : '');
    b.textContent = label;
    b.addEventListener('click', () => {
      if (pickedDays.includes(i)) pickedDays = pickedDays.filter(d => d !== i);
      else pickedDays.push(i);
      renderDayPicker();
    });
    daysEl.appendChild(b);
  });
}

function daysSummary(days) {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.join() === '1,2,3,4,5') return 'Weekdays';
  if (sorted.join() === '0,6') return 'Weekends';
  if (sorted.length === 7) return 'Every day';
  return sorted.map(d => DAY_LABELS[d]).join(', ');
}

// ---- schedule list --------------------------------------------------------
async function renderSchedules() {
  const { schedules } = await FL.getAll();
  scheduleList.innerHTML = '';
  for (const s of schedules) {
    const li = document.createElement('li');
    li.className = 'sched-item';

    const info = document.createElement('div');
    info.className = 'sched-info';
    const dom = document.createElement('span');
    dom.className = 'sched-domain';
    dom.textContent = s.domain;
    const when = document.createElement('span');
    when.className = 'sched-when';
    when.textContent = `${daysSummary(s.days)} · ${s.start}–${s.end}`;
    info.append(dom, when);

    const rm = document.createElement('button');
    rm.className = 'btn-ghost remove-btn';
    rm.textContent = 'Remove';
    rm.addEventListener('click', () => removeSchedule(s.id));

    li.append(info, rm);
    scheduleList.appendChild(li);
  }
}

addScheduleBtn.addEventListener('click', async () => {
  const domain = FL.normalizeDomain(schedDomain.value);
  if (!domain) { schedDomain.focus(); return; }
  if (!pickedDays.length) { return; }
  const { schedules } = await FL.getAll();
  schedules.push({
    id: FL.uid(),
    domain,
    label: domain,
    days: [...pickedDays].sort((a, b) => a - b),
    start: schedStart.value || '09:00',
    end: schedEnd.value || '17:00'
  });
  await FL.set({ schedules });
  schedDomain.value = '';
  renderSchedules();
  flashSaved();
});

async function removeSchedule(id) {
  const { schedules } = await FL.getAll();
  await FL.set({ schedules: schedules.filter(s => s.id !== id) });
  renderSchedules();
}

// ---- settings -------------------------------------------------------------
async function loadSettings() {
  const { settings } = await FL.getAll();
  challengeEnabled.checked = settings.challengeEnabled !== false;
  captchaRounds.value = settings.captchaRounds || 10;
}

async function saveSettings() {
  const rounds = Math.max(1, Math.min(50, parseInt(captchaRounds.value, 10) || 10));
  captchaRounds.value = rounds;
  await FL.set({
    settings: { challengeEnabled: challengeEnabled.checked, captchaRounds: rounds }
  });
  flashSaved();
}

challengeEnabled.addEventListener('change', saveSettings);
captchaRounds.addEventListener('change', saveSettings);

let savedTimer = null;
function flashSaved() {
  savedNote.hidden = false;
  savedNote.style.opacity = '1';
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { savedNote.style.opacity = '0'; }, 1500);
}

renderDayPicker();
renderSchedules();
loadSettings();
