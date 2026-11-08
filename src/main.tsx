import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { runVersionGate } from "./lib/versionGate";
import ErrorBoundary from "./components/ErrorBoundary";

// Version check runs before anything renders: a stale session from an older
// bundle is cleared here so the app lands on Login within 1-2s (see
// src/lib/versionGate.ts). It never blocks first paint (fully synchronous,
// no network wait).
runVersionGate();

// No white screen of death: any crash that escapes the per-route boundaries
// (a provider, the router itself) lands in this outermost boundary instead of
// unmounting the whole tree to a blank page.
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary variant="app">
    <App />
  </ErrorBoundary>
);
