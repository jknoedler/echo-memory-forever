create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  occurred_at timestamptz not null,
  all_day boolean not null default false,
  created_at timestamptz not null default now()
);
create index events_user_time on public.events(user_id, occurred_at desc);
grant select, insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;
create policy "own events" on public.events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);