begin;

-- Agents marked OOO are excluded from least-loaded assignment (see tickets.controller selectLeastLoadedAssignee).
alter table users add column if not exists out_of_office boolean not null default false;

comment on column users.out_of_office is 'When true, user is excluded from automatic ticket assignment for their team(s).';

-- System-generated ticket messages may have no human author.
alter table ticket_messages alter column author_user_id drop not null;

commit;
