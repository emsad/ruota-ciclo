const MS_PER_DAY = 24 * 60 * 60 * 1000;
const todayKey = toInputDate(new Date());

const defaults = {
  lastStart: null,
  cycleLength: 28,
  periodLength: 5,
  history: []
};

const state = { ...defaults, history: [], observation: null };
const db = window.ADueDb;
let profileId = null;
let activeUserId = null;
let selectedDay = null;

const elements = {
  authGate: document.querySelector("#authGate"),
  authForm: document.querySelector("#authForm"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  authStatus: document.querySelector("#authStatus"),
  signUp: document.querySelector("#signUp"),
  signOut: document.querySelector("#signOut"),
  appShell: document.querySelector("#appShell"),
  accountEmail: document.querySelector("#accountEmail"),
  accountInitial: document.querySelector("#accountInitial"),
  syncStatus: document.querySelector("#syncStatus"),
  currentMonth: document.querySelector("#currentMonth"),
  timeline: document.querySelector("#cycleTimeline"),
  dayContext: document.querySelector("#dayContext"),
  todayDay: document.querySelector("#todayDay"),
  phaseTitle: document.querySelector("#phaseTitle"),
  phaseDescription: document.querySelector("#phaseDescription"),
  trendDay: document.querySelector("#trendDay"),
  trendPhase: document.querySelector("#trendPhase"),
  trendLabel: document.querySelector("#trendLabel"),
  trendText: document.querySelector("#trendText"),
  settingsForm: document.querySelector("#settingsForm"),
  lastStart: document.querySelector("#lastStart"),
  cycleLength: document.querySelector("#cycleLength"),
  periodLength: document.querySelector("#periodLength"),
  markToday: document.querySelector("#markToday"),
  nextPeriod: document.querySelector("#nextPeriod"),
  daysUntil: document.querySelector("#daysUntil"),
  fertileWindow: document.querySelector("#fertileWindow"),
  historyList: document.querySelector("#historyList"),
  clearData: document.querySelector("#clearData"),
  historyFile: document.querySelector("#historyFile"),
  importHistory: document.querySelector("#importHistory"),
  importStatus: document.querySelector("#importStatus"),
  dailyForm: document.querySelector("#dailyForm"),
  observationStatus: document.querySelector("#observationStatus"),
  energyInput: document.querySelector("#energyInput"),
  energyOutput: document.querySelector("#energyOutput"),
  moodInput: document.querySelector("#moodInput"),
  moodOutput: document.querySelector("#moodOutput"),
  libidoInput: document.querySelector("#libidoInput"),
  libidoOutput: document.querySelector("#libidoOutput"),
  irritabilityInput: document.querySelector("#irritabilityInput"),
  irritabilityOutput: document.querySelector("#irritabilityOutput"),
  painInput: document.querySelector("#painInput"),
  painOutput: document.querySelector("#painOutput"),
  notesInput: document.querySelector("#notesInput")
};

const scoreLabels = {
  energy: ["Molto bassa", "Bassa", "Moderata", "Buona", "Alta", "Molto alta"],
  mood: ["Difficile", "Faticoso", "Variabile", "Sereno", "Positivo", "Molto positivo"],
  libido: ["Assente", "Molto bassa", "Bassa", "Presente", "Alta", "Molto alta"]
};

elements.currentMonth.textContent = new Intl.DateTimeFormat("it-IT", {
  month: "long",
  year: "numeric"
}).format(new Date()).replace(/^./, (letter) => letter.toUpperCase());

elements.settingsForm.addEventListener("submit", saveCycleSettings);
elements.markToday.addEventListener("click", markTodayAsStart);
elements.clearData.addEventListener("click", clearProfile);
elements.importHistory.addEventListener("click", importHistory);
elements.dailyForm.addEventListener("submit", saveDailyObservation);
elements.authForm.addEventListener("submit", signIn);
elements.signUp.addEventListener("click", signUp);
elements.signOut.addEventListener("click", signOut);

[
  [elements.energyInput, elements.energyOutput, "energy"],
  [elements.moodInput, elements.moodOutput, "mood"],
  [elements.libidoInput, elements.libidoOutput, "libido"]
].forEach(([input, output, type]) => {
  input.addEventListener("input", () => {
    output.textContent = scoreLabels[type][Number(input.value)];
  });
});

[
  [elements.irritabilityInput, elements.irritabilityOutput],
  [elements.painInput, elements.painOutput]
].forEach(([input, output]) => {
  input.addEventListener("input", () => { output.textContent = input.value; });
});

initialize();

async function initialize() {
  if (!db) {
    elements.authStatus.textContent = "Configurazione database non disponibile.";
    return;
  }

  try {
    const session = await db.getSession();
    if (session) await activateSession(session);
    else showAuth();
  } catch (error) {
    elements.authStatus.textContent = readableError(error);
  }

  db.onAuthChange((session) => {
    window.setTimeout(() => {
      if (session) activateSession(session);
      else showAuth();
    }, 0);
  });
}

async function signIn(event) {
  event.preventDefault();
  elements.authStatus.textContent = "Accesso...";
  try {
    const session = await db.signIn(elements.authEmail.value.trim(), elements.authPassword.value);
    if (session) await activateSession(session);
  } catch (error) {
    elements.authStatus.textContent = readableError(error);
  }
}

async function signUp() {
  if (!elements.authForm.reportValidity()) return;
  elements.authStatus.textContent = "Creazione account...";
  try {
    const result = await db.signUp(elements.authEmail.value.trim(), elements.authPassword.value);
    if (result.session) await activateSession(result.session);
    else elements.authStatus.textContent = "Controlla la tua email per confermare l'account, poi accedi.";
  } catch (error) {
    elements.authStatus.textContent = readableError(error);
  }
}

async function signOut() {
  try {
    await db.signOut();
    showAuth();
  } catch (error) {
    setSyncStatus(`Errore: ${readableError(error)}`);
  }
}

async function activateSession(session) {
  if (activeUserId === session.user.id && profileId) return;
  elements.authStatus.textContent = "Caricamento profilo...";

  const profile = await db.loadProfile(defaults);
  const [events, observation] = await Promise.all([
    db.loadCycleEvents(profile.id),
    db.loadObservation(profile.id, todayKey)
  ]);

  profileId = profile.id;
  activeUserId = session.user.id;
  state.cycleLength = profile.cycle_length;
  state.periodLength = profile.period_length;
  state.history = events.map((event) => event.start_date);
  state.lastStart = state.history[0] ?? null;
  state.observation = observation;
  selectedDay = state.lastStart ? getCycleDay(parseLocalDate(state.lastStart), state.cycleLength) : null;

  syncInputs();
  populateObservation();
  elements.accountEmail.textContent = session.user.email;
  elements.accountInitial.textContent = (session.user.email?.[0] || "A").toUpperCase();
  elements.authGate.hidden = true;
  elements.appShell.hidden = false;
  elements.authPassword.value = "";
  setSyncStatus("Sincronizzato");
  render();
}

function showAuth() {
  activeUserId = null;
  profileId = null;
  elements.appShell.hidden = true;
  elements.authGate.hidden = false;
  elements.authStatus.textContent = "";
  elements.accountEmail.textContent = "";
}

async function saveCycleSettings(event) {
  event.preventDefault();
  state.lastStart = elements.lastStart.value;
  state.cycleLength = clamp(Number(elements.cycleLength.value), 21, 40);
  state.periodLength = clamp(Number(elements.periodLength.value), 1, 10);
  addHistoryDate(state.lastStart);

  try {
    setSyncStatus("Salvataggio...");
    await db.saveSettings(profileId, state.cycleLength, state.periodLength);
    await db.saveCycleStart(profileId, state.lastStart);
    selectedDay = getCycleDay(parseLocalDate(state.lastStart), state.cycleLength);
    render();
    setSyncStatus("Salvato");
  } catch (error) {
    setSyncStatus(`Errore: ${readableError(error)}`);
  }
}

async function markTodayAsStart() {
  state.lastStart = todayKey;
  addHistoryDate(todayKey);
  syncInputs();
  try {
    setSyncStatus("Salvataggio...");
    await db.saveSettings(profileId, state.cycleLength, state.periodLength);
    await db.saveCycleStart(profileId, todayKey);
    selectedDay = 1;
    render();
    setSyncStatus("Salvato");
  } catch (error) {
    setSyncStatus(`Errore: ${readableError(error)}`);
  }
}

async function saveDailyObservation(event) {
  event.preventDefault();
  elements.observationStatus.textContent = "Salvataggio...";
  const observation = {
    date: todayKey,
    energy: Number(elements.energyInput.value),
    mood: Number(elements.moodInput.value),
    libido: Number(elements.libidoInput.value),
    irritability: Number(elements.irritabilityInput.value),
    pain: Number(elements.painInput.value),
    notes: elements.notesInput.value.trim() || null
  };

  try {
    state.observation = await db.saveObservation(profileId, observation);
    populateObservation();
    elements.observationStatus.textContent = "Salvata nel diario";
    setSyncStatus("Sincronizzato");
  } catch (error) {
    elements.observationStatus.textContent = `Errore: ${readableError(error)}`;
  }
}

async function clearProfile() {
  const confirmed = window.confirm("Cancellare dal database tutte le date e le osservazioni del profilo?");
  if (!confirmed) return;
  try {
    setSyncStatus("Cancellazione...");
    await db.clearProfileData(profileId, defaults);
    Object.assign(state, { ...defaults, history: [], observation: null });
    selectedDay = null;
    syncInputs();
    populateObservation();
    render();
    setSyncStatus("Dati cancellati");
  } catch (error) {
    setSyncStatus(`Errore: ${readableError(error)}`);
  }
}

async function importHistory() {
  const file = elements.historyFile.files[0];
  if (!file) {
    elements.importStatus.textContent = "Seleziona prima un file CSV.";
    return;
  }
  elements.importStatus.textContent = "Lettura e controllo...";

  try {
    const parsed = window.Papa.parse(await file.text(), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim().toLowerCase()
    });
    if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);

    const normalized = normalizeHistoricalRows(parsed.data);
    await db.importHistory(profileId, normalized.cycleStarts, normalized.observations);
    const [events, observation] = await Promise.all([
      db.loadCycleEvents(profileId),
      db.loadObservation(profileId, todayKey)
    ]);
    state.history = events.map((item) => item.start_date);
    state.lastStart = state.history[0] ?? null;
    state.observation = observation;
    selectedDay = state.lastStart ? getCycleDay(parseLocalDate(state.lastStart), state.cycleLength) : null;
    syncInputs();
    populateObservation();
    render();
    elements.historyFile.value = "";
    elements.importStatus.textContent = `${normalized.total} righe importate.`;
  } catch (error) {
    elements.importStatus.textContent = `Errore: ${readableError(error)}`;
  }
}

function render() {
  const cycleLength = clamp(Number(state.cycleLength), 21, 40);
  const periodLength = clamp(Number(state.periodLength), 1, 10);
  const hasCycle = Boolean(state.lastStart);
  const lastStart = hasCycle ? parseLocalDate(state.lastStart) : null;
  const currentDay = hasCycle ? getCycleDay(lastStart, cycleLength) : null;

  if (!selectedDay || selectedDay > cycleLength) selectedDay = currentDay;
  renderTimeline(cycleLength, periodLength, currentDay);

  if (!hasCycle) {
    document.body.className = "phase-follicular";
    elements.dayContext.textContent = "Oggi";
    elements.todayDay.textContent = "-";
    elements.phaseTitle.textContent = "Imposta una data";
    elements.phaseDescription.textContent = "Registra l'ultimo inizio delle mestruazioni per visualizzare una stima del ciclo.";
    elements.trendDay.textContent = "Ciclo non impostato";
    elements.trendPhase.textContent = "In attesa dei dati";
    elements.trendLabel.textContent = "Andamento orientativo";
    elements.trendText.textContent = "Le osservazioni quotidiane renderanno il quadro piu personale nel tempo.";
    elements.nextPeriod.textContent = "-";
    elements.daysUntil.textContent = "-";
    elements.fertileWindow.textContent = "-";
    renderHistory();
    return;
  }

  const displayedDay = selectedDay || currentDay;
  const phase = getPhase(displayedDay, periodLength, cycleLength);
  const selectedIsToday = displayedDay === currentDay;
  const nextStart = addDays(lastStart, cycleLength);
  const ovulationDay = Math.max(1, cycleLength - 14);
  const fertileStart = addDays(lastStart, Math.max(0, ovulationDay - 5));
  const fertileEnd = addDays(lastStart, ovulationDay);

  document.body.className = phase.className;
  elements.dayContext.textContent = selectedIsToday ? "Oggi" : "Anteprima";
  elements.todayDay.textContent = displayedDay;
  elements.phaseTitle.textContent = phase.label;
  elements.phaseDescription.textContent = phase.description;
  elements.trendDay.textContent = `Giorno ${displayedDay}`;
  elements.trendPhase.textContent = phase.label;
  elements.trendLabel.textContent = phase.trend;
  elements.trendText.textContent = phase.guidance;
  elements.nextPeriod.textContent = formatDate(nextStart);
  elements.daysUntil.textContent = getDaysUntil(nextStart);
  elements.fertileWindow.textContent = `${formatShortDate(fertileStart)} - ${formatShortDate(fertileEnd)}`;
  renderHistory();
}

function renderTimeline(cycleLength, periodLength, currentDay) {
  elements.timeline.innerHTML = "";
  for (let day = 1; day <= cycleLength; day += 1) {
    const button = document.createElement("button");
    const phase = getPhase(day, periodLength, cycleLength);
    button.type = "button";
    button.className = "timeline-day";
    button.textContent = day;
    button.setAttribute("aria-label", `Giorno ${day}, ${phase.label}`);
    button.disabled = !currentDay;
    if (day === currentDay) button.classList.add("is-current");
    if (day === selectedDay) button.classList.add("is-selected");
    button.addEventListener("click", () => {
      selectedDay = day;
      render();
    });
    elements.timeline.appendChild(button);
  }

  window.requestAnimationFrame(() => {
    const selected = elements.timeline.querySelector(".is-selected");
    const wrap = elements.timeline.parentElement;
    if (selected && wrap.scrollWidth > wrap.clientWidth) {
      wrap.scrollLeft = selected.offsetLeft - wrap.clientWidth / 2 + selected.clientWidth / 2;
    }
  });
}

function getPhase(day, periodLength, cycleLength) {
  const ovulationDay = Math.max(1, cycleLength - 14);
  const fertileStart = Math.max(periodLength + 1, ovulationDay - 5);

  if (day <= periodLength) {
    return {
      label: "Mestruazione",
      className: "phase-period",
      description: "Energia e sensibilita possono variare. Comfort e ascolto sono una buona base.",
      trend: "Ritmo personale",
      guidance: "Chiedi come sta e lascia spazio a cio che desidera davvero oggi."
    };
  }
  if (day >= fertileStart && day < ovulationDay) {
    return {
      label: "Finestra fertile stimata",
      className: "phase-fertile",
      description: "In alcune persone energia e desiderio possono aumentare, ma non e una regola.",
      trend: "Possibile slancio",
      guidance: "Un invito aperto funziona meglio di un'aspettativa: la risposta reale viene prima della stima."
    };
  }
  if (day === ovulationDay) {
    return {
      label: "Ovulazione stimata",
      className: "phase-ovulation",
      description: "Un momento biologicamente significativo, calcolato soltanto in modo orientativo.",
      trend: "Picco stimato",
      guidance: "Osserva energia, umore e desiderio senza considerarli automatici."
    };
  }
  if (day > ovulationDay) {
    const late = day > cycleLength - 6;
    return {
      label: "Fase luteale",
      className: "phase-luteal",
      description: late
        ? "Verso la fine del ciclo possono comparire maggiore sensibilita o bisogno di spazio."
        : "Il ritmo puo diventare piu variabile mentre il corpo si avvicina al ciclo successivo.",
      trend: late ? "Sensibilita possibile" : "Ritmo variabile",
      guidance: late
        ? "Riduci le supposizioni: ascolto, chiarezza e gentilezza aiutano piu di qualsiasi previsione."
        : "Mantieni le proposte leggere e facili da accettare, modificare o rifiutare."
    };
  }
  return {
    label: "Fase follicolare",
    className: "phase-follicular",
    description: "Energia in possibile crescita e passaggio graduale verso la fase fertile.",
    trend: "Possibile ripresa",
    guidance: "Puoi proporre qualcosa con leggerezza, verificando sempre come si sente davvero."
  };
}

function populateObservation() {
  const observation = state.observation;
  const fields = ["energy", "mood", "libido", "irritability", "pain"];
  fields.forEach((field) => {
    elements[`${field}Input`].value = observation?.[field] ?? 0;
  });
  elements.notesInput.value = observation?.notes ?? "";
  elements.energyOutput.textContent = Number.isInteger(observation?.energy) ? scoreLabels.energy[observation.energy] : "Non registrata";
  elements.moodOutput.textContent = Number.isInteger(observation?.mood) ? scoreLabels.mood[observation.mood] : "Non registrato";
  elements.libidoOutput.textContent = Number.isInteger(observation?.libido) ? scoreLabels.libido[observation.libido] : "Non registrata";
  elements.irritabilityOutput.textContent = observation?.irritability ?? "0";
  elements.painOutput.textContent = observation?.pain ?? "0";
  elements.observationStatus.textContent = observation ? "Osservazione gia salvata" : "Ancora da compilare";
}

function syncInputs() {
  elements.lastStart.value = state.lastStart ?? "";
  elements.cycleLength.value = state.cycleLength;
  elements.periodLength.value = state.periodLength;
}

function renderHistory() {
  const history = [...new Set(state.history)].sort().reverse();
  elements.historyList.innerHTML = "";
  if (history.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Nessuna data salvata";
    elements.historyList.appendChild(item);
    return;
  }
  history.slice(0, 12).forEach((date) => {
    const item = document.createElement("li");
    item.textContent = formatDate(parseLocalDate(date));
    elements.historyList.appendChild(item);
  });
}

function normalizeHistoricalRows(rows) {
  const cycleStarts = [];
  const observations = [];
  rows.forEach((row, index) => {
    const line = index + 2;
    const date = String(row.date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Data non valida alla riga ${line}. Usa AAAA-MM-GG.`);
    if (isCsvTrue(row.period_start)) cycleStarts.push(date);
    const observation = {
      date,
      mood: csvScore(row.mood, line, "mood"),
      libido: csvScore(row.libido, line, "libido"),
      energy: csvScore(row.energy, line, "energy"),
      irritability: csvScore(row.irritability, line, "irritability"),
      pain: csvScore(row.pain, line, "pain"),
      notes: String(row.notes ?? "").trim() || null
    };
    if (Object.values(observation).some((value) => value !== null && value !== date)) observations.push(observation);
  });
  return { cycleStarts: [...new Set(cycleStarts)], observations, total: rows.length };
}

function isCsvTrue(value) {
  return ["true", "1", "yes", "si", "sì"].includes(String(value ?? "").trim().toLowerCase());
}

function csvScore(value, line, field) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const number = Number(text);
  if (!Number.isInteger(number) || number < 0 || number > 5) throw new Error(`${field} deve essere da 0 a 5 alla riga ${line}.`);
  return number;
}

function addHistoryDate(date) {
  if (date) state.history = [...new Set([date, ...state.history])].slice(0, 24);
}

function setSyncStatus(message) { elements.syncStatus.textContent = message; }
function readableError(error) { return error?.message || "Operazione non riuscita"; }
function parseLocalDate(value) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); }
function toInputDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function addDays(date, days) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function getCycleDay(lastStart, length) { return positiveModulo(Math.floor((startOfDay(new Date()) - startOfDay(lastStart)) / MS_PER_DAY), length) + 1; }
function positiveModulo(value, divisor) { return ((value % divisor) + divisor) % divisor; }
function clamp(value, min, max) { return Math.min(Math.max(value || min, min), max); }
function getDaysUntil(date) { const diff = Math.ceil((startOfDay(date) - startOfDay(new Date())) / MS_PER_DAY); if (diff === 0) return "Oggi"; if (diff === 1) return "Domani"; if (diff < 0) return "Da aggiornare"; return `${diff} giorni`; }
function formatDate(date) { return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "long", year: "numeric" }).format(date); }
function formatShortDate(date) { return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(date); }
