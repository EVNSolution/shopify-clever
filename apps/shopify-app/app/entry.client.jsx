import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { shouldHydrateDocument } from "./features/runtime/document-hydration";
import { installStaleBundleRecovery } from "./features/runtime/stale-bundle-recovery";

installStaleBundleRecovery();

function hydrateApp() {
  if (!shouldHydrateDocument(document)) return;

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>,
    );
  });
}

hydrateApp();
