begin;

-- Outbound ticket notification emails: audit trail (recipient routing, SMTP outcome, ticket snapshot).
create table if not exists notification_email_logs (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  ticket_id bigint references tickets(id) on delete set null,
  ticket_status text,
  notification_key text not null,
  product text not null,
  mail_from text not null,
  recipient_intended text,
  recipient_actual text,
  subject text,
  send_status text not null
    check (send_status in ('sent', 'skipped', 'failed', 'disabled', 'no_smtp')),
  error_message text,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table notification_email_logs is 'Audit log for outbound notification emails (ticket-related SMTP and routing).';
comment on column notification_email_logs.recipient_intended is 'Address before org email-status / sandbox routing.';
comment on column notification_email_logs.recipient_actual is 'Final To address when sent; null when skipped before SMTP.';
comment on column notification_email_logs.send_status is 'sent=SMTP ok; skipped=routing/pre-send skip; failed=exception; disabled=no NOTIFICATION_EMAIL_ENABLED; no_smtp=missing SMTP config.';

create index if not exists notification_email_logs_org_created_idx
  on notification_email_logs (organisation_id, created_at desc);

create index if not exists notification_email_logs_ticket_idx
  on notification_email_logs (ticket_id)
  where ticket_id is not null;

commit;
