import { useEffect, useRef } from "react";

export const HERO_VIDEO = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4";

/**
 * The looping night-study video used behind the landing hero, the closing call to action and the sign-in panel.
 * It sits on a navy background, so if the video cannot load the section still looks right.
 * With "Fewer animations" or the OS reduced-motion setting it stays on a still frame.
 */
export function CineVideo({ className = "" }) {
  const ref = useRef();
  useEffect(() => {
    const v = ref.current;
    const still = document.documentElement.dataset.calm === "1" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (v && still) v.pause();
  }, []);
  return (
    <video
      ref={ref}
      className={`absolute inset-0 -z-10 h-full w-full object-cover ${className}`}
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    >
      <source src={HERO_VIDEO} type="video/mp4" />
    </video>
  );
}
