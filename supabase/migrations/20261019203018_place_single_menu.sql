-- A place offers guests one menu: a link or a PDF, never both.
-- NOT VALID: enforced on every insert and update from now on; rows saved earlier are not rechecked.
alter table public.places add constraint places_single_menu check (link_url is null or menu_path is null) not valid;
