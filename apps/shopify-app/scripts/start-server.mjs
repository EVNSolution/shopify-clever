import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const SENSITIVE_REQUEST_QUERY_VALUE = /([?&](?:hmac|id_token|session)=)[^&\s"']*/gi;

export function redactSensitiveRequestLogValues(line) {
  return String(line).replace(SENSITIVE_REQUEST_QUERY_VALUE, "$1REDACTED");
}

function forwardRedactedLines(stream, destination) {
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  lines.on("line", (line) => {
    destination.write(`${redactSensitiveRequestLogValues(line)}\n`);
  });
}

export function startServer(buildPath = "./build/server/index.js") {
  const serverExecutable = fileURLToPath(
    new URL("../node_modules/.bin/react-router-serve", import.meta.url),
  );
  const child = spawn(serverExecutable, [buildPath], {
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  forwardRedactedLines(child.stdout, process.stdout);
  forwardRedactedLines(child.stderr, process.stderr);

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => child.kill(signal));
  }

  child.once("error", (error) => {
    console.error("Unable to start React Router server", error);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });

  return child;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  startServer(process.argv[2]);
}
