# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

Chrome Extension (Manifest V3) that shows Chinese Super League (CSL/中超) football data in a browser popup. Vanilla JS, no build toolchain — files run directly in Chrome without bundling.

## Development Workflow

Load and test the extension via `chrome://extensions` → **Load unpacked**, pointing at the repo root. After editing any file, click the refresh icon on the extension card to reload it.

Generate icons (required after changing icon appearance):

```
node create_icons.js
```

No CI, no tests, no linter. Single developer, commits directly to `master`.

## Architecture

**Data source: ESPN public API only.** No authentication required.

- Schedule/results: `https://site.api.espn.com/apis/site/v2/sports/soccer/chn.1/scoreboard`
- Standings: `https://site.api.espn.com/apis/v2/sports/soccer/chn.1/standings`
- Results are cached 10 minutes via `chrome.storage.local`.

**Dead code:** `settings.html` / `settings.js` reference football-data.org and prompt for an API key, but `popup.js` ignores the saved key entirely. The settings page is not used. Do not wire it up unless explicitly asked.

## Key Details

- Popup width is fixed at 380px; keep UI changes within that constraint.
- `TEAM_CN` in `popup.js` maps ESPN team abbreviations to Chinese display names for all 16 CSL teams. Update this dict when team roster changes.
- `formatBeijingTime()` manually converts UTC → Beijing time (+8h); no timezone library is used.
- `create_icons.js` implements full PNG encoding (IHDR/IDAT/IEND + CRC32) using only Node.js stdlib — no image libraries.
- Brand red: `#D71A1E`.
