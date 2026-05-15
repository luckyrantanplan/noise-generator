import { decodeDisplacementField } from "../shared/displacementBinary.js";
import {
  DEFAULT_PARAMETERS,
} from "../shared/params.js";
import type { ParameterValues } from "../shared/types.js";
import {
  normalizeParameters,
  PARAMETER_DEFINITIONS,
  PARAMETER_GROUPS,
  type BooleanParameterDefinition,
  type NumericParameterDefinition,
  type ParameterDefinition,
  type SeedParameterDefinition,
} from "./parameter-controls.js";

const controlsElement = requireElement("#controls");
const previewElement = requireElement("#preview");
const statusElement = requireElement("#status");
const importButtonElement = requireElement("#import-binary");
const importInputElement = requireElement("#import-binary-input");
const exportButtonElement = requireElement("#export-binary");

const currentParameters: ParameterValues = normalizeParameters({
  ...DEFAULT_PARAMETERS,
});
let pendingRequest = 0;
let latestPreviewRequestAt = 0;

buildControls(controlsElement, currentParameters);
importButtonElement.addEventListener("click", () => {
  importInputElement.click();
});
importInputElement.addEventListener("change", () => {
  void importBinary(currentParameters);
});
exportButtonElement.addEventListener("click", () => {
  void exportBinary(currentParameters);
});
void refreshPreview(currentParameters);

function requireElement(selector: "#controls"): HTMLFormElement;
function requireElement(selector: "#preview"): HTMLDivElement;
function requireElement(selector: "#status"): HTMLSpanElement;
function requireElement(
  selector: "#import-binary" | "#export-binary",
): HTMLButtonElement;
function requireElement(selector: "#import-binary-input"): HTMLInputElement;

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (element === null) {
    throw new Error(`The page is missing ${selector}`);
  }
  if (!(element instanceof HTMLElement)) {
    throw new Error(`The page element ${selector} is not an HTML element`);
  }
  return element;
}

function buildControls(
  form: HTMLFormElement,
  parameters: ParameterValues,
): void {
  const definitionsByGroup = groupParameterDefinitions(PARAMETER_DEFINITIONS);

  for (const group of PARAMETER_GROUPS) {
    const definitions = definitionsByGroup.get(group.key);
    if (definitions === undefined) {
      continue;
    }

    const section = document.createElement("section");
    section.className = "control-group";

    const heading = document.createElement("h2");
    heading.className = "control-group-title";
    heading.textContent = group.label;

    const description = document.createElement("p");
    description.className = "control-group-description";
    description.textContent = group.description;

    section.append(heading, description);

    for (const definition of definitions) {
      section.appendChild(createControl(definition, parameters));
    }

    form.appendChild(section);
  }
}

function rebuildControls(parameters: ParameterValues): void {
  controlsElement.replaceChildren();
  buildControls(controlsElement, parameters);
}

function groupParameterDefinitions(
  definitions: ParameterDefinition[],
): Map<string, ParameterDefinition[]> {
  const groupedDefinitions = new Map<string, ParameterDefinition[]>();

  for (const definition of definitions) {
    const existingGroup = groupedDefinitions.get(definition.group);
    if (existingGroup === undefined) {
      groupedDefinitions.set(definition.group, [definition]);
      continue;
    }
    existingGroup.push(definition);
  }

  return groupedDefinitions;
}

function createControl(
  definition: ParameterDefinition,
  parameters: ParameterValues,
): HTMLElement {
  if (definition.key === "randomSeed") {
    return createSeedControl(definition, parameters);
  }
  if (definition.key === "showHeatmap") {
    return createBooleanControl(definition, parameters);
  }
  return createNumericControl(definition, parameters);
}

function createBooleanControl(
  definition: BooleanParameterDefinition,
  parameters: ParameterValues,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "control";

  const label = document.createElement("label");
  label.htmlFor = definition.key;
  label.appendChild(
    createLabelContent(definition.label, definition.description),
  );

  const input = document.createElement("input");
  input.id = definition.key;
  input.name = definition.key;
  input.type = "checkbox";
  input.checked = parameters[definition.key];
  input.addEventListener("input", () => {
    parameters[definition.key] = input.checked;
    queuePreviewRefresh(parameters);
  });

  applyTooltip([wrapper, label, input], definition.description);

  wrapper.append(label, input);
  return wrapper;
}

function createSeedControl(
  definition: SeedParameterDefinition,
  parameters: ParameterValues,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "control";

  const label = document.createElement("label");
  label.htmlFor = "randomSeed";
  label.appendChild(
    createLabelContent(definition.label, definition.description),
  );

  const input = document.createElement("input");
  input.id = "randomSeed";
  input.name = "randomSeed";
  input.type = "text";
  input.value = parameters.randomSeed;
  input.addEventListener("input", () => {
    parameters.randomSeed = input.value;
    queuePreviewRefresh(parameters);
  });

  applyTooltip([wrapper, label, input], definition.description);

  wrapper.append(label, input);
  return wrapper;
}

function createNumericControl(
  definition: NumericParameterDefinition,
  parameters: ParameterValues,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "control";

  const label = document.createElement("label");
  label.htmlFor = definition.key;
  const labelText = createLabelContent(
    definition.label,
    definition.description,
  );
  const valueOutput = document.createElement("span");
  valueOutput.textContent = String(parameters[definition.key]);
  label.append(labelText, valueOutput);

  const row = document.createElement("div");
  row.className = "value-row";

  const rangeInput = document.createElement("input");
  rangeInput.id = definition.key;
  rangeInput.name = definition.key;
  rangeInput.type = "range";
  rangeInput.min = String(definition.min);
  rangeInput.max = String(definition.max);
  rangeInput.step = String(definition.step);
  rangeInput.value = String(parameters[definition.key]);

  const numberInput = document.createElement("input");
  if (definition.integer) {
    numberInput.type = "number";
    numberInput.min = String(definition.min);
    numberInput.max = String(definition.max);
    numberInput.step = String(definition.step);
  } else {
    numberInput.type = "text";
    numberInput.inputMode = "decimal";
    numberInput.setAttribute("aria-label", definition.label);
  }
  numberInput.value = String(parameters[definition.key]);

  applyTooltip(
    [wrapper, label, valueOutput, rangeInput, numberInput],
    definition.description,
  );

  const commitValue = (rawValue: string, writeBackToInput: boolean): void => {
    const nextValue = parseNumericControlValue(rawValue, definition);
    if (nextValue === null) {
      if (writeBackToInput) {
        numberInput.value = String(parameters[definition.key]);
      }
      return;
    }
    parameters[definition.key] = nextValue;
    const normalizedChanged = syncNormalizedParameters(parameters);
    const rebuildControlsNeeded = normalizedChanged;

    if (rebuildControlsNeeded) {
      rebuildControls(parameters);
    } else {
      rangeInput.value = String(parameters[definition.key]);
      valueOutput.textContent = String(parameters[definition.key]);
      if (writeBackToInput) {
        numberInput.value = String(parameters[definition.key]);
      }
    }

    queuePreviewRefresh(parameters);
  };

  rangeInput.addEventListener("input", () => {
    commitValue(rangeInput.value, true);
  });
  numberInput.addEventListener("input", () => {
    const nextValue = parseNumericControlValue(numberInput.value, definition);
    if (nextValue === null) {
      return;
    }
    parameters[definition.key] = nextValue;
    const normalizedChanged = syncNormalizedParameters(parameters);
    const rebuildControlsNeeded = normalizedChanged;

    if (rebuildControlsNeeded) {
      rebuildControls(parameters);
    } else {
      rangeInput.value = String(parameters[definition.key]);
      valueOutput.textContent = String(parameters[definition.key]);
    }
    queuePreviewRefresh(parameters);
  });
  numberInput.addEventListener("change", () => {
    commitValue(numberInput.value, true);
  });
  numberInput.addEventListener("blur", () => {
    commitValue(numberInput.value, true);
  });

  row.append(rangeInput, numberInput);
  wrapper.append(label, row);
  return wrapper;
}

function createLabelContent(text: string, description: string): HTMLElement {
  const content = document.createElement("span");
  content.className = "label-main";

  const textNode = document.createElement("span");
  textNode.textContent = text;

  const indicator = document.createElement("span");
  indicator.className = "tooltip-indicator";
  indicator.textContent = "?";
  indicator.title = description;
  indicator.setAttribute("aria-label", description);

  content.append(textNode, indicator);
  return content;
}

function applyTooltip(elements: HTMLElement[], description: string): void {
  for (const element of elements) {
    element.title = description;
  }
}

function parseNumericControlValue(
  rawValue: string,
  definition: NumericParameterDefinition,
): number | null {
  const normalizedValue = rawValue.trim().replace(/,/g, ".");
  if (
    normalizedValue.length === 0 ||
    normalizedValue === "." ||
    normalizedValue === "+" ||
    normalizedValue === "-" ||
    normalizedValue.endsWith(".")
  ) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  const roundedValue = definition.integer
    ? Math.round(parsedValue)
    : parsedValue;

  return Math.min(definition.max, Math.max(definition.min, roundedValue));
}

function queuePreviewRefresh(parameters: ParameterValues): void {
  window.clearTimeout(pendingRequest);
  pendingRequest = window.setTimeout(() => {
    void refreshPreview(parameters);
  }, 160);
}

async function refreshPreview(parameters: ParameterValues): Promise<void> {
  syncNormalizedParameters(parameters);
  const requestTimestamp = Date.now();
  latestPreviewRequestAt = requestTimestamp;
  statusElement.textContent = "Rendering";
  const response = await fetch("/api/field.svg", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(parameters),
  });
  if (!response.ok) {
    if (requestTimestamp !== latestPreviewRequestAt) {
      return;
    }
    statusElement.textContent = "Render failed";
    previewElement.textContent = await response.text();
    return;
  }
  const svg = await response.text();
  if (requestTimestamp !== latestPreviewRequestAt) {
    return;
  }
  previewElement.innerHTML = svg;
  statusElement.textContent = "Ready";
}

async function exportBinary(parameters: ParameterValues): Promise<void> {
  statusElement.textContent = "Exporting";
  setToolbarBusy(true);

  try {
    const response = await fetch("/api/field.bin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(parameters),
    });
    if (!response.ok) {
      statusElement.textContent = "Export failed";
      return;
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = "displacement-field.bin";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);
    statusElement.textContent = "Ready";
  } finally {
    setToolbarBusy(false);
  }
}

async function importBinary(parameters: ParameterValues): Promise<void> {
  const file = importInputElement.files?.[0];
  if (file === undefined) {
    return;
  }

  statusElement.textContent = "Importing";
  setToolbarBusy(true);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decodedField = decodeDisplacementField(bytes);
    // Import restores the recorded parameter set, then regenerates the preview.
    Object.assign(
      parameters,
      normalizeParameters(decodedField.metadata.parameters),
    );
    rebuildControls(parameters);
    await refreshPreview(parameters);
  } catch (error) {
    statusElement.textContent = "Import failed";
    previewElement.textContent =
      error instanceof Error ? error.message : "Unknown import error";
  } finally {
    importInputElement.value = "";
    setToolbarBusy(false);
  }
}

function setToolbarBusy(isBusy: boolean): void {
  importButtonElement.disabled = isBusy;
  exportButtonElement.disabled = isBusy;
}

function syncNormalizedParameters(parameters: ParameterValues): boolean {
  const normalizedParameters = normalizeParameters(parameters);
  const changed = !parameterValuesEqual(parameters, normalizedParameters);

  if (changed) {
    Object.assign(parameters, normalizedParameters);
  }

  return changed;
}

function parameterValuesEqual(
  left: ParameterValues,
  right: ParameterValues,
): boolean {
  return (
    left.renderWidth === right.renderWidth &&
    left.renderHeight === right.renderHeight &&
    left.force === right.force &&
    left.scale === right.scale &&
    left.silenceCutoffPercent === right.silenceCutoffPercent &&
    left.gridSparseness === right.gridSparseness &&
    left.showHeatmap === right.showHeatmap &&
    left.vectorOverlayDensity === right.vectorOverlayDensity &&
    left.spectralSlopeDbPerOct === right.spectralSlopeDbPerOct &&
    left.amplitudeContrast === right.amplitudeContrast &&
    left.swirlDensity === right.swirlDensity &&
    left.swirlMinimumAngleDegrees === right.swirlMinimumAngleDegrees &&
    left.swirlStrengthPercent === right.swirlStrengthPercent &&
    left.swirlFalloff === right.swirlFalloff &&
    left.swirlDirectionBias === right.swirlDirectionBias &&
    left.directionNoiseMix === right.directionNoiseMix &&
    left.randomSeed === right.randomSeed
  );
}
