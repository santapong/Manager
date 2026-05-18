import type { ServerConfig } from "./config.js";

/**
 * Thin HTTP client used by every tool to call the Manager v1 REST API.
 *
 * Every call carries `Authorization: Bearer <MANAGER_API_KEY>` and
 * `X-Workspace-Slug: <MANAGER_WORKSPACE_SLUG>`. The Manager side enforces
 * RLS scoping based on the slug; the MCP server can't bypass it even if
 * a tool author tries.
 *
 * In v1 the API key is a single static credential per Manager instance.
 * The follow-up replaces it with Personal Access Tokens (per-user,
 * argon2id-hashed at rest, scoped to the workspaces the user belongs to).
 */

export interface ManagerClient {
  get<T>(path: string, query?: Record<string, string | undefined>): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

export interface ManagerApiError extends Error {
  status: number;
  body: unknown;
}

export class ManagerApiErrorImpl extends Error implements ManagerApiError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ManagerApiError";
  }
}

export type Fetcher = typeof fetch;

export function createClient(config: ServerConfig, fetchImpl: Fetcher = fetch): ManagerClient {
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "X-Workspace-Slug": config.workspaceSlug,
    "Content-Type": "application/json",
  };

  function url(path: string, query?: Record<string, string | undefined>): string {
    const base = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    if (!query) return base;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  async function parse<T>(res: Response): Promise<T> {
    const text = await res.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) {
      const errCode =
        body && typeof body === "object" && body !== null && "error" in body
          ? String((body as { error: unknown }).error)
          : `http_${res.status}`;
      throw new ManagerApiErrorImpl(errCode, res.status, body);
    }
    return body as T;
  }

  return {
    async get<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
      const res = await fetchImpl(url(path, query), { method: "GET", headers });
      return parse<T>(res);
    },
    async post<T>(path: string, body: unknown): Promise<T> {
      const res = await fetchImpl(url(path), {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
      });
      return parse<T>(res);
    },
  };
}
