import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { CHALLENGE_TEXT } from "../lib/badges";
import { pet } from "../lib/events";
import { Button, Icon, ProgressBar, Skeleton, useToast } from "./ui";
import { tr } from "../lib/i18n";

/** Today's three challenges. Finish one, then claim its bonus XP. */
export default function Challenges() {
  const toast = useToast();
  const { refreshStats } = useAuth();
  const [list, setList] = useState(null);

  const load = useCallback(() => api("/challenges").then(setList).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);

  const claim = async (key) => {
    try {
      const r = await api(`/challenges/${key}/claim`, { method: "POST" });
      toast(tr("+{xp} bonus XP", { xp: r.xp }));
      pet("cheer");
      load();
      refreshStats();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  if (!list) return <Skeleton className="h-40" />;
  if (!list.length) return null;
  return (
    <ul className="space-y-3">
      {list.map((c) => (
        <li key={c.key} className="rounded-2xl border border-line/40 bg-low p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-semibold">
              <Icon name={c.claimed ? "check_circle" : c.complete ? "emoji_events" : "flag"} fill={c.claimed} size={20} className={c.claimed ? "text-cyan" : c.complete ? "text-amber" : "text-faint"} />
              {tr(CHALLENGE_TEXT[c.key], { n: c.goal })}
            </p>
            {c.claimed ? (
              <span className="label text-cyan">{tr("Claimed")}</span>
            ) : c.complete ? (
              <Button size="sm" icon="redeem" onClick={() => claim(c.key)}>{tr("Claim +{xp} XP", { xp: c.bonus })}</Button>
            ) : (
              <span className="label text-faint">+{c.bonus} XP</span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar value={(100 * c.progress) / c.goal} tone={c.complete ? "cyan" : "primary"} className="flex-1" />
            <span className="w-14 text-right font-mono text-xs text-mute">{c.progress}/{c.goal}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
