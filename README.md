# Weight Tracker

A personal weight loss tracker with calorie calculator, milestone tracking, and progress chart. Runs entirely in the browser — no backend, no account needed.

## Features

- **Progress chart** — projection line vs actual weighed-in data, with milestone dots you can click to mark as reached
- **Milestone accordion** — collapsible list of every kg milestone between your start and goal, with projected dates
- **Calorie calculator** — enter your age, height, gender and activity level to get your BMR, TDEE, and daily calorie target to hit your goal by your deadline
- **Weight log** — log a weight entry for any date, view history, delete entries
- **Dark / light mode** — toggle with one click, preference saved
- **All data cached in localStorage** — nothing leaves your browser, persists across sessions

## File Structure

```
weight-tracker/
├── index.html       # Markup and app shell
├── css/
│   └── style.css    # All styles with CSS variables for theming
└── js/
    ├── data.js      # State, storage, date helpers, BMR/TDEE logic
    ├── chart.js     # Chart.js rendering
    └── ui.js        # DOM rendering, event handlers, tabs, modal
```

## Running Locally

Just open `index.html` in any browser. No build step, no dependencies to install.

```bash
# Or serve with a local server if you prefer:
npx serve .
# or
python3 -m http.server 8080
```

## Hosting on GitHub Pages

1. Push the folder to a GitHub repo
2. Go to **Settings → Pages**
3. Set source to `main` branch, `/ (root)`
4. Your tracker will be live at `https://yourusername.github.io/repo-name`

## Tech Stack

- Vanilla HTML / CSS / JS — no framework
- [Chart.js 4.4.1](https://www.chartjs.org/) via CDN
- [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) + [Syne](https://fonts.google.com/specimen/Syne) via Google Fonts
- `localStorage` for data persistence
