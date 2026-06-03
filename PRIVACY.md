# Privacy Policy — Focus Lock

**Last updated: June 3, 2026**

Focus Lock is built to be private by design. The short version: **it collects
nothing, sends nothing, and stores everything locally in your own browser.**

## What data we collect

**None.** Focus Lock has no account system, no analytics, no tracking, no
telemetry, and no remote server. We never see your browsing, your block lists,
or any usage.

## What is stored, and where

Everything you create in the extension is stored **locally on your device**
using Chrome's `storage.local` API and never leaves your browser:

- The sites/groups you choose to lock and their timers.
- Your recurring schedules.
- Your settings (theme, hardened mode, challenge rounds).
- Local focus statistics (streaks, counts, a 7‑day history) used only to draw
  the charts on the settings page.

You can erase all of it at any time by removing the extension, or via your
browser's "clear data" controls.

## Permissions, and why they are needed

- **storage** — to save your locks, schedules, and settings on your device.
- **tabs** / **webNavigation** / host access (`<all_urls>`) — to detect when you
  navigate to a site you have chosen to lock and redirect that tab to the local
  block screen. The extension inspects URLs **only** to compare them against
  *your own* block list, locally. It does not read page contents, and no URL or
  browsing data is ever transmitted or logged.
- **alarms** — to periodically clear expired locks and update the toolbar badge.

## Network activity

Focus Lock makes **no network requests**. The only time your browser contacts an
outside server is if **you** click the optional "Support Focus Lock" link, which
opens our Ko‑fi page in a new tab — and that is governed by Ko‑fi's own privacy
policy, not ours.

## Third parties

We do not share, sell, or transmit data to anyone, because we never collect any.

## Changes

If this policy ever changes, the updated version will be posted here with a new
"Last updated" date.

## Contact

Questions or feedback? Email **toscamee@gmail.com** or open an issue on the
project's GitHub repository.
