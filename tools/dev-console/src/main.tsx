import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Bare Træn Dev Console could not find its root element.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
