// src/index.jsx — the entry point referenced by index.html.
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { installAuthFetch } from "./lib/api";

// Must run before the first render so no request leaves without its token.
installAuthFetch();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
