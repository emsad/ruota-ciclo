const MS_PER_DAY = 24 * 60 * 60 * 1000;

const defaults = {
  lastStart: toInputDate(new Date()),
  cycleLength: 28,
  periodLength: 5,
  history: []
};

const state = { ...defaults, history: [] };
const db = window.ADueDb;
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
const todayHeat = document.querySelector("#todayHeat");
const playDayLabel = document.querySelector("#playDayLabel");
const funLevel = document.querySelector("#funLevel");
const funNote = document.querySelector("#funNote");
const suggestionText = document.querySelector("#suggestionText");
const newSuggestion = document.querySelector("#newSuggestion");
const authGate = document.querySelector("#authGate");
const authForm = document.querySelector("#authForm");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");
const authStatus = document.querySelector("#authStatus");
const signUpButton = document.querySelector("#signUp");
const signOutButton = document.querySelector("#signOut");
const appShell = document.querySelector("#appShell");
const accountEmail = document.querySelector("#accountEmail");
const syncStatus = document.querySelector("#syncStatus");
const historyFile = document.querySelector("#historyFile");
const importHistoryButton = document.querySelector("#importHistory");
const importStatus = document.querySelector("#importStatus");

let selectedDay = null;
let activeSuggestions = [];
let suggestionIndex = 0;
let profileId = null;
let activeUserId = null;

lastStartInput.value = state.lastStart;
cycleLengthInput.value = state.cycleLength;
periodLengthInput.value = state.periodLength;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.lastStart = lastStartInput.value;
  state.cycleLength = clamp(Number(cycleLengthInput.value), 21, 40);
  state.periodLength = clamp(Number(periodLengthInput.value), 1, 10);
  addHistoryDate(state.lastStart);
  try {
    setSyncStatus("Salvataggio...");
    await saveState();
    render();
    setSyncStatus("Salvato");
  } catch (error) {
    setSyncStatus(`Errore: ${readableError(error)}`);
  }
});

markToday.addEventListener("click", async () => {
  state.lastStart = toInputDate(new Date());
  addHistoryDate(state.lastStart);
  lastStartInput.value = state.lastStart;
  try {
    setSyncStatus("Salvataggio...");
    await saveState();
    render();
    setSyncStatus("Salvato");
  } catch (error) {
    setSyncStatus(`Errore: ${readableError(error)}`);
  }
});

clearData.addEventListener("click", async () => {
  const confirmed = window.confirm("Cancellare dal database tutte le date e le osservazioni del profilo?");
  if (!confirmed) return;

  try {
    setSyncStatus("Cancellazione...");
    await db.clearProfileData(profileId, defaults);
  } catch (error) {
    setSyncStatus(`Errore: ${readableError(error)}`);
    return;
  }

  Object.assign(state, { ...defaults, history: [] });
  syncInputs();
  render();
  setSyncStatus("Dati cancellati");
});

newSuggestion.addEventListener("click", () => {
  if (activeSuggestions.length === 0) return;
  suggestionIndex = (suggestionIndex + 1) % activeSuggestions.length;
  suggestionText.textContent = activeSuggestions[suggestionIndex];
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authStatus.textContent = "Accesso...";

  try {
    const session = await db.signIn(authEmail.value.trim(), authPassword.value);
    if (session) await activateSession(session);
  } catch (error) {
    authStatus.textContent = readableError(error);
  }
});

signUpButton.addEventListener("click", async () => {
  if (!authForm.reportValidity()) return;
  authStatus.textContent = "Creazione account...";

  try {
    const result = await db.signUp(authEmail.value.trim(), authPassword.value);
    if (result.session) {
      await activateSession(result.session);
    } else {
      authStatus.textContent = "Controlla la tua email per confermare l'account, poi accedi.";
    }
  } catch (error) {
    authStatus.textContent = readableError(error);
  }
});

signOutButton.addEventListener("click", async () => {
  try {
    await db.signOut();
    showAuth();
  } catch (error) {
    setSyncStatus(`Errore: ${readableError(error)}`);
  }
});

importHistoryButton.addEventListener("click", async () => {
  const file = historyFile.files[0];
  if (!file) {
    importStatus.textContent = "Seleziona prima un file CSV.";
    return;
  }

  importStatus.textContent = "Lettura e controllo...";

  try {
    const parsed = window.Papa.parse(await file.text(), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim().toLowerCase()
    });

    if (parsed.errors.length > 0) {
      throw new Error(parsed.errors[0].message);
    }

    const normalized = normalizeHistoricalRows(parsed.data);
    await db.importHistory(profileId, normalized.cycleStarts, normalized.observations);

    const events = await db.loadCycleEvents(profileId);
    state.history = events.map((event) => event.start_date);
    if (state.history[0]) state.lastStart = state.history[0];
    syncInputs();
    render();
    historyFile.value = "";
    importStatus.textContent = `${normalized.total} righe importate.`;
  } catch (error) {
    importStatus.textContent = `Errore: ${readableError(error)}`;
  }
});

initialize();

async function initialize() {
  if (!db) {
    authStatus.textContent = "Configurazione database non disponibile.";
    return;
  }

  try {
    const session = await db.getSession();
    if (session) await activateSession(session);
    else showAuth();
  } catch (error) {
    authStatus.textContent = readableError(error);
  }

  db.onAuthChange((session) => {
    window.setTimeout(() => {
      if (session) activateSession(session);
      else showAuth();
    }, 0);
  });
}

async function activateSession(session) {
  if (activeUserId === session.user.id && profileId) return;

  authStatus.textContent = "Caricamento profilo...";
  const profile = await db.loadProfile(defaults);
  const events = await db.loadCycleEvents(profile.id);

  profileId = profile.id;
  activeUserId = session.user.id;
  state.cycleLength = profile.cycle_length;
  state.periodLength = profile.period_length;
  state.history = events.map((event) => event.start_date);
  state.lastStart = state.history[0] ?? defaults.lastStart;

  syncInputs();
  accountEmail.textContent = session.user.email;
  authGate.hidden = true;
  appShell.hidden = false;
  authPassword.value = "";
  setSyncStatus("Sincronizzato");
  render();
}

function showAuth() {
  activeUserId = null;
  profileId = null;
  appShell.hidden = true;
  authGate.hidden = false;
  authStatus.textContent = "";
  accountEmail.textContent = "";
}

function syncInputs() {
  lastStartInput.value = state.lastStart;
  cycleLengthInput.value = state.cycleLength;
  periodLengthInput.value = state.periodLength;
}

function setSyncStatus(message) {
  syncStatus.textContent = message;
}

function normalizeHistoricalRows(rows) {
  const cycleStarts = [];
  const observations = [];

  rows.forEach((row, index) => {
    const line = index + 2;
    const date = String(row.date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`Data non valida alla riga ${line}. Usa AAAA-MM-GG.`);
    }

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

    const hasObservation = [
      observation.mood,
      observation.libido,
      observation.energy,
      observation.irritability,
      observation.pain,
      observation.notes
    ].some((value) => value !== null);

    if (hasObservation) observations.push(observation);
  });

  return {
    cycleStarts: [...new Set(cycleStarts)],
    observations,
    total: rows.length
  };
}

function isCsvTrue(value) {
  return ["true", "1", "yes", "si", "sì"].includes(String(value ?? "").trim().toLowerCase());
}

function csvScore(value, line, field) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const number = Number(text);
  if (!Number.isInteger(number) || number < 0 || number > 5) {
    throw new Error(`${field} deve essere da 0 a 5 alla riga ${line}.`);
  }
  return number;
}

function render() {
  wheel.innerHTML = "";

  const cycleLength = clamp(Number(state.cycleLength), 21, 40);
  const periodLength = clamp(Number(state.periodLength), 1, 10);
  const lastStart = parseLocalDate(state.lastStart);
  const currentCycleDay = getCycleDay(lastStart, cycleLength);
  const todayPhaseInfo = getPhase(currentCycleDay, periodLength, cycleLength);
  const todayFunProfile = getFunProfile(currentCycleDay, periodLength, cycleLength);

  if (!selectedDay || selectedDay > cycleLength) selectedDay = currentCycleDay;

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
    if (day === selectedDay) node.classList.add("is-selected");
    if (day === 1) node.classList.add("is-start");

    node.addEventListener("click", () => {
      selectedDay = day;
      document.querySelectorAll(".day-node").forEach((item) => item.classList.remove("is-selected"));
      node.classList.add("is-selected");
      renderPlayCard(day, periodLength, cycleLength, currentCycleDay);
    });

    wheel.appendChild(node);
  }

  const nextStart = addDays(lastStart, cycleLength);
  const ovulationDay = Math.max(1, cycleLength - 14);
  const fertileStart = addDays(lastStart, Math.max(0, ovulationDay - 5));
  const fertileEnd = addDays(lastStart, ovulationDay);

  todayDay.textContent = currentCycleDay;
  todayPhase.textContent = todayPhaseInfo.label;
  todayHeat.textContent = todayFunProfile.level;
  nextPeriod.textContent = formatDate(nextStart);
  daysUntil.textContent = getDaysUntil(nextStart);
  fertileWindow.textContent = `${formatShortDate(fertileStart)} - ${formatShortDate(fertileEnd)}`;
  renderPlayCard(selectedDay, periodLength, cycleLength, currentCycleDay);
  renderHistory();
}

function renderPlayCard(day, periodLength, cycleLength, currentCycleDay) {
  const profile = getFunProfile(day, periodLength, cycleLength);
  activeSuggestions = profile.suggestions;
  suggestionIndex = day % activeSuggestions.length;

  playDayLabel.textContent = day === currentCycleDay ? "Spunto di oggi" : `Anteprima giorno ${day}`;
  funLevel.textContent = profile.level;
  funNote.textContent = profile.note;
  suggestionText.textContent = activeSuggestions[suggestionIndex];
}

function getFunProfile(day, periodLength, cycleLength) {
  const ovulationDay = Math.max(1, cycleLength - 14);
  const fertileStart = Math.max(periodLength + 1, ovulationDay - 5);

  if (day <= periodLength) {
    return {
      level: "Dolce e senza pressione",
      note: "Comfort, vicinanza e ascolto possono essere piu invitanti di un programma intenso.",
      suggestions: [
        "Proponi una doccia calda insieme, poi lasciate decidere al momento se fermarvi alle coccole.",
        "Massaggio lento a turno: chi lo riceve decide ritmo, zona e quando fermarsi.",
        "Prepara una serata comoda e chiedile quale tipo di contatto le farebbe piacere oggi."
      ]
    };
  }

  if (day < fertileStart) {
    return {
      level: "Pepe in aumento",
      note: "Dopo le mestruazioni energia e desiderio possono salire: buon momento per lanciare un invito malizioso.",
      suggestions: [
        "Mandale un messaggio malizioso durante il giorno e falle scegliere come continuare la sera.",
        "Ognuno scrive un desiderio segreto: pescatene uno e decidete insieme se provarlo.",
        "Proponi una serata senza telefoni, musica scelta da lei e baci senza fretta.",
        "Invitala a scegliere un outfit, un luogo o una piccola fantasia da esplorare insieme."
      ]
    };
  }

  if (day < ovulationDay) {
    return {
      level: "Terreno piccante",
      note: "La finestra fertile puo coincidere con piu desiderio e iniziativa, ma la risposta vera la da sempre lei.",
      suggestions: [
        "Gioco dei tre desideri: uno romantico, uno sensuale e uno decisamente audace.",
        "Falle scegliere musica e ritmo; tu prepari una sorpresa e lei mantiene il diritto di cambiare idea.",
        "Organizza un appuntamento in casa con una regola: ogni portata sblocca una domanda piu maliziosa.",
        "Proponi una sfida lenta: niente fretta, chi cede per primo sceglie la prossima mossa."
      ]
    };
  }

  if (day === ovulationDay) {
    return {
      level: "Massimo tasso di pepe",
      note: "Picco solo stimato: se l'intesa c'e, e una buona serata per una proposta piu coraggiosa.",
      suggestions: [
        "Carta bianca condivisa: raccontate una fantasia ciascuno e sceglietene una che entusiasmi entrambi.",
        "Benda, musica e turno di comando, concordando prima una parola per fermarsi.",
        "Preparate una sorpresa reciproca e rivelatela solo quando entrambi dite si al gioco.",
        "Fatele trovare un invito: luogo, ora e due opzioni piccanti tra cui scegliere."
      ]
    };
  }

  const isLateLuteal = day > cycleLength - 5;
  return {
    level: isLateLuteal ? "Ritmo morbido" : "Pepe variabile",
    note: isLateLuteal
      ? "Nei giorni finali sensibilita e desiderio possono cambiare: meglio invitare senza aspettative."
      : "Il desiderio puo restare vivace oppure rallentare. Una proposta flessibile funziona meglio.",
    suggestions: [
      "Proponi un massaggio con possibilita di continuare, ma rendi bellissimo anche fermarsi li.",
      "Chiedile: stasera preferisci coccole, gioco o sorpresa? Poi segui davvero la risposta.",
      "Create una lista si, forse, non oggi e scegliete insieme solo dalla prima colonna.",
      "Serata lenta: luci basse, qualcosa di buono e nessun obiettivo oltre allo stare bene."
    ]
  };
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

async function saveState() {
  if (!db || !profileId) throw new Error("Profilo non disponibile");
  await db.saveSettings(profileId, state.cycleLength, state.periodLength);
  await db.saveCycleStart(profileId, state.lastStart);
}

function readableError(error) {
  return error?.message || "Operazione non riuscita";
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
