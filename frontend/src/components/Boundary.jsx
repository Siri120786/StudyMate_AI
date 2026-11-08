import { Component, lazy } from "react";
import { Link } from "react-router-dom";
import { tr } from "../lib/i18n";
import { Skeleton } from "./ui";

const RELOADED = "studymate-chunk-reload";

/**
 * Like React.lazy, but survives a new deploy. After a rebuild the old page files are gone, so importing one fails
 * and the page would hang forever. We reload once to pick up the new files, and only then give up with an error.
 */
export function lazyPage(factory) {
  return lazy(() =>
    factory()
      .then((m) => {
        try { sessionStorage.removeItem(RELOADED); } catch {}
        return m;
      })
      .catch((err) => {
        let already = false;
        try {
          already = sessionStorage.getItem(RELOADED) === "1";
          sessionStorage.setItem(RELOADED, "1");
        } catch {}
        if (!already) {
          window.location.reload();
          return new Promise(() => {}); // the page is reloading
        }
        throw err;
      })
  );
}

/** Shown in the page area while a page's code is loading. The top bar stays, so navigation feels instant. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" role="status" aria-label={tr("Loading")}>
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-64" />
      <Skeleton className="h-24" />
    </div>
  );
}

/** Catches a page that fails to load or draw, so the person sees a way forward instead of a blank screen. */
export class RouteBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Page failed:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line/50 bg-card p-8 text-center" role="alert">
        <h1 className="text-2xl font-bold">{tr("This page could not load")}</h1>
        <p className="mt-2 text-mute">{tr("Your connection may have dropped, or the app was just updated. Reloading usually fixes it.")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={() => window.location.reload()} className="rounded-full bg-brand px-6 py-2.5 font-semibold text-white">{tr("Reload")}</button>
          <Link to="/dashboard" onClick={() => this.setState({ failed: false })} className="rounded-full border border-line px-6 py-2.5 font-semibold">{tr("Go to dashboard")}</Link>
        </div>
      </div>
    );
  }
}
