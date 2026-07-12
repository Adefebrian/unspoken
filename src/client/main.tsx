import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header.tsx";
import { Footer } from "./components/Footer.tsx";
import { Toaster } from "./components/Toaster.tsx";
import { LetterModal } from "./components/LetterModal.tsx";
import { ReleasedModal } from "./components/ReleasedModal.tsx";
import { CrisisModal } from "./components/CrisisModal.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { SmoothScroll } from "./lib/SmoothScroll.tsx";
import { initTelemetry } from "./lib/telemetry.ts";
import { Home } from "./pages/Home.tsx";

// The archive is only needed on /all, so it loads as a lazy chunk and stays out
// of the home (LCP) bundle.
const Archive = lazy(() => import("./pages/Archive.tsx").then((m) => ({ default: m.Archive })));

initTelemetry();

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root");

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <SmoothScroll>
          <Header />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/all" element={<Suspense fallback={null}><Archive /></Suspense>} />
            <Route path="*" element={<Home />} />
          </Routes>
          <Footer />
        </SmoothScroll>
        <LetterModal />
        <ReleasedModal />
        <CrisisModal />
        <Toaster />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
