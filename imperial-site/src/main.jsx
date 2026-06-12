import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import "./index.css";
import "./styles/admin.css";
import "./styles/account.css";
import "./styles/auth.css";
import "./styles/catalog.css";
import "./styles/commerce.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/imperial-site/">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
