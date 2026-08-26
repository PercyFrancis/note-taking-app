create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  parent_id uuid references folders(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists folders_user_parent_position_idx
on folders(user_id, parent_id, position);

alter table notebooks
add column if not exists folder_id uuid references folders(id) on delete set null;

alter table notebooks
add column if not exists trashed_at timestamptz;

create index if not exists notebooks_user_folder_position_idx
on notebooks(user_id, folder_id, position);

create index if not exists notebooks_user_trashed_idx
on notebooks(user_id, trashed_at);
