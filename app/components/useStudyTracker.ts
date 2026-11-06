"use client";

import { useEffect, useRef } from "react";
import type { StudyActivity } from "../lib/record-sync";
import { addStudyActivity } from "../lib/study-activity";

export function useStudyTracker(enabled: boolean, owner: string, onRecord: (owner: string, update: (previous: StudyActivity) => StudyActivity) => void) {
  const callback = useRef(onRecord);
  useEffect(() => { callback.current = onRecord; }, [onRecord]);
  const session = useRef("");
  const activeOwner = useRef(owner);
  useEffect(() => {
    activeOwner.current = owner;
    session.current = crypto.randomUUID();
    if (!enabled) return;
    let previous = Date.now(), interaction = previous;
    let wasActive = document.visibilityState === "visible" && document.hasFocus();
    const tick = () => {
      const now = Date.now();
      const active = document.visibilityState === "visible" && document.hasFocus();
      const end = Math.min(now, interaction + 90_000);
      if (activeOwner.current === owner && wasActive && end > previous && now - previous <= 20_000) {
        const start = previous, token = session.current;
        callback.current(owner, data => addStudyActivity(data, token, start, end));
      }
      previous = now; wasActive = active;
    };
    const interact = () => {
      const now = Date.now();
      if (!wasActive) { previous = now; wasActive = document.visibilityState === "visible" && document.hasFocus(); }
      interaction = now;
    };
    const visibility = () => { tick(); };
    const timer = window.setInterval(tick, 10_000);
    const events = ["pointerdown", "pointermove", "keydown", "wheel"] as const;
    events.forEach(event => window.addEventListener(event, interact, { passive: true }));
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", interact);
    window.addEventListener("blur", visibility);
    window.addEventListener("pagehide", visibility);
    return () => {
      tick();
      window.clearInterval(timer);
      events.forEach(event => window.removeEventListener(event, interact));
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", interact); window.removeEventListener("blur", visibility); window.removeEventListener("pagehide", visibility);
    };
  }, [enabled, owner]);

  return (result: "correct" | "wrong" | "pending") => {
    const now = Date.now();
    const token = session.current || crypto.randomUUID();
    callback.current(owner, data => addStudyActivity(data, token, now, now, result));
  };
}
