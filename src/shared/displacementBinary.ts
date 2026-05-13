import type {
  DecodedDisplacementField,
  DisplacementBinaryMetadata,
} from "./types.js";

export const DISPLACEMENT_BINARY_MAGIC = "DFLD";
export const DISPLACEMENT_BINARY_VERSION = 2;

const MAGIC_LENGTH = 4;
const VERSION_LENGTH = 1;
const METADATA_LENGTH_BYTES = 4;
const HEADER_LENGTH = MAGIC_LENGTH + VERSION_LENGTH + METADATA_LENGTH_BYTES;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createDisplacementMetadata(
  metadata: Omit<
    DisplacementBinaryMetadata,
    "sampleFormat" | "ordering" | "displacementRule"
  >,
): DisplacementBinaryMetadata {
  return {
    ...metadata,
    sampleFormat: "f32-interleaved-dxdy",
    ordering: "row-major",
    displacementRule: "p_plus_z",
  };
}

export function interleaveDisplacements(
  displacementX: Float32Array,
  displacementY: Float32Array,
): Float32Array {
  if (displacementX.length !== displacementY.length) {
    throw new Error("Displacement component arrays must have the same length");
  }

  const interleaved = new Float32Array(displacementX.length * 2);
  for (let index = 0; index < displacementX.length; index += 1) {
    const outputIndex = index * 2;
    interleaved[outputIndex] = displacementX[index];
    interleaved[outputIndex + 1] = displacementY[index];
  }
  return interleaved;
}

export function encodeDisplacementField(
  metadata: DisplacementBinaryMetadata,
  displacements: Float32Array,
): Uint8Array {
  validateDisplacementLength(metadata, displacements.length);

  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  const output = new Uint8Array(
    HEADER_LENGTH + metadataBytes.length + displacements.byteLength,
  );
  const view = new DataView(output.buffer);

  output.set(encoder.encode(DISPLACEMENT_BINARY_MAGIC), 0);
  view.setUint8(MAGIC_LENGTH, DISPLACEMENT_BINARY_VERSION);
  view.setUint32(MAGIC_LENGTH + VERSION_LENGTH, metadataBytes.length, true);
  output.set(metadataBytes, HEADER_LENGTH);

  const payloadOffset = HEADER_LENGTH + metadataBytes.length;
  for (let index = 0; index < displacements.length; index += 1) {
    view.setFloat32(
      payloadOffset + index * Float32Array.BYTES_PER_ELEMENT,
      displacements[index],
      true,
    );
  }

  return output;
}

export function decodeDisplacementField(
  input: ArrayBuffer | ArrayBufferView,
): DecodedDisplacementField {
  const bytes = asUint8Array(input);
  if (bytes.byteLength < HEADER_LENGTH) {
    throw new Error("Binary displacement file is too short");
  }

  const magic = decoder.decode(bytes.subarray(0, MAGIC_LENGTH));
  if (magic !== DISPLACEMENT_BINARY_MAGIC) {
    throw new Error(`Unexpected binary magic: ${magic}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(MAGIC_LENGTH);
  if (version !== DISPLACEMENT_BINARY_VERSION) {
    throw new Error(
      `Unsupported binary displacement version: ${String(version)}`,
    );
  }

  const metadataLength = view.getUint32(MAGIC_LENGTH + VERSION_LENGTH, true);
  const metadataStart = HEADER_LENGTH;
  const metadataEnd = metadataStart + metadataLength;
  if (metadataEnd > bytes.byteLength) {
    throw new Error("Binary displacement metadata is truncated");
  }

  const metadata = JSON.parse(
    decoder.decode(bytes.subarray(metadataStart, metadataEnd)),
  ) as DisplacementBinaryMetadata;
  const payloadBytes = bytes.subarray(metadataEnd);
  if (payloadBytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error(
      "Binary displacement payload is not aligned to Float32 values",
    );
  }

  const displacementCount =
    payloadBytes.byteLength / Float32Array.BYTES_PER_ELEMENT;
  validateDisplacementLength(metadata, displacementCount);

  const displacements = new Float32Array(displacementCount);
  const payloadView = new DataView(
    payloadBytes.buffer,
    payloadBytes.byteOffset,
    payloadBytes.byteLength,
  );
  for (let index = 0; index < displacementCount; index += 1) {
    displacements[index] = payloadView.getFloat32(
      index * Float32Array.BYTES_PER_ELEMENT,
      true,
    );
  }

  return {
    metadata,
    displacements,
  };
}

function validateDisplacementLength(
  metadata: DisplacementBinaryMetadata,
  displacementCount: number,
): void {
  const expectedCount = metadata.grid.width * metadata.grid.height * 2;
  if (displacementCount !== expectedCount) {
    throw new Error(
      `Binary displacement payload length ${String(displacementCount)} does not match expected ${String(expectedCount)}`,
    );
  }
}

function asUint8Array(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}
