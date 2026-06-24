create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique,
  email text,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- insert into users (id, email, name)
-- values (
--   '00000000-0000-0000-0000-000000000001',
--   'dev@example.com',
--   'Development User'
-- )
-- on conflict (id) do nothing;