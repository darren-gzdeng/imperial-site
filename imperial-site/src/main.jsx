import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./frontend/App";
import "./frontend/index.css";
import "./frontend/styles/admin.css";
import "./frontend/styles/account.css";
import "./frontend/styles/auth.css";
import "./frontend/styles/catalog.css";
import "./frontend/styles/commerce.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/imperial-site/">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
