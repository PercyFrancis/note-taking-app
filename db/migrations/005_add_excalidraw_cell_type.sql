alter table cells
drop constraint if exists cells_type_check;

alter table cells
add constraint cells_type_check
check (type in ('text', 'drawing', 'excalidraw'));
