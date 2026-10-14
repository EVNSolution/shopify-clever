/* eslint-disable react/prop-types */
import { createElement } from "react";

export function CustomerEmailPreviewFrame({ fallbackText, html, title }) {
  if (!html) {
    return fallbackText ? createElement("pre", { style: fallbackStyle }, fallbackText) : null;
  }

  return createElement("iframe", {
    referrerPolicy: "no-referrer",
    sandbox: "",
    srcDoc: html,
    style: frameStyle,
    title,
  });
}

const frameStyle = {
  background: "#ffffff",
  border: "1px solid #d0d7de",
  borderRadius: "8px",
  boxSizing: "border-box",
  minHeight: "520px",
  width: "100%",
};

const fallbackStyle = {
  background: "#ffffff",
  border: "1px solid #d0d7de",
  borderRadius: "8px",
  boxSizing: "border-box",
  margin: 0,
  minHeight: "180px",
  overflow: "auto",
  padding: "16px",
  whiteSpace: "pre-wrap",
};
