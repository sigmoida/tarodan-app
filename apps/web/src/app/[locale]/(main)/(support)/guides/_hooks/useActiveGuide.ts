"use client";

import { useState, useEffect } from "react";
import { GUIDES } from "../_lib/guides";

/**
 * Owns which guide is shown and keeps it in sync with the URL hash, so deep
 * links like `/guides#selling` open the matching guide (and scroll to it).
 */
export function useActiveGuide() {
  const [activeGuide, setActiveGuide] = useState(GUIDES[0].id);

  const currentGuide = GUIDES.find((g) => g.id === activeGuide) || GUIDES[0];

  // /guides#selling, /guides#trade gibi derin linkler ilgili rehberi açsın.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash && GUIDES.some((g) => g.id === hash)) {
        setActiveGuide(hash);
        setTimeout(() => {
          document
            .getElementById("guide-content")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash.replace("#", "") !== activeGuide) {
      window.history.replaceState(null, "", `#${activeGuide}`);
    }
  }, [activeGuide]);

  return { activeGuide, setActiveGuide, currentGuide };
}
