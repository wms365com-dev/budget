const STORAGE_KEY = "budget-flow-dashboard-v1";
const API_ENDPOINT = "/api/data";
const DEFAULT_SETTINGS = {
  currentBalance: 0,
  safetyBuffer: 0,
  forecastDays: 60
};
const LEGACY_SAMPLE_ITEM_IDS = [
  "item-salary",
  "item-freelance",
  "item-rent",
  "item-groceries",
  "item-utilities",
  "item-internet",
  "item-transport",
  "item-dining",
  "item-insurance",
  "item-subscriptions",
  "item-medical"
];
const LEGACY_SAMPLE_BUDGET_IDS = [
  "budget-groceries",
  "budget-dining",
  "budget-transport",
  "budget-utilities",
  "budget-subscriptions"
];
const USE_REMOTE_STORAGE = window.location.protocol !== "file:";
const state = createEmptyState();
let saveTimerId = null;
let activeSavePromise = Promise.resolve();

const dom = {
  exportButton: document.getElementById("exportButton"),
  importInput: document.getElementById("importInput"),
  clearDataButton: document.getElementById("clearDataButton"),
  storageModeValue: document.getElementById("storageModeValue"),
  syncStatusText: document.getElementById("syncStatusText"),
  riskBanner: document.getElementById("riskBanner"),
  riskTitle: document.getElementById("riskTitle"),
  riskText: document.getElementById("riskText"),
  lowestBalanceValue: document.getElementById("lowestBalanceValue"),
  watchDateValue: document.getElementById("watchDateValue"),
  currentBalanceValue: document.getElementById("currentBalanceValue"),
  monthlyIncomeValue: document.getElementById("monthlyIncomeValue"),
  monthlyExpenseValue: document.getElementById("monthlyExpenseValue"),
  projectedEndValue: document.getElementById("projectedEndValue"),
  safeToSpendValue: document.getElementById("safeToSpendValue"),
  safeToSpendNote: document.getElementById("safeToSpendNote"),
  upcomingBillsValue: document.getElementById("upcomingBillsValue"),
  nextIncomeNote: document.getElementById("nextIncomeNote"),
  forecastDaysLabel: document.getElementById("forecastDaysLabel"),
  forecastChart: document.getElementById("forecastChart"),
  chartStartBalance: document.getElementById("chartStartBalance"),
  chartEndBalance: document.getElementById("chartEndBalance"),
  chartBufferBalance: document.getElementById("chartBufferBalance"),
  upcomingList: document.getElementById("upcomingList"),
  budgetProgressList: document.getElementById("budgetProgressList"),
  settingsForm: document.getElementById("settingsForm"),
  currentBalanceInput: document.getElementById("currentBalanceInput"),
  safetyBufferInput: document.getElementById("safetyBufferInput"),
  forecastDaysInput: document.getElementById("forecastDaysInput"),
  itemForm: document.getElementById("itemForm"),
  itemFormTitle: document.getElementById("itemFormTitle"),
  itemIdInput: document.getElementById("itemIdInput"),
  directionInput: document.getElementById("directionInput"),
  labelInput: document.getElementById("labelInput"),
  amountInput: document.getElementById("amountInput"),
  categoryInput: document.getElementById("categoryInput"),
  scheduleInput: document.getElementById("scheduleInput"),
  startDateInput: document.getElementById("startDateInput"),
  startDateLabel: document.getElementById("startDateLabel"),
  notesInput: document.getElementById("notesInput"),
  cancelEditButton: document.getElementById("cancelEditButton"),
  categoryOptions: document.getElementById("categoryOptions"),
  itemTableBody: document.getElementById("itemTableBody"),
  budgetForm: document.getElementById("budgetForm"),
  budgetIdInput: document.getElementById("budgetIdInput"),
  budgetCategoryInput: document.getElementById("budgetCategoryInput"),
  budgetLimitInput: document.getElementById("budgetLimitInput"),
  cancelBudgetEditButton: document.getElementById("cancelBudgetEditButton"),
  budgetTableBody: document.getElementById("budgetTableBody")
};

void init();

async function init() {
  attachEventListeners();
  resetItemForm();
  resetBudgetForm();
  updateStorageStatus();
  renderApp();
  await hydrateState();
  renderApp();
}

function attachEventListeners() {
  dom.settingsForm.addEventListener("submit", handleSettingsSubmit);
  dom.itemForm.addEventListener("submit", handleItemSubmit);
  dom.budgetForm.addEventListener("submit", handleBudgetSubmit);
  dom.cancelEditButton.addEventListener("click", resetItemForm);
  dom.cancelBudgetEditButton.addEventListener("click", resetBudgetForm);
  dom.scheduleInput.addEventListener("change", updateScheduleLabel);
  dom.directionInput.addEventListener("change", updateScheduleLabel);
  dom.itemTableBody.addEventListener("click", handleItemTableClick);
  dom.budgetTableBody.addEventListener("click", handleBudgetTableClick);
  dom.exportButton.addEventListener("click", exportData);
  dom.clearDataButton.addEventListener("click", handleClearData);
  dom.importInput.addEventListener("change", importData);
}

async function hydrateState() {
  try {
    updateStorageStatus("loading");
    applyState(await loadState());
    updateStorageStatus("ready");
  } catch (error) {
    console.error(error);
    updateStorageStatus("error");
  }
}

function updateStorageStatus(status = "idle") {
  if (!USE_REMOTE_STORAGE) {
    dom.storageModeValue.textContent = "Browser-only storage";
    dom.syncStatusText.textContent =
      status === "error"
        ? "Local save failed. Export a backup before closing this page."
        : "Saved in this browser profile. Export a JSON backup if you want a file copy.";
    return;
  }

  dom.storageModeValue.textContent = "Railway server storage";

  if (status === "loading") {
    dom.syncStatusText.textContent = "Loading saved data from the server.";
    return;
  }

  if (status === "saving") {
    dom.syncStatusText.textContent = "Saving changes to the server.";
    return;
  }

  if (status === "error") {
    dom.syncStatusText.textContent = "Could not reach the server. Your latest changes may not be saved yet.";
    return;
  }

  dom.syncStatusText.textContent = "Connected to the server. Export backups any time from the dashboard.";
}

function applyState(payload) {
  const normalized = normalizeStatePayload(payload);
  state.settings = normalized.settings;
  state.items = normalized.items;
  state.budgets = normalized.budgets;
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  state.settings.currentBalance = sanitizeMoney(dom.currentBalanceInput.value);
  state.settings.safetyBuffer = sanitizeMoney(dom.safetyBufferInput.value);
  state.settings.forecastDays = Number(dom.forecastDaysInput.value);
  persistAndRender();
}

function handleItemSubmit(event) {
  event.preventDefault();

  const item = {
    id: dom.itemIdInput.value || createId("item"),
    direction: dom.directionInput.value,
    label: dom.labelInput.value.trim(),
    amount: sanitizeMoney(dom.amountInput.value),
    category: dom.categoryInput.value.trim(),
    schedule: dom.scheduleInput.value,
    startDate: dom.startDateInput.value,
    notes: dom.notesInput.value.trim()
  };

  if (!item.label || !item.category || !item.startDate) {
    return;
  }

  const existingIndex = state.items.findIndex((entry) => entry.id === item.id);
  if (existingIndex >= 0) {
    state.items[existingIndex] = item;
  } else {
    state.items.push(item);
  }

  persistAndRender();
  resetItemForm();
}

function handleBudgetSubmit(event) {
  event.preventDefault();

  const budget = {
    id: dom.budgetIdInput.value || createId("budget"),
    category: dom.budgetCategoryInput.value.trim(),
    limit: sanitizeMoney(dom.budgetLimitInput.value)
  };

  if (!budget.category) {
    return;
  }

  const existingIndex = state.budgets.findIndex((entry) => entry.id === budget.id);
  if (existingIndex >= 0) {
    state.budgets[existingIndex] = budget;
  } else {
    state.budgets.push(budget);
  }

  persistAndRender();
  resetBudgetForm();
}

function handleItemTableClick(event) {
  const trigger = event.target.closest("button[data-action]");
  if (!trigger) {
    return;
  }

  const itemId = trigger.dataset.id;
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  if (trigger.dataset.action === "edit") {
    fillItemForm(item);
    return;
  }

  const confirmed = window.confirm(`Delete "${item.label}" from the plan?`);
  if (!confirmed) {
    return;
  }

  state.items = state.items.filter((entry) => entry.id !== itemId);
  persistAndRender();

  if (dom.itemIdInput.value === itemId) {
    resetItemForm();
  }
}

function handleBudgetTableClick(event) {
  const trigger = event.target.closest("button[data-action]");
  if (!trigger) {
    return;
  }

  const budgetId = trigger.dataset.id;
  const budget = state.budgets.find((entry) => entry.id === budgetId);
  if (!budget) {
    return;
  }

  if (trigger.dataset.action === "edit") {
    fillBudgetForm(budget);
    return;
  }

  const confirmed = window.confirm(`Delete the "${budget.category}" budget limit?`);
  if (!confirmed) {
    return;
  }

  state.budgets = state.budgets.filter((entry) => entry.id !== budgetId);
  persistAndRender();

  if (dom.budgetIdInput.value === budgetId) {
    resetBudgetForm();
  }
}

function exportData() {
  const payload = JSON.stringify(serializeState(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `budget-flow-backup-${toIsoDate(new Date()).replaceAll("-", "")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(reader.result);
      state.settings = normalizeSettings(parsed.settings);
      state.items = normalizeItems(parsed.items);
      state.budgets = normalizeBudgets(parsed.budgets);
      persistAndRender();
      resetItemForm();
      resetBudgetForm();
    } catch (error) {
      window.alert("That file could not be imported. Make sure it is valid dashboard JSON.");
    } finally {
      dom.importInput.value = "";
    }
  });

  reader.readAsText(file);
}

function handleClearData() {
  const confirmed = window.confirm("Clear all income, expenses, and budget limits from this dashboard?");
  if (!confirmed) {
    return;
  }

  const emptyState = createEmptyState();
  state.settings = emptyState.settings;
  state.items = emptyState.items;
  state.budgets = emptyState.budgets;
  persistAndRender();
  resetItemForm();
  resetBudgetForm();
}

function renderApp() {
  syncForms();
  renderOverview();
  renderForecast();
  renderUpcoming();
  renderBudgetProgress();
  renderItemTable();
  renderBudgetTable();
  renderCategoryOptions();
}

function syncForms() {
  dom.currentBalanceInput.value = state.settings.currentBalance;
  dom.safetyBufferInput.value = state.settings.safetyBuffer;
  dom.forecastDaysInput.value = String(state.settings.forecastDays);
}

function renderOverview() {
  const today = startOfDay(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthOccurrences = getOccurrencesBetween(monthStart, monthEnd);
  const futureMonthOccurrences = monthOccurrences.filter((occurrence) => parseDate(occurrence.date) >= today);
  const monthlyIncome = sumOccurrences(monthOccurrences, "income");
  const monthlyExpenses = sumOccurrences(monthOccurrences, "expense");
  const projectedMonthEndBalance = state.settings.currentBalance + sumNetAmounts(futureMonthOccurrences);
  const nextIncome = getUpcomingOccurrences(120).find((occurrence) => occurrence.direction === "income");
  const nextIncomeDate = nextIncome ? parseDate(nextIncome.date) : null;
  const expensesNext14Days = getUpcomingOccurrences(14)
    .filter((occurrence) => occurrence.direction === "expense")
    .reduce((total, occurrence) => total + occurrence.amount, 0);
  const safeBeforeNextIncome = calculateSafeBeforeNextIncome(nextIncomeDate);
  const forecastSummary = getForecastSummary();

  dom.currentBalanceValue.textContent = formatCurrency(state.settings.currentBalance);
  dom.monthlyIncomeValue.textContent = formatCurrency(monthlyIncome);
  dom.monthlyExpenseValue.textContent = formatCurrency(monthlyExpenses);
  dom.projectedEndValue.textContent = formatCurrency(projectedMonthEndBalance);
  dom.safeToSpendValue.textContent = formatCurrency(safeBeforeNextIncome);
  dom.upcomingBillsValue.textContent = formatCurrency(expensesNext14Days);
  dom.nextIncomeNote.textContent = nextIncome
    ? `Next income: ${nextIncome.label} on ${formatDate(parseDate(nextIncome.date), "monthDay")}`
    : "No income event is scheduled inside the forecast range.";
  dom.safeToSpendNote.textContent = nextIncome
    ? `Available before ${formatDate(parseDate(nextIncome.date), "monthDay")} after your buffer.`
    : "No next income found, so this uses the full forecast horizon.";

  dom.riskBanner.classList.remove("tone-safe", "tone-buffer", "tone-danger");
  dom.riskBanner.classList.add(forecastSummary.toneClass);
  dom.riskTitle.textContent = forecastSummary.title;
  dom.riskText.textContent = forecastSummary.text;
  dom.lowestBalanceValue.textContent = formatCurrency(forecastSummary.lowestBalance);
  dom.watchDateValue.textContent = formatDate(forecastSummary.watchDate, "friendly");
}

function renderForecast() {
  const summary = getForecastSummary();
  const { series } = summary;

  dom.forecastDaysLabel.textContent = String(state.settings.forecastDays);
  dom.chartStartBalance.textContent = formatCurrency(state.settings.currentBalance);
  dom.chartEndBalance.textContent = formatCurrency(series[series.length - 1].balance);
  dom.chartBufferBalance.textContent = formatCurrency(state.settings.safetyBuffer);
  dom.forecastChart.innerHTML = buildForecastSvg(series, state.settings.safetyBuffer, summary.lowestPoint);
}

function renderUpcoming() {
  const upcoming = getUpcomingOccurrences(30).slice(0, 8);

  if (!upcoming.length) {
    dom.upcomingList.innerHTML = `<div class="empty-state">No cash events are scheduled yet. Add a paycheck, bill, or one-time expense in the Cash item form.</div>`;
    return;
  }

  dom.upcomingList.innerHTML = upcoming
    .map((occurrence) => {
      const date = parseDate(occurrence.date);
      const badgeClass = occurrence.direction === "income" ? "income" : "expense";
      const amountPrefix = occurrence.direction === "income" ? "+" : "-";

      return `
        <div class="list-item">
          <div>
            <strong class="list-title">${escapeHtml(occurrence.label)}</strong>
            <p class="list-meta">${escapeHtml(occurrence.category)} • ${formatRelativeDate(date)}</p>
            <p class="list-date">${formatDate(date, "friendly")}</p>
          </div>
          <span class="amount-pill ${badgeClass}">${amountPrefix}${formatCurrency(occurrence.amount)}</span>
        </div>
      `;
    })
    .join("");
}

function renderBudgetProgress() {
  const monthSpending = getCurrentMonthCategorySpend();

  if (!state.budgets.length) {
    dom.budgetProgressList.innerHTML = `<div class="empty-state">Add a category limit to track whether groceries, dining, or other spending is drifting too high.</div>`;
    return;
  }

  dom.budgetProgressList.innerHTML = state.budgets
    .slice()
    .sort((left, right) => left.category.localeCompare(right.category))
    .map((budget) => {
      const spent = monthSpending[getCategoryKey(budget.category)] || 0;
      const ratio = budget.limit === 0 ? 0 : spent / budget.limit;
      const percent = Math.min(ratio * 100, 100);
      const remaining = budget.limit - spent;
      const warningClass = ratio >= 0.9 ? "warning" : "";

      return `
        <div class="budget-progress-item">
          <div class="budget-progress-header">
            <strong>${escapeHtml(budget.category)}</strong>
            <strong>${formatCurrency(spent)} / ${formatCurrency(budget.limit)}</strong>
          </div>
          <div class="budget-progress-bar" aria-hidden="true">
            <div class="budget-progress-fill ${warningClass}" style="width: ${percent}%"></div>
          </div>
          <p>${remaining >= 0 ? `${formatCurrency(remaining)} remaining this month.` : `${formatCurrency(Math.abs(remaining))} over the limit this month.`}</p>
        </div>
      `;
    })
    .join("");
}

function renderItemTable() {
  const today = startOfDay(new Date());
  const rows = state.items
    .slice()
    .sort((left, right) => {
      const nextLeft = getNextOccurrence(left, today);
      const nextRight = getNextOccurrence(right, today);
      const leftTime = nextLeft ? parseDate(nextLeft.date).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = nextRight ? parseDate(nextRight.date).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });

  if (!rows.length) {
    dom.itemTableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">Add your first income or expense in the Cash item form. Use the due date for bills and the pay date for income.</div>
        </td>
      </tr>
    `;
    return;
  }

  dom.itemTableBody.innerHTML = rows
    .map((item) => {
      const nextOccurrence = getNextOccurrence(item, today);
      const amountClass = item.direction === "income" ? "positive" : "negative";
      const amountPrefix = item.direction === "income" ? "+" : "-";

      return `
        <tr>
          <td>
            <strong>${escapeHtml(item.label)}</strong>
            <span class="row-subtitle">${item.notes ? escapeHtml(item.notes) : capitalize(item.direction)}</span>
          </td>
          <td>${escapeHtml(item.category)}</td>
          <td>${formatSchedule(item.schedule)}</td>
          <td>${nextOccurrence ? formatDate(parseDate(nextOccurrence.date), "friendly") : "No future date"}</td>
          <td class="${amountClass}">${amountPrefix}${formatCurrency(item.amount)}</td>
          <td>
            <div class="table-actions">
              <button class="text-button" data-action="edit" data-id="${item.id}" type="button">Edit</button>
              <button class="text-button delete-button" data-action="delete" data-id="${item.id}" type="button">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderBudgetTable() {
  const monthSpending = getCurrentMonthCategorySpend();

  if (!state.budgets.length) {
    dom.budgetTableBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">Category limits show how much room you have left before the month gets tight.</div>
        </td>
      </tr>
    `;
    return;
  }

  dom.budgetTableBody.innerHTML = state.budgets
    .slice()
    .sort((left, right) => left.category.localeCompare(right.category))
    .map((budget) => {
      const spent = monthSpending[getCategoryKey(budget.category)] || 0;
      const remaining = budget.limit - spent;

      return `
        <tr>
          <td>${escapeHtml(budget.category)}</td>
          <td>${formatCurrency(budget.limit)}</td>
          <td>${formatCurrency(spent)}</td>
          <td class="${remaining >= 0 ? "positive" : "negative"}">${formatCurrency(remaining)}</td>
          <td>
            <div class="table-actions">
              <button class="text-button" data-action="edit" data-id="${budget.id}" type="button">Edit</button>
              <button class="text-button delete-button" data-action="delete" data-id="${budget.id}" type="button">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderCategoryOptions() {
  const categories = new Set();
  state.items.forEach((item) => categories.add(item.category));
  state.budgets.forEach((budget) => categories.add(budget.category));

  dom.categoryOptions.innerHTML = Array.from(categories)
    .sort((left, right) => left.localeCompare(right))
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join("");
}

function fillItemForm(item) {
  dom.itemFormTitle.textContent = `Edit ${item.label}`;
  dom.itemIdInput.value = item.id;
  dom.directionInput.value = item.direction;
  dom.labelInput.value = item.label;
  dom.amountInput.value = item.amount;
  dom.categoryInput.value = item.category;
  dom.scheduleInput.value = item.schedule;
  dom.startDateInput.value = item.startDate;
  dom.notesInput.value = item.notes || "";
  dom.cancelEditButton.hidden = false;
  updateScheduleLabel();
  dom.itemForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetItemForm() {
  dom.itemForm.reset();
  dom.itemFormTitle.textContent = "Add income, bills, or a one-time expense";
  dom.itemIdInput.value = "";
  dom.directionInput.value = "income";
  dom.scheduleInput.value = "once";
  dom.startDateInput.value = toIsoDate(new Date());
  dom.cancelEditButton.hidden = true;
  updateScheduleLabel();
}

function fillBudgetForm(budget) {
  dom.budgetIdInput.value = budget.id;
  dom.budgetCategoryInput.value = budget.category;
  dom.budgetLimitInput.value = budget.limit;
  dom.cancelBudgetEditButton.hidden = false;
  dom.budgetForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetBudgetForm() {
  dom.budgetForm.reset();
  dom.budgetIdInput.value = "";
  dom.cancelBudgetEditButton.hidden = true;
}

function updateScheduleLabel() {
  const isIncome = dom.directionInput.value === "income";
  const isOneTime = dom.scheduleInput.value === "once";

  if (isIncome && isOneTime) {
    dom.startDateLabel.textContent = "Pay date";
    return;
  }

  if (isIncome) {
    dom.startDateLabel.textContent = "First pay date";
    return;
  }

  dom.startDateLabel.textContent = isOneTime ? "Due date" : "First due date";
}

function persistAndRender() {
  renderApp();
  scheduleSave();
}

function scheduleSave() {
  updateStorageStatus("saving");

  if (saveTimerId) {
    window.clearTimeout(saveTimerId);
  }

  saveTimerId = window.setTimeout(() => {
    const snapshot = serializeState();

    activeSavePromise = activeSavePromise
      .catch(() => {})
      .then(() => saveState(snapshot))
      .then((savedState) => {
        applyState(savedState);
        renderApp();
        updateStorageStatus("ready");
      })
      .catch((error) => {
        console.error(error);
        updateStorageStatus("error");
      });
  }, 180);
}

function createEmptyState() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    items: [],
    budgets: []
  };
}

function getForecastSummary() {
  const today = startOfDay(new Date());
  const endDate = addDays(today, state.settings.forecastDays);
  const changesByDate = new Map();
  const occurrences = getOccurrencesBetween(today, endDate);

  occurrences.forEach((occurrence) => {
    changesByDate.set(occurrence.date, (changesByDate.get(occurrence.date) || 0) + occurrence.netAmount);
  });

  const series = [];
  let balance = state.settings.currentBalance;
  let lowestPoint = { date: today, balance };

  for (let index = 0; index <= state.settings.forecastDays; index += 1) {
    const date = addDays(today, index);
    const isoDate = toIsoDate(date);
    balance += changesByDate.get(isoDate) || 0;

    const point = {
      date,
      isoDate,
      balance,
      delta: changesByDate.get(isoDate) || 0
    };

    series.push(point);

    if (point.balance < lowestPoint.balance) {
      lowestPoint = point;
    }
  }

  const firstNegative = series.find((point) => point.balance < 0);
  const firstBufferHit = series.find((point) => point.balance < state.settings.safetyBuffer);
  const neededToProtectBuffer = Math.max(0, state.settings.safetyBuffer - lowestPoint.balance);

  if (firstNegative) {
    return {
      series,
      lowestPoint,
      lowestBalance: lowestPoint.balance,
      watchDate: firstNegative.date,
      toneClass: "tone-danger",
      title: `Shortfall likely by ${formatDate(firstNegative.date, "monthDay")}.`,
      text: `Your balance drops below zero inside the forecast window. Closing that gap and keeping your ${formatCurrency(state.settings.safetyBuffer)} buffer would take about ${formatCurrency(neededToProtectBuffer)}.`
    };
  }

  if (firstBufferHit) {
    return {
      series,
      lowestPoint,
      lowestBalance: lowestPoint.balance,
      watchDate: firstBufferHit.date,
      toneClass: "tone-buffer",
      title: `Cash gets tight around ${formatDate(firstBufferHit.date, "monthDay")}.`,
      text: `You stay positive, but the plan dips under your safety buffer. Trimming or moving about ${formatCurrency(neededToProtectBuffer)} would restore breathing room.`
    };
  }

  return {
    series,
    lowestPoint,
    lowestBalance: lowestPoint.balance,
    watchDate: lowestPoint.date,
    toneClass: "tone-safe",
    title: "You stay above your buffer.",
    text: `The lowest projected balance is ${formatCurrency(lowestPoint.balance)}, so the current plan keeps a cushion through the next ${state.settings.forecastDays} days.`
  };
}

function buildForecastSvg(series, safetyBuffer, lowestPoint) {
  if (!series.length) {
    return `<div class="empty-state">Add at least one item to generate a forecast.</div>`;
  }

  const width = 820;
  const height = 320;
  const leftPad = 48;
  const rightPad = 32;
  const topPad = 26;
  const bottomPad = 42;
  const balances = series.map((point) => point.balance).concat([safetyBuffer, 0]);
  let minBalance = Math.min(...balances);
  let maxBalance = Math.max(...balances);

  if (minBalance === maxBalance) {
    minBalance -= 100;
    maxBalance += 100;
  }

  const xScale = (index) => {
    const usableWidth = width - leftPad - rightPad;
    return leftPad + (usableWidth * index) / Math.max(1, series.length - 1);
  };

  const yScale = (value) => {
    const usableHeight = height - topPad - bottomPad;
    return topPad + ((maxBalance - value) / (maxBalance - minBalance)) * usableHeight;
  };

  const linePoints = series.map((point, index) => `${xScale(index)},${yScale(point.balance)}`).join(" ");
  const areaPath = [
    `M ${xScale(0)} ${height - bottomPad}`,
    ...series.map((point, index) => `L ${xScale(index)} ${yScale(point.balance)}`),
    `L ${xScale(series.length - 1)} ${height - bottomPad}`,
    "Z"
  ].join(" ");
  const markerIndex = series.findIndex((point) => point.isoDate === toIsoDate(lowestPoint.date));
  const markerX = xScale(markerIndex);
  const markerY = yScale(lowestPoint.balance);
  const bufferY = yScale(safetyBuffer);
  const zeroY = yScale(0);
  const gridLines = [0.2, 0.5, 0.8]
    .map((ratio) => topPad + (height - topPad - bottomPad) * ratio)
    .map((y) => `<line class="chart-grid-line" x1="${leftPad}" y1="${y}" x2="${width - rightPad}" y2="${y}"></line>`)
    .join("");

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Forecast chart">
      <defs>
        <linearGradient id="forecastArea" x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="rgba(29, 106, 74, 0.36)"></stop>
          <stop offset="100%" stop-color="rgba(29, 106, 74, 0.02)"></stop>
        </linearGradient>
      </defs>
      ${gridLines}
      <line class="chart-buffer-line" x1="${leftPad}" y1="${bufferY}" x2="${width - rightPad}" y2="${bufferY}"></line>
      <line class="chart-zero-line" x1="${leftPad}" y1="${zeroY}" x2="${width - rightPad}" y2="${zeroY}"></line>
      <path class="chart-area" d="${areaPath}"></path>
      <polyline class="chart-line" points="${linePoints}"></polyline>
      <circle class="chart-point" cx="${markerX}" cy="${markerY}" r="6"></circle>
      <text class="chart-marker-label" x="${Math.min(markerX + 12, width - 200)}" y="${Math.max(markerY - 12, 24)}">Low ${formatCurrency(lowestPoint.balance)}</text>
      <text class="chart-axis-label" x="${leftPad}" y="${height - 14}">${formatDate(series[0].date, "monthDay")}</text>
      <text class="chart-axis-label" x="${width - rightPad - 70}" y="${height - 14}">${formatDate(series[series.length - 1].date, "monthDay")}</text>
      <text class="chart-axis-label" x="${leftPad}" y="${Math.max(bufferY - 10, 18)}">Buffer ${formatCurrency(safetyBuffer)}</text>
      <text class="chart-axis-label" x="${leftPad}" y="${Math.max(zeroY - 10, 18)}">Zero</text>
    </svg>
  `;
}

function getOccurrencesBetween(startDate, endDate) {
  return state.items
    .flatMap((item) => expandOccurrences(item, startDate, endDate))
    .sort((left, right) => parseDate(left.date) - parseDate(right.date));
}

function getUpcomingOccurrences(days) {
  const today = startOfDay(new Date());
  return getOccurrencesBetween(today, addDays(today, days));
}

function expandOccurrences(item, rangeStart, rangeEnd) {
  const startDate = parseDate(item.startDate);
  const occurrences = [];

  if (item.schedule === "once") {
    if (startDate >= rangeStart && startDate <= rangeEnd) {
      occurrences.push(createOccurrence(item, startDate));
    }
    return occurrences;
  }

  let cursor = startDate;
  let guard = 0;

  while (cursor < rangeStart && guard < 1000) {
    cursor = advanceDate(cursor, item.schedule);
    guard += 1;
  }

  while (cursor && cursor <= rangeEnd && guard < 1000) {
    if (cursor >= rangeStart) {
      occurrences.push(createOccurrence(item, cursor));
    }
    cursor = advanceDate(cursor, item.schedule);
    guard += 1;
  }

  return occurrences;
}

function createOccurrence(item, date) {
  const amount = sanitizeMoney(item.amount);
  return {
    itemId: item.id,
    label: item.label,
    category: item.category,
    direction: item.direction,
    amount,
    date: toIsoDate(date),
    netAmount: item.direction === "income" ? amount : -amount
  };
}

function getNextOccurrence(item, onOrAfter) {
  return expandOccurrences(item, onOrAfter, addDays(onOrAfter, 400))[0] || null;
}

function calculateSafeBeforeNextIncome(nextIncomeDate) {
  const today = startOfDay(new Date());
  const rangeEnd = nextIncomeDate ? addDays(nextIncomeDate, -1) : addDays(today, state.settings.forecastDays);
  const occurrences = getOccurrencesBetween(today, rangeEnd);
  const projectedBalanceBeforeIncome = state.settings.currentBalance + sumNetAmounts(occurrences);
  return projectedBalanceBeforeIncome - state.settings.safetyBuffer;
}

function getCurrentMonthCategorySpend() {
  const today = startOfDay(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const occurrences = getOccurrencesBetween(monthStart, monthEnd).filter(
    (occurrence) => occurrence.direction === "expense"
  );

  return occurrences.reduce((totals, occurrence) => {
    const key = getCategoryKey(occurrence.category);
    totals[key] = (totals[key] || 0) + occurrence.amount;
    return totals;
  }, {});
}

function sumOccurrences(occurrences, direction) {
  return occurrences
    .filter((occurrence) => occurrence.direction === direction)
    .reduce((total, occurrence) => total + occurrence.amount, 0);
}

function sumNetAmounts(occurrences) {
  return occurrences.reduce((total, occurrence) => total + occurrence.netAmount, 0);
}

function advanceDate(date, schedule) {
  switch (schedule) {
    case "weekly":
      return addDays(date, 7);
    case "biweekly":
      return addDays(date, 14);
    case "monthly":
      return addMonthsClamped(date, 1);
    case "quarterly":
      return addMonthsClamped(date, 3);
    case "yearly":
      return addMonthsClamped(date, 12);
    default:
      return null;
  }
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return startOfDay(next);
}

function addMonthsClamped(date, amount) {
  const year = date.getFullYear();
  const month = date.getMonth() + amount;
  const day = date.getDate();
  const firstOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate();
  return startOfDay(new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), Math.min(day, lastDayOfMonth)));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function sanitizeMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatDate(date, style) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "-";
  }

  if (style === "monthDay") {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatRelativeDate(date) {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diff === 0) {
    return "Today";
  }
  if (diff === 1) {
    return "Tomorrow";
  }
  if (diff > 1) {
    return `In ${diff} days`;
  }
  if (diff === -1) {
    return "Yesterday";
  }
  return `${Math.abs(diff)} days ago`;
}

function formatSchedule(schedule) {
  switch (schedule) {
    case "once":
      return "One time";
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Biweekly";
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "yearly":
      return "Yearly";
    default:
      return capitalize(schedule);
  }
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getCategoryKey(category) {
  return category.trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function saveState(snapshot) {
  if (!USE_REMOTE_STORAGE) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return snapshot;
  }

  const response = await fetch(API_ENDPOINT, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(snapshot)
  });

  if (!response.ok) {
    throw new Error(`Save failed with status ${response.status}`);
  }

  return normalizeStatePayload(await response.json());
}

async function loadState() {
  if (!USE_REMOTE_STORAGE) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return createEmptyState();
      }

      const parsed = JSON.parse(raw);
      if (looksLikeLegacySample(parsed)) {
        return createEmptyState();
      }

      return normalizeStatePayload(parsed);
    } catch (error) {
      return createEmptyState();
    }
  }

  const response = await fetch(API_ENDPOINT, {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Load failed with status ${response.status}`);
  }

  return normalizeStatePayload(await response.json());
}

function serializeState() {
  return normalizeStatePayload(state);
}

function normalizeStatePayload(payload) {
  return {
    settings: normalizeSettings(payload?.settings),
    items: normalizeItems(payload?.items),
    budgets: normalizeBudgets(payload?.budgets)
  };
}

function normalizeSettings(settings) {
  return {
    currentBalance: sanitizeMoney(settings?.currentBalance ?? DEFAULT_SETTINGS.currentBalance),
    safetyBuffer: sanitizeMoney(settings?.safetyBuffer ?? DEFAULT_SETTINGS.safetyBuffer),
    forecastDays: [30, 60, 90, 120].includes(Number(settings?.forecastDays))
      ? Number(settings.forecastDays)
      : DEFAULT_SETTINGS.forecastDays
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      id: item.id || createId("item"),
      direction: item.direction === "expense" ? "expense" : "income",
      label: String(item.label || "").trim(),
      amount: sanitizeMoney(item.amount),
      category: String(item.category || "").trim() || "General",
      schedule: normalizeSchedule(item.schedule),
      startDate: isValidIsoDate(item.startDate) ? item.startDate : toIsoDate(new Date()),
      notes: String(item.notes || "").trim()
    }))
    .filter((item) => item.label);
}

function normalizeBudgets(budgets) {
  if (!Array.isArray(budgets)) {
    return [];
  }

  return budgets
    .map((budget) => ({
      id: budget.id || createId("budget"),
      category: String(budget.category || "").trim(),
      limit: sanitizeMoney(budget.limit)
    }))
    .filter((budget) => budget.category);
}

function normalizeSchedule(schedule) {
  const allowed = ["once", "weekly", "biweekly", "monthly", "quarterly", "yearly"];
  return allowed.includes(schedule) ? schedule : "once";
}

function isValidIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function looksLikeLegacySample(parsed) {
  const itemIds = Array.isArray(parsed?.items) ? parsed.items.map((item) => item?.id).sort() : [];
  const budgetIds = Array.isArray(parsed?.budgets) ? parsed.budgets.map((budget) => budget?.id).sort() : [];

  return (
    sanitizeMoney(parsed?.settings?.currentBalance) === 2840 &&
    sanitizeMoney(parsed?.settings?.safetyBuffer) === 600 &&
    Number(parsed?.settings?.forecastDays) === 60 &&
    JSON.stringify(itemIds) === JSON.stringify([...LEGACY_SAMPLE_ITEM_IDS].sort()) &&
    JSON.stringify(budgetIds) === JSON.stringify([...LEGACY_SAMPLE_BUDGET_IDS].sort())
  );
}
