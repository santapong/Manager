import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),

  DATABASE_URL: z.string().url(),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),
  AUTH_TRUST_HOST: z.coerce.boolean().default(false),
  AUTH_URL: z.string().url().optional(),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default("Manager <noreply@example.com>"),

  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  AXIOM_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),

  HEALTH_TOKEN: z.string().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const isLint = process.env.ESLINT === "1" || process.argv.some((a) => a.includes("eslint"));

function parse<T extends z.ZodTypeAny>(name: string, schema: T, source: Record<string, unknown>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    if (isBuild || isLint) {
      console.error(`\n❌ Invalid ${name} environment variables:\n`);
      console.error(result.error.flatten().fieldErrors);
      console.error("\nCheck apps/web/.env.example for the required keys.\n");
      throw new Error(`Invalid ${name} environment variables`);
    }
    return new Proxy(
      {},
      {
        get(_, key) {
          throw new Error(
            `Tried to read env.${String(key)} but the environment failed validation. See errors at startup.`,
          );
        },
      },
    ) as z.infer<T>;
  }
  return result.data;
}

const rawServer: Record<string, unknown> =
  typeof process !== "undefined" && typeof process.env !== "undefined" ? { ...process.env } : {};

const rawClient: Record<string, unknown> = {
  NEXT_PUBLIC_APP_URL: rawServer["NEXT_PUBLIC_APP_URL"],
  NEXT_PUBLIC_SENTRY_DSN: rawServer["NEXT_PUBLIC_SENTRY_DSN"],
};

export const env = {
  ...parse("server", serverSchema, rawServer),
  ...parse("client", clientSchema, rawClient),
};

export type Env = typeof env;
