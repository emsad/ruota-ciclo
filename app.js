const MS_PER_DAY = 24 * 60 * 60 * 1000;
const today = startOfDay(new Date());
const todayKey = toInputDate(today);

const defaults = {
  lastStart: null,
  cycleLength: 28,
  periodLength: 5,
  history: []
};

const state = {
  ...defaults,
  profileId: null,
  activeUserId: null,
  cycles: [],
  observations: [],
  events: [],
  selectedDate: todayKey,
  calendarCursor: new Date(today.getFullYear(), today.getMonth(), 1),
  insightRange: "month",
  activeFilters: new Set(),
  scores: { libido: null, mood: null, irritability: null, sex: null, conflict: null }
};

const db = window.ADueDb;
const elements = collectElements();

bindEvents();
buildScoreControls();
initialize();

function collectElements() {
  const ids = [
    "authGate", "authForm", "authEmail", "authPassword", "authStatus", "signUp", "signOut", "appShell",
    "accountEmail", "accountInitial", "syncStatus", "forecastDay", "forecastPhase", "forecastLabel", "forecastText",
    "todayDay", "cycleTimeline", "phaseTitle", "phaseDescription", "logToday", "todayRecordStatus", "todayLibido",
    "todayMood", "todayIrritability", "todayLibidoNote", "todayMoodNote", "todayIrritabilityNote", "todayLibidoSpark",
    "todayMoodSpark", "todayIrritabilitySpark", "settingsForm", "lastStart", "cycleLength", "periodLength", "markToday",
    "nextPeriod", "predictionRange", "predictionConfidence", "historyList", "historyFile", "importHistory", "importStatus",
    "clearData", "calendarFilters", "previousMonth", "nextMonth", "calendarMonth", "monthGrid", "logSelected", "feedSummary",
    "eventList", "patternConfidence", "patternSummary", "libidoChart", "moodChart", "sexPhaseChart", "seasonChart",
    "patternFindings", "todayInsightsTitle", "insightRange", "drawerBackdrop", "dayDrawer", "closeDrawer", "drawerTitle", "drawerDate", "dayForm",
    "periodStartInput", "libidoValue", "moodValue", "irritabilityValue", "sexInput", "sexIntensityField", "sexValue",
    "conflictInput", "conflictIntensityField", "conflictValue", "otherInput", "otherDetailsLabel", "otherDetailsInput",
    "dayNotesInput", "drawerStatus"
  ];
  return Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));
}

function bindEvents() {
  elements.authForm.addEventListener("submit", signIn);
  elements.signUp.addEventListener("click", signUp);
  elements.signOut.addEventListener("click", signOut);
  elements.settingsForm.addEventListener("submit", saveCycleSettings);
  elements.markToday.addEventListener("click", () => openDayDrawer(todayKey, true));
  elements.clearData.addEventListener("click", clearProfile);
  elements.importHistory.addEventListener("click", importHistory);
  elements.logToday.addEventListener("click", () => openDayDrawer(todayKey));
  elements.logSelected.addEventListener("click", () => openDayDrawer(state.selectedDate || todayKey));
  elements.previousMonth.addEventListener("click", () => changeMonth(-1));
  elements.nextMonth.addEventListener("click", () => changeMonth(1));
  elements.closeDrawer.addEventListener("click", closeDayDrawer);
  elements.drawerBackdrop.addEventListener("click", closeDayDrawer);
  elements.dayForm.addEventListener("submit", saveDay);
  elements.sexInput.addEventListener("change", syncEventFields);
  elements.conflictInput.addEventListener("change", syncEventFields);
  elements.otherInput.addEventListener("change", syncEventFields);

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.viewTarget));
  });

  elements.calendarFilters.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    toggleFilter(button.dataset.filter);
  });

  elements.insightRange.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-range]");
    if (!button) return;
    state.insightRange = button.dataset.range;
    elements.insightRange.querySelectorAll("button").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderInsightDashboard();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.dayDrawer.hidden) closeDayDrawer();
  });
}

function buildScoreControls() {
  ["libido", "mood", "irritability", "sex", "conflict"].forEach((type) => {
    const container = document.querySelector(`[data-score="${type}"]`);
    for (let value = 1; value <= 10; value += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = value;
      button.dataset.value = value;
      button.setAttribute("aria-label", `${type} ${value} su 10`);
      button.addEventListener("click", () => setScore(type, value));
      container.appendChild(button);
    }
  });
}

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
  if (state.activeUserId === session.user.id && state.profileId) return;
  elements.authStatus.textContent = "Caricamento profilo...";
  const profile = await db.loadProfile(defaults);

  state.profileId = profile.id;
  state.activeUserId = session.user.id;
  state.cycleLength = profile.cycle_length;
  state.periodLength = profile.period_length;
  await reloadData();

  elements.accountEmail.textContent = session.user.email;
  elements.accountInitial.textContent = (session.user.email?.[0] || "A").toUpperCase();
  elements.authPassword.value = "";
  elements.authGate.hidden = true;
  elements.appShell.hidden = false;
  setSyncStatus("Sincronizzato");
  syncSettingsInputs();
  renderAll();
}

function showAuth() {
  state.activeUserId = null;
  state.profileId = null;
  elements.appShell.hidden = true;
  elements.authGate.hidden = false;
  elements.authStatus.textContent = "";
  elements.accountEmail.textContent = "";
}

async function reloadData() {
  const [cycles, observations, events] = await Promise.all([
    db.loadCycleEvents(state.profileId),
    db.loadAllObservations(state.profileId),
    db.loadTimelineEvents(state.profileId)
  ]);
  state.cycles = cycles;
  state.observations = observations;
  state.events = events;
  state.history = cycles.map((cycle) => cycle.start_date);
  state.lastStart = state.history[0] ?? null;
}

function renderAll() {
  renderToday();
  renderCalendar();
  renderPatterns();
  renderHistory();
}

function switchView(view) {
  document.querySelectorAll("[data-view]").forEach((panel) => {
    const active = panel.dataset.view === view;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    const active = button.dataset.viewTarget === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (view === "calendar") renderCalendar();
  if (view === "patterns") renderPatterns();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderToday() {
  const stats = getPredictionStats();
  const cycleInfo = getCycleInfo(todayKey);
  const phase = cycleInfo ? getPhase(cycleInfo.day, stats.length, state.periodLength) : null;

  renderTimeline(cycleInfo?.day ?? null, stats.length);
  setBodyPhase(phase?.className ?? "phase-follicular");

  if (!cycleInfo) {
    elements.todayDay.textContent = "-";
    elements.phaseTitle.textContent = "Imposta il ciclo";
    elements.phaseDescription.textContent = "Registra l'inizio delle mestruazioni di oggi o di una data passata per cominciare.";
    elements.forecastDay.textContent = "Ciclo non impostato";
    elements.forecastPhase.textContent = "In attesa dei dati";
    elements.forecastLabel.textContent = "Previsione orientativa";
    elements.forecastText.textContent = "Con ogni nuova data la stima del ciclo successivo diventa piu personale.";
    elements.nextPeriod.textContent = "-";
    elements.predictionRange.textContent = "-";
    elements.predictionConfidence.textContent = "In attesa";
  } else {
    elements.todayDay.textContent = cycleInfo.day;
    elements.phaseTitle.textContent = phase.label;
    elements.phaseDescription.textContent = phase.description;
    elements.forecastDay.textContent = `Giorno ${cycleInfo.day}`;
    elements.forecastPhase.textContent = phase.label;
    elements.forecastLabel.textContent = phase.trend;
    elements.forecastText.textContent = getPersonalForecast(cycleInfo.day, phase);
    elements.nextPeriod.textContent = stats.nextDate ? formatDate(stats.nextDate) : "-";
    elements.predictionRange.textContent = stats.rangeLabel;
    elements.predictionConfidence.textContent = stats.confidence;
  }

  elements.todayRecordStatus.textContent = hasDayData(todayKey) ? "Giornata registrata" : "Nessuna osservazione registrata";
  renderInsightDashboard();
}

function renderTimeline(currentDay, length) {
  elements.cycleTimeline.innerHTML = "";
  const total = Math.max(length, currentDay || 0, 21);
  for (let day = 1; day <= Math.min(total, 60); day += 1) {
    const node = document.createElement("span");
    node.className = "timeline-day";
    node.textContent = day;
    if (day === currentDay) node.classList.add("is-current");
    elements.cycleTimeline.appendChild(node);
  }

  window.requestAnimationFrame(() => {
    const current = elements.cycleTimeline.querySelector(".is-current");
    const wrap = elements.cycleTimeline.parentElement;
    if (current && wrap.scrollWidth > wrap.clientWidth) {
      wrap.scrollLeft = current.offsetLeft - wrap.clientWidth / 2 + current.clientWidth / 2;
    }
  });
}

function renderInsightDashboard() {
  const windowInfo = getInsightWindow(state.insightRange);
  elements.todayInsightsTitle.textContent = windowInfo.title;
  const observations = state.observations
    .filter((item) => item.observation_date >= windowInfo.startKey && item.observation_date <= todayKey)
    .sort((a, b) => a.observation_date.localeCompare(b.observation_date));

  renderInsightMetric("libido", "Libido", observations, elements.todayLibido, elements.todayLibidoNote, elements.todayLibidoSpark, windowInfo);
  renderInsightMetric("mood", "Umore", observations, elements.todayMood, elements.todayMoodNote, elements.todayMoodSpark, windowInfo);
  renderInsightMetric("irritability", "Irritabilita", observations, elements.todayIrritability, elements.todayIrritabilityNote, elements.todayIrritabilitySpark, windowInfo);
}

function getInsightWindow(range) {
  if (range === "today") return { startKey: todayKey, startDate: today, title: "Il quadro di oggi" };
  if (range === "3") {
    const startDate = addDays(today, -2);
    return { startKey: toInputDate(startDate), startDate, title: "Gli ultimi 3 giorni" };
  }
  if (range === "7") {
    const startDate = addDays(today, -6);
    return { startKey: toInputDate(startDate), startDate, title: "Gli ultimi 7 giorni" };
  }
  const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  const month = new Intl.DateTimeFormat("it-IT", { month: "long" }).format(today);
  return { startKey: toInputDate(startDate), startDate, title: `Il quadro di ${month}` };
}

function renderInsightMetric(field, label, observations, output, note, chart, windowInfo) {
  const points = observations
    .map((item) => ({ date: item.observation_date, value: normalizeScore(item[field]) }))
    .filter((item) => item.value);
  const values = points.map((item) => item.value);
  output.textContent = values.length ? `${formatNumber(average(values))}/10` : "-";
  if (values.length === 0) note.textContent = "Nessuna osservazione nel periodo";
  else if (state.insightRange === "today") note.textContent = `${label} ${field === "mood" ? "registrato" : "registrata"} oggi`;
  else note.textContent = `${values.length} ${values.length === 1 ? "osservazione" : "osservazioni"} · media del periodo`;
  renderSparkline(chart, points, windowInfo.startDate, today);
}

function renderSparkline(container, points, startDate, endDate) {
  if (points.length === 0) {
    container.innerHTML = `<span class="sparkline-empty">Nessun dato</span>`;
    return;
  }
  const width = 260;
  const height = 56;
  const totalDays = dayDifference(startDate, endDate);
  const coordinates = points.map((point) => {
    const offset = dayDifference(startDate, parseLocalDate(point.date));
    const x = totalDays === 0 ? width / 2 : (offset / totalDays) * width;
    const y = height - ((point.value - 1) / 9) * (height - 8) - 4;
    return { x, y };
  });
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const dots = coordinates.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3" fill="currentColor"/>`).join("");
  const line = coordinates.length > 1 ? `<polyline points="${polyline}" fill="none" stroke="currentColor" stroke-width="2"/>` : "";
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Andamento nel periodo">${line}${dots}<line x1="0" y1="${height - 4}" x2="${width}" y2="${height - 4}" stroke="currentColor" opacity=".15"/></svg>`;
}

function renderCalendar() {
  const year = state.calendarCursor.getFullYear();
  const month = state.calendarCursor.getMonth();
  elements.calendarMonth.textContent = capitalize(new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(state.calendarCursor));
  elements.monthGrid.innerHTML = "";

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - firstWeekday);
  const predictedDates = getPredictedStartKeys(8);

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index);
    const dateKey = toInputDate(date);
    const data = dayData(dateKey);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.setAttribute("aria-label", calendarAriaLabel(dateKey, data, predictedDates.has(dateKey)));
    if (date.getMonth() !== month) button.classList.add("is-outside");
    if (dateKey === todayKey) button.classList.add("is-today");
    if (dateKey === state.selectedDate) button.classList.add("is-selected");
    if (predictedDates.has(dateKey) && dateKey > todayKey) button.classList.add("is-predicted");
    if (!matchesActiveFilters(data)) button.classList.add("is-filtered-out");

    const cycleInfo = getCycleInfo(dateKey);
    button.innerHTML = `<span class="day-number">${date.getDate()}</span>${cycleInfo ? `<span class="day-cycle-label">Giorno ${cycleInfo.day}</span>` : ""}<span class="day-markers">${renderDayMarkers(data)}</span>`;
    button.addEventListener("click", () => {
      state.selectedDate = dateKey;
      if (date.getMonth() !== month) state.calendarCursor = new Date(date.getFullYear(), date.getMonth(), 1);
      renderCalendar();
      openDayDrawer(dateKey);
    });
    elements.monthGrid.appendChild(button);
  }
  renderEventFeed(year, month);
}

function renderDayMarkers(data) {
  const markers = [];
  if (data.period) markers.push("period");
  if (data.sex) markers.push("sex");
  if (data.conflict) markers.push("conflict");
  if (data.notes) markers.push("note");
  if (data.other) markers.push("other");
  return markers.map((marker) => `<i class="day-marker ${marker}" aria-hidden="true"></i>`).join("");
}

function dayData(dateKey) {
  const observation = observationFor(dateKey);
  const events = eventsFor(dateKey);
  return {
    dateKey,
    period: state.cycles.some((cycle) => cycle.start_date === dateKey),
    sex: events.find((event) => event.category === "sex") ?? null,
    conflict: events.find((event) => event.category === "conflict") ?? null,
    other: events.find((event) => event.category === "other") ?? null,
    notes: observation?.notes || "",
    libido: normalizeScore(observation?.libido),
    mood: normalizeScore(observation?.mood),
    irritability: normalizeScore(observation?.irritability),
    observation
  };
}

function matchesActiveFilters(data) {
  if (state.activeFilters.size === 0) return true;
  return [...state.activeFilters].every((filter) => {
    if (filter === "period") return data.period;
    if (filter === "sex") return Boolean(data.sex);
    if (filter === "conflict") return Boolean(data.conflict);
    if (filter === "high-libido") return data.libido >= 7;
    if (filter === "low-mood") return data.mood && data.mood <= 4;
    if (filter === "notes") return Boolean(data.notes);
    if (filter === "other") return Boolean(data.other);
    return true;
  });
}

function toggleFilter(filter) {
  if (filter === "all") state.activeFilters.clear();
  else if (state.activeFilters.has(filter)) state.activeFilters.delete(filter);
  else state.activeFilters.add(filter);

  elements.calendarFilters.querySelectorAll("button[data-filter]").forEach((button) => {
    const key = button.dataset.filter;
    const active = key === "all" ? state.activeFilters.size === 0 : state.activeFilters.has(key);
    button.classList.toggle("is-active", active);
  });
  renderCalendar();
}

function renderEventFeed(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const matchingDays = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = toInputDate(new Date(year, month, day));
    const data = dayData(dateKey);
    if (hasDayData(dateKey) && matchesActiveFilters(data)) matchingDays.push(data);
  }
  matchingDays.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  elements.feedSummary.textContent = `${matchingDays.length} ${matchingDays.length === 1 ? "giorno" : "giorni"} corrispondenti`;
  elements.eventList.innerHTML = "";

  if (matchingDays.length === 0) {
    const item = document.createElement("li");
    item.className = "event-empty";
    item.textContent = state.activeFilters.size ? "Nessun giorno corrisponde a tutti i filtri selezionati." : "Nessun evento registrato in questo mese.";
    elements.eventList.appendChild(item);
    return;
  }

  matchingDays.forEach((data) => {
    const labels = dayLabels(data);
    const item = document.createElement("li");
    item.className = "event-item";
    const marker = document.createElement("i");
    marker.className = `filter-dot ${primaryMarker(data)}`;
    const button = document.createElement("button");
    button.type = "button";
    const strong = document.createElement("strong");
    strong.textContent = formatDate(parseLocalDate(data.dateKey));
    const small = document.createElement("small");
    small.textContent = labels.join(" · ");
    button.append(strong, small);
    const time = document.createElement("time");
    const cycleDay = getCycleInfo(data.dateKey)?.day;
    time.textContent = cycleDay ? `G${cycleDay}` : "";
    item.append(marker, button, time);
    button.addEventListener("click", () => openDayDrawer(data.dateKey));
    elements.eventList.appendChild(item);
  });
}

function dayLabels(data) {
  const labels = [];
  if (data.period) labels.push("Inizio mestruazioni");
  if (data.sex) labels.push(`Sesso ${data.sex.intensity || ""}`.trim());
  if (data.conflict) labels.push(`Litigio ${data.conflict.intensity || ""}`.trim());
  if (data.libido) labels.push(`Libido ${data.libido}/10`);
  if (data.mood) labels.push(`Umore ${data.mood}/10`);
  if (data.notes) labels.push("Nota");
  if (data.other) labels.push(data.other.details || "Altro");
  return labels;
}

function primaryMarker(data) {
  if (data.period) return "period";
  if (data.sex) return "sex";
  if (data.conflict) return "conflict";
  if (data.notes) return "note";
  return "";
}

function calendarAriaLabel(dateKey, data, predicted) {
  const labels = dayLabels(data);
  if (predicted && dateKey > todayKey) labels.push("Mestruazioni previste");
  return `${formatDate(parseLocalDate(dateKey))}${labels.length ? `, ${labels.join(", ")}` : ""}`;
}

function changeMonth(offset) {
  state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + offset, 1);
  renderCalendar();
}

function openDayDrawer(dateKey, forcePeriodStart = false) {
  state.selectedDate = dateKey;
  const observation = observationFor(dateKey);
  const data = dayData(dateKey);
  const sex = data.sex;
  const conflict = data.conflict;

  state.scores = {
    libido: normalizeScore(observation?.libido),
    mood: normalizeScore(observation?.mood),
    irritability: normalizeScore(observation?.irritability),
    sex: normalizeScore(sex?.intensity),
    conflict: normalizeScore(conflict?.intensity)
  };
  elements.drawerTitle.textContent = dateKey === todayKey ? "Registra oggi" : "Registra giornata";
  elements.drawerDate.textContent = capitalize(formatDate(parseLocalDate(dateKey)));
  elements.periodStartInput.checked = forcePeriodStart || data.period;
  elements.sexInput.checked = Boolean(sex);
  elements.conflictInput.checked = Boolean(conflict);
  elements.otherInput.checked = Boolean(data.other);
  elements.otherDetailsInput.value = data.other?.details ?? "";
  elements.dayNotesInput.value = observation?.notes ?? "";
  elements.drawerStatus.textContent = "";
  renderScoreSelections();
  syncEventFields();
  elements.drawerBackdrop.hidden = false;
  elements.dayDrawer.hidden = false;
  document.body.classList.add("is-drawer-open");
  window.setTimeout(() => elements.closeDrawer.focus(), 0);
}

function closeDayDrawer() {
  elements.drawerBackdrop.hidden = true;
  elements.dayDrawer.hidden = true;
  document.body.classList.remove("is-drawer-open");
}

function setScore(type, value) {
  state.scores[type] = state.scores[type] === value ? null : value;
  renderScoreSelections();
}

function renderScoreSelections() {
  const outputMap = {
    libido: elements.libidoValue,
    mood: elements.moodValue,
    irritability: elements.irritabilityValue,
    sex: elements.sexValue,
    conflict: elements.conflictValue
  };
  Object.entries(state.scores).forEach(([type, selected]) => {
    const container = document.querySelector(`[data-score="${type}"]`);
    container.querySelectorAll("button").forEach((button) => {
      const active = Number(button.dataset.value) === selected;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
    outputMap[type].textContent = selected ? `${selected}/10` : type === "mood" ? "Non registrato" : "Non registrata";
  });
}

function syncEventFields() {
  elements.sexIntensityField.disabled = !elements.sexInput.checked;
  elements.conflictIntensityField.disabled = !elements.conflictInput.checked;
  elements.otherDetailsLabel.hidden = !elements.otherInput.checked;
  if (!elements.sexInput.checked) state.scores.sex = null;
  if (!elements.conflictInput.checked) state.scores.conflict = null;
  renderScoreSelections();
}

async function saveDay(event) {
  event.preventDefault();
  const dateKey = state.selectedDate;
  const currentObservation = observationFor(dateKey);
  elements.drawerStatus.textContent = "Salvataggio...";
  setSyncStatus("Salvataggio...");

  try {
    const isExistingPeriodStart = state.cycles.some((cycle) => cycle.start_date === dateKey);
    if (elements.periodStartInput.checked && !isExistingPeriodStart) await db.saveCycleStart(state.profileId, dateKey);
    if (!elements.periodStartInput.checked && isExistingPeriodStart) await db.deleteCycleStart(state.profileId, dateKey);

    await db.saveObservation(state.profileId, {
      date: dateKey,
      libido: state.scores.libido,
      mood: state.scores.mood,
      irritability: state.scores.irritability,
      energy: normalizeScore(currentObservation?.energy),
      pain: normalizeScore(currentObservation?.pain),
      notes: elements.dayNotesInput.value.trim() || null
    });

    await syncTimelineEvent("sex", elements.sexInput.checked, state.scores.sex, null);
    await syncTimelineEvent("conflict", elements.conflictInput.checked, state.scores.conflict, null);
    await syncTimelineEvent("other", elements.otherInput.checked, null, elements.otherDetailsInput.value.trim() || null);

    await reloadData();
    syncSettingsInputs();
    renderAll();
    elements.drawerStatus.textContent = "Giornata salvata";
    setSyncStatus("Sincronizzato");
    window.setTimeout(closeDayDrawer, 350);
  } catch (error) {
    elements.drawerStatus.textContent = `Errore: ${readableError(error)}`;
    setSyncStatus("Errore di salvataggio");
  }
}

async function syncTimelineEvent(category, enabled, intensity, details) {
  const existing = eventsFor(state.selectedDate).some((event) => event.category === category);
  if (enabled) {
    await db.saveTimelineEvent(state.profileId, { date: state.selectedDate, category, intensity, details });
  } else if (existing) {
    await db.deleteTimelineEvent(state.profileId, state.selectedDate, category);
  }
}

async function saveCycleSettings(event) {
  event.preventDefault();
  const startDate = elements.lastStart.value;
  const length = clamp(Number(elements.cycleLength.value), 21, 40);
  const periodLength = clamp(Number(elements.periodLength.value), 1, 10);
  try {
    setSyncStatus("Salvataggio...");
    await db.saveSettings(state.profileId, length, periodLength);
    await db.saveCycleStart(state.profileId, startDate);
    state.cycleLength = length;
    state.periodLength = periodLength;
    await reloadData();
    renderAll();
    setSyncStatus("Salvato");
  } catch (error) {
    setSyncStatus(`Errore: ${readableError(error)}`);
  }
}

async function clearProfile() {
  const confirmed = window.confirm("Cancellare dal database tutte le date, gli eventi e le osservazioni del profilo?");
  if (!confirmed) return;
  try {
    setSyncStatus("Cancellazione...");
    await db.clearProfileData(state.profileId, defaults);
    state.cycleLength = defaults.cycleLength;
    state.periodLength = defaults.periodLength;
    await reloadData();
    syncSettingsInputs();
    renderAll();
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
    await db.importHistory(state.profileId, normalized.cycleStarts, normalized.observations);
    await reloadData();
    syncSettingsInputs();
    renderAll();
    elements.historyFile.value = "";
    elements.importStatus.textContent = `${normalized.total} righe importate.`;
  } catch (error) {
    elements.importStatus.textContent = `Errore: ${readableError(error)}`;
  }
}

function renderPatterns() {
  const stats = getPredictionStats();
  elements.patternConfidence.textContent = stats.confidence;
  const trackedDays = state.observations.filter((item) => hasObservationValues(item)).length;
  const sexEvents = state.events.filter((item) => item.category === "sex").length;
  const conflictEvents = state.events.filter((item) => item.category === "conflict").length;
  elements.patternSummary.innerHTML = [
    ["Cicli registrati", state.cycles.length],
    ["Giorni osservati", trackedDays],
    ["Eventi intimi", sexEvents],
    ["Litigi registrati", conflictEvents]
  ].map(([label, value]) => `<div class="summary-stat"><span>${label}</span><strong>${value}</strong></div>`).join("");

  const libidoByDay = averageByCycleDay("libido");
  const moodByDay = averageByCycleDay("mood");
  const irritabilityByDay = averageByCycleDay("irritability");
  renderLineChart(elements.libidoChart, [{ values: libidoByDay, className: "chart-line-libido", color: "var(--sex)" }], "Servono osservazioni di libido distribuite nel ciclo.");
  renderLineChart(elements.moodChart, [
    { values: moodByDay, className: "chart-line-mood", color: "var(--note)" },
    { values: irritabilityByDay, className: "chart-line-irritability", color: "var(--conflict)" }
  ], "Servono osservazioni di umore e irritabilita.");
  renderBarChart(elements.sexPhaseChart, intimacyByPhase(), "Servono eventi intimi associati a cicli registrati.");
  renderBarChart(elements.seasonChart, libidoBySeason(), "Servono dati raccolti in periodi diversi dell'anno.");
  renderPatternFindings(libidoByDay, irritabilityByDay);
}

function averageByCycleDay(field) {
  const buckets = new Map();
  state.observations.forEach((observation) => {
    const value = normalizeScore(observation[field]);
    const cycleInfo = getCycleInfo(observation.observation_date);
    if (!value || !cycleInfo || cycleInfo.day > 60) return;
    if (!buckets.has(cycleInfo.day)) buckets.set(cycleInfo.day, []);
    buckets.get(cycleInfo.day).push(value);
  });
  return [...buckets.entries()].map(([x, values]) => ({ x, y: average(values), count: values.length })).sort((a, b) => a.x - b.x);
}

function intimacyByPhase() {
  const counts = new Map([["Mestr.", 0], ["Follic.", 0], ["Fertile", 0], ["Luteale", 0]]);
  const stats = getPredictionStats();
  state.events.filter((event) => event.category === "sex").forEach((event) => {
    const info = getCycleInfo(event.event_date);
    if (!info) return;
    const phase = getPhase(info.day, stats.length, state.periodLength).shortLabel;
    counts.set(phase, (counts.get(phase) || 0) + 1);
  });
  return [...counts.entries()].map(([label, value]) => ({ label, value })).filter((item) => item.value > 0);
}

function libidoBySeason() {
  const buckets = new Map([["Inv", []], ["Pri", []], ["Est", []], ["Aut", []]]);
  state.observations.forEach((observation) => {
    const value = normalizeScore(observation.libido);
    if (!value) return;
    const month = parseLocalDate(observation.observation_date).getMonth();
    const label = month === 11 || month <= 1 ? "Inv" : month <= 4 ? "Pri" : month <= 7 ? "Est" : "Aut";
    buckets.get(label).push(value);
  });
  return [...buckets.entries()].filter(([, values]) => values.length > 0).map(([label, values]) => ({ label, value: average(values), count: values.length }));
}

function renderLineChart(container, series, emptyText) {
  const all = series.flatMap((item) => item.values);
  if (all.length === 0) {
    container.innerHTML = `<div class="chart-empty">${emptyText}</div>`;
    return;
  }
  const width = 620;
  const height = 210;
  const pad = { left: 34, right: 14, top: 10, bottom: 28 };
  const maxX = Math.max(28, ...all.map((point) => point.x));
  const xPos = (x) => pad.left + ((x - 1) / Math.max(1, maxX - 1)) * (width - pad.left - pad.right);
  const yPos = (y) => pad.top + ((10 - y) / 9) * (height - pad.top - pad.bottom);
  const grid = [1, 5, 10].map((value) => `<line class="chart-grid-line" x1="${pad.left}" y1="${yPos(value)}" x2="${width - pad.right}" y2="${yPos(value)}"/><text class="chart-label" x="3" y="${yPos(value) + 3}">${value}</text>`).join("");
  const axes = [1, Math.round(maxX / 2), maxX].map((value) => `<text class="chart-label" text-anchor="middle" x="${xPos(value)}" y="${height - 6}">${value}</text>`).join("");
  const paths = series.map((item) => {
    if (item.values.length === 0) return "";
    const points = item.values.map((point) => `${xPos(point.x)},${yPos(point.y)}`).join(" ");
    const dots = item.values.map((point) => `<circle class="chart-point" cx="${xPos(point.x)}" cy="${yPos(point.y)}" r="4" fill="${item.color}"/>`).join("");
    return `<polyline class="${item.className}" points="${points}"/>${dots}`;
  }).join("");
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico per giorno del ciclo">${grid}<line class="chart-axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"/>${axes}${paths}</svg>`;
}

function renderBarChart(container, data, emptyText) {
  if (data.length === 0) {
    container.innerHTML = `<div class="chart-empty">${emptyText}</div>`;
    return;
  }
  const width = 420;
  const height = 210;
  const top = 18;
  const bottom = 34;
  const max = Math.max(...data.map((item) => item.value), 1);
  const slot = width / data.length;
  const barWidth = Math.min(56, slot * .52);
  const bars = data.map((item, index) => {
    const barHeight = (item.value / max) * (height - top - bottom);
    const x = index * slot + (slot - barWidth) / 2;
    const y = height - bottom - barHeight;
    return `<rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="2"/><text class="chart-label" text-anchor="middle" x="${x + barWidth / 2}" y="${height - 10}">${item.label}</text><text class="chart-label" text-anchor="middle" x="${x + barWidth / 2}" y="${Math.max(11, y - 6)}">${formatNumber(item.value)}</text>`;
  }).join("");
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico a barre">${bars}</svg>`;
}

function renderPatternFindings(libidoByDay, irritabilityByDay) {
  const findings = [];
  if (state.cycles.length < 2) findings.push("Registra almeno due inizi del ciclo per calcolare una durata personale.");
  if (state.observations.length < 10) findings.push("Con almeno dieci giornate osservate inizieranno a emergere confronti piu utili.");
  const libidoPeak = maxPoint(libidoByDay);
  if (libidoPeak) findings.push(`La libido media piu alta finora compare intorno al giorno ${libidoPeak.x} del ciclo (${formatNumber(libidoPeak.y)}/10).`);
  const irritationPeak = maxPoint(irritabilityByDay);
  if (irritationPeak) findings.push(`L'irritabilita media piu alta registrata compare intorno al giorno ${irritationPeak.x} (${formatNumber(irritationPeak.y)}/10).`);
  const phaseData = intimacyByPhase();
  if (phaseData.length) {
    const topPhase = [...phaseData].sort((a, b) => b.value - a.value)[0];
    findings.push(`Gli eventi intimi registrati sono piu frequenti nella fase ${topPhase.label.toLowerCase()}.`);
  }
  if (findings.length === 0) findings.push("Continua a registrare le giornate: i pattern appariranno qui senza forzare conclusioni.");
  elements.patternFindings.innerHTML = findings.map((finding) => `<li>${finding}</li>`).join("");
}

function getPredictionStats() {
  const dates = state.cycles.map((cycle) => parseLocalDate(cycle.start_date)).sort((a, b) => a - b);
  const intervals = [];
  for (let index = 1; index < dates.length; index += 1) {
    const interval = dayDifference(dates[index - 1], dates[index]);
    if (interval >= 15 && interval <= 60) intervals.push(interval);
  }
  const length = intervals.length ? Math.round(median(intervals)) : state.cycleLength;
  const deviation = intervals.length > 1 ? Math.max(1, Math.round(average(intervals.map((value) => Math.abs(value - median(intervals)))))) : 2;
  const latest = dates.length ? dates[dates.length - 1] : null;
  let nextDate = latest ? addDays(latest, length) : null;
  while (nextDate && nextDate < today) nextDate = addDays(nextDate, length);
  const confidence = intervals.length >= 5 && deviation <= 3 ? "Alta" : intervals.length >= 2 ? "Media" : intervals.length >= 1 ? "In crescita" : "In attesa";
  const rangeLabel = nextDate ? `${formatShortDate(addDays(nextDate, -deviation))} - ${formatShortDate(addDays(nextDate, deviation))}` : "-";
  return { length, deviation, nextDate, confidence, rangeLabel, intervals };
}

function getPredictedStartKeys(count) {
  const result = new Set();
  const stats = getPredictionStats();
  if (!stats.nextDate) return result;
  let date = stats.nextDate;
  for (let index = 0; index < count; index += 1) {
    result.add(toInputDate(date));
    date = addDays(date, stats.length);
  }
  return result;
}

function getCycleInfo(dateKey) {
  const date = parseLocalDate(dateKey);
  const starts = state.cycles.map((cycle) => parseLocalDate(cycle.start_date)).filter((start) => start <= date).sort((a, b) => b - a);
  if (!starts.length) return null;
  return { start: starts[0], day: dayDifference(starts[0], date) + 1 };
}

function getPhase(day, cycleLength, periodLength) {
  const ovulationDay = Math.max(periodLength + 2, cycleLength - 14);
  const fertileStart = Math.max(periodLength + 1, ovulationDay - 5);
  if (day <= periodLength) return { label: "Mestruazione", shortLabel: "Mestr.", className: "phase-period", trend: "Ritmo personale", description: "Energia e sensibilita possono variare. Il dato reale di oggi conta piu della fase stimata." };
  if (day >= fertileStart && day < ovulationDay) return { label: "Finestra fertile stimata", shortLabel: "Fertile", className: "phase-fertile", trend: "Possibile slancio", description: "In alcune persone energia e desiderio possono aumentare, ma non e una regola." };
  if (day === ovulationDay) return { label: "Ovulazione stimata", shortLabel: "Fertile", className: "phase-ovulation", trend: "Picco stimato", description: "Un passaggio calcolato in modo orientativo, da confrontare con le osservazioni reali." };
  if (day > ovulationDay) return { label: "Fase luteale", shortLabel: "Luteale", className: "phase-luteal", trend: day > cycleLength - 6 ? "Sensibilita possibile" : "Ritmo variabile", description: "Umore, energia e desiderio possono diventare piu variabili verso il ciclo successivo." };
  return { label: "Fase follicolare", shortLabel: "Follic.", className: "phase-follicular", trend: "Possibile ripresa", description: "Energia e desiderio possono crescere gradualmente dopo le mestruazioni." };
}

function getPersonalForecast(day, fallbackPhase) {
  const nearby = state.observations.filter((observation) => {
    const info = getCycleInfo(observation.observation_date);
    return info && Math.abs(info.day - day) <= 2;
  });
  if (nearby.length < 2) return fallbackPhase.description;
  const libidoValues = nearby.map((item) => normalizeScore(item.libido)).filter(Boolean);
  const irritationValues = nearby.map((item) => normalizeScore(item.irritability)).filter(Boolean);
  const parts = [];
  if (libidoValues.length) parts.push(`libido media ${formatNumber(average(libidoValues))}/10`);
  if (irritationValues.length) parts.push(`irritabilita media ${formatNumber(average(irritationValues))}/10`);
  return parts.length ? `Nei giorni simili hai registrato ${parts.join(" e ")}.` : fallbackPhase.description;
}

function observationFor(dateKey) {
  return state.observations.find((item) => item.observation_date === dateKey) ?? null;
}

function eventsFor(dateKey) {
  return state.events.filter((item) => item.event_date === dateKey);
}

function hasDayData(dateKey) {
  const observation = observationFor(dateKey);
  return state.cycles.some((cycle) => cycle.start_date === dateKey) || eventsFor(dateKey).length > 0 || hasObservationValues(observation);
}

function hasObservationValues(observation) {
  if (!observation) return false;
  return [observation.libido, observation.mood, observation.irritability, observation.energy, observation.pain].some((value) => normalizeScore(value)) || Boolean(observation.notes);
}

function syncSettingsInputs() {
  elements.lastStart.value = state.lastStart ?? "";
  elements.cycleLength.value = state.cycleLength;
  elements.periodLength.value = state.periodLength;
}

function renderHistory() {
  elements.historyList.innerHTML = "";
  if (!state.history.length) {
    const item = document.createElement("li");
    item.textContent = "Nessuna data salvata";
    elements.historyList.appendChild(item);
    return;
  }
  state.history.slice(0, 12).forEach((date) => {
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
    if ([observation.mood, observation.libido, observation.energy, observation.irritability, observation.pain, observation.notes].some((value) => value !== null)) observations.push(observation);
  });
  return { cycleStarts: [...new Set(cycleStarts)], observations, total: rows.length };
}

function isCsvTrue(value) { return ["true", "1", "yes", "si", "sì"].includes(String(value ?? "").trim().toLowerCase()); }
function csvScore(value, line, field) { const text = String(value ?? "").trim(); if (text === "") return null; const number = Number(text); if (!Number.isInteger(number) || number < 0 || number > 10) throw new Error(`${field} deve essere da 0 a 10 alla riga ${line}.`); return number; }
function normalizeScore(value) { const number = Number(value); return Number.isFinite(number) && number >= 1 && number <= 10 ? number : null; }
function maxPoint(points) { return points.length ? [...points].sort((a, b) => b.y - a.y)[0] : null; }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function median(values) { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function formatNumber(value) { return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(value); }
function setSyncStatus(message) { elements.syncStatus.textContent = message; }
function setBodyPhase(className) { document.body.classList.remove("phase-period", "phase-follicular", "phase-fertile", "phase-ovulation", "phase-luteal"); document.body.classList.add(className); }
function readableError(error) { return error?.message || "Operazione non riuscita"; }
function parseLocalDate(value) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); }
function toInputDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function addDays(date, days) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function dayDifference(start, end) { return Math.round((startOfDay(end) - startOfDay(start)) / MS_PER_DAY); }
function clamp(value, min, max) { return Math.min(Math.max(value || min, min), max); }
function capitalize(value) { return value ? value.charAt(0).toUpperCase() + value.slice(1) : value; }
function formatDate(date) { return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "long", year: "numeric" }).format(date); }
function formatShortDate(date) { return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(date); }
