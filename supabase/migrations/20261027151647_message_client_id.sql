-- Idempotent sends: the client generates client_id once per message and reuses it on every retry,
-- so a send whose response was lost cannot store the message twice. Older rows keep null (nulls never collide).
alter table public.messages add column client_id uuid;
alter table public.messages add constraint messages_sender_id_client_id_key unique (sender_id, client_id);
grant insert (client_id) on table public.messages to authenticated;

-- A retry of a stored message is skipped before limit_message_rate (triggers fire in name order), so it never
-- reads as a rate-limit or slow-mode error. The client then reads the first row back. Concurrent duplicates
-- still meet the unique key, which the client's ON CONFLICT DO NOTHING absorbs.
create function private.skip_duplicate_message() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.client_id is not null and exists (
    select 1 from public.messages m where m.sender_id = new.sender_id and m.client_id = new.client_id
  ) then return null; end if;
  return new;
end;
$$;
revoke all on function private.skip_duplicate_message() from public;
create trigger dedupe_message before insert on public.messages
  for each row execute function private.skip_duplicate_message();
