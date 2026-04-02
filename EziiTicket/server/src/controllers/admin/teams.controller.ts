import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { asInt } from "./adminUtils.js";
import { appendAdminAudit } from "./adminAudit.js";
import { isEziiSystemAdmin } from "./eziiSystemAdmin.js";

export async function listTeams(req: Request, res: Response) {
  const orgId = req.query.organisation_id
    ? asInt(req.query.organisation_id)
    : null;

  const result = await pool.query(
    `select id, organisation_id, product_id, name, created_at, updated_at
     from teams
     where ($1::bigint is null or organisation_id = $1::bigint)
     order by id desc`,
    [orgId]
  );

  return res.json({ ok: true, data: result.rows });
}

export async function createTeam(req: Request, res: Response) {
  const { organisation_id, product_id, name, create_for_all_organisations } = req.body ?? {};
  const orgId = asInt(organisation_id);
  const productId = asInt(product_id);
  const createForAllOrgs =
    create_for_all_organisations === true || create_for_all_organisations === "true";

  if (!orgId) {
    return res.status(400).json({
      ok: false,
      error: "organisation_id is required",
    });
  }
  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  if (!productId) {
    return res.status(400).json({ ok: false, error: "product_id is required" });
  }

  if (createForAllOrgs) {
    if (!isEziiSystemAdmin(req)) {
      return res.status(403).json({ ok: false, error: "only system admin can create global teams" });
    }

    const result = await pool.query(
      `insert into teams (organisation_id, product_id, name)
       select o.id, $1::bigint, $2::text
       from organisations o
       where not exists (
         select 1
         from teams t
         where t.organisation_id = o.id
           and lower(t.name) = lower($2::text)
           and coalesce(t.product_id, -1) = coalesce($1::bigint, -1)
       )
       returning id, organisation_id, product_id, name, created_at, updated_at`,
      [productId, name]
    );

    await appendAdminAudit(
      req,
      1,
      "Teams",
      "create_global",
      `Created global team "${name}" across ${result.rowCount ?? 0} org(s)`
    );
    return res.status(201).json({ ok: true, data: result.rows });
  }

  const result = await pool.query(
    `insert into teams (organisation_id, product_id, name)
     values ($1,$2,$3)
     returning id, organisation_id, product_id, name, created_at, updated_at`,
    [orgId, productId, name]
  );

  await appendAdminAudit(
    req,
    orgId,
    "Teams",
    "create",
    `Created team "${name}"`
  );
  return res.status(201).json({ ok: true, data: result.rows[0] });
}

export async function updateTeam(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const { product_id, name } = req.body ?? {};
  const productId = product_id ? asInt(product_id) : null;

  const result = await pool.query(
    `update teams
     set product_id = coalesce($2, product_id),
         name = coalesce($3, name),
         updated_at = now()
     where id=$1
     returning id, organisation_id, product_id, name, created_at, updated_at`,
    [id, productId, name ?? null]
  );

  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(
    req,
    Number(row.organisation_id),
    "Teams",
    "update",
    `Updated team "${row.name}"`
  );
  return res.json({ ok: true, data: row });
}

export async function deleteTeam(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const result = await pool.query(
    `delete from teams
     where id = $1
     returning id, organisation_id, name`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });

  await appendAdminAudit(
    req,
    Number(row.organisation_id),
    "Teams",
    "delete",
    `Deleted team "${row.name}"`
  );
  return res.json({ ok: true, data: { id: row.id } });
}

export async function listTeamMembers(req: Request, res: Response) {
  const teamId = asInt(req.params.id);
  if (!teamId) return res.status(400).json({ ok: false, error: "invalid id" });

  const result = await pool.query(
    `select tm.id, tm.team_id, tm.user_id, tm.is_team_lead, tm.max_open_tickets_cap, u.name, u.email
     from team_members tm
     join users u on u.user_id = tm.user_id
     where tm.team_id=$1
     order by tm.id asc`,
    [teamId]
  );

  return res.json({ ok: true, data: result.rows });
}

export async function setTeamMembers(req: Request, res: Response) {
  const teamId = asInt(req.params.id);
  if (!teamId) return res.status(400).json({ ok: false, error: "invalid id" });

  const { members } = req.body ?? {};
  if (!Array.isArray(members)) {
    return res.status(400).json({ ok: false, error: "members must be an array" });
  }

  await pool.query("begin");
  const orgIdRow = await pool.query("select organisation_id from teams where id=$1", [teamId]);
  const orgId = orgIdRow.rows[0]?.organisation_id ? Number(orgIdRow.rows[0].organisation_id) : null;
  try {
    await pool.query("delete from team_members where team_id=$1", [teamId]);
    for (const m of members) {
      const userId = asInt((m as { user_id?: unknown }).user_id);
      if (!userId) throw new Error("Invalid member.user_id");

      const isLead =
        typeof (m as { is_team_lead?: unknown }).is_team_lead === "boolean"
          ? (m as { is_team_lead: boolean }).is_team_lead
          : false;
      const cap =
        typeof (m as { max_open_tickets_cap?: unknown }).max_open_tickets_cap ===
        "number"
          ? (m as { max_open_tickets_cap: number }).max_open_tickets_cap
          : null;
      if (cap != null && (!Number.isFinite(cap) || cap < 0)) {
        throw new Error("max_open_tickets_cap must be a non-negative number");
      }

      await pool.query(
        `insert into team_members (team_id, user_id, is_team_lead, max_open_tickets_cap)
         values ($1,$2,$3,$4)`,
        [teamId, userId, isLead, cap]
      );
    }
    await pool.query("commit");
  } catch (e) {
    await pool.query("rollback");
    return res.status(400).json({
      ok: false,
      error: (e as Error).message,
    });
  }

  const result = await pool.query(
    `select tm.id, tm.team_id, tm.user_id, tm.is_team_lead, tm.max_open_tickets_cap, u.name, u.email
     from team_members tm
     join users u on u.user_id = tm.user_id
     where tm.team_id=$1
     order by tm.id asc`,
    [teamId]
  );

  if (orgId != null) {
    await appendAdminAudit(
      req,
      orgId,
      "Teams",
      "update_members",
      `Updated team members for team_id=${teamId}`
    );
  }

  return res.json({ ok: true, data: result.rows });
}

