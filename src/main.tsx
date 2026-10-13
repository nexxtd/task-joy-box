import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { runVersionGate } from "./lib/versionGate";

// Version check runs before anything renders: a stale session from an older
// bundle is cleared here so the app lands on Login within 1-2s (see
// src/lib/versionGate.ts). It never blocks first paint (fully synchronous,
// no network wait).
runVersionGate();

createRoot(document.getElementById("root")!).render(<App />);
