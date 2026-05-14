import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createNodeClient>;
export type EdgeDatabase = ReturnType<typeof createEdgeClient>;

export function createNodeClient(connectionString: string) {
  const client = postgres(connectionString, { max: 10, prepare: false });
  return drizzleNode(client, { schema, logger: false });
}

export function createEdgeClient(connectionString: string) {
  const sql = neon(connectionString);
  return drizzleHttp(sql, { schema, logger: false });
}

let _node: Database | undefined;
let _edge: EdgeDatabase | undefined;

export function dbNode(connectionString?: string): Database {
  const conn = connectionString ?? process.env.DATABASE_URL;
  if (!conn) throw new Error("DATABASE_URL is not set");
  if (!_node) _node = createNodeClient(conn);
  return _node;
}

export function dbEdge(connectionString?: string): EdgeDatabase {
  const conn = connectionString ?? process.env.DATABASE_URL;
  if (!conn) throw new Error("DATABASE_URL is not set");
  if (!_edge) _edge = createEdgeClient(conn);
  return _edge;
}
