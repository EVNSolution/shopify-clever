import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { installStaleBundleRecovery } from "./features/runtime/stale-bundle-recovery";

installStaleBundleRecovery();

function isShopifyBoundaryResponse() {
  return document.body.firstElementChild?.textContent === "Handling response";
}

if (!isShopifyBoundaryResponse()) {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>,
    );
  });
}
