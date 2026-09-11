export function isServerRenderedErrorBoundary(document) {
  return (
    document.body.firstElementChild?.textContent === "Handling response" ||
    document.querySelector("[data-shopify-document-error]") != null
  );
}

export function shouldHydrateDocument(document) {
  return !isServerRenderedErrorBoundary(document);
}
