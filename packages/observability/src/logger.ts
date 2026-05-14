/**
 * Vendor-neutral JSON logger. Writes a single JSON line per call to
 * stdout (or stderr for level >= "error"). Axiom and Vercel both
 * ingest JSON logs natively — swapping to OpenTelemetry later is a
 * matter of changing the sink, not the call sites.
 */
type Level = "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_RANK: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

export interface LoggerOptions {
  service?: string;
  env?: string;
  minLevel?: Level;
}

export interface Logger {
  child(fields: Record<string, unknown>): Logger;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  fatal(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const base = {
    service: opts.service ?? "manager",
    env: opts.env ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  };
  const minRank = LEVEL_RANK[opts.minLevel ?? "info"];

  function emit(level: Level, msg: string, fields: Record<string, unknown> = {}) {
    if (LEVEL_RANK[level] < minRank) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...base,
      ...fields,
    });
    if (LEVEL_RANK[level] >= LEVEL_RANK.error) console.error(line);
    else console.log(line);
  }

  function make(parent: Record<string, unknown>): Logger {
    return {
      child(fields) {
        return make({ ...parent, ...fields });
      },
      debug(msg, fields) {
        emit("debug", msg, { ...parent, ...fields });
      },
      info(msg, fields) {
        emit("info", msg, { ...parent, ...fields });
      },
      warn(msg, fields) {
        emit("warn", msg, { ...parent, ...fields });
      },
      error(msg, fields) {
        emit("error", msg, { ...parent, ...fields });
      },
      fatal(msg, fields) {
        emit("fatal", msg, { ...parent, ...fields });
      },
    };
  }
  return make({});
}

export const logger = createLogger();
