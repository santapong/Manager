"use client";

// Client component: a live countdown timer with local persistence. Renders on
// the dashboard's "pomodoro" widget. The countdown is derived from a target
// timestamp (not a decrementing counter) so it stays accurate across
// re-renders, tab backgrounding, and navigation (state is mirrored to
// localStorage, namespaced per workspace slug).

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { logPomodoroAction } from "@/app/[workspace]/dashboard/actions";

type Phase = "focus" | "short_break" | "long_break";

const DURATIONS: Record<Phase, number> = {
  focus: 25,
  short_break: 5,
  long_break: 15,
};

const PHASE_LABEL: Record<Phase, string> = {
  focus: "Focus",
  short_break: "Short break",
  long_break: "Long break",
};

/** Focus sessions before a long break. */
const CYCLE = 4;

interface Persisted {
  phase: Phase;
  /** Completed focus sessions in the current cycle (0..CYCLE). */
  completed: number;
  /** epoch ms the current phase ends, or null when paused/idle. */
  targetAt: number | null;
  /** seconds left when paused; full duration when reset. */
  remaining: number;
  running: boolean;
  /** epoch ms the running phase started (for accurate logged startedAt). */
  startedAt: number | null;
}

function defaultState(phase: Phase = "focus"): Persisted {
  return {
    phase,
    completed: 0,
    targetAt: null,
    remaining: DURATIONS[phase] * 60,
    running: false,
    startedAt: null,
  };
}

function storageKey(slug: string) {
  return `mgr:pomodoro:${slug}`;
}

function loadState(slug: string): Persisted | null {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (!parsed || typeof parsed !== "object" || !parsed.phase) return null;
    const phase = parsed.phase;
    if (phase !== "focus" && phase !== "short_break" && phase !== "long_break") return null;
    return {
      phase,
      completed: clampInt(parsed.completed, 0, CYCLE),
      targetAt: typeof parsed.targetAt === "number" ? parsed.targetAt : null,
      remaining:
        typeof parsed.remaining === "number" ? parsed.remaining : DURATIONS[phase] * 60,
      running: Boolean(parsed.running),
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : null,
    };
  } catch {
    return null;
  }
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : lo;
  return Math.min(hi, Math.max(lo, n));
}

function secondsLeft(s: Persisted): number {
  if (s.running && s.targetAt != null) {
    return Math.max(0, Math.round((s.targetAt - Date.now()) / 1000));
  }
  return s.remaining;
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function nextPhase(s: Persisted): { phase: Phase; completed: number } {
  if (s.phase === "focus") {
    const completed = s.completed + 1;
    if (completed >= CYCLE) return { phase: "long_break", completed: CYCLE };
    return { phase: "short_break", completed };
  }
  // After any break, return to focus. A long break resets the cycle.
  return { phase: "focus", completed: s.phase === "long_break" ? 0 : s.completed };
}

/** Short beep via WebAudio; fully guarded so a blocked AudioContext is a no-op. */
function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    /* audio unavailable — silent */
  }
}

function notify(message: string) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification("Pomodoro", { body: message });
    }
  } catch {
    /* notifications unavailable — silent */
  }
}

export function PomodoroTimer({ workspaceSlug }: { workspaceSlug: string }) {
  const [state, setState] = useState<Persisted>(() => defaultState());
  // Ticking setter forces a re-render every 250ms; the value itself is unused
  // (`remaining` is recomputed from Date.now() on each render).
  const [, setNow] = useState(() => Date.now());
  const [showSettings, setShowSettings] = useState(false);
  const [, startLog] = useTransition();
  const hydrated = useRef(false);
  const firedRef = useRef(false);

  // Hydrate from localStorage on mount (avoids SSR/client text mismatch).
  useEffect(() => {
    const loaded = loadState(workspaceSlug);
    if (loaded) setState(loaded);
    hydrated.current = true;
  }, [workspaceSlug]);

  // Persist every change once hydrated.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(storageKey(workspaceSlug), JSON.stringify(state));
    } catch {
      /* storage full / unavailable — ignore */
    }
  }, [state, workspaceSlug]);

  // Tick once per second only while running; drives the displayed countdown.
  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [state.running]);

  const remaining = secondsLeft(state);

  const logFocus = useCallback(
    (minutes: number, startedAt: number | null) => {
      startLog(async () => {
        await logPomodoroAction(workspaceSlug, {
          kind: "focus",
          minutes,
          startedAt: new Date(startedAt ?? Date.now()).toISOString(),
        });
      });
    },
    [workspaceSlug],
  );

  // Phase completion: when a running phase hits zero, advance + side effects.
  useEffect(() => {
    if (!state.running || state.targetAt == null) return;
    if (remaining > 0) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;

    const finishedPhase = state.phase;
    const finishedStartedAt = state.startedAt;
    const finishedMinutes = DURATIONS[finishedPhase];

    if (finishedPhase === "focus") {
      logFocus(finishedMinutes, finishedStartedAt);
    }
    beep();
    notify(`${PHASE_LABEL[finishedPhase]} complete`);

    setState((prev) => {
      const { phase, completed } = nextPhase(prev);
      return {
        phase,
        completed,
        targetAt: null,
        remaining: DURATIONS[phase] * 60,
        running: false,
        startedAt: null,
      };
    });
    // `remaining` shrinks on each 250ms tick, so this effect re-checks for
    // phase completion every tick.
  }, [remaining, state.running, state.targetAt, state.phase, state.startedAt, logFocus]);

  function start() {
    setState((prev) => {
      const left = prev.remaining > 0 ? prev.remaining : DURATIONS[prev.phase] * 60;
      return {
        ...prev,
        running: true,
        targetAt: Date.now() + left * 1000,
        startedAt: prev.startedAt ?? Date.now(),
      };
    });
    setNow(Date.now());
    // Ask for notification permission lazily on first interaction.
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch {
      /* ignore */
    }
  }

  function pause() {
    setState((prev) => ({
      ...prev,
      running: false,
      remaining: secondsLeft(prev),
      targetAt: null,
    }));
  }

  function reset() {
    setState((prev) => ({
      ...prev,
      running: false,
      targetAt: null,
      remaining: DURATIONS[prev.phase] * 60,
      startedAt: null,
    }));
  }

  function skip() {
    setState((prev) => {
      const { phase, completed } = nextPhase(prev);
      return {
        phase,
        completed,
        targetAt: null,
        remaining: DURATIONS[phase] * 60,
        running: false,
        startedAt: null,
      };
    });
    firedRef.current = false;
  }

  const dotsFilled = state.phase === "long_break" ? CYCLE : state.completed;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full items-center justify-between">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {PHASE_LABEL[state.phase]}
        </span>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-label="Pomodoro settings"
          aria-expanded={showSettings}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <GearIcon />
        </button>
      </div>

      <p
        className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-gray-900"
        aria-live="polite"
        aria-label={`${mmss(remaining)} remaining in ${PHASE_LABEL[state.phase]}`}
      >
        {mmss(remaining)}
      </p>

      <div
        className="flex items-center gap-1.5"
        aria-label={`Focus session ${Math.min(dotsFilled + (state.phase === "focus" ? 1 : 0), CYCLE)} of ${CYCLE}`}
      >
        {Array.from({ length: CYCLE }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={`h-2.5 w-2.5 rounded-full ${
              i < dotsFilled ? "bg-brand-600" : "border border-gray-300 bg-white"
            }`}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        {state.running ? (
          <button
            type="button"
            onClick={pause}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Start
          </button>
        )}
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={skip}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Skip
        </button>
      </div>

      {showSettings ? (
        <div className="w-full rounded-md bg-gray-50 p-2 text-xs text-gray-500">
          <p className="font-medium text-gray-600">Durations (minutes)</p>
          <ul className="mt-1 space-y-0.5">
            <li>Focus: {DURATIONS.focus}</li>
            <li>Short break: {DURATIONS.short_break}</li>
            <li>Long break: {DURATIONS.long_break} (after {CYCLE} focus sessions)</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
