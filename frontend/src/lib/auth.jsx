import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { api } from "./api";
import { tr } from "./i18n";
import { BADGE_TEXT } from "./badges";
import { pet } from "./events";
import { useToast } from "../components/ui";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [profile, setProfile] = useState(null);
  const toast = useToast();
  const [stats, setStats] = useState({ streak: 0, xp_today: 0, xp_total: 0, level: 1 });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshStats = useCallback(
    (check = true) =>
      api(check === false ? "/stats" : "/stats?check=1")
        .then((s) => {
          setStats(s);
          // celebrate badges earned since the last check
          (s.new_badges || []).forEach((id) => {
            const name = BADGE_TEXT[id]?.[0];
            if (name) toast(tr("Badge earned: {name}", { name: tr(name) }));
          });
          if (s.new_badges?.length) pet("badge");
        })
        .catch(() => {}),
    [toast]
  );

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    api("/profile").then(setProfile).catch(() => setProfile({ display_name: "", daily_goal_xp: 100, subjects: [], onboarded: true }));
    refreshStats(false); // header numbers only; badges are checked after something is earned
  }, [session?.user?.id, refreshStats]);

  const saveProfile = async (changes) => {
    const next = await api("/profile", { method: "PUT", json: { ...profile, ...changes } });
    setProfile(next);
    return next;
  };

  const name = profile?.display_name || session?.user?.email?.split("@")[0] || "there";

  return (
    <AuthContext.Provider value={{ session, user: session?.user, profile, saveProfile, stats, refreshStats, name }}>
      {children}
    </AuthContext.Provider>
  );
}
