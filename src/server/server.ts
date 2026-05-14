import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { generateDisplacementField } from "../field/composeField.js";
import { parseParameters } from "../shared/params.js";
import { encodeGeneratedDisplacementField } from "./exportBinary.js";
import { renderFieldSvg } from "./renderSvg.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(currentDirectory, "../..");
const sourceRoot = path.join(projectRoot, "src");

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

  if (
    requestUrl.pathname.startsWith("/src/") &&
    requestUrl.pathname.endsWith(".js")
  ) {
    const relativePath = requestUrl.pathname.slice(1);
    await serveBrowserModule(relativePath, response);
    return;
  }

  sendText(response, 404, "Not found");
}

async function serveBrowserModule(
  relativePath: string,
  response: ServerResponse,
): Promise<void> {
  const relativeSourcePath = relativePath
    .slice("src/".length)
    .replace(/\.js$/, ".ts");
  const sourceFilePath = path.resolve(sourceRoot, relativeSourcePath);
  const sourceRootPrefix = `${sourceRoot}${path.sep}`;

  if (
    sourceFilePath !== sourceRoot &&
    !sourceFilePath.startsWith(sourceRootPrefix)
  ) {
    sendText(response, 404, "Not found");
    return;
  }

  try {
    const fileStat = await stat(sourceFilePath);
    if (!fileStat.isFile()) {
      sendText(response, 404, "Not found");
      return;
    }
  } catch {
    sendText(response, 404, "Not found");
    return;
  }

  try {
    const source = await readFile(sourceFilePath, "utf-8");
    const output = stripTypeScriptTypes(source, {
      mode: "strip",
      sourceUrl: pathToFileURL(sourceFilePath).href,
    });

    response.writeHead(200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(output);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown module transform error";
    sendText(response, 500, message);
  }
}

function serveFieldSvg(requestUrl: URL, response: ServerResponse): void {
  try {
    const parameters = parseParameters(requestUrl.searchParams);
    const width = parameters.renderWidth;
    const height = parameters.renderHeight;
    const field = generateDisplacementField(parameters);
    const svg = renderFieldSvg(field, {
      width,
      height,
      showHeatmap: parameters.showHeatmap,
      vectorOverlayDensity: parameters.vectorOverlayDensity,
    });
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
    const parameters = parseParameters(requestUrl.searchParams);
    const field = generateDisplacementField(parameters);
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
