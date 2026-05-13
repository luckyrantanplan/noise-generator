import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createGridFromSparseness } from "../field/grid.js";
import { generateVectorField } from "../field/composeField.js";
import { parseParameters } from "../shared/params.js";
import type { ParameterValues, RenderOptions } from "../shared/types.js";
import { encodeGeneratedDisplacementField } from "./exportBinary.js";
import { renderFieldSvg } from "./renderSvg.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(currentDirectory, "../../..");
const distRoot = path.join(projectRoot, "dist");

export function createAppServer(): Server {
  return createServer((request, response) => {
    void routeRequest(request, response);
  });
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.url === undefined) {
    sendText(response, 400, "Missing request URL");
    return;
  }

  const requestUrl = new URL(request.url, "http://localhost");
  if (requestUrl.pathname === "/") {
    await serveFile(
      path.join(projectRoot, "index.html"),
      "text/html; charset=utf-8",
      response,
    );
    return;
  }

  if (requestUrl.pathname === "/api/field.svg") {
    serveFieldSvg(requestUrl, response);
    return;
  }

  if (requestUrl.pathname === "/api/field.bin") {
    serveFieldBinary(requestUrl, response);
    return;
  }

  if (requestUrl.pathname.startsWith("/src/")) {
    const relativePath = requestUrl.pathname.slice(1);
    await serveFile(
      path.join(distRoot, relativePath),
      contentTypeForPath(relativePath),
      response,
    );
    return;
  }

  sendText(response, 404, "Not found");
}

function serveFieldSvg(requestUrl: URL, response: ServerResponse): void {
  try {
    const { field, renderOptions } =
      generateFieldResponseData(requestUrl);
    const svg = renderFieldSvg(field, renderOptions);
    response.writeHead(200, {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(svg);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown render error";
    sendText(response, 500, message);
  }
}

function serveFieldBinary(requestUrl: URL, response: ServerResponse): void {
  try {
    const { field, parameters } = generateFieldResponseData(requestUrl);
    const bytes = encodeGeneratedDisplacementField(parameters, field);
    response.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-disposition": 'attachment; filename="displacement-field.bin"',
      "cache-control": "no-store",
    });
    response.end(bytes);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown export error";
    sendText(response, 500, message);
  }
}

function generateFieldResponseData(requestUrl: URL): {
  field: ReturnType<typeof generateVectorField>;
  parameters: ParameterValues;
  renderOptions: RenderOptions;
} {
  const parameters = parseParameters(requestUrl.searchParams);
  const renderOptions = createRenderOptions(parameters);
  const grid = createGridFromSparseness(
    renderOptions.width,
    renderOptions.height,
    parameters.gridSparseness,
  );
  const field = generateVectorField(parameters, grid);

  return { field, parameters, renderOptions };
}

function createRenderOptions(parameters: ParameterValues): RenderOptions {
  return {
    width: parameters.renderWidth,
    height: parameters.renderHeight,
    showHeatmap: parameters.showHeatmap,
    vectorOverlayDensity: parameters.vectorOverlayDensity,
  };
}

async function serveFile(
  filePath: string,
  contentType: string,
  response: ServerResponse,
): Promise<void> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendText(response, 404, "Not found");
      return;
    }
  } catch {
    sendText(response, 404, "Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(response);
}

function sendText(
  response: ServerResponse,
  statusCode: number,
  message: string,
): void {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
  });
  response.end(message);
}

function contentTypeForPath(filePath: string): string {
  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  return "application/octet-stream";
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const port = Number(process.env.PORT ?? "4173");
  const server = createAppServer();
  server.listen(port, () => {
    console.log(
      `Displacement field generator listening on http://localhost:${String(port)}`,
    );
  });
}
