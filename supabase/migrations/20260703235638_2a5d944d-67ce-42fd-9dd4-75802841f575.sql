create table if not exists public.personality_portrait (
  user_id uuid primary key references auth.users(id) on delete cascade,
  energy text not null default '',
  mood text not null default '',
  values_worldview text not null default '',
  interests_ideas text not null default '',
  communication text not null default '',
  explicit_preferences text[] not null default '{}',
  freeform_notes text not null default '',
  turns_since_synthesis int not null default 0,
  last_synthesized_at timestamptz,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.personality_portrait to authenticated;
grant all on public.personality_portrait to service_role;

alter table public.personality_portrait enable row level security;

create policy "portrait_own_select" on public.personality_portrait
  for select to authenticated using (auth.uid() = user_id);
create policy "portrait_own_insert" on public.personality_portrait
  for insert to authenticated with check (auth.uid() = user_id);
create policy "portrait_own_update" on public.personality_portrait
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "portrait_own_delete" on public.personality_portrait
  for delete to authenticated using (auth.uid() = user_id);