import type { Request, Response } from "express";
import { pool } from "../../db/pool.js";
import { ensureTenantAndDefaultsByOrgId } from "../../services/provisioning/ensureTenantAndDefaults.js";
import { asInt } from "./adminUtils.js";
import { appendAdminAudit } from "./adminAudit.js";
import { isEziiSystemAdmin } from "./eziiSystemAdmin.js";

async function assignNewQueueAsOrgProductDefault(
  organisationId: number,
  productId: number | null,
  queueId: number
) {
  if (!productId) return;
  await ensureTenantAndDefaultsByOrgId(organisationId);
  await pool.query(
    `update organisation_products
     set default_routing_queue_id = $3, updated_at = now()
     where organisation_id = $1 and product_id = $2`,
    [organisationId, productId, queueId]
  );
}

export async function listQueues(req: Request, res: Response) {
  const orgId = req.query.organisation_id
    ? asInt(req.query.organisation_id)
    : null;
  const productId = req.query.product_id ? asInt(req.query.product_id) : null;

  const result = await pool.query(
    `select id, organisation_id, product_id, team_id, name, created_at, updated_at
     from queues
     where ($1::bigint is null or organisation_id = $1::bigint)
       and ($2::bigint is null or product_id = $2::bigint)
     order by id desc`,
    [orgId, productId]
  );

  return res.json({ ok: true, data: result.rows });
}

export async function createQueue(req: Request, res: Response) {
  const { organisation_id, product_id, team_id, name, create_for_all_organisations } = req.body ?? {};
  const orgId = asInt(organisation_id);
  if (!orgId) {
    return res.status(400).json({ ok: false, error: "organisation_id is required" });
  }
  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  const productId = product_id ? asInt(product_id) : null;
  const teamId = team_id ? asInt(team_id) : null;
  const createForAllOrgs =
    create_for_all_organisations === true || create_for_all_organisations === "true";

  if (createForAllOrgs) {
    if (!isEziiSystemAdmin(req)) {
      return res.status(403).json({ ok: false, error: "only system admin can create global queues" });
    }

    let baseTeamName: string | null = null;
    let baseTeamProductId: number | null = null;
    if (teamId) {
      const baseTeamRes = await pool.query(
        `select name, product_id
         from teams
         where id = $1`,
        [teamId]
      );
      const baseTeam = baseTeamRes.rows[0];
      if (!baseTeam) {
        return res.status(400).json({ ok: false, error: "invalid team_id" });
      }
      baseTeamName = String(baseTeam.name);
      baseTeamProductId = baseTeam.product_id ? Number(baseTeam.product_id) : null;
    }

    const result = await pool.query(
      `insert into queues (organisation_id, product_id, team_id, name)
       select
         o.id,
         coalesce($1::bigint, $2::bigint, null::bigint) as product_id,
         tm.id as team_id,
         $4::text as name
       from organisations o
       left join lateral (
         select t.id
         from teams t
         where $3::text is not null
           and t.organisation_id = o.id
           and lower(t.name) = lower($3::text)
           and (
             ($2::bigint is null and t.product_id is null)
             or t.product_id = $2::bigint
           )
         order by t.id asc
         limit 1
       ) tm on true
       where not exists (
         select 1
         from queues q
         where q.organisation_id = o.id
           and lower(q.name) = lower($4::text)
       )
       returning id, organisation_id, product_id, team_id, name, created_at, updated_at`,
      [productId, baseTeamProductId, baseTeamName, name]
    );

    for (const row of result.rows as {
      id: number;
      organisation_id: number;
      product_id: number | null;
    }[]) {
      await assignNewQueueAsOrgProductDefault(
        Number(row.organisation_id),
        row.product_id != null ? Number(row.product_id) : null,
        Number(row.id)
      );
    }

    await appendAdminAudit(
      req,
      1,
      "Queues",
      "create_global",
      `Created global queue "${name}" across ${result.rowCount ?? 0} org(s)`
    );
    return res.status(201).json({ ok: true, data: result.rows });
  }

  const result = await pool.query(
    `insert into queues (organisation_id, product_id, team_id, name)
     values ($1,$2,$3,$4)
     returning id, organisation_id, product_id, team_id, name, created_at, updated_at`,
    [orgId, productId, teamId, name]
  );

  const created = result.rows[0];
  if (created) {
    await assignNewQueueAsOrgProductDefault(
      orgId,
      productId,
      Number(created.id)
    );
  }

  await appendAdminAudit(
    req,
    orgId,
    "Queues",
    "create",
    `Created queue "${name}"`
  );
  return res.status(201).json({ ok: true, data: created });
}

export async function updateQueue(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const body = req.body ?? {};
  const { product_id, name } = body;
  const productId = product_id ? asInt(product_id) : null;
  const hasTeamId = Object.prototype.hasOwnProperty.call(body, "team_id");
  const teamId = hasTeamId
    ? body.team_id == null || body.team_id === ""
      ? null
      : asInt(body.team_id)
    : undefined;

  const result = await pool.query(
    `update queues
     set product_id = coalesce($2, product_id),
         team_id = case when $5::boolean then $3::bigint else team_id end,
         name = coalesce($4, name),
         updated_at = now()
     where id=$1
     returning id, organisation_id, product_id, team_id, name, created_at, updated_at`,
    [id, productId, teamId ?? null, name ?? null, hasTeamId]
  );

  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });
  await appendAdminAudit(
    req,
    Number(row.organisation_id),
    "Queues",
    "update",
    `Updated queue "${row.name}"`
  );
  return res.json({ ok: true, data: row });
}

export async function deleteQueue(req: Request, res: Response) {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  const result = await pool.query(
    `delete from queues
     where id = $1
     returning id, organisation_id`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "not found" });

  await appendAdminAudit(
    req,
    Number(row.organisation_id),
    "Queues",
    "delete",
    `Deleted queue id ${row.id}`
  );
  return res.json({ ok: true, data: { id: row.id } });
}

