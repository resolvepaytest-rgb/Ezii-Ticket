begin;

-- Enforce at most one queue per (organisation, product) when product_id is set.
-- Merge duplicates onto the row with the smallest id; re-point FKs, then remove extras.

with grp as (
  select organisation_id, product_id, min(id) as keep_id
  from queues
  where product_id is not null
  group by organisation_id, product_id
),
losers as (
  select q.id as loser_id, grp.keep_id
  from queues q
  join grp on grp.organisation_id = q.organisation_id
    and grp.product_id = q.product_id
    and q.id <> grp.keep_id
  where q.product_id is not null
)
update tickets t
set queue_id = l.keep_id
from losers l
where t.queue_id = l.loser_id;

with grp as (
  select organisation_id, product_id, min(id) as keep_id
  from queues
  where product_id is not null
  group by organisation_id, product_id
),
losers as (
  select q.id as loser_id, grp.keep_id
  from queues q
  join grp on grp.organisation_id = q.organisation_id
    and grp.product_id = q.product_id
    and q.id <> grp.keep_id
  where q.product_id is not null
)
update organisation_products op
set default_routing_queue_id = l.keep_id,
    updated_at = now()
from losers l
where op.default_routing_queue_id = l.loser_id;

with grp as (
  select organisation_id, product_id, min(id) as keep_id
  from queues
  where product_id is not null
  group by organisation_id, product_id
),
losers as (
  select q.id as loser_id, grp.keep_id
  from queues q
  join grp on grp.organisation_id = q.organisation_id
    and grp.product_id = q.product_id
    and q.id <> grp.keep_id
  where q.product_id is not null
)
update workflow_steps ws
set queue_id = l.keep_id
from losers l
where ws.queue_id = l.loser_id;

delete from queues q
using (
  select organisation_id, product_id, min(id) as keep_id
  from queues
  where product_id is not null
  group by organisation_id, product_id
) grp
where q.organisation_id = grp.organisation_id
  and q.product_id = grp.product_id
  and q.id <> grp.keep_id;

create unique index if not exists queues_organisation_id_product_id_unique
  on queues (organisation_id, product_id)
  where product_id is not null;

commit;
