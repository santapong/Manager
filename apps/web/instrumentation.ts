export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(...args: Parameters<typeof captureRequestError>) {
  await captureRequestError(...args);
}

async function captureRequestError(
  error: { digest?: string } & Error,
  request: { path: string; method: string; headers: { [key: string]: string } },
  errorContext: { routerKind: "Pages Router" | "App Router"; routePath: string; routeType: "render" | "route" | "action" | "middleware" },
) {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(error, request, errorContext);
}
