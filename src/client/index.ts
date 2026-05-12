import {
  DEFAULT_PARAMETERS,
  PARAMETER_DEFINITIONS,
  serializeParameters,
  type BooleanParameterDefinition,
  type NumericParameterDefinition,
  type SeedParameterDefinition,
} from "../shared/params.js";
import type { ParameterValues } from "../shared/types.js";

const controlsElement = requireElement("#controls");
const previewElement = requireElement("#preview");
const statusElement = requireElement("#status");

const currentParameters: ParameterValues = { ...DEFAULT_PARAMETERS };
let pendingRequest = 0;

buildControls(controlsElement, currentParameters);
void refreshPreview(currentParameters);

function requireElement(selector: "#controls"): HTMLFormElement;
function requireElement(selector: "#preview"): HTMLDivElement;
function requireElement(selector: "#status"): HTMLSpanElement;
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
  for (const definition of PARAMETER_DEFINITIONS) {
    if (definition.key === "randomSeed") {
      form.appendChild(createSeedControl(definition, parameters));
      continue;
    }
    if (definition.key === "showHeatmap") {
      form.appendChild(createBooleanControl(definition, parameters));
      continue;
    }
    form.appendChild(createNumericControl(definition, parameters));
  }
}

function createBooleanControl(
  definition: BooleanParameterDefinition,
  parameters: ParameterValues,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "control";

  const label = document.createElement("label");
  label.htmlFor = definition.key;
  label.appendChild(createLabelContent(definition.label, definition.description));

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
  label.appendChild(createLabelContent(definition.label, definition.description));

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
    rangeInput.value = String(nextValue);
    valueOutput.textContent = String(nextValue);
    if (writeBackToInput) {
      numberInput.value = String(nextValue);
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
    rangeInput.value = String(nextValue);
    valueOutput.textContent = String(nextValue);
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
  statusElement.textContent = "Rendering";
  const searchParams = serializeParameters(parameters);
  const response = await fetch(`/api/field.svg?${searchParams.toString()}`);
  if (!response.ok) {
    statusElement.textContent = "Render failed";
    previewElement.textContent = await response.text();
    return;
  }
  previewElement.innerHTML = await response.text();
  statusElement.textContent = "Ready";
}
