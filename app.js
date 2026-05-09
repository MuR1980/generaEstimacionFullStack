const DATA_URL = "estimaciones.json";
const HOURS_PER_DAY = 8;
const PHASES = [
  { key: "diseno", label: "Diseno", ratio: 0.35 },
  { key: "documentacion", label: "Documentacion", ratio: 0.15 },
  { key: "pruebasUnitarias", label: "Pruebas Unitarias", ratio: 0.3 },
  { key: "release", label: "Release", ratio: 0.2 },
];
const byId = (id) => document.getElementById(id);

let data = {
  complexities: {},
  sources: [],
  systems: [],
};
let rows = [];
let rowState = new Map();
let cartItems = [];
let cartSequence = 1;
let activeMaintainerSystem = 0;
let jsonFileHandle = null;
let densityMode = localStorage.getItem("densityMode") || "compact";
let themeMode = localStorage.getItem("themeMode") || "default";
let activeView = "catalog";
let artifactDialogMode = "add";
let editingArtifactIndex = null;
let systemDialogMode = "add";
let editingSystemIndex = null;
let pendingConfirmAction = null;
let hasUnsavedChanges = false;

const elements = {
  brandHome: byId("brandHome"),
  estimateTab: byId("estimateTab"),
  cartTab: byId("cartTab"),
  cartBadge: byId("cartBadge"),
  reportTab: byId("reportTab"),
  maintainerTab: byId("maintainerTab"),
  exportCsv: byId("exportCsv"),
  exportExcel: byId("exportExcel"),
  visualMenu: byId("visualMenu"),
  themeSelect: byId("themeSelect"),
  densitySelect: byId("densitySelect"),
  statusBar: byId("statusBar"),
  catalogViews: [...document.querySelectorAll(".catalog-view")],
  cartViews: [...document.querySelectorAll(".cart-view")],
  reportView: byId("reportView"),
  maintainerView: byId("maintainerView"),
  totalDays: byId("totalDays"),
  baseDays: byId("baseDays"),
  contingencyDays: byId("contingencyDays"),
  selectedCount: byId("selectedCount"),
  systemCount: byId("systemCount"),
  contingency: byId("contingency"),
  contingencyValue: byId("contingencyValue"),
  contingencyExtraInline: byId("contingencyExtraInline"),
  moduleSystemSelect: byId("moduleSystemSelect"),
  moduleSelect: byId("moduleSelect"),
  addComplexity: byId("addComplexity"),
  addQuantity: byId("addQuantity"),
  addPreviewDays: byId("addPreviewDays"),
  addToCart: byId("addToCart"),
  clearCart: byId("clearCart"),
  systemFilter: byId("systemFilter"),
  searchInput: byId("searchInput"),
  artifactRows: byId("artifactRows"),
  visibleCount: byId("visibleCount"),
  reportSystemFilter: byId("reportSystemFilter"),
  reportExport: byId("reportExport"),
  reportCopy: byId("reportCopy"),
  reportRows: byId("reportRows"),
  reportCount: byId("reportCount"),
  cartItems: byId("cartItems"),
  emptyState: byId("emptyState"),
  phaseTotals: byId("phaseTotals"),
  sources: byId("sources"),
  maintSystemSelect: byId("maintSystemSelect"),
  maintainerSearch: byId("maintainerSearch"),
  maintArtifacts: byId("maintArtifacts"),
  addSystem: byId("addSystem"),
  editSystem: byId("editSystem"),
  deleteSystem: byId("deleteSystem"),
  addArtifact: byId("addArtifact"),
  unsavedIndicator: byId("unsavedIndicator"),
  systemDialog: byId("systemDialog"),
  systemDialogTitle: byId("systemDialogTitle"),
  systemDialogName: byId("systemDialogName"),
  systemDialogDescription: byId("systemDialogDescription"),
  systemDialogError: byId("systemDialogError"),
  systemDialogCancel: byId("systemDialogCancel"),
  systemDialogSave: byId("systemDialogSave"),
  artifactDialog: byId("artifactDialog"),
  artifactDialogTitle: byId("artifactDialogTitle"),
  artifactDialogName: byId("artifactDialogName"),
  artifactDialogNote: byId("artifactDialogNote"),
  artifactDialogBajo: byId("artifactDialogBajo"),
  artifactDialogMedio: byId("artifactDialogMedio"),
  artifactDialogAlto: byId("artifactDialogAlto"),
  artifactDialogExtraAlto: byId("artifactDialogExtraAlto"),
  artifactDialogError: byId("artifactDialogError"),
  artifactDialogCancel: byId("artifactDialogCancel"),
  artifactDialogSave: byId("artifactDialogSave"),
  confirmDialog: byId("confirmDialog"),
  confirmDialogTitle: byId("confirmDialogTitle"),
  confirmDialogMessage: byId("confirmDialogMessage"),
  confirmDialogCancel: byId("confirmDialogCancel"),
  confirmDialogAccept: byId("confirmDialogAccept"),
  saveJson: byId("saveJson"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDays(value) {
  return new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatHours(value) {
  return new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatInputDays(value) {
  return Number(value.toFixed(2));
}

const alphaCollator = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});

function compareText(left, right) {
  return alphaCollator.compare(String(left || ""), String(right || ""));
}

function sortedSystems() {
  return data.systems
    .map((system, index) => ({ system, index }))
    .sort((left, right) => compareText(left.system.name, right.system.name));
}

function sortedArtifacts(system) {
  return (system?.artifacts || [])
    .map((artifact, index) => ({ artifact, index }))
    .sort((left, right) => compareText(left.artifact.name, right.artifact.name));
}

function sortedRows(nextRows) {
  return [...nextRows].sort((left, right) => {
    const systemOrder = compareText(left.system, right.system);
    if (systemOrder !== 0) return systemOrder;
    return compareText(left.name, right.name);
  });
}

function showStatus(message, type = "") {
  elements.statusBar.hidden = false;
  elements.statusBar.className = `status-bar ${type ? `is-${type}` : ""}`.trim();
  elements.statusBar.textContent = message;
}

function clearStatus() {
  elements.statusBar.hidden = true;
  elements.statusBar.textContent = "";
}

function setDataDirty(isDirty) {
  hasUnsavedChanges = isDirty;
  elements.unsavedIndicator.hidden = !isDirty;
  elements.saveJson.classList.toggle("has-pending-changes", isDirty);
}

function markDataDirty() {
  setDataDirty(true);
}

function warnUnsavedChanges(event) {
  if (!hasUnsavedChanges) return;
  event.preventDefault();
  event.returnValue = "";
}

function refreshIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons({
      attrs: {
        "aria-hidden": "true",
        "stroke-width": 2,
      },
    });
  }
}

function setTemporaryButtonLabel(button, label) {
  const labelElement = button.querySelector("span:last-child") || button;
  const previousLabel = labelElement.textContent;
  labelElement.textContent = label;
  window.setTimeout(() => {
    labelElement.textContent = previousLabel;
  }, 1400);
}

function pulseElement(element) {
  element.classList.remove("is-pulsing");
  void element.offsetWidth;
  element.classList.add("is-pulsing");
}

function applyDensityMode() {
  const isComfortable = densityMode === "comfortable";
  const isUltra = densityMode === "ultra";
  const normalizedDensity = ["compact", "comfortable", "ultra"].includes(densityMode) ? densityMode : "compact";
  densityMode = normalizedDensity;
  document.documentElement.dataset.density = normalizedDensity;
  document.body.classList.toggle("density-compact", !isComfortable && !isUltra);
  document.body.classList.toggle("density-comfortable", isComfortable);
  document.body.classList.toggle("density-ultra", isUltra);
  elements.densitySelect.value = normalizedDensity;
}

function setDensityMode(nextMode) {
  densityMode = nextMode;
  localStorage.setItem("densityMode", densityMode);
  applyDensityMode();
}

function applyThemeMode() {
  const useSystemDark = themeMode === "default" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = themeMode;
  document.documentElement.dataset.resolvedTheme = themeMode === "default" ? (useSystemDark ? "dark" : "light") : themeMode;
  document.body.classList.toggle("theme-light", themeMode === "light");
  document.body.classList.toggle("theme-dark", themeMode === "dark" || useSystemDark);
  elements.themeSelect.value = themeMode;
}

function setThemeMode(nextMode) {
  themeMode = nextMode;
  localStorage.setItem("themeMode", themeMode);
  applyThemeMode();
}

function closeVisualMenu() {
  elements.visualMenu.open = false;
}

function serializeData() {
  normalizeData();
  return `${JSON.stringify(data, null, 2)}\n`;
}

async function writeTextFile(fileHandle, content) {
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function loadData() {
  try {
    if (window.location.protocol === "file:") {
      applyData(emptyData());
      showStatus("Abre la app desde un servidor local para cargar estimaciones.json automaticamente.", "error");
      return;
    }

    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`No se pudo cargar ${DATA_URL} (${response.status})`);
    applyData(await response.json());
    clearStatus();
  } catch (error) {
    applyData(emptyData());
    showStatus(`${error.message}. Revisa que estimaciones.json exista junto a index.html.`, "error");
  }
}

function emptyData() {
  return {
    complexities: {
      bajo: "Bajo",
      medio: "Medio",
      alto: "Alto",
      extraAlto: "Extra alto",
    },
    sources: [],
    systems: [],
  };
}

function applyData(nextData) {
  data = nextData;
  normalizeData();
  activeMaintainerSystem = data.systems.length > 0 ? sortedSystems()[0].index : 0;
  rebuildRows();
  cartItems = cartItems.filter((item) => getRowById(item.rowId));
  renderAll();
  setDataDirty(false);
}

function isProtectedArtifact(artifact) {
  return artifact.custom !== true;
}

function systemHasProtectedArtifacts(system) {
  return system.artifacts.some((artifact) => isProtectedArtifact(artifact));
}

function normalizeData() {
  const numberOrDefault = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  };

  data.complexities ||= {
    bajo: "Bajo",
    medio: "Medio",
    alto: "Alto",
    extraAlto: "Extra alto",
  };
  data.sources ||= [];
  data.systems ||= [];

  data.systems.forEach((system) => {
    system.name ||= "NUEVO";
    system.description ||= "";
    system.artifacts ||= [];
    system.artifacts.forEach((artifact) => {
      artifact.name ||= "Nuevo artefacto";
      artifact.note ||= "";
      artifact.days ||= {};
      artifact.days.bajo = numberOrDefault(artifact.days.bajo, 1);
      artifact.days.medio = numberOrDefault(artifact.days.medio, artifact.days.bajo);
      artifact.days.alto = numberOrDefault(artifact.days.alto, artifact.days.medio);
      artifact.days.extraAlto = numberOrDefault(artifact.days.extraAlto, artifact.days.alto);
    });
  });
}

function rebuildRows() {
  const previousState = rowState;
  rows = data.systems.flatMap((system, systemIndex) =>
    system.artifacts.map((artifact, artifactIndex) => {
      const id = `${systemIndex}-${artifactIndex}`;
      return {
        id,
        systemIndex,
        artifactIndex,
        system: system.name,
        systemDescription: system.description,
        ...artifact,
      };
    }),
  );

  rowState = new Map(
    rows.map((row) => [
      row.id,
      previousState.get(row.id) || {
        complexity: "bajo",
        quantity: 1,
      },
    ]),
  );
}

function getRowById(rowId) {
  return rows.find((row) => row.id === rowId);
}

function getVisibleRows() {
  const system = elements.systemFilter.value;
  const query = elements.searchInput.value.trim().toLowerCase();

  return sortedRows(
    rows.filter((row) => {
      const systemMatch = system === "todos" || row.system === system;
      const queryMatch =
        !query ||
        `${row.system} ${row.systemDescription} ${row.name} ${row.note}`
          .toLowerCase()
          .includes(query);

      return systemMatch && queryMatch;
    }),
  );
}

function itemBaseDays(item) {
  const row = getRowById(item.rowId);
  if (!row) return 0;
  return row.days[item.complexity] * item.quantity;
}

function defaultPhaseValues(days) {
  let assignedDays = 0;
  return Object.fromEntries(
    PHASES.map((phase, index) => {
      const isLastPhase = index === PHASES.length - 1;
      const phaseDays = isLastPhase ? Math.max(0, days - assignedDays) : days * phase.ratio;
      const roundedDays = formatInputDays(phaseDays);
      assignedDays += roundedDays;
      return [phase.key, roundedDays];
    }),
  );
}

function resetItemPhases(item) {
  item.phases = defaultPhaseValues(itemBaseDays(item));
}

function ensureItemPhases(item) {
  if (!item.phases) resetItemPhases(item);
  PHASES.forEach((phase) => {
    const value = Number(item.phases[phase.key]);
    if (!Number.isFinite(value) || value < 0) {
      item.phases[phase.key] = formatInputDays(itemBaseDays(item) * phase.ratio);
      return;
    }
    item.phases[phase.key] = formatInputDays(value);
  });
}

function itemPhaseBreakdown(item) {
  ensureItemPhases(item);
  return PHASES.map((phase) => ({
    ...phase,
    days: item.phases[phase.key],
    hours: item.phases[phase.key] * HOURS_PER_DAY,
  }));
}

function sumPhaseDays(phases) {
  return phases.reduce((total, phase) => total + phase.days, 0);
}

function itemPhaseDays(item) {
  return sumPhaseDays(itemPhaseBreakdown(item));
}

function itemEffortDays(item) {
  return itemBaseDays(item) + itemPhaseDays(item);
}

function totalMatrixDays() {
  return cartItems.reduce((total, item) => total + itemBaseDays(item), 0);
}

function totalPhaseBreakdown() {
  return PHASES.map((phase) => ({
    ...phase,
    days: cartItems.reduce((total, item) => {
      ensureItemPhases(item);
      return total + item.phases[phase.key];
    }, 0),
  })).map((phase) => ({
    ...phase,
    hours: phase.days * HOURS_PER_DAY,
  }));
}

function totalBaseDays() {
  return cartItems.reduce((total, item) => total + itemEffortDays(item), 0);
}

function totalDaysWithContingency(days = totalBaseDays()) {
  const contingency = Number(elements.contingency.value) / 100;
  return days * (1 + contingency);
}

function syncCartPhasesFromDom() {
  elements.cartItems.querySelectorAll("[data-cart-id]").forEach((card) => {
    const item = cartItems.find((cartItem) => cartItem.id === card.dataset.cartId);
    if (!item) return;
    ensureItemPhases(item);
    card.querySelectorAll('[data-cart-action="phase"]').forEach((input) => {
      item.phases[input.dataset.phaseKey] = formatInputDays(Math.max(0, Number(input.value) || 0));
    });
  });
}

function blankSystem() {
  return {
    name: "",
    description: "",
    artifacts: [],
  };
}

function systemDialogValue() {
  return {
    name: elements.systemDialogName.value.trim().toUpperCase(),
    description: elements.systemDialogDescription.value.trim(),
    artifacts: [],
  };
}

function systemValidationMessages(system, systemIndex = null) {
  const messages = [];
  if (!system.name) messages.push("Falta codigo del sistema.");
  const duplicatedSystem = data.systems.some(
    (candidate, index) => index !== systemIndex && candidate.name?.trim().toUpperCase() === system.name,
  );
  if (duplicatedSystem) messages.push("Ya existe un sistema con ese codigo.");
  return messages;
}

function fillSystemDialog(system) {
  elements.systemDialogName.value = system.name || "";
  elements.systemDialogDescription.value = system.description || "";
  elements.systemDialogError.textContent = "";
}

function openSystemDialog(mode, systemIndex = null) {
  systemDialogMode = mode;
  editingSystemIndex = systemIndex;
  const system = mode === "edit" ? data.systems[systemIndex] : blankSystem();
  if (!system) return;

  elements.systemDialogTitle.textContent = mode === "edit" ? "Editar sistema" : "Agregar sistema";
  elements.systemDialogSave.querySelector("span").textContent = mode === "edit" ? "Guardar" : "Agregar";
  fillSystemDialog(system);

  if (elements.systemDialog.showModal) {
    elements.systemDialog.showModal();
  } else {
    elements.systemDialog.hidden = false;
  }

  elements.systemDialogName.focus();
}

function closeSystemDialog() {
  if (elements.systemDialog.open) {
    elements.systemDialog.close();
  } else {
    elements.systemDialog.hidden = true;
  }
  editingSystemIndex = null;
  elements.systemDialogError.textContent = "";
}

function saveSystemDialog() {
  const nextSystem = systemDialogValue();
  const currentSystem = systemDialogMode === "edit" ? data.systems[editingSystemIndex] : null;
  const systemIndex = systemDialogMode === "edit" ? editingSystemIndex : null;
  const messages = systemValidationMessages(nextSystem, systemIndex);
  if (messages.length > 0) {
    elements.systemDialogError.textContent = messages.join(" ");
    return;
  }

  if (systemDialogMode === "edit" && currentSystem) {
    currentSystem.name = nextSystem.name;
    currentSystem.description = nextSystem.description;
  } else {
    data.systems.push(nextSystem);
    activeMaintainerSystem = data.systems.length - 1;
  }

  rebuildRows();
  renderAll();
  switchView("maintainer");
  closeSystemDialog();
  markDataDirty();
  showStatus(
    systemDialogMode === "edit"
      ? `Sistema ${nextSystem.name} actualizado. Recuerda guardar el JSON.`
      : `Sistema ${nextSystem.name} agregado. Recuerda guardar el JSON.`,
    "ok",
  );
}

function blankArtifact() {
  return {
    name: "",
    note: "",
    custom: true,
    days: {
      bajo: 1,
      medio: 2,
      alto: 4,
      extraAlto: 8,
    },
  };
}

function dialogArtifactValue(custom = true) {
  return {
    name: elements.artifactDialogName.value.trim(),
    note: elements.artifactDialogNote.value.trim(),
    custom,
    days: {
      bajo: Math.max(0, Number(elements.artifactDialogBajo.value) || 0),
      medio: Math.max(0, Number(elements.artifactDialogMedio.value) || 0),
      alto: Math.max(0, Number(elements.artifactDialogAlto.value) || 0),
      extraAlto: Math.max(0, Number(elements.artifactDialogExtraAlto.value) || 0),
    },
  };
}

function fillArtifactDialog(artifact) {
  elements.artifactDialogName.value = artifact.name || "";
  elements.artifactDialogNote.value = artifact.note || "";
  elements.artifactDialogBajo.value = artifact.days?.bajo ?? 1;
  elements.artifactDialogMedio.value = artifact.days?.medio ?? 2;
  elements.artifactDialogAlto.value = artifact.days?.alto ?? 4;
  elements.artifactDialogExtraAlto.value = artifact.days?.extraAlto ?? 8;
  elements.artifactDialogError.textContent = "";
}

function openArtifactDialog(mode, artifactIndex = null) {
  const system = data.systems[activeMaintainerSystem];
  if (!system) return;

  artifactDialogMode = mode;
  editingArtifactIndex = artifactIndex;
  const artifact = mode === "edit" ? system.artifacts[artifactIndex] : blankArtifact();
  if (!artifact) return;

  elements.artifactDialogTitle.textContent = mode === "edit" ? "Editar modulo" : "Agregar modulo";
  elements.artifactDialogSave.querySelector("span").textContent = mode === "edit" ? "Guardar" : "Agregar";
  fillArtifactDialog(artifact);

  if (elements.artifactDialog.showModal) {
    elements.artifactDialog.showModal();
  } else {
    elements.artifactDialog.hidden = false;
  }

  elements.artifactDialogName.focus();
}

function closeArtifactDialog() {
  if (elements.artifactDialog.open) {
    elements.artifactDialog.close();
  } else {
    elements.artifactDialog.hidden = true;
  }
  editingArtifactIndex = null;
  elements.artifactDialogError.textContent = "";
}

function saveArtifactDialog() {
  const system = data.systems[activeMaintainerSystem];
  if (!system) return;

  const currentArtifact = artifactDialogMode === "edit" ? system.artifacts[editingArtifactIndex] : null;
  const nextArtifact = dialogArtifactValue(currentArtifact?.custom ?? true);
  const messages = artifactValidationMessages(nextArtifact);
  if (messages.length > 0) {
    elements.artifactDialogError.textContent = messages.join(" ");
    return;
  }

  if (artifactDialogMode === "edit" && currentArtifact) {
    currentArtifact.name = nextArtifact.name;
    currentArtifact.note = nextArtifact.note;
    currentArtifact.days = nextArtifact.days;
  } else {
    system.artifacts.push(nextArtifact);
  }

  rebuildRows();
  renderAll();
  switchView("maintainer");
  closeArtifactDialog();
  markDataDirty();
  showStatus(
    artifactDialogMode === "edit"
      ? `Modulo actualizado en ${system.name}. Recuerda guardar el JSON.`
      : `Modulo agregado a ${system.name}. Recuerda guardar el JSON.`,
    "ok",
  );
}

function openConfirmDialog(title, message, onConfirm) {
  pendingConfirmAction = onConfirm;
  elements.confirmDialogTitle.textContent = title;
  elements.confirmDialogMessage.textContent = message;

  if (elements.confirmDialog.showModal) {
    elements.confirmDialog.showModal();
  } else {
    elements.confirmDialog.hidden = false;
  }
}

function closeConfirmDialog() {
  if (elements.confirmDialog.open) {
    elements.confirmDialog.close();
  } else {
    elements.confirmDialog.hidden = true;
  }
  pendingConfirmAction = null;
}

function artifactValidationMessages(artifact) {
  const messages = [];
  if (!artifact.name?.trim()) messages.push("Falta nombre del modulo.");

  Object.entries(data.complexities).forEach(([key, label]) => {
    const days = Number(artifact.days?.[key]);
    if (!Number.isFinite(days) || days <= 0) {
      messages.push(`${label} debe ser mayor a 0 dias.`);
    }
  });

  return messages;
}

function maintainerValidationMessages() {
  return data.systems.flatMap((system, systemIndex) => [
    ...systemValidationMessages(
      {
        ...system,
        name: system.name?.trim().toUpperCase(),
      },
      systemIndex,
    ).map((message) => `${system.name || "Sin codigo"}: ${message}`),
    ...system.artifacts.flatMap((artifact) =>
      artifactValidationMessages(artifact).map((message) => `${system.name} / ${artifact.name || "Sin nombre"}: ${message}`),
    ),
  ]);
}

function generateEstimateText(item) {
  const row = getRowById(item.rowId);
  if (!row) return "";

  const matrixDays = itemBaseDays(item);
  const phaseDays = itemPhaseDays(item);
  const totalDays = itemEffortDays(item);
  const totalHours = totalDays * HOURS_PER_DAY;
  const contingency = Number(elements.contingency.value);
  const totalWithContingency = totalDaysWithContingency(totalDays);
  const lines = [
    `${row.system} - ${row.name}`,
    `Complejidad: ${data.complexities[item.complexity]} | Cantidad: ${item.quantity}`,
    `Construccion: ${formatDays(matrixDays)} dias`,
    `Fases: ${formatDays(phaseDays)} dias`,
    `Esfuerzo total: ${formatDays(totalDays)} dias / ${formatHours(totalHours)} horas`,
    "",
    "Distribucion por fase:",
    ...itemPhaseBreakdown(item).map(
      (phase) => `- ${phase.label}: ${formatHours(phase.hours)} horas / ${formatDays(phase.days)} dias`,
    ),
    "",
    `Total con contingencia global (${contingency}%): ${formatDays(totalWithContingency)} dias / ${formatHours(
      totalWithContingency * HOURS_PER_DAY,
    )} horas`,
  ];

  return lines.join("\n");
}

function addCartItem(row, complexity, quantity) {
  const existing = cartItems.find((item) => item.rowId === row.id && item.complexity === complexity);
  if (existing) {
    existing.quantity += quantity;
    resetItemPhases(existing);
    existing.estimateText = generateEstimateText(existing);
    renderCart();
    renderSummary();
    showStatus("Cantidad actualizada en el carrito. Revisa la pestana Carrito.", "ok");
    setTemporaryButtonLabel(elements.addToCart, "Actualizado");
    pulseElement(elements.cartTab);
    return;
  }

  const item = {
    id: `cart-${cartSequence++}`,
    rowId: row.id,
    complexity,
    quantity,
    phases: {},
    estimateText: "",
  };
  resetItemPhases(item);
  item.estimateText = generateEstimateText(item);
  cartItems.push(item);
  renderCart();
  renderSummary();
  showStatus("Modulo agregado al carrito. Revisa la pestana Carrito.", "ok");
  setTemporaryButtonLabel(elements.addToCart, "Agregado");
  pulseElement(elements.cartTab);
}

function renderBuilderOptions() {
  const systemOptions = sortedSystems();
  const currentValue = elements.moduleSystemSelect.value;
  const selectedSystemIndex =
    currentValue !== "" && systemOptions.some(({ index }) => index === Number(currentValue))
      ? Number(currentValue)
      : systemOptions[0]?.index || 0;

  elements.moduleSystemSelect.innerHTML = systemOptions
    .map(
      ({ system, index }) =>
        `<option value="${index}" ${index === selectedSystemIndex ? "selected" : ""}>${escapeHtml(system.name)} - ${escapeHtml(
          system.description,
        )}</option>`,
    )
    .join("");

  renderModuleOptions();
}

function renderModuleOptions() {
  const system = data.systems[Number(elements.moduleSystemSelect.value || 0)];
  elements.moduleSelect.innerHTML = system
    ? sortedArtifacts(system)
        .map(({ artifact, index }) => `<option value="${index}">${escapeHtml(artifact.name)}</option>`)
        .join("")
    : "";
  elements.addToCart.disabled = !system || system.artifacts.length === 0;
  renderQuickAddPreview();
}

function renderQuickAddPreview() {
  const systemIndex = Number(elements.moduleSystemSelect.value);
  const artifactIndex = Number(elements.moduleSelect.value);
  const row = getRowById(`${systemIndex}-${artifactIndex}`);
  const complexity = elements.addComplexity.value;
  const quantity = Math.max(1, Number(elements.addQuantity.value) || 1);
  const days = row ? row.days[complexity] * quantity : 0;
  elements.addPreviewDays.value = `${formatDays(days)} dias`;
}

function renderSystemOptions() {
  const selected = elements.systemFilter.value || "todos";
  const options = [
    '<option value="todos">Todos</option>',
    ...sortedSystems().map(
      ({ system }) =>
        `<option value="${escapeHtml(system.name)}">${escapeHtml(system.name)} - ${escapeHtml(system.description)}</option>`,
    ),
  ];
  elements.systemFilter.innerHTML = options.join("");
  elements.systemFilter.value = [...elements.systemFilter.options].some((option) => option.value === selected)
    ? selected
    : "todos";
}

function renderReportOptions() {
  const selected = elements.reportSystemFilter.value || "todos";
  const options = [
    '<option value="todos">Todos</option>',
    ...sortedSystems().map(
      ({ system }) =>
        `<option value="${escapeHtml(system.name)}">${escapeHtml(system.name)} - ${escapeHtml(system.description)}</option>`,
    ),
  ];
  elements.reportSystemFilter.innerHTML = options.join("");
  elements.reportSystemFilter.value = [...elements.reportSystemFilter.options].some((option) => option.value === selected)
    ? selected
    : "todos";
}

function renderSources() {
  elements.sources.innerHTML = data.sources
    .map(
      (source) =>
        `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a></li>`,
    )
    .join("");
}

function renderRows() {
  const visibleRows = getVisibleRows();
  elements.visibleCount.value = `${visibleRows.length} registros`;

  elements.artifactRows.innerHTML = visibleRows
    .map((row) => {
      const state = rowState.get(row.id);
      const complexityOptions = Object.entries(data.complexities)
        .map(([value, label]) => {
          const optionSelected = state.complexity === value ? "selected" : "";
          return `<option value="${escapeHtml(value)}" ${optionSelected}>${escapeHtml(label)}</option>`;
        })
        .join("");

      return `
        <tr data-row-id="${escapeHtml(row.id)}">
          <td>
            <button type="button" data-action="add-row"><i data-lucide="plus" aria-hidden="true"></i><span>Agregar</span></button>
          </td>
          <td><strong>${escapeHtml(row.system)}</strong><small>${escapeHtml(row.systemDescription)}</small></td>
          <td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.note)}</small></td>
          <td class="number">${row.days.bajo}</td>
          <td class="number">${row.days.medio}</td>
          <td class="number">${row.days.alto}</td>
          <td class="number">${row.days.extraAlto}</td>
          <td class="complexity-cell">
            <select data-action="complexity" aria-label="Complejidad de ${escapeHtml(row.name)}">
              ${complexityOptions}
            </select>
          </td>
          <td class="quantity-cell">
            <input data-action="quantity" type="number" min="1" max="99" step="1" value="${state.quantity}" aria-label="Cantidad de ${escapeHtml(row.name)}" />
          </td>
          <td class="number">${formatDays(row.days[state.complexity] * state.quantity)} dias</td>
        </tr>
      `;
    })
    .join("");
  refreshIcons();
}

function getReportRows() {
  const selectedSystem = elements.reportSystemFilter.value || "todos";
  return sortedRows(rows.filter((row) => selectedSystem === "todos" || row.system === selectedSystem));
}

function getReportTableData() {
  return {
    header: ["Sistema", "Modulo", "Bajo", "Medio", "Alto", "Extra alto"],
    rows: getReportRows().map((row) => [
      [row.system, row.systemDescription].filter(Boolean).join(" - "),
      [row.name, row.note].filter(Boolean).join(" - "),
      row.days.bajo,
      row.days.medio,
      row.days.alto,
      row.days.extraAlto,
    ]),
  };
}

function renderReportRows() {
  const reportRows = getReportRows();
  elements.reportCount.value = `${reportRows.length} modulos`;

  elements.reportRows.innerHTML = reportRows.length
    ? reportRows
        .map(
          (row) => `
            <tr>
              <td><strong>${escapeHtml(row.system)}</strong><small>${escapeHtml(row.systemDescription)}</small></td>
              <td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.note)}</small></td>
              <td class="number">${row.days.bajo}</td>
              <td class="number">${row.days.medio}</td>
              <td class="number">${row.days.alto}</td>
              <td class="number">${row.days.extraAlto}</td>
            </tr>
          `,
        )
        .join("")
    : '<tr><td colspan="6">No hay modulos para mostrar.</td></tr>';
  refreshIcons();
}

function renderSummary() {
  syncCartPhasesFromDom();
  const baseDays = totalBaseDays();
  const totalWithContingency = totalDaysWithContingency(baseDays);
  const contingencyDays = totalWithContingency - baseDays;
  const selectedSystems = new Set(
    cartItems.map((item) => getRowById(item.rowId)?.system).filter(Boolean),
  );

  elements.totalDays.textContent = formatDays(totalWithContingency);
  elements.baseDays.textContent = formatDays(baseDays);
  elements.contingencyDays.textContent = formatDays(contingencyDays);
  elements.contingencyExtraInline.textContent = formatDays(contingencyDays);
  elements.selectedCount.textContent = cartItems.length.toString();
  elements.systemCount.textContent = selectedSystems.size.toString();
  elements.contingencyValue.textContent = elements.contingency.value;
  elements.cartBadge.textContent = cartItems.length.toString();
  elements.cartBadge.hidden = cartItems.length === 0;
  elements.cartTab.classList.toggle("has-items", cartItems.length > 0);
  elements.cartTab.setAttribute(
    "aria-label",
    cartItems.length > 0 ? `Carrito con ${cartItems.length} modulos` : "Carrito",
  );
  elements.exportCsv.disabled = cartItems.length === 0;
  elements.exportCsv.title = cartItems.length > 0 ? "Exportar estimacion" : "Agrega modulos al carrito para exportar";
  elements.exportExcel.disabled = cartItems.length === 0;
  elements.exportExcel.title =
    cartItems.length > 0 ? "Exportar estimacion a Excel" : "Agrega modulos al carrito para exportar a Excel";
  renderPhaseTotals();
}

function renderPhaseTotals() {
  const matrixDays = totalMatrixDays();
  const phases = totalPhaseBreakdown();
  const totalPhases = sumPhaseDays(phases);
  const totalEffortDays = matrixDays + totalPhases;
  elements.phaseTotals.innerHTML = [
    `
      <article>
        <span>Construccion</span>
        <strong>${formatDays(matrixDays)} dias</strong>
        <small>base de complejidad y cantidad</small>
      </article>
    `,
    ...phases.map(
      (phase) => `
        <article>
          <span>${escapeHtml(phase.label)}</span>
          <strong>${formatDays(phase.days)} dias</strong>
          <small>base sin contingencia</small>
        </article>
      `,
    ),
    `
      <article class="phase-total-card">
        <span>Total Esfuerzo</span>
        <strong>${formatDays(totalEffortDays)} dias</strong>
        <small>Construccion + Diseno + Documentacion + Pruebas + Release</small>
      </article>
    `,
  ].join("");
}

function renderCart() {
  elements.emptyState.hidden = cartItems.length > 0;
  elements.cartItems.innerHTML = cartItems
    .map((item) => {
      const row = getRowById(item.rowId);
      if (!row) return "";

      const matrixDays = itemBaseDays(item);
      const phases = itemPhaseBreakdown(item);
      const totalPhaseDays = matrixDays + sumPhaseDays(phases);
      const complexityOptions = Object.entries(data.complexities)
        .map(([value, label]) => {
          const optionSelected = item.complexity === value ? "selected" : "";
          return `<option value="${escapeHtml(value)}" ${optionSelected}>${escapeHtml(label)}</option>`;
        })
        .join("");
      const phaseInputs = phases
        .map(
          (phase) =>
            `<label>
              ${escapeHtml(phase.label)}
              <input data-cart-action="phase" data-phase-key="${escapeHtml(phase.key)}" type="number" min="0" step="0.25" value="${formatInputDays(phase.days)}" />
            </label>`,
        )
        .join("");

      return `
        <article class="cart-card" data-cart-id="${escapeHtml(item.id)}">
          <div class="cart-card-header">
            <div>
              <strong>${escapeHtml(row.system)} - ${escapeHtml(row.name)}</strong>
              <small>${escapeHtml(row.systemDescription)}</small>
            </div>
            <button class="danger-button" data-cart-action="remove" type="button"><i data-lucide="trash-2" aria-hidden="true"></i><span>Quitar</span></button>
          </div>
          <div class="cart-card-controls">
            <label>
              Complejidad
              <select data-cart-action="complexity">${complexityOptions}</select>
            </label>
            <label>
              Cantidad
              <input data-cart-action="quantity" type="number" min="1" max="99" step="1" value="${item.quantity}" />
            </label>
            <label>
              Construccion
              <input readonly value="${formatDays(matrixDays)} dias" />
            </label>
            <label>
              Total Esfuerzo
              <input data-cart-action="base" readonly value="${formatDays(totalPhaseDays)} dias" />
            </label>
          </div>
          <div class="phase-chip-row">${phaseInputs}</div>
          <label class="estimate-text">
            Estimacion en horas y dias
            <textarea data-cart-action="estimateText" rows="9">${escapeHtml(item.estimateText)}</textarea>
          </label>
          <div class="control-actions">
            <button data-cart-action="regenerate" type="button"><i data-lucide="refresh-cw" aria-hidden="true"></i><span>Regenerar texto</span></button>
          </div>
        </article>
      `;
    })
    .join("");
  refreshIcons();
}

function renderMaintainer() {
  if (activeMaintainerSystem >= data.systems.length) activeMaintainerSystem = Math.max(0, data.systems.length - 1);

  elements.maintSystemSelect.innerHTML = sortedSystems()
    .map(
      ({ system, index }) =>
        `<option value="${index}" ${index === activeMaintainerSystem ? "selected" : ""}>${escapeHtml(system.name)}</option>`,
    )
    .join("");

  const system = data.systems[activeMaintainerSystem];
  const hasSystem = Boolean(system);
  elements.editSystem.disabled = !hasSystem;
  elements.deleteSystem.disabled = !hasSystem;
  elements.addArtifact.disabled = !hasSystem;
  elements.maintainerSearch.disabled = !hasSystem;

  const searchQuery = elements.maintainerSearch.value.trim().toLowerCase();
  const artifactIssues = hasSystem
    ? system.artifacts.flatMap((artifact) =>
        artifactValidationMessages(artifact).map((message) => `${artifact.name || "Sin nombre"}: ${message}`),
      )
    : [];
  const visibleArtifacts = hasSystem
    ? sortedArtifacts(system).filter(({ artifact }) => {
        if (!searchQuery) return true;
        return `${artifact.name} ${artifact.note}`.toLowerCase().includes(searchQuery);
      })
    : [];
  const validationSummary = artifactIssues.length
    ? `
      <div class="validation-summary" role="alert">
        <strong>${artifactIssues.length} validacion${artifactIssues.length === 1 ? "" : "es"} pendiente${artifactIssues.length === 1 ? "" : "s"}</strong>
        <span>${escapeHtml(artifactIssues.slice(0, 4).join(" "))}${
          artifactIssues.length > 4 ? " ..." : ""
        }</span>
      </div>
    `
    : "";

  elements.maintArtifacts.innerHTML = hasSystem
    ? `
      ${validationSummary}
      <div class="table-scroll maintainer-table-scroll">
        <table class="maintainer-table">
          <thead>
            <tr>
              <th scope="col">Modulo</th>
              <th scope="col">Nota</th>
              <th scope="col">Bajo</th>
              <th scope="col">Medio</th>
              <th scope="col">Alto</th>
              <th scope="col">Extra alto</th>
              <th scope="col">Tipo</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${
              visibleArtifacts.length
                ? visibleArtifacts
              .map(({ artifact, index }) => {
                const isBaseArtifact = isProtectedArtifact(artifact);
                const validationMessage = artifactValidationMessages(artifact).join(" ");
                return `
                  <tr class="${validationMessage ? "is-invalid-row" : ""}" data-artifact-index="${index}">
                    <td>
                      <strong>${escapeHtml(artifact.name)}</strong>
                      ${
                        validationMessage
                          ? `<small class="validation-message">${escapeHtml(validationMessage)}</small>`
                          : ""
                      }
                    </td>
                    <td>${escapeHtml(artifact.note || "")}</td>
                    <td class="number">${formatDays(artifact.days.bajo)}</td>
                    <td class="number">${formatDays(artifact.days.medio)}</td>
                    <td class="number">${formatDays(artifact.days.alto)}</td>
                    <td class="number">${formatDays(artifact.days.extraAlto)}</td>
                    <td>
                      ${
                        isBaseArtifact
                          ? '<span class="base-artifact-note">Base: editable, no eliminable</span>'
                          : '<span class="custom-artifact-note">Nuevo</span>'
                      }
                    </td>
                    <td>
                      <div class="row-actions">
                        <button class="icon-action secondary" data-maint-action="edit-artifact" type="button" title="Editar modulo" aria-label="Editar modulo">
                          <i data-lucide="pencil" aria-hidden="true"></i>
                        </button>
                        ${
                          isBaseArtifact
                            ? ""
                            : `<button class="icon-action danger-button" data-maint-action="delete-artifact" type="button" title="Eliminar modulo" aria-label="Eliminar modulo">
                                <i data-lucide="trash-2" aria-hidden="true"></i>
                              </button>`
                        }
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join("")
                : `<tr><td colspan="8">${searchQuery ? "No hay modulos que coincidan con la busqueda." : "Este sistema no tiene modulos."}</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `
    : '<p class="empty-maintainer">Agrega un sistema para comenzar.</p>';
  refreshIcons();
}

function renderAll() {
  renderBuilderOptions();
  renderSystemOptions();
  renderReportOptions();
  renderSources();
  renderRows();
  renderReportRows();
  renderCart();
  renderSummary();
  renderMaintainer();
}

function renderEstimatorOnly() {
  renderBuilderOptions();
  renderSystemOptions();
  renderReportOptions();
  renderRows();
  renderReportRows();
  renderCart();
  renderSummary();
}

function updateRowState(rowId, updater) {
  const current = rowState.get(rowId);
  rowState.set(rowId, { ...current, ...updater(current) });
}

function switchView(view) {
  if (view !== activeView) {
    clearStatus();
    activeView = view;
  }

  const isCatalog = view === "catalog";
  const isCart = view === "cart";
  const isReport = view === "report";
  const isMaintainer = view === "maintainer";

  elements.catalogViews.forEach((element) => {
    element.hidden = !isCatalog;
  });
  elements.cartViews.forEach((element) => {
    element.hidden = !isCart;
  });
  elements.reportView.hidden = !isReport;
  elements.maintainerView.hidden = !isMaintainer;
  elements.estimateTab.classList.toggle("is-active", isCatalog);
  elements.cartTab.classList.toggle("is-active", isCart);
  elements.reportTab.classList.toggle("is-active", isReport);
  elements.maintainerTab.classList.toggle("is-active", isMaintainer);
}

function bindEvents() {
  elements.brandHome.addEventListener("click", () => switchView("catalog"));
  elements.estimateTab.addEventListener("click", () => switchView("catalog"));
  elements.cartTab.addEventListener("click", () => switchView("cart"));
  elements.reportTab.addEventListener("click", () => switchView("report"));
  elements.maintainerTab.addEventListener("click", () => switchView("maintainer"));
  elements.themeSelect.addEventListener("change", () => {
    setThemeMode(elements.themeSelect.value);
    closeVisualMenu();
  });
  elements.densitySelect.addEventListener("change", () => {
    setDensityMode(elements.densitySelect.value);
    closeVisualMenu();
  });
  elements.moduleSystemSelect.addEventListener("change", renderModuleOptions);
  elements.moduleSelect.addEventListener("change", renderQuickAddPreview);
  elements.addComplexity.addEventListener("change", renderQuickAddPreview);
  elements.addQuantity.addEventListener("input", renderQuickAddPreview);
  elements.addToCart.addEventListener("click", addSelectedModuleToCart);
  elements.clearCart.addEventListener("click", () => {
    if (cartItems.length === 0) return;
    const confirmed = window.confirm("Limpiar todos los modulos del carrito?");
    if (!confirmed) return;
    cartItems = [];
    renderCart();
    renderSummary();
  });
  elements.systemFilter.addEventListener("change", renderRows);
  elements.searchInput.addEventListener("input", renderRows);
  elements.reportSystemFilter.addEventListener("change", renderReportRows);
  elements.reportExport.addEventListener("click", exportReportCsv);
  elements.reportCopy.addEventListener("click", copyReportTable);
  elements.contingency.addEventListener("input", () => {
    cartItems.forEach((item) => {
      item.estimateText = generateEstimateText(item);
    });
    renderCart();
    renderSummary();
  });

  elements.artifactRows.addEventListener("change", (event) => {
    const rowElement = event.target.closest("tr[data-row-id]");
    if (!rowElement) return;

    const rowId = rowElement.dataset.rowId;
    const action = event.target.dataset.action;

    if (action === "complexity") {
      updateRowState(rowId, () => ({ complexity: event.target.value }));
    }

    if (action === "quantity") {
      const quantity = Math.max(1, Number(event.target.value) || 1);
      updateRowState(rowId, () => ({ quantity }));
    }

    renderRows();
  });

  elements.artifactRows.addEventListener("click", (event) => {
    const actionButton = event.target.closest('button[data-action="add-row"]');
    if (!actionButton) return;
    const rowElement = actionButton.closest("tr[data-row-id]");
    const row = getRowById(rowElement?.dataset.rowId);
    if (!row) return;
    const state = rowState.get(row.id);
    addCartItem(row, state.complexity, state.quantity);
  });

  elements.cartItems.addEventListener("input", handleCartInput);
  elements.cartItems.addEventListener("change", handleCartInput);
  elements.cartItems.addEventListener("click", handleCartClick);

  elements.exportCsv.addEventListener("click", exportCsv);
  elements.exportExcel.addEventListener("click", exportCartExcel);
  elements.maintSystemSelect.addEventListener("change", () => {
    activeMaintainerSystem = Number(elements.maintSystemSelect.value);
    renderMaintainer();
  });

  elements.maintainerSearch.addEventListener("input", renderMaintainer);

  elements.addSystem.addEventListener("click", () => {
    openSystemDialog("add");
  });

  elements.editSystem.addEventListener("click", () => {
    openSystemDialog("edit", activeMaintainerSystem);
  });

  elements.deleteSystem.addEventListener("click", () => {
    const system = data.systems[activeMaintainerSystem];
    if (!system) return;
    if (systemHasProtectedArtifacts(system)) {
      showStatus("No se puede eliminar este sistema porque contiene modulos base del JSON. Puedes modificarlos, pero no eliminarlos.", "error");
      return;
    }
    openConfirmDialog("Eliminar sistema", `Eliminar ${system.name} y todos sus modulos?`, () => {
      data.systems.splice(activeMaintainerSystem, 1);
      activeMaintainerSystem = Math.max(0, activeMaintainerSystem - 1);
      rebuildRows();
      cartItems = cartItems.filter((item) => getRowById(item.rowId));
      renderAll();
      markDataDirty();
    });
  });

  elements.addArtifact.addEventListener("click", () => {
    openArtifactDialog("add");
  });

  elements.maintArtifacts.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-maint-action]");
    if (!actionButton) return;
    const row = actionButton.closest("[data-artifact-index]");
    const system = data.systems[activeMaintainerSystem];
    if (!row || !system) return;
    const artifactIndex = Number(row.dataset.artifactIndex);
    const artifact = system.artifacts[artifactIndex];
    if (!artifact) return;

    if (actionButton.dataset.maintAction === "edit-artifact") {
      openArtifactDialog("edit", artifactIndex);
      return;
    }

    if (actionButton.dataset.maintAction === "delete-artifact") {
      if (isProtectedArtifact(artifact)) {
        showStatus("Este modulo base permite editar sus dias y datos, pero no se puede eliminar.", "error");
        return;
      }

      openConfirmDialog("Eliminar modulo", `Eliminar el modulo "${artifact.name}" de ${system.name}?`, () => {
        system.artifacts.splice(artifactIndex, 1);
        rebuildRows();
        cartItems = cartItems.filter((item) => getRowById(item.rowId));
        renderAll();
        switchView("maintainer");
        markDataDirty();
      });
    }
  });

  elements.systemDialogCancel.addEventListener("click", closeSystemDialog);
  elements.systemDialogSave.addEventListener("click", saveSystemDialog);
  elements.systemDialog.addEventListener("cancel", () => {
    editingSystemIndex = null;
    elements.systemDialogError.textContent = "";
  });

  elements.artifactDialogCancel.addEventListener("click", closeArtifactDialog);
  elements.artifactDialogSave.addEventListener("click", saveArtifactDialog);
  elements.artifactDialog.addEventListener("cancel", () => {
    editingArtifactIndex = null;
    elements.artifactDialogError.textContent = "";
  });

  elements.confirmDialogCancel.addEventListener("click", closeConfirmDialog);
  elements.confirmDialogAccept.addEventListener("click", () => {
    const action = pendingConfirmAction;
    closeConfirmDialog();
    action?.();
  });

  elements.saveJson.addEventListener("click", saveData);
  window.addEventListener("beforeunload", warnUnsavedChanges);
}

function addSelectedModuleToCart() {
  const systemIndex = Number(elements.moduleSystemSelect.value);
  const artifactIndex = Number(elements.moduleSelect.value);
  const row = getRowById(`${systemIndex}-${artifactIndex}`);
  const quantity = Math.max(1, Number(elements.addQuantity.value) || 1);
  if (!row) return;
  addCartItem(row, elements.addComplexity.value, quantity);
}

function getCartItemFromEvent(event) {
  const card = event.target.closest("[data-cart-id]");
  if (!card) return null;
  return cartItems.find((item) => item.id === card.dataset.cartId);
}

function handleCartInput(event) {
  const item = getCartItemFromEvent(event);
  if (!item) return;

  const card = event.target.closest("[data-cart-id]");
  const action = event.target.dataset.cartAction;
  if (action === "estimateText") {
    item.estimateText = event.target.value;
    return;
  }

  if (action === "phase") {
    ensureItemPhases(item);
    item.phases[event.target.dataset.phaseKey] = formatInputDays(Math.max(0, Number(event.target.value) || 0));
    event.target.value = item.phases[event.target.dataset.phaseKey];
    item.estimateText = generateEstimateText(item);
    card.querySelector('[data-cart-action="base"]').value = `${formatDays(itemEffortDays(item))} dias`;
    card.querySelector('[data-cart-action="estimateText"]').value = item.estimateText;
    renderSummary();
    return;
  }

  if (action === "complexity") {
    item.complexity = event.target.value;
    resetItemPhases(item);
    item.estimateText = generateEstimateText(item);
  }

  if (action === "quantity") {
    item.quantity = Math.max(1, Number(event.target.value) || 1);
    resetItemPhases(item);
    item.estimateText = generateEstimateText(item);
  }

  renderCart();
  renderSummary();
}

function handleCartClick(event) {
  const actionButton = event.target.closest("button[data-cart-action]");
  if (!actionButton) return;

  const item = getCartItemFromEvent(event);
  if (!item) return;

  const action = actionButton.dataset.cartAction;
  if (action === "remove") {
    const row = getRowById(item.rowId);
    const confirmed = window.confirm(`Quitar ${row?.name || "este modulo"} del carrito?`);
    if (!confirmed) return;
    cartItems = cartItems.filter((cartItem) => cartItem.id !== item.id);
    renderCart();
    renderSummary();
  }

  if (action === "regenerate") {
    item.estimateText = generateEstimateText(item);
    renderCart();
  }
}

async function saveData() {
  try {
    const validationMessages = maintainerValidationMessages();
    if (validationMessages.length > 0) {
      renderMaintainer();
      showStatus(`No se puede grabar: ${validationMessages[0]}`, "error");
      switchView("maintainer");
      return;
    }

    const json = serializeData();

    if (jsonFileHandle?.createWritable) {
      await writeTextFile(jsonFileHandle, json);
      setDataDirty(false);
      showStatus("estimaciones.json guardado correctamente.", "ok");
      return;
    }

    if (window.showSaveFilePicker) {
      jsonFileHandle = await window.showSaveFilePicker({
        suggestedName: DATA_URL,
        types: [
          {
            description: "JSON",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      await writeTextFile(jsonFileHandle, json);
      setDataDirty(false);
      showStatus("estimaciones.json guardado correctamente.", "ok");
      return;
    }

    downloadTextFile("estimaciones.json", json, "application/json;charset=utf-8");
    setDataDirty(false);
    showStatus("Tu navegador no permite sobrescribir el archivo directo. Se descargo un nuevo estimaciones.json.", "ok");
  } catch (error) {
    if (error.name === "AbortError") return;
    showStatus(error.message, "error");
  }
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function slugifyFilename(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function exportCsv() {
  if (cartItems.length === 0) {
    showStatus("Agrega modulos al carrito antes de exportar.", "error");
    return;
  }

  const projectName = window.prompt("Nombre del proyecto para la estimacion:");
  if (projectName === null) return;

  const cleanProjectName = projectName.trim();
  if (!cleanProjectName) {
    showStatus("Ingresa un nombre de proyecto para exportar la estimacion.", "error");
    return;
  }

  const header = [
    "Sistema",
    "Modulo",
    "Complejidad",
    "Cantidad",
    "Construccion dias",
    "Diseno",
    "Documentacion",
    "Pruebas Unitarias",
    "Release",
    "Total esfuerzo dias",
    "Contingencia %",
    "Contingencia dias",
    "Total con contingencia dias",
  ];

  const contingency = Number(elements.contingency.value) / 100;
  const csvRows = cartItems.map((item) => {
    const row = getRowById(item.rowId);
    const matrixDays = itemBaseDays(item);
    const totalDays = itemEffortDays(item);
    const phases = itemPhaseBreakdown(item);
    return [
      row?.system || "",
      row?.name || "",
      data.complexities[item.complexity],
      item.quantity,
      formatDays(matrixDays),
      ...phases.map((phase) => formatDays(phase.days)),
      formatDays(totalDays),
      Number(elements.contingency.value),
      formatDays(totalDays * contingency),
      formatDays(totalDays * (1 + contingency)),
    ];
  });

  const totalDays = totalBaseDays();
  const matrixDays = totalMatrixDays();
  const totalPhases = totalPhaseBreakdown();
  const totalRow = [
    "TOTAL",
    "",
    "",
    cartItems.reduce((total, item) => total + item.quantity, 0),
    formatDays(matrixDays),
    ...totalPhases.map((phase) => formatDays(phase.days)),
    formatDays(totalDays),
    Number(elements.contingency.value),
    formatDays(totalDaysWithContingency(totalDays) - totalDays),
    formatDays(totalDaysWithContingency(totalDays)),
  ];

  const escapeCell = (cell) => `"${String(cell).replace(/"/g, '""')}"`;
  const csv = [header, ...csvRows, totalRow].map((line) => line.map(escapeCell).join(",")).join("\n");
  const filenameProject = slugifyFilename(cleanProjectName) || "proyecto";
  downloadTextFile(`estimacion-${filenameProject}.csv`, csv, "text/csv;charset=utf-8");
}

function getCartExportTableData() {
  const header = [
    "Sistema",
    "Modulo",
    "Complejidad",
    "Cantidad",
    "Construccion dias",
    "Diseno",
    "Documentacion",
    "Pruebas Unitarias",
    "Release",
    "Total esfuerzo dias",
    "Contingencia %",
    "Contingencia dias",
    "Total con contingencia dias",
  ];

  const contingency = Number(elements.contingency.value) / 100;
  const rowsForExport = cartItems.map((item) => {
    const row = getRowById(item.rowId);
    const matrixDays = itemBaseDays(item);
    const totalDays = itemEffortDays(item);
    const phases = itemPhaseBreakdown(item);
    return [
      row?.system || "",
      row?.name || "",
      data.complexities[item.complexity],
      item.quantity,
      formatInputDays(matrixDays),
      ...phases.map((phase) => formatInputDays(phase.days)),
      formatInputDays(totalDays),
      Number(elements.contingency.value),
      formatInputDays(totalDays * contingency),
      formatInputDays(totalDays * (1 + contingency)),
    ];
  });

  const totalDays = totalBaseDays();
  const matrixDays = totalMatrixDays();
  const totalPhases = totalPhaseBreakdown();
  const totalRow = [
    "TOTAL",
    "",
    "",
    cartItems.reduce((total, item) => total + item.quantity, 0),
    formatInputDays(matrixDays),
    ...totalPhases.map((phase) => formatInputDays(phase.days)),
    formatInputDays(totalDays),
    Number(elements.contingency.value),
    formatInputDays(totalDaysWithContingency(totalDays) - totalDays),
    formatInputDays(totalDaysWithContingency(totalDays)),
  ];

  return {
    header,
    rows: [...rowsForExport, totalRow],
  };
}

function exportReportCsv() {
  const tableData = getReportTableData();
  if (tableData.rows.length === 0) {
    showStatus("No hay modulos para exportar en el reporte.", "error");
    return;
  }

  const escapeCell = (cell) => `"${String(cell).replace(/"/g, '""')}"`;
  const csv = [tableData.header, ...tableData.rows].map((line) => line.map(escapeCell).join(",")).join("\n");
  const selectedSystem = elements.reportSystemFilter.value || "todos";
  const filenameSystem = selectedSystem === "todos" ? "todos" : slugifyFilename(selectedSystem);
  downloadTextFile(`reporte-${filenameSystem}.csv`, csv, "text/csv;charset=utf-8");
  setTemporaryButtonLabel(elements.reportExport, "Exportado");
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index) {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function worksheetXml(tableData) {
  const rowsForSheet = [tableData.header, ...tableData.rows];
  const colsXml = tableData.header
    .map((_, index) => {
      const width = index === 0 ? 28 : index === 1 ? 34 : 16;
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");
  const rowsXml = rowsForSheet
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          const number = Number(cell);
          if (columnIndex >= 2 && Number.isFinite(number) && cell !== "") {
            return `<c r="${ref}"><v>${number}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
}

function buildXlsx(tableData) {
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Reporte" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    "xl/worksheets/sheet1.xml": worksheetXml(tableData),
  };

  return zipStore(files);
}

const crc32Table = (() => {
  const table = [];
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table.push(value >>> 0);
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const contentBytes = encoder.encode(content);
    const checksum = crc32(contentBytes);
    const localHeader = [];

    writeUint32(localHeader, 0x04034b50);
    writeUint16(localHeader, 20);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint32(localHeader, checksum);
    writeUint32(localHeader, contentBytes.length);
    writeUint32(localHeader, contentBytes.length);
    writeUint16(localHeader, nameBytes.length);
    writeUint16(localHeader, 0);
    localParts.push(new Uint8Array(localHeader), nameBytes, contentBytes);

    const centralHeader = [];
    writeUint32(centralHeader, 0x02014b50);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, checksum);
    writeUint32(centralHeader, contentBytes.length);
    writeUint32(centralHeader, contentBytes.length);
    writeUint16(centralHeader, nameBytes.length);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, 0);
    writeUint32(centralHeader, offset);
    centralParts.push(new Uint8Array(centralHeader), nameBytes);

    offset += localHeader.length + nameBytes.length + contentBytes.length;
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const endRecord = [];
  writeUint32(endRecord, 0x06054b50);
  writeUint16(endRecord, 0);
  writeUint16(endRecord, 0);
  writeUint16(endRecord, Object.keys(files).length);
  writeUint16(endRecord, Object.keys(files).length);
  writeUint32(endRecord, centralSize);
  writeUint32(endRecord, offset);
  writeUint16(endRecord, 0);

  return new Blob([...localParts, ...centralParts, new Uint8Array(endRecord)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function exportCartExcel() {
  if (cartItems.length === 0) {
    showStatus("Agrega modulos al carrito antes de exportar a Excel.", "error");
    return;
  }

  const projectName = window.prompt("Nombre del proyecto para la estimacion:");
  if (projectName === null) return;

  const cleanProjectName = projectName.trim();
  if (!cleanProjectName) {
    showStatus("Ingresa un nombre de proyecto para exportar la estimacion.", "error");
    return;
  }

  const blob = buildXlsx(getCartExportTableData());
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `estimacion-${slugifyFilename(cleanProjectName) || "proyecto"}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
  setTemporaryButtonLabel(elements.exportExcel, "Exportado");
}

function reportTableToText(tableData) {
  return [tableData.header, ...tableData.rows]
    .map((line) => line.map((cell) => String(cell).replace(/[\t\r\n]+/g, " ").trim()).join("\t"))
    .join("\n");
}

function reportTableToHtml(tableData) {
  const thStyle = "border:1px solid #bdc9c4;background:#f7f8f6;padding:8px;text-align:left;font-weight:700;";
  const tdStyle = "border:1px solid #bdc9c4;padding:8px;text-align:left;";
  const header = tableData.header.map((cell) => `<th style="${thStyle}">${escapeHtml(cell)}</th>`).join("");
  const body = tableData.rows
    .map((line) => `<tr>${line.map((cell) => `<td style="${tdStyle}">${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");

  return `
    <table style="border-collapse:collapse;width:100%;font-family:Inter,Arial,sans-serif;font-size:12px;">
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

async function copyReportTable() {
  const tableData = getReportTableData();
  if (tableData.rows.length === 0) {
    showStatus("No hay modulos para copiar en el reporte.", "error");
    return;
  }

  const text = reportTableToText(tableData);
  const html = reportTableToHtml(tableData);

  try {
    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }
    showStatus("Tabla de reporte copiada al portapapeles.", "ok");
    setTemporaryButtonLabel(elements.reportCopy, "Copiado");
  } catch (error) {
    showStatus("No se pudo copiar la tabla. Intenta nuevamente desde el boton Copiar tabla.", "error");
  }
}

bindEvents();
applyThemeMode();
applyDensityMode();
refreshIcons();
loadData();

if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (themeMode === "default") applyThemeMode();
  });
}
