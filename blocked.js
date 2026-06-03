'use strict';
const FL = self.FocusLock;

const params = new URLSearchParams(location.search);
const domain = params.get('d') || 'this site';
const key = params.get('key') || '';
let endTime = Number(params.get('until')) || 0;
const fromUrl = params.get('from') || ('https://' + domain);

// settings loaded asynchronously
let hardened = false;
let rounds = 5;
let challengeEnabled = true;

// views
const lockView = document.getElementById('lockView');
const challengeView = document.getElementById('challengeView');
const confirmView = document.getElementById('confirmView');

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

// Rotates after every solved round — the "is it worth it?" nudge you asked for.
const PRODUCTIVITY_MSGS = [
  "Are you sure it's worth it?",
  "The time you'd spend here, you could spend getting ahead.",
  "Every minute you resist is a minute invested in you.",
  "Think of what you could finish in the next hour instead.",
  "This will still be here later. Your momentum won't.",
  "You're stronger than the urge. Prove it once more.",
  "Future you is watching — make them proud.",
  "Not now means more later. Keep going.",
  "Each tap of focus compounds. Don't break the chain.",
  "Bored isn't a reason. Get back to the good stuff."
];

const SENTENCES = [
  "I am choosing my goals over this distraction",
  "Focus now means freedom later",
  "Small disciplined steps build big results",
  "I do not actually need this right now",
  "My attention is worth protecting",
  "The work I avoid is the work that matters"
];

// ---- load settings + per-domain message ---------------------------------
(async function init() {
  const { settings, domainMessages } = await FL.getAll();
  hardened = !!settings.hardened;
  rounds = settings.captchaRounds || 5;
  challengeEnabled = settings.challengeEnabled !== false;
  const custom = domainMessages && domainMessages[domain];
  encourageEl.textContent = custom || ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
})();

// ---- countdown ----------------------------------------------------------
function tick() {
  const left = endTime - Date.now();
  if (left <= 0) { countdownEl.textContent = '00:00'; location.replace(fromUrl); return; }
  countdownEl.textContent = FL.formatRemaining(left);
}
tick();
setInterval(tick, 1000);

// ---- challenge engine ---------------------------------------------------
const challengeEyebrow = document.getElementById('challengeEyebrow');
const challengeTitle = document.getElementById('challengeTitle');
const challengeBody = document.getElementById('challengeBody');
const challengeError = document.getElementById('challengeError');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

const TYPES = ['captcha', 'math', 'sentence', 'wait'];
let current = 0;
let currentType = null;
let waitTimer = null;

const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randCode(n) { let s = ''; for (let i = 0; i < n; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)]; return s; }
function pickType() { return TYPES[Math.floor(Math.random() * TYPES.length)]; }

function updateProgress() {
  progressBar.style.width = Math.round((current / rounds) * 100) + '%';
  progressText.textContent = `${current} of ${rounds} done`;
}

function startChallenge() {
  lockView.hidden = true; confirmView.hidden = true; challengeView.hidden = false;
  current = 0; updateProgress(); nextRound();
}

function nextRound() {
  if (current >= rounds) { showConfirm(); return; }
  challengeEyebrow.textContent = PRODUCTIVITY_MSGS[current % PRODUCTIVITY_MSGS.length];
  challengeError.hidden = true;
  currentType = pickType();
  renderRound(currentType);
}

function succeed() { current++; updateProgress(); nextRound(); }
function fail() { challengeError.hidden = false; renderRound(currentType); }

function addInput(placeholder, checkFn) {
  const inp = document.createElement('input');
  inp.type = 'text'; inp.autocomplete = 'off'; inp.spellcheck = false;
  inp.className = 'challenge-input'; inp.placeholder = placeholder;
  inp.addEventListener('input', () => { challengeError.hidden = true; });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); checkFn(inp.value); } });
  challengeBody.appendChild(inp);
  inp.focus();
}

function renderRound(type) {
  if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
  challengeBody.innerHTML = '';
  if (type === 'captcha') renderCaptcha();
  else if (type === 'math') renderMath();
  else if (type === 'sentence') renderSentence();
  else renderWait();
}

function renderCaptcha() {
  challengeTitle.textContent = 'Type the code exactly';
  const code = randCode(5);
  const box = document.createElement('div');
  box.className = 'captcha';
  [...code].forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.transform = `rotate(${((i * 37) % 13) - 6}deg) translateY(${((i * 53) % 9) - 4}px)`;
    box.appendChild(s);
  });
  challengeBody.appendChild(box);
  addInput('type the code above', v => { v.trim().toUpperCase() === code ? succeed() : fail(); });
}

function renderMath() {
  challengeTitle.textContent = 'Solve this';
  const ops = [['+', (a, b) => a + b], ['−', (a, b) => a - b], ['×', (a, b) => a * b]];
  const [sym, fn] = ops[Math.floor(Math.random() * ops.length)];
  let a, b;
  if (sym === '×') { a = 2 + Math.floor(Math.random() * 11); b = 2 + Math.floor(Math.random() * 11); }
  else {
    a = 10 + Math.floor(Math.random() * 89); b = 10 + Math.floor(Math.random() * 89);
    if (sym === '−' && b > a) { const t = a; a = b; b = t; }
  }
  const ans = fn(a, b);
  const q = document.createElement('div');
  q.className = 'math-q';
  q.textContent = `${a} ${sym} ${b} = ?`;
  challengeBody.appendChild(q);
  addInput('your answer', v => { Number(v.trim()) === ans ? succeed() : fail(); });
}

function normalizeSentence(s) {
  return String(s).toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim();
}
function renderSentence() {
  challengeTitle.textContent = 'Type this sentence';
  const sent = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
  const q = document.createElement('div');
  q.className = 'sentence-q';
  q.textContent = sent;
  challengeBody.appendChild(q);
  addInput('type it exactly', v => { normalizeSentence(v) === normalizeSentence(sent) ? succeed() : fail(); });
}

function renderWait() {
  challengeTitle.textContent = 'Sit with the urge';
  const secs = 8 + Math.floor(Math.random() * 8); // 8–15s
  const num = document.createElement('div');
  num.className = 'wait-num';
  num.textContent = String(secs);
  const btn = document.createElement('button');
  btn.className = 'btn-primary block wait-btn';
  btn.textContent = 'Continue';
  btn.disabled = true;
  challengeBody.append(num, btn);
  let left = secs;
  waitTimer = setInterval(() => {
    left--;
    num.textContent = left > 0 ? String(left) : '✓';
    if (left <= 0) { clearInterval(waitTimer); waitTimer = null; btn.disabled = false; }
  }, 1000);
  btn.addEventListener('click', () => { if (!btn.disabled) succeed(); });
}

// ---- confirm ------------------------------------------------------------
const confirmSoft = document.getElementById('confirmSoft');
const confirmHard = document.getElementById('confirmHard');
const confirmCommit = document.getElementById('confirmCommit');
const confirmYesHard = document.getElementById('confirmYesHard');

function showConfirm() {
  if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
  challengeView.hidden = true;
  confirmView.hidden = false;
  if (hardened) {
    confirmSoft.hidden = true;
    confirmHard.hidden = false;
    document.getElementById('confirmPhrase').textContent = FL.COMMITMENT_PHRASE;
    confirmCommit.value = '';
    confirmYesHard.disabled = true;
    confirmCommit.focus();
  } else {
    confirmSoft.hidden = false;
    confirmHard.hidden = true;
  }
}

function backToLock() {
  confirmView.hidden = true; challengeView.hidden = true; lockView.hidden = false;
}
async function stayFocused() {
  await FL.recordEvent({ resisted: 1, markFocusDay: true });
  backToLock();
}
async function breakThrough() {
  await FL.recordEvent({ brokeThrough: 1 });
  await FL.unlock(key);
  location.replace(fromUrl);
}

document.getElementById('giveUp').addEventListener('click', stayFocused);
document.getElementById('confirmNo').addEventListener('click', stayFocused);
document.getElementById('confirmNoHard').addEventListener('click', stayFocused);
document.getElementById('confirmYes').addEventListener('click', breakThrough);

confirmCommit.addEventListener('input', () => {
  confirmYesHard.disabled = confirmCommit.value.trim() !== FL.COMMITMENT_PHRASE;
});
confirmYesHard.addEventListener('click', () => {
  if (confirmCommit.value.trim() === FL.COMMITMENT_PHRASE) breakThrough();
});

// ---- wire up "I really need to visit" -----------------------------------
document.getElementById('needIn').addEventListener('click', () => {
  if (!challengeEnabled) { showConfirm(); return; } // challenge off → straight to confirm
  startChallenge();
});
