import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { L, LANGS, tr, useI18n } from "../lib/i18n";
import { Button, Icon, Logo } from "./ui";
import { SidekickProvider, useSidekick } from "./Sidekick";
import StudyCat from "./StudyCat";
import { PageSkeleton, RouteBoundary } from "./Boundary";
import { ReminderWatcher } from "./Comfort";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? tr("Switch to light mode") : tr("Switch to dark mode")}
      className="grid h-10 w-10 place-items-center rounded-full bg-high text-mute transition hover:text-ink"
    >
      <Icon name={theme === "dark" ? "dark_mode" : "light_mode"} size={20} />
    </button>
  );
}

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={tr("Language")}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-10 items-center gap-1.5 rounded-full bg-high px-3 text-sm font-semibold text-mute transition hover:text-ink"
      >
        <Icon name="translate" size={20} />
        <span className="hidden uppercase sm:inline">{lang}</span>
      </button>
      {open && (
        <ul role="listbox" aria-label={tr("Language")} className="pop absolute right-0 top-12 z-40 w-44 overflow-hidden rounded-2xl border border-line/50 bg-card py-1 shadow-2xl">
          {LANGS.map((l) => (
            <li key={l.code} role="option" aria-selected={l.code === lang}>
              <button
                onClick={() => { setOpen(false); setLang(l.code); }}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-high ${l.code === lang ? "font-semibold text-primary" : ""}`}
              >
                {l.native}
                {l.code === lang && <Icon name="check" size={18} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line/30 bg-low/50">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-mute sm:px-6 md:flex-row">
        <Logo className="scale-90" />
        <p className="text-center">&copy; {new Date().getFullYear()} StudyMate AI. {tr("Distraction-free AI learning.")}</p>
        <nav className="flex gap-6" aria-label={tr("Footer")}>
          <Link to="/privacy" className="hover:text-ink">{tr("Privacy")}</Link>
          <Link to="/terms" className="hover:text-ink">{tr("Terms")}</Link>
          <Link to="/#faq" className="hover:text-ink">{tr("FAQ")}</Link>
        </nav>
      </div>
    </footer>
  );
}

const LINKS = [
  { to: "/dashboard", label: L("Dashboard"), icon: "dashboard" },
  { to: "/library", label: L("Library"), icon: "auto_stories" },
  { to: "/quizzes", label: L("Quizzes"), icon: "quiz" },
  { to: "/analytics", label: L("Analytics"), icon: "monitoring" },
  { to: "/planner", label: L("Planner"), icon: "event" },
];

function UserMenu() {
  const { user, name } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={tr("Account menu")}
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-full bg-primary/25 font-display text-sm font-bold text-primary ring-2 ring-transparent transition hover:ring-brand"
      >
        {name.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="pop absolute right-0 top-12 z-40 w-60 overflow-hidden rounded-2xl border border-line/50 bg-card shadow-2xl">
          <div className="border-b border-line/40 px-4 py-3">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-xs text-faint">{user?.email}</p>
          </div>
          <Link to="/achievements" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-high">
            <Icon name="emoji_events" size={18} /> {tr("Achievements")}
          </Link>
          <Link to="/groups" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-high">
            <Icon name="groups" size={18} /> {tr("Study groups")}
          </Link>
          <Link to="/focus" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-high">
            <Icon name="timer" size={18} /> {tr("Focus timer")}
          </Link>
          <Link to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-high">
            <Icon name="settings" size={18} /> {tr("Settings")}
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/");
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-high"
          >
            <Icon name="logout" size={18} /> {tr("Sign out")}
          </button>
        </div>
      )}
    </div>
  );
}

function TopNav() {
  const { stats } = useAuth();
  return (
    <header className="glass sticky top-0 z-30 border-b border-line/30">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
        <Logo to="/dashboard" />
        <nav className="hidden items-center gap-1 md:flex" aria-label={tr("Main")}>
          <Link to="/#features" className="rounded-full px-3 py-2 text-[15px] text-mute hover:text-ink">{tr("Features")}</Link>
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => `rounded-full px-3 py-2 text-[15px] transition ${isActive ? "bg-high font-semibold text-ink" : "text-mute hover:text-ink"}`}
            >
              {tr(l.label)}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/analytics"
            title={`${stats.xp_total} XP total`}
            className="hidden items-center gap-1.5 rounded-full bg-high px-3 py-2 text-sm font-semibold sm:flex"
          >
            <Icon name="local_fire_department" fill className="text-amber" size={18} />
            {stats.streak}
            <span className="ml-1 text-cyan">{stats.xp_today} XP</span>
            {stats.level > 0 && <span className="ml-1 rounded-full bg-brand/30 px-2 py-0.5 text-xs text-primary">{tr("Lv {n}", { n: stats.level })}</span>}
          </Link>
          <Link to="/focus" aria-label={tr("Focus timer")} title={tr("Focus timer")} className="grid h-10 w-10 place-items-center rounded-full bg-high text-mute transition hover:text-ink"><Icon name="timer" size={20} /></Link>
          <LangSwitch />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const sidekick = useSidekick();
  const item = "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold";
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-30 flex border-t border-line/30 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label={tr("Main")}>
      {LINKS.map((l) => (
        <NavLink key={l.to} to={l.to} className={({ isActive }) => `${item} ${isActive ? "text-primary" : "text-faint"}`}>
          <Icon name={l.icon} size={22} />
          {tr(l.label)}
        </NavLink>
      ))}
      <button onClick={sidekick.open} className={`${item} text-faint`}>
        <Icon name="smart_toy" size={22} />
        {tr("Sidekick")}
      </button>
    </nav>
  );
}

function SidekickFab() {
  const sidekick = useSidekick();
  const { pathname } = useLocation();
  if (pathname.startsWith("/doc/") || pathname.startsWith("/quiz/")) return null;
  return (
    <button
      onClick={sidekick.open}
      className="fixed bottom-6 right-6 z-30 hidden items-center gap-2 rounded-full bg-primary/90 px-5 py-3 text-sm font-semibold text-[#2900a0] shadow-[0_8px_30px_-6px_rgb(108_92_231/0.8)] transition hover:scale-105 md:flex"
    >
      <Icon name="smart_toy" size={20} /> {tr("Ask Sidekick")}
    </button>
  );
}

function OfflineNotice() {
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && !navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="sticky top-16 z-20 bg-amber/20 px-4 py-2 text-center text-sm font-semibold text-amber">
      {tr("You are offline. Summaries and quizzes need a connection, but the app itself is still here.")}
    </div>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <SidekickProvider>
      <div className="flex min-h-[100dvh] flex-col">
        <TopNav />
        <OfflineNotice />
        <ReminderWatcher />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-28 pt-8 sm:px-6 md:pb-12">
          <RouteBoundary key={pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </RouteBoundary>
        </main>
        <Footer />
        <BottomNav />
        <SidekickFab />
        <StudyCat />
      </div>
    </SidekickProvider>
  );
}

export function PublicNav({ links = [], overlay = false }) {
  const { session } = useAuth();
  const [atTop, setAtTop] = useState(true);
  useEffect(() => {
    if (!overlay) return;
    const on = () => setAtTop(window.scrollY < 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [overlay]);
  const clear = overlay && atTop;
  // Over the landing video the bar is see-through and always uses the dark palette (white text), in either theme.
  // Once the page scrolls it becomes the normal frosted bar.
  return (
    <header className={`${overlay ? "fixed inset-x-0" : "sticky"} top-0 z-30 border-b transition-[background-color,border-color,backdrop-filter] duration-300 ${clear ? "dark border-transparent bg-transparent" : "glass border-line/20"}`}>
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
        <div className="min-w-0 shrink [&_span]:truncate"><Logo /></div>
        <nav className="hidden items-center gap-8 md:flex" aria-label={tr("Main")}>
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[15px] font-medium text-mute transition hover:text-ink">{tr(l.label)}</a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LangSwitch />
          <ThemeToggle />
          {session ? (
            <Button as={Link} to="/dashboard" size="sm" className={clear ? "liquid-glass !rounded-full !bg-transparent !px-5 !text-white !shadow-none" : ""}>{tr("Dashboard")}</Button>
          ) : (
            <>
              <Button as={Link} to="/login" size="sm" className={clear ? "liquid-glass !rounded-full !bg-transparent !px-5 !text-white !shadow-none" : ""}>{tr("Log in")}</Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicShell({ children, links, overlay = false }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PublicNav links={links} overlay={overlay} />
      <div className="flex-1">{children}</div>
      <Footer />
      <StudyCat />
    </div>
  );
}
