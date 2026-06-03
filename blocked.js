'use strict';
const FL = self.FocusLock;

const params = new URLSearchParams(location.search);
const domain = params.get('d') || 'this site';
const key = params.get('key') || '';
let endTime = Number(params.get('until')) || 0;
const fromUrl = params.get('from') || ('https://' + domain);

// views
const lockView = document.getElementById('lockView');
const challengeView = document.getElementById('challengeView');
const confirmView = document.getElementById('confirmView');

// lock view els
const countdownEl = document.getElementById('countdown');
const encourageEl = document.getElementById('encourage');

document.getElementById('domainName').textContent = domain;
document.getElementById('confirmDomain').textContent = domain;

const ENCOURAGEMENTS = [
  "Whatever you were about to do — your focus is the better choice.",
  "The urge passes. Give it a minute and get back to what matters.",
  "You boxed this up on purpose. Future you says thanks.",
  "Nothing here can’t wait. Your work can’t.",
  "Small win: you chose to stay on track."
];
encourageEl.textContent = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];

// ---- countdown ----------------------------------------------------------
function tick() {
  const left = endTime - Date.now();
  if (left <= 0) {
    countdownEl.textContent = '00:00';
    location.replace(fromUrl); // timer is up — let them through
    return;
  }
  countdownEl.textContent = FL.formatRemaining(left);
}
tick();
setInterval(tick, 1000);

// ---- challenge ----------------------------------------------------------
let rounds = 10;            // overridden by settings
let current = 0;
const captchaBox = document.getElementById('captchaBox');
const captchaInput = document.getElementById('captchaInput');
const captchaError = document.getElementById('captchaError');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
let answer = '';

// Unambiguous character set — no 0/O, 1/I/L.
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

function renderCaptcha() {
  answer = makeCode();
  captchaBox.innerHTML = '';
  // wrap each char so we can jitter it a little — mildly annoying, on purpose
  [...answer].forEach((ch, i) => {
    const span = document.createElement('span');
    span.textContent = ch;
    const rot = ((i * 37) % 13) - 6;          // deterministic-ish tilt
    const dy = ((i * 53) % 9) - 4;
    span.style.transform = `rotate(${rot}deg) translateY(${dy}px)`;
    captchaBox.appendChild(span);
  });
  captchaInput.value = '';
  captchaInput.focus();
}

function updateProgress() {
  const pct = Math.round((current / rounds) * 100);
  progressBar.style.width = pct + '%';
  progressText.textContent = `${current} of ${rounds} solved`;
}

function startChallenge() {
  lockView.hidden = true;
  confirmView.hidden = true;
  challengeView.hidden = false;
  current = 0;
  updateProgress();
  renderCaptcha();
}

captchaInput.addEventListener('input', () => { captchaError.hidden = true; });
captchaInput.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const val = captchaInput.value.trim().toUpperCase();
  if (val === answer) {
    current++;
    updateProgress();
    if (current >= rounds) {
      showConfirm();
    } else {
      renderCaptcha();
    }
  } else {
    captchaError.hidden = false;
    renderCaptcha(); // wrong answer → fresh code, no progress
  }
});

// ---- confirm ------------------------------------------------------------
function showConfirm() {
  challengeView.hidden = true;
  confirmView.hidden = false;
}

document.getElementById('confirmNo').addEventListener('click', backToLock);
document.getElementById('giveUp').addEventListener('click', backToLock);

function backToLock() {
  confirmView.hidden = true;
  challengeView.hidden = true;
  lockView.hidden = false;
}

document.getElementById('confirmYes').addEventListener('click', async () => {
  await FL.unlock(key);       // unlock for the rest of the timer
  location.replace(fromUrl);  // and go where they were headed
});

// ---- wire up "I really need to visit" -----------------------------------
document.getElementById('needIn').addEventListener('click', async () => {
  const { settings } = await FL.getAll();
  if (settings && settings.challengeEnabled === false) {
    // challenge turned off → the "are you sure?" is the only gate
    showConfirm();
    return;
  }
  rounds = (settings && settings.captchaRounds) || 10;
  startChallenge();
});
