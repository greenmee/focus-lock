# 🔒 Focus Lock — Website Time Box

Put distracting websites in a **time box**. Like a phone-jail safe that locks your
phone away on a timer, Focus Lock locks sites like YouTube or Reddit out of Chrome
for as long as you decide — so the impulse to doom-scroll becomes expensive and the
productive choice wins by default.

> Built as a calm, minimal Manifest V3 Chrome extension. No build step, no tracking,
> nothing leaves your browser.

## How it works

1. **Lock some sites.** Open the toolbar popup, add the sites you want out of reach
   (e.g. `youtube.com`), and pick a duration — 30 min, a few hours, or a custom length.
2. **They get boxed up.** Try to visit a locked site and you'll hit a calm lock screen
   with a live countdown instead. Blocking is domain-wide: locking `youtube.com` also
   covers every channel, `m.youtube.com`, and `/watch` link.
3. **An escape, but a costly one.** If you *really* need in, you can — but only after
   solving a deliberately tedious captcha several times, then confirming "yes, I'm sure."
   Say no and you're back to your countdown. The friction is the feature.
4. **Recurring schedules.** On the settings page you can auto-lock a site on a routine,
   e.g. block Reddit every weekday from 9:00 to 17:00 — overnight windows included.

## Features

- **Two timer types** — quick one-off focus sessions and recurring schedules.
- **Varied challenges** — each escape round is a random captcha, math problem,
  type-this-sentence, or forced wait, so you can't autopilot through it. The
  "is it worth it?" message changes after every round you solve.
- **Hardened mode** (opt-in) — ending a lock or breaking through requires typing a
  commitment phrase first. Off by default; locks stay an honest speed bump.
- **Block-list groups** — save bundles like "Social" and lock the whole set in one tap,
  in a quick session or a recurring schedule.
- **Stats & streaks** — focus committed, blocks enforced, times you resisted, and a
  daily streak, on the settings page.
- **Dark mode** — auto (follows your system), or force light/dark.

## Install (load unpacked)

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.
4. Pin the **Focus Lock** icon and click it to start your first session.

After editing the code, click the **↻ reload** button on the extension card.

## Design notes

- **Honor-system by design.** Locks stay editable — this is a strong speed bump, not an
  unbreakable vault. The goal is to interrupt the impulse, not to fight you.
- **Calm & minimal.** Warm paper tones, sage-green accent, encouraging copy. Nothing
  shouts at you.
- Everything is stored locally in `chrome.storage.local`. No accounts, no network calls.

## Project layout

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, data model, and conventions.

| Area | Files |
|------|-------|
| Manifest | `manifest.json` |
| Shared core | `common.js`, `theme.css` |
| Background worker | `background.js` |
| Toolbar popup | `popup.{html,css,js}` |
| Lock screen | `blocked.{html,css,js}` |
| Settings & schedules | `options.{html,css,js}` |
| Icons | `icons/` |

## License

MIT — do what you like.
