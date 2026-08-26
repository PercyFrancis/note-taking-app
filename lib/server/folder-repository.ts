import type { Folder, TrashItem } from "../types";
import { createId } from "../utils";
import { sql } from "./db";

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface TrashRow {
  id: string;
  kind: "folder" | "notebook";
  name: string;
  trashed_at: Date | string;
}

function mapFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    position: row.position,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export async function getFolders(userId: string): Promise<Folder[]> {
  const rows = (await sql.query(
    `
      select id, name, parent_id, position, created_at, updated_at
      from folders
      where user_id = $1 and trashed_at is null
      order by parent_id nulls first, position, lower(name)
    `,
    [userId],
  )) as FolderRow[];

  return rows.map(mapFolder);
}

export async function createFolder(
  userId: string,
  name: string,
  parentId: string | null,
): Promise<Folder | null> {
  const id = createId();
  const rows = (await sql.query(
    `
      insert into folders (id, user_id, parent_id, name, position)
      select
        $1,
        $2,
        $3,
        $4,
        coalesce((
          select max(position) + 1
          from folders
          where user_id = $2
            and parent_id is not distinct from $3::uuid
            and trashed_at is null
        ), 0)
      where $3::uuid is null
        or exists (
          select 1 from folders
          where id = $3 and user_id = $2 and trashed_at is null
        )
      returning id, name, parent_id, position, created_at, updated_at
    `,
    [id, userId, parentId, name],
  )) as FolderRow[];

  return rows[0] ? mapFolder(rows[0]) : null;
}

export async function renameFolder(
  userId: string,
  folderId: string,
  name: string,
): Promise<Folder | null> {
  const rows = (await sql.query(
    `
      update folders
      set name = $3, updated_at = now()
      where id = $1 and user_id = $2 and trashed_at is null
      returning id, name, parent_id, position, created_at, updated_at
    `,
    [folderId, userId, name],
  )) as FolderRow[];

  return rows[0] ? mapFolder(rows[0]) : null;
}

export async function moveFolder(
  userId: string,
  folderId: string,
  parentId: string | null,
): Promise<Folder | null> {
  const rows = (await sql.query(
    `
      with recursive descendants as (
        select id from folders where id = $1 and user_id = $2
        union all
        select folders.id
        from folders
        join descendants on folders.parent_id = descendants.id
        where folders.user_id = $2
      ),
      valid_parent as (
        select 1 as valid
        where $3::uuid is null
          or exists (
            select 1 from folders
            where id = $3 and user_id = $2 and trashed_at is null
          )
      )
      update folders
      set
        parent_id = $3,
        position = coalesce((
          select max(position) + 1
          from folders as siblings
          where siblings.user_id = $2
            and siblings.parent_id is not distinct from $3::uuid
            and siblings.trashed_at is null
        ), 0),
        updated_at = now()
      where folders.id = $1
        and folders.user_id = $2
        and folders.trashed_at is null
        and exists (select 1 from valid_parent)
        and not exists (select 1 from descendants where id = $3)
      returning id, name, parent_id, position, created_at, updated_at
    `,
    [folderId, userId, parentId],
  )) as FolderRow[];

  return rows[0] ? mapFolder(rows[0]) : null;
}

export async function trashFolder(
  userId: string,
  folderId: string,
): Promise<boolean> {
  const rows = await sql.query(
    `
      with recursive subtree as (
        select id from folders
        where id = $1 and user_id = $2 and trashed_at is null
        union all
        select folders.id
        from folders
        join subtree on folders.parent_id = subtree.id
        where folders.user_id = $2 and folders.trashed_at is null
      ),
      trashed_notebooks as (
        update notebooks
        set trashed_at = now(), updated_at = now()
        where user_id = $2 and folder_id in (select id from subtree)
        returning id
      )
      update folders
      set trashed_at = now(), updated_at = now()
      where id in (select id from subtree)
      returning id
    `,
    [folderId, userId],
  );

  return rows.length > 0;
}

export async function restoreFolder(
  userId: string,
  folderId: string,
): Promise<boolean> {
  const rows = await sql.query(
    `
      with recursive ancestors as (
        select id, parent_id from folders where id = $1 and user_id = $2
        union all
        select folders.id, folders.parent_id
        from folders
        join ancestors on ancestors.parent_id = folders.id
        where folders.user_id = $2
      ),
      subtree as (
        select id from folders where id = $1 and user_id = $2
        union all
        select folders.id
        from folders
        join subtree on folders.parent_id = subtree.id
        where folders.user_id = $2
      ),
      restored_notebooks as (
        update notebooks
        set trashed_at = null, updated_at = now()
        where user_id = $2 and folder_id in (select id from subtree)
        returning id
      )
      update folders
      set trashed_at = null, updated_at = now()
      where id in (
        select id from ancestors
        union
        select id from subtree
      )
      returning id
    `,
    [folderId, userId],
  );

  return rows.length > 0;
}

export async function permanentlyDeleteFolder(
  userId: string,
  folderId: string,
): Promise<boolean> {
  const rows = await sql.query(
    `
      with recursive subtree as (
        select id from folders
        where id = $1 and user_id = $2 and trashed_at is not null
        union all
        select folders.id
        from folders
        join subtree on folders.parent_id = subtree.id
        where folders.user_id = $2
      ),
      deleted_notebooks as (
        delete from notebooks
        where user_id = $2 and folder_id in (select id from subtree)
        returning id
      )
      delete from folders
      where id = $1 and user_id = $2 and trashed_at is not null
      returning id
    `,
    [folderId, userId],
  );

  return rows.length > 0;
}

export async function getTrashItems(userId: string): Promise<TrashItem[]> {
  const rows = (await sql.query(
    `
      select
        folders.id,
        'folder'::text as kind,
        folders.name,
        folders.trashed_at
      from folders
      left join folders as parent on parent.id = folders.parent_id
      where folders.user_id = $1
        and folders.trashed_at is not null
        and (folders.parent_id is null or parent.trashed_at is null)

      union all

      select
        notebooks.id,
        'notebook'::text as kind,
        notebooks.title as name,
        notebooks.trashed_at
      from notebooks
      left join folders on folders.id = notebooks.folder_id
      where notebooks.user_id = $1
        and notebooks.trashed_at is not null
        and (notebooks.folder_id is null or folders.trashed_at is null)

      order by trashed_at desc
    `,
    [userId],
  )) as TrashRow[];

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    trashedAt: new Date(row.trashed_at).getTime(),
  }));
}
