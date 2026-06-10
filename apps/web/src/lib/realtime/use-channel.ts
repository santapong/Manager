"use client";

// Subscribe to a project channel and refresh the RSC tree on events.
// Fully optional: when /api/realtime/token 404s (no provider configured),
// the hook stays silent and the app keeps its revalidate-on-action flow.
// The vendor client loads lazily so Ably never lands in the base bundle.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function useProjectChannel(channel: string | null): void {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    let sub: { unsubscribe(): void } | undefined;

    (async () => {
      const tokenUrl = `/api/realtime/token?channel=${encodeURIComponent(channel)}`;
      const probe = await fetch(tokenUrl).catch(() => null);
      if (cancelled || !probe?.ok) return;
      const { subscribeToChannel } = await import("@manager/realtime/browser");
      if (cancelled) return;
      sub = subscribeToChannel({
        tokenUrl,
        channel,
        onEvent: () => {
          // Debounce bursts (drag storms) into one refresh.
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => router.refresh(), 400);
        },
      });
    })();

    return () => {
      cancelled = true;
      sub?.unsubscribe();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [channel, router]);
}
