import dns from "node:dns/promises";
import net from "node:net";
import pg from "pg";
import cs from "pg-connection-string";
import { env } from "../config/env.js";

const { Pool } = pg;

const raw = env.databaseUrl?.trim() ?? "";

/** Prefer A-record IPv4 so broken IPv6 paths (common on Windows) do not hang until pool timeout. */
async function buildPoolConfig(): Promise<ConstructorParameters<typeof Pool>[0]> {
  const base: ConstructorParameters<typeof Pool>[0] = {
    connectionTimeoutMillis: 15_000,
  };

  if (!raw) {
    return base;
  }

  const config = cs.parseIntoClientConfig(raw);
  const originalHost = config.host;
  if (originalHost && !net.isIP(originalHost)) {
    const { address } = await dns.lookup(originalHost, { family: 4 });
    config.host = address;
    if (config.ssl === true) {
      config.ssl = { servername: originalHost };
    } else if (typeof config.ssl === "object" && config.ssl !== null) {
      config.ssl = { ...config.ssl, servername: originalHost };
    }
  }

  return { ...config, ...base };
}

export const pool = new Pool(await buildPoolConfig());
