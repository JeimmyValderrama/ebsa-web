import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { PresentationProvider } from "./app/Presentation";
import App from "./app/App";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PresentationProvider>
          <App />
        </PresentationProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
