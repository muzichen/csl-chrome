# 中超赛程 — CSL Chrome Extension

A Chrome extension for following the Chinese Super League (中超联赛). View the full season schedule, recent results, and the current standings table directly from your browser toolbar.

## Features

- **赛程 (Schedule)** — Full season fixture list, auto-scrolled to the next upcoming match
- **战绩 (Results)** — Completed matches sorted by most recent
- **积分榜 (Standings)** — League table with played, win-draw-loss record, goal difference, points, and recent form
- **我的球队 (My Team)** — Favorite-team summary with next match, latest result, rank, points, and form
- Manual refresh with visible cache/update timestamp
- Team names displayed in Chinese (e.g. 上海申花, 山东泰山)
- Results cached for 10 minutes to avoid repeated API calls

Data is sourced from the ESPN public API — no account or API key required.

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the repo root folder.
5. The 中超赛程 icon will appear in your toolbar.

## Development

The extension is plain HTML/CSS/JS with no build step. After editing any file, click the refresh icon on the extension card at `chrome://extensions` to reload it.

To regenerate the extension icons:

```bash
node create_icons.js
```

This produces `icons/icon16.png`, `icons/icon48.png`, and `icons/icon128.png` using only Node.js stdlib.

## Project Structure

```
csl-chrome/
├── manifest.json       # Chrome Extension Manifest V3
├── popup.html          # Toolbar popup UI
├── popup.js            # Data fetching, caching, rendering
├── popup.css           # Popup styles
├── create_icons.js     # Icon generation script
└── icons/              # Generated PNG icons (16, 48, 128px)
```

## Data Source

Both endpoints are public and require no authentication:

| Data | Endpoint |
|------|----------|
| Schedule / Results | `https://site.api.espn.com/apis/site/v2/sports/soccer/chn.1/scoreboard` |
| Standings | `https://site.api.espn.com/apis/v2/sports/soccer/chn.1/standings` |

Times are displayed in Beijing time (UTC+8).
