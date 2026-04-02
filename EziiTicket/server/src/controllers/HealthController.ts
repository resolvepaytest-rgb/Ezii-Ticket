import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";

export async function healthController(_req: Request, res: Response) {
  const health = {
    ok: true,
    service: "ezii-ticket-server",
    env: env.nodeEnv,
    db: {
      configured: Boolean(env.databaseUrl),
      ok: false,
    },
  } as const;

  try {
    if (!env.databaseUrl) {
      return res.json(health);
    }

    const result = await pool.query("select 1 as ok");
    return res.json({
      ...health,
      db: { configured: true, ok: result.rows[0]?.ok === 1 },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      service: "ezii-ticket-server",
      env: env.nodeEnv,
      db: { configured: Boolean(env.databaseUrl), ok: false },
      error: (err as Error).message,
    });
  }
}

