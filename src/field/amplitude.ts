import { clamp } from "../shared/params.js";
import type { ParameterValues, ScalarField } from "../shared/types.js";

export function shapeAmplitudeField(
  normalizedField: ScalarField,
  parameters: ParameterValues,
): Float32Array {
  const outputValues = new Float32Array(normalizedField.values.length);
  const amplitudeRange = Math.max(
    0,
    parameters.amplitudeMax - parameters.amplitudeMin,
  );

  for (let index = 0; index < normalizedField.values.length; index += 1) {
    const normalizedValue = clamp(normalizedField.values[index], 0, 1);
    const contrastedValue = Math.pow(
      normalizedValue,
      parameters.amplitudeContrast,
    );
    outputValues[index] =
      parameters.amplitudeMin + contrastedValue * amplitudeRange;
  }

  return outputValues;
}
