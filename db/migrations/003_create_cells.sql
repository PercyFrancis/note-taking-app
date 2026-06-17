create table if not exists cells (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks(id) on delete cascade,
  type text not null check (type in ('text', 'drawing')),
  position integer not null,
  content text,
  drawing text,
  height_px integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cells_notebook_id_position_idx
on cells(notebook_id, position);