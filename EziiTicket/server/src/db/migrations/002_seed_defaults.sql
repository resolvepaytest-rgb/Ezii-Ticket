begin;

-- Products (PRD defaults)
insert into products (name, code, default_ticket_prefix)
values
  ('Payroll', 'PAY', 'PAY-'),
  ('Leave', 'LEA', 'LEA-'),
  ('Attendance', 'ATT', 'ATT-'),
  ('Expense', 'EXP', 'EXP-')
on conflict (code) do nothing;

-- Roles (RBAC)
insert into roles (name, description)
values
  ('customer', 'End user; can access own tickets'),
  ('org_admin', 'Customer org admin; can access org tickets'),
  ('l1_agent', 'Frontline support agent'),
  ('l2_specialist', 'Product specialist'),
  ('l3_engineer', 'Engineering/DevOps'),
  ('team_lead', 'Team lead; visibility + intervention'),
  ('system_admin', 'System admin; full access + configuration')
on conflict (name) do nothing;

commit;

