import {
  createDisplacementMetadata,
  encodeDisplacementField,
  interleaveDisplacements,
} from "../shared/displacementBinary.js";
import type { ParameterValues, VectorField } from "../shared/types.js";

export function encodeGeneratedDisplacementField(
  parameters: ParameterValues,
  field: VectorField,
): Uint8Array {
  const metadata = createDisplacementMetadata({
    parameters,
    grid: field.grid,
    renderWidth: parameters.renderWidth,
    renderHeight: parameters.renderHeight,
  });
  const displacements = interleaveDisplacements(
    field.displacementX,
    field.displacementY,
  );
  return encodeDisplacementField(metadata, displacements);
}
