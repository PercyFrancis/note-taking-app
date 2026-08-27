alter table users
add column if not exists settings jsonb not null default '{}'::jsonb;
