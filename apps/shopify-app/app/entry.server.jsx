import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";
import {
  createTelemetryRequestId,
  logSafeOperationalEvent,
} from "./features/telemetry/structured-telemetry.server";

export const streamTimeout = 30_000;

export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  reactRouterContext,
) {
  const correlationId = createTelemetryRequestId();
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError() {
          responseStatusCode = 500;
          logSafeOperationalEvent("error", "ssr_render_failed", {
            correlationId,
            errorCode: "SSR_RENDER_FAILED",
            stage: "render",
          });
        },
      },
    );

    // Keep the stream alive past deferred route timeouts so React can flush
    // either the resolved content or its retry boundary before aborting.
    setTimeout(abort, streamTimeout + 1000);
  });
}
