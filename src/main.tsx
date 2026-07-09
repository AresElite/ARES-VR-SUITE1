import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { configureFonts } from "./utils/fonts";
import "./index.css";

configureFonts();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
