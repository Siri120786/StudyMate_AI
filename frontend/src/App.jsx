import { Suspense, useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { AppShell } from "./components/Layout";
import Landing from "./pages/Landing";
import { Forgot, Login, Reset, Signup } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import { NotFound, Privacy, Terms } from "./pages/Legal";
import { RouteBoundary, lazyPage } from "./components/Boundary";
// Everything except the landing page, sign-in and dashboard loads when first visited, which keeps the first
// download small. Idle prefetch (below) fetches the rest quietly after sign-in.
const pages = {
  Onboarding: () => import("./pages/Onboarding"),
  Library: () => import("./pages/Library"),
  Document: () => import("./pages/Document"),
  Quizzes: () => import("./pages/Quizzes"),
  QuizSession: () => import("./pages/QuizSession"),
  Analytics: () => import("./pages/Analytics"),
  Settings: () => import("./pages/Settings"),
  Planner: () => import("./pages/Planner"),
  Focus: () => import("./pages/Focus"),
  Achievements: () => import("./pages/Achievements"),
  Print: () => import("./pages/Print"),
  Groups: () => import("./pages/Groups"),
  Shared: () => import("./pages/Shared"),
};
const Onboarding = lazyPage(pages.Onboarding);
const Library = lazyPage(pages.Library);
const Document = lazyPage(pages.Document);
const Quizzes = lazyPage(pages.Quizzes);
const QuizSession = lazyPage(pages.QuizSession);
const Analytics = lazyPage(pages.Analytics);
const Settings = lazyPage(pages.Settings);
const Planner = lazyPage(pages.Planner);
const Focus = lazyPage(pages.Focus);
const Achievements = lazyPage(pages.Achievements);
const Print = lazyPage(pages.Print);
const Groups = lazyPage(pages.Groups);
const Shared = lazyPage(pages.Shared);


function Splash() {
  return <div className="grid min-h-[100dvh] place-items-center"><span className="h-10 w-10 animate-spin rounded-full border-4 border-high border-t-brand" role="status" aria-label="Loading" /></div>;
}

/** Signed-in routes. New accounts are sent through onboarding once. */
function RequireAuth() {
  const { session, profile } = useAuth();
  const location = useLocation();
  if (session === undefined || (session && !profile)) return <Splash />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (!profile.onboarded && location.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
  return <Prefetch />;
}

/** Once signed in and idle, fetch the other pages' code so moving around never waits on a download. */
function Prefetch() {
  useEffect(() => {
    const warm = () => Object.values(pages).forEach((load) => load().catch(() => {}));
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const id = idle(warm);
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id));
  }, []);
  return <Outlet />;
}

function ScrollToHash() {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 50);
    else window.scrollTo(0, 0);
  }, [hash, pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToHash />
      <RouteBoundary>
      <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/s/:token" element={<Shared />} />

        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/doc/:id/print" element={<Print />} />
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/library" element={<Library />} />
            <Route path="/doc/:id" element={<Document />} />
            <Route path="/quizzes" element={<Quizzes />} />
            <Route path="/quiz/:id" element={<QuizSession />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/planner" element={<Planner />} />
            <Route path="/focus" element={<Focus />} />
            <Route path="/achievements" element={<Achievements />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      </RouteBoundary>
    </>
  );
}
