(() => {
  "use strict";

  const STORAGE_KEY = "pomodoro-focus-space-v1";
  const DEFAULTS = { focus: 25, short: 5, long: 15, interval: 4 };
  const MODE_LABELS = {
    focus: { label: "FOCUS SESSION", overline: "TIME TO FOCUS", hint: "One thing at a time. You’ve got this.", button: "Start focus" },
    short: { label: "SHORT BREAK", overline: "TAKE A BREATHER", hint: "Step away for a little while.", button: "Start break" },
    long: { label: "LONG BREAK", overline: "YOU EARNED THIS", hint: "Rest, recharge, and come back fresh.", button: "Start break" },
  };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  function freshState() {
    return {
      settings: { ...DEFAULTS }, mode: "focus", remaining: DEFAULTS.focus * 60,
      running: false, endsAt: null, completedToday: 0, focusedMinutesToday: 0,
      day: new Date().toLocaleDateString("en-CA"), tasks: [], activeTaskId: null,
      muted: false,
    };
  }

  function loadState() {
    const initial = freshState();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== "object") return initial;
      const merged = { ...initial, ...saved, settings: { ...DEFAULTS, ...saved.settings } };
      if (merged.day !== initial.day) {
        merged.day = initial.day;
        merged.completedToday = 0;
        merged.focusedMinutesToday = 0;
      }
      if (!MODE_LABELS[merged.mode]) merged.mode = "focus";
      if (!Array.isArray(merged.tasks)) merged.tasks = [];
      if (merged.running && Number.isFinite(merged.endsAt)) {
        merged.remaining = Math.max(0, Math.ceil((merged.endsAt - Date.now()) / 1000));
        if (merged.remaining === 0) {
          merged.running = false;
          merged.endsAt = null;
        }
      }
      if (!Number.isFinite(merged.remaining) || merged.remaining < 0) merged.remaining = merged.settings[merged.mode] * 60;
      return merged;
    } catch {
      return initial;
    }
  }

  let state = loadState();
  let ticker = null;
  let toastTimer = null;
  let audioContext = null;
  const circumference = 2 * Math.PI * 128;

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Timer still works when storage is unavailable. */ }
  }

  function duration(mode = state.mode) { return state.settings[mode] * 60; }

  function renderTimer() {
    const info = MODE_LABELS[state.mode];
    const minutes = Math.floor(state.remaining / 60).toString().padStart(2, "0");
    const seconds = (state.remaining % 60).toString().padStart(2, "0");
    $("#timer-time").textContent = `${minutes}:${seconds}`;
    $("#timer-time").dateTime = `PT${minutes}M${seconds}S`;
    $("#session-label").textContent = info.label;
    $("#timer-overline").textContent = state.running ? (state.mode === "focus" ? "YOU'RE IN THE FLOW" : "ENJOY YOUR BREAK") : info.overline;
    $("#timer-hint").textContent = state.running ? "Stay present. This time is yours." : (state.remaining === duration() ? info.hint : "Paused — pick up when you're ready.");
    $("#start-button span").textContent = state.running ? "Pause timer" : info.button;
    $("#start-button").classList.toggle("is-running", state.running);
    $(".timer-card").dataset.mode = state.mode;
    $$(".mode-button").forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const fraction = duration() ? state.remaining / duration() : 0;
    $("#ring-progress").style.strokeDasharray = String(circumference);
    $("#ring-progress").style.strokeDashoffset = String(circumference * (1 - fraction));
    document.title = `${minutes}:${seconds} — Pomodoro`;
  }

  function renderStats() {
    $("#cycle-count").textContent = state.completedToday;
    $("#progress-sessions").textContent = Math.min(state.completedToday, state.settings.interval);
    $("#focus-minutes").textContent = state.focusedMinutesToday;
    const dots = $("#session-dots");
    if (dots.childElementCount !== state.settings.interval) {
      dots.replaceChildren(...Array.from({ length: state.settings.interval }, () => document.createElement("span")));
    }
    $$("#session-dots span").forEach((dot, index) => dot.classList.toggle("is-done", index < Math.min(state.completedToday, state.settings.interval)));
    const remaining = Math.max(0, state.settings.interval - state.completedToday);
    $("#progress-note").textContent = state.completedToday >= state.settings.interval
      ? "Beautiful work. Make space for a longer rest."
      : state.completedToday === 0
        ? "Your first focused session is waiting."
        : `${remaining} more ${remaining === 1 ? "session" : "sessions"} until your long break.`;
    $("#today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date());
    dots.setAttribute("aria-label", `${state.completedToday} of ${state.settings.interval} sessions completed today`);
  }

  function renderTasks() {
    const list = $("#task-list");
    list.replaceChildren();
    const openTasks = state.tasks.filter((task) => !task.done);
    $("#task-total").textContent = openTasks.length;
    $("#task-empty").hidden = state.tasks.length > 0;
    for (const task of state.tasks) {
      const item = document.createElement("li");
      item.className = `task-item${task.id === state.activeTaskId ? " is-selected" : ""}${task.done ? " is-done" : ""}`;
      const check = document.createElement("button");
      check.type = "button";
      check.className = "task-check";
      check.setAttribute("aria-label", task.done ? `Reopen ${task.text}` : `Complete ${task.text}`);
      check.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 6 2.5 2.5L10 3"/></svg>';
      check.addEventListener("click", () => toggleTask(task.id));
      const text = document.createElement("span");
      text.className = "task-text";
      text.textContent = task.text;
      text.title = task.text;
      text.addEventListener("click", () => selectTask(task.id));
      text.setAttribute("role", "button");
      text.setAttribute("tabindex", "0");
      text.setAttribute("aria-label", `Focus on ${task.text}`);
      text.addEventListener("keydown", (event) => { if (event.key === "Enter") selectTask(task.id); });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "task-delete";
      remove.setAttribute("aria-label", `Delete ${task.text}`);
      remove.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M6 4V2.5h4V4m2 0-.6 9H4.6L4 4m2.2 2v4.5m3.6-4.5v4.5"/></svg>';
      remove.addEventListener("click", () => deleteTask(task.id));
      item.append(check, text, remove);
      list.append(item);
    }
    const active = state.tasks.find((task) => task.id === state.activeTaskId && !task.done);
    $("#active-task-label").textContent = active ? active.text : "No task selected";
    $(".focus-indicator").classList.toggle("is-active", Boolean(active));
  }

  function renderSound() {
    $("#sound-toggle").classList.toggle("is-muted", state.muted);
    $("#sound-toggle").setAttribute("aria-label", state.muted ? "Turn timer sounds on" : "Mute timer sounds");
    $("#sound-toggle").title = state.muted ? "Sound off" : "Sound on";
  }

  function render() {
    renderTimer();
    renderStats();
    renderTasks();
    renderSound();
  }

  function announce(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function playChime() {
    if (state.muted) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume();
      [660, 880, 990].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = audioContext.currentTime + index * .16;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.12, start + .025);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .35);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + .37);
      });
    } catch { /* Audio is an enhancement; completion remains visible on screen. */ }
  }

  function stopTicker() {
    if (ticker) clearInterval(ticker);
    ticker = null;
  }

  function setMode(mode, { announceChange = false } = {}) {
    if (!MODE_LABELS[mode]) return;
    stopTicker();
    state.mode = mode;
    state.remaining = duration(mode);
    state.running = false;
    state.endsAt = null;
    saveState();
    render();
    if (announceChange) announce(`${MODE_LABELS[mode].label.toLowerCase()} ready.`);
  }

  function completeTimer() {
    stopTicker();
    state.running = false;
    state.endsAt = null;
    state.remaining = 0;
    playChime();
    if (state.mode === "focus") {
      state.completedToday += 1;
      state.focusedMinutesToday += state.settings.focus;
      const nextMode = state.completedToday % state.settings.interval === 0 ? "long" : "short";
      saveState();
      setMode(nextMode);
      announce(nextMode === "long" ? "Focus session complete. Time for a long break." : "Focus session complete. Time for a short break.");
    } else {
      const wasLong = state.mode === "long";
      saveState();
      setMode("focus");
      announce(wasLong ? "Long break complete. Ready for another focus session?" : "Break complete. Ready when you are.");
    }
  }

  function tick() {
    const next = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
    if (next !== state.remaining) {
      state.remaining = next;
      renderTimer();
      saveState();
    }
    if (next <= 0) completeTimer();
  }

  function toggleTimer() {
    if (state.running) {
      state.remaining = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
      state.running = false;
      state.endsAt = null;
      stopTicker();
      saveState();
      renderTimer();
      return;
    }
    if (state.remaining <= 0) state.remaining = duration();
    state.running = true;
    state.endsAt = Date.now() + state.remaining * 1000;
    saveState();
    renderTimer();
    ticker = setInterval(tick, 250);
  }

  function resetTimer() {
    stopTicker();
    state.running = false;
    state.endsAt = null;
    state.remaining = duration();
    saveState();
    renderTimer();
    announce("Timer reset.");
  }

  function addTask(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const task = { id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), text: trimmed, done: false };
    state.tasks.push(task);
    if (!state.activeTaskId) state.activeTaskId = task.id;
    saveState();
    renderTasks();
    announce("Added to your focus list.");
  }

  function selectTask(id) {
    const task = state.tasks.find((item) => item.id === id && !item.done);
    if (!task) return;
    state.activeTaskId = id;
    saveState();
    renderTasks();
    announce("Focus task updated.");
  }

  function toggleTask(id) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    task.done = !task.done;
    if (task.done && state.activeTaskId === id) state.activeTaskId = state.tasks.find((item) => !item.done)?.id ?? null;
    if (!task.done && !state.activeTaskId) state.activeTaskId = id;
    saveState();
    renderTasks();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter((task) => task.id !== id);
    if (state.activeTaskId === id) state.activeTaskId = state.tasks.find((task) => !task.done)?.id ?? null;
    saveState();
    renderTasks();
  }

  function openSettings() {
    const form = $("#settings-form");
    for (const key of Object.keys(DEFAULTS)) form.elements[key].value = state.settings[key];
    $("#settings-dialog").showModal();
  }

  function applySettings(nextSettings) {
    state.settings = nextSettings;
    state.running = false;
    state.endsAt = null;
    stopTicker();
    state.remaining = duration();
    saveState();
    render();
  }

  $$(".mode-button").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $("#start-button").addEventListener("click", toggleTimer);
  $("#reset-button").addEventListener("click", resetTimer);
  $("#skip-button").addEventListener("click", () => {
    const next = state.mode === "focus" ? (state.completedToday > 0 && state.completedToday % state.settings.interval === 0 ? "long" : "short") : "focus";
    setMode(next);
    announce(`Switched to ${MODE_LABELS[next].label.toLowerCase()}.`);
  });
  $("#sound-toggle").addEventListener("click", () => { state.muted = !state.muted; saveState(); renderSound(); });
  $("#task-form").addEventListener("submit", (event) => {
    event.preventDefault();
    addTask($("#task-input").value);
    $("#task-input").value = "";
    $("#task-input").focus();
  });
  $("#open-settings").addEventListener("click", openSettings);
  $("#close-settings").addEventListener("click", () => $("#settings-dialog").close());
  $("#restore-defaults").addEventListener("click", () => {
    for (const [key, value] of Object.entries(DEFAULTS)) $("#settings-form").elements[key].value = value;
  });
  $("#settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const next = {};
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
      const value = Number(form.elements[key].value);
      if (!Number.isInteger(value) || value < 1 || value > (key === "focus" ? 90 : key === "short" ? 30 : key === "long" ? 60 : 8) || (key === "interval" && value < 2)) {
        form.elements[key].focus();
        return;
      }
      next[key] = value || fallback;
    }
    applySettings(next);
    $("#settings-dialog").close();
    announce("Your timer settings have been saved.");
  });
  $("#settings-dialog").addEventListener("click", (event) => {
    if (event.target === $("#settings-dialog")) $("#settings-dialog").close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !$("#settings-dialog").open && !["INPUT", "TEXTAREA", "BUTTON"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      toggleTimer();
    }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.running) tick(); });

  render();
  if (state.running) {
    if (state.remaining <= 0) completeTimer();
    else ticker = setInterval(tick, 250);
  }
})();