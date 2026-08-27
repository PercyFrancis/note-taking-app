create table if not exists pdf_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  original_filename text not null,
  pathname text not null unique,
  size_bytes bigint not null check (size_bytes >= 0),
  page_count integer not null check (page_count > 0),
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pdf_documents_user_updated_idx
on pdf_documents(user_id, trashed_at, updated_at desc);

create table if not exists pdf_page_annotations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references pdf_documents(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  scene_json text not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_id, page_number)
);

create index if not exists pdf_page_annotations_document_page_idx
on pdf_page_annotations(document_id, page_number);
