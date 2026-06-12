import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import { API_BASE } from "./lib/api-base";
import "./index.css";

// Point the generated API client at the API server. Empty when same-origin.
setBaseUrl(API_BASE || null);

createRoot(document.getElementById("root")!).render(<App />);
