# Pomodoro Timer

A calm, responsive Pomodoro timer for focused work. It runs in the browser with no build step or third-party JavaScript packages.

## Features

- Focus, short break, and long break sessions
- Configurable session lengths and long-break interval
- Start, pause, reset, skip, and Space-key timer controls
- Task list with a selected focus task, completion, and removal
- Daily focus minutes and session progress
- Optional completion chime
- Timer and tasks saved in browser local storage
- Responsive layout for desktop and mobile screens

## Run it

Open `index.html` in a modern browser. The app uses plain HTML, CSS, and JavaScript, so there is nothing to install or build.

The Google Fonts used for the interface load when an internet connection is available; system fonts are used as a fallback. Timer data is stored in the browser on the device where you use it.

## Put it on GitHub

1. Create a new empty repository on GitHub, for example `pomodoro-timer`.
2. In a terminal, open this project folder and run:

   ```bash
   git init
   git add .
   git commit -m "Add Pomodoro timer project"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/pomodoro-timer.git
   git push -u origin main
   ```

   Replace `YOUR-USERNAME` with your GitHub username.
3. To publish it as a website, open the repository's **Settings → Pages** and choose **Deploy from a branch**, then select `main` and `/ (root)`.

## Customize

Use the gear button in the app to change focus and break lengths. To change the default values for new visitors, edit the `DEFAULTS` object near the top of `app.js`.

## Project files

- `index.html` — page structure and accessible controls
- `styles.css` — responsive visual design
- `app.js` — timer, tasks, settings, sound, and local persistence
- `favicon.svg` — project icon

