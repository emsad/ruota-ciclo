const STORAGE_KEY = "cycle-wheel-state-v1";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const defaults = {
  lastStart: toInputDate(new Date()),
  cycleLength: 28,
  periodLength: 5,
  history: []
};

const state = loadState();
const wheel = document.querySelector("#cycleWheel");
const form = document.querySelector("#settingsForm");
const lastStartInput = document.querySelector("#lastStart");
const cycleLengthInput = document.querySelector("#cycleLength");
const periodLengthInput = document.querySelector("#periodLength");
const todayDay = document.querySelector("#todayDay");
const todayPhase = document.querySelector("#todayPhase");
const nextPeriod = document.querySelector("#nextPeriod");
const daysUntil = document.querySelector("#daysUntil");
const fertileWindow = document.querySelector("#fertileWindow");
const historyList = document.querySelector("#historyList");
const markToday = document.querySelector("#markToday");
const clearData = document.querySelector("#clearData");

lastStartInput.value = state.lastStart;
cycleLengthInput.value = state.cycleLength;
periodLengthInput.value = state.periodLength;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  state.lastStart = lastStartInput.value;
  state.cycleLength = clamp(Number(cycleLengthInput.value), 21, 40);
  state.periodLength = clamp(Number(periodLengthInput.value), 1, 10);
  addHistoryDate(state.lastStart);
  saveState();
  render();
});

markToday.addEventListener("click", () => {
  state.lastStart = toInputDate(new Date());
  addHistoryDate(state.lastStart);
  lastStartInput.value = state.lastStart;
  saveState();
  render();
});

clearData.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  Object.assign(state, { ...defaults, history: [] });
  lastStartInput.value = state.lastStart;
  cycleLengthInput.value = state.cycleLength;
  periodLengthInput.value = state.periodLength;
  render();
});

render();

function render() {
  wheel.innerHTML = "";

  const cycleLength = clamp(Number(state.cycleLength), 21, 40);
  const periodLength = clamp(Number(state.periodLength), 1, 10);
  const lastStart = parseLocalDate(state.lastStart);
  const currentCycleDay = getCycleDay(lastStart, cycleLength);
  const todayPhaseInfo = getPhase(currentCycleDay, periodLength, cycleLength);

  for (let day = 1; day <= cycleLength; day += 1) {
    const node = document.createElement("button");
    const phase = getPhase(day, periodLength, cycleLength);
    const angle = ((day - 1) / cycleLength) * 360;
    const radians = (angle * Math.PI) / 180;
    const radius = 45;

    node.type = "button";
    node.className = `day-node ${phase.className}`;
    node.style.left = `${50 + Math.sin(radians) * radius}%`;
    node.style.top = `${50 - Math.cos(radians) * radius}%`;
    node.setAttribute("aria-label", `Giorno ${day}, ${phase.label}`);
    node.innerHTML = `<span>${day}</span>`;

    if (day === currentCycleDay) node.classList.add("is-today");
    if (day === 1) node.classList.add("is-start");

    wheel.appendChild(node);
  }

  const nextStart = addDays(lastStart, cycleLength);
  const ovulationDay = Math.max(1, cycleLength - 14);
  const fertileStart = addDays(lastStart, Math.max(0, ovulationDay - 5));
  const fertileEnd = addDays(lastStart, ovulationDay);

  todayDay.textContent = currentCycleDay;
  todayPhase.textContent = todayPhaseInfo.label;
  nextPeriod.textContent = formatDate(nextStart);
  daysUntil.textContent = getDaysUntil(nextStart);
  fertileWindow.textContent = `${formatShortDate(fertileStart)} - ${formatShortDate(fertileEnd)}`;
  renderHistory();
}

function renderHistory() {
  const history = [...new Set(state.history)].sort().reverse();
  historyList.innerHTML = "";

  if (history.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Nessuna data salvata";
    historyList.appendChild(item);
    return;
  }

  history.slice(0, 8).forEach((date) => {
    const item = document.createElement("li");
    item.textContent = formatDate(parseLocalDate(date));
    historyList.appendChild(item);
  });
}

function getPhase(day, periodLength, cycleLength) {
  const ovulationDay = Math.max(1, cycleLength - 14);
  const fertileStart = Math.max(periodLength + 1, ovulationDay - 5);

  if (day <= periodLength) {
    return { label: "Mestruazione", className: "phase-period" };
  }

  if (day >= fertileStart && day < ovulationDay) {
    return { label: "Finestra fertile stimata", className: "phase-fertile" };
  }

  if (day === ovulationDay) {
    return { label: "Ovulazione stimata", className: "phase-ovulation" };
  }

  if (day > ovulationDay) {
    return { label: "Fase luteale", className: "phase-luteal" };
  }

  return { label: "Fase follicolare", className: "phase-follicular" };
}

function getCycleDay(lastStart, cycleLength) {
  const today = startOfDay(new Date());
  const elapsed = Math.floor((today - startOfDay(lastStart)) / MS_PER_DAY);
  return positiveModulo(elapsed, cycleLength) + 1;
}

function getDaysUntil(date) {
  const diff = Math.ceil((startOfDay(date) - startOfDay(new Date())) / MS_PER_DAY);
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Domani";
  if (diff < 0) return "Da aggiornare";
  return `${diff} giorni`;
}

function addHistoryDate(date) {
  if (!date) return;
  state.history = [...new Set([date, ...state.history])].slice(0, 24);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...defaults, ...saved, history: saved?.history ?? [] };
  } catch {
    return { ...defaults, history: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short"
  }).format(date);
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value || min, min), max);
}
