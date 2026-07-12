alter table users
add column if not exists image_url text;

alter table users
add column if not exists deleted_at timestamptz;

alter table users
add column if not exists clerk_synced_at timestamptz;