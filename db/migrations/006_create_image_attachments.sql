create table if not exists image_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_cell_id uuid references cells(id) on delete set null,
  pathname text not null unique,
  display_name text not null,
  original_filename text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  uploaded_at timestamptz not null,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists image_attachments_user_status_uploaded_idx
on image_attachments(user_id, trashed_at, uploaded_at desc);

create index if not exists image_attachments_source_cell_idx
on image_attachments(source_cell_id);
