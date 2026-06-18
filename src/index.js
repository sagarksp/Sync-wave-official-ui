import React from "react";
import ReactDOM from "react-dom/client";
import Root from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Root />);

if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((err) => {
      console.log("[SyncWave PWA] Service worker registration failed", err.message);
    });
  });
}
