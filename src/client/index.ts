import {
  DEFAULT_PARAMETERS,
  PARAMETER_DEFINITIONS,
  serializeParameters,
  type NumericParameterDefinition,
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
      form.appendChild(createSeedControl(parameters));
      continue;
    }
    form.appendChild(createNumericControl(definition, parameters));
  }
}

function createSeedControl(parameters: ParameterValues): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "control";

  const label = document.createElement("label");
  label.htmlFor = "randomSeed";
  label.textContent = "Random Seed";

  const input = document.createElement("input");
  input.id = "randomSeed";
  input.name = "randomSeed";
  input.type = "text";
  input.value = parameters.randomSeed;
  input.addEventListener("input", () => {
    parameters.randomSeed = input.value;
    queuePreviewRefresh(parameters);
  });

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
  const labelText = document.createElement("span");
  labelText.textContent = definition.label;
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
  numberInput.type = "number";
  numberInput.min = String(definition.min);
  numberInput.max = String(definition.max);
  numberInput.step = String(definition.step);
  numberInput.value = String(parameters[definition.key]);

  const updateValue = (rawValue: string): void => {
    const nextValue = definition.integer
      ? Math.round(Number(rawValue))
      : Number(rawValue);
    if (!Number.isFinite(nextValue)) {
      return;
    }
    parameters[definition.key] = nextValue;
    rangeInput.value = String(nextValue);
    numberInput.value = String(nextValue);
    valueOutput.textContent = String(nextValue);
    queuePreviewRefresh(parameters);
  };

  rangeInput.addEventListener("input", () => {
    updateValue(rangeInput.value);
  });
  numberInput.addEventListener("input", () => {
    updateValue(numberInput.value);
  });

  row.append(rangeInput, numberInput);
  wrapper.append(label, row);
  return wrapper;
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
