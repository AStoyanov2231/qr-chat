create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from public, anon, authenticated;
grant select on public.user_blocks to authenticated;
create policy own_blocks_read on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

-- Enforce blocks even when a request or acceptance uses a privileged RPC.
create function private.reject_blocked_connection()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(least(new.user_a_id, new.user_b_id)::text || greatest(new.user_a_id, new.user_b_id)::text, 0));
  if exists (select 1 from public.user_blocks
    where (blocker_id = new.user_a_id and blocked_id = new.user_b_id)
       or (blocker_id = new.user_b_id and blocked_id = new.user_a_id)) then
    raise exception 'This friendship is unavailable.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_blocked_connection() from public, anon, authenticated;
create trigger reject_blocked_connection before insert or update on public.friend_connections
  for each row execute function private.reject_blocked_connection();

create function public.block_friend_connection(p_connection_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  peer uuid;
begin
  if caller is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  select case when user_a_id = caller then user_b_id else user_a_id end into peer
    from public.friend_connections
    where id = p_connection_id and accepted_at is not null
      and (user_a_id = caller or user_b_id = caller);
  if peer is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(caller, peer)::text || greatest(caller, peer)::text, 0));
  insert into public.user_blocks(blocker_id, blocked_id) values(caller, peer) on conflict do nothing;
  delete from public.friend_connections where (user_a_id = caller and user_b_id = peer) or (user_a_id = peer and user_b_id = caller);
  return true;
end;
$$;
revoke all on function public.block_friend_connection(uuid) from public, anon;
grant execute on function public.block_friend_connection(uuid) to authenticated;
