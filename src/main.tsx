import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { lazy, Suspense } from "react";
import QueryProvider from "./app/QueryProvider";
import App from "./app/App";
import "./index.css";

const Toaster = lazy(() =>
  import("sonner").then((module) => ({ default: module.Toaster })),
);

try {
  const legacyCachePrefixes = [
    "mylnder-admin-users-v",
    "mylnder-admin-invoice-v1-",
  ];
  Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index),
  )
    .filter(
      (key): key is string =>
        key !== null &&
        legacyCachePrefixes.some((prefix) => key.startsWith(prefix)),
    )
    .forEach((key) => localStorage.removeItem(key));
} catch {
  console.warn("Unable to clear legacy local data caches.");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryProvider>
      <BrowserRouter future={{ v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
      <Suspense fallback={null}>
        <Toaster position="top-right" richColors closeButton duration={4_000} />
      </Suspense>
    </QueryProvider>
  </React.StrictMode>
);