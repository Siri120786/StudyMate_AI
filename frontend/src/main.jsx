import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { I18nProvider, getLang, loadLanguage } from "./lib/i18n";
import { ToastProvider } from "./components/ui";
import "./index.css";
import "./lib/a11y";

// Show the icons only once their font is ready, so their text names (like "local_fire_department") never flash.
const iconsReady = () => document.documentElement.classList.add("icons-ready");
if (document.fonts?.load) {
  Promise.race([document.fonts.load('24px "Material Symbols Outlined"'), new Promise((r) => setTimeout(r, 2500))]).finally(iconsReady);
} else iconsReady();

// Draw once the saved language is loaded (instant for English), so the first screen is never in the wrong language.
loadLanguage(getLang()).finally(() => createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <I18nProvider>
            <App />
          </I18nProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </BrowserRouter>
));

// Offline shell. Skipped in development so hot reload is not served stale files.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
