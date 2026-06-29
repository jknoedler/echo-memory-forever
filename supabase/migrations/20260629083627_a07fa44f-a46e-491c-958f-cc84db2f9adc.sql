
-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

-- profiles
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  dob date,
  persona_brief text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.touch_updated_at();

-- auto-create profile + settings on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict do nothing;
  insert into public.user_settings (user_id, biometrics_secret)
  values (new.id, encode(gen_random_bytes(24), 'hex'))
  on conflict do nothing;
  return new;
end;
$$;

-- user_settings
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'lovable',           -- 'lovable' | 'custom'
  model text not null default 'google/gemini-3-flash-preview',
  custom_base_url text,
  custom_api_key text,
  custom_model_id text,
  system_prompt_override text,
  hotl_auto_execute boolean not null default false,
  biometrics_secret text not null default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.user_settings to authenticated;
grant all on public.user_settings to service_role;
alter table public.user_settings enable row level security;
create policy "own settings" on public.user_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_settings_updated before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- now create the auth trigger (after user_settings exists)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- threads
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index threads_user_recent on public.threads(user_id, last_message_at desc);
grant select, insert, update, delete on public.threads to authenticated;
grant all on public.threads to service_role;
alter table public.threads enable row level security;
create policy "own threads" on public.threads for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_threads_updated before update on public.threads
  for each row execute function public.touch_updated_at();

-- messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null default '',
  parts jsonb,
  created_at timestamptz not null default now()
);
create index messages_thread_time on public.messages(thread_id, created_at);
grant select, insert, update, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "own messages" on public.messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- memories (RAG)
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.threads(id) on delete set null,
  source text not null default 'message' check (source in ('message','note','biometric','summary')),
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index memories_user_time on public.memories(user_id, created_at desc);
create index memories_embedding on public.memories using ivfflat (embedding vector_cosine_ops) with (lists = 100);
grant select, insert, update, delete on public.memories to authenticated;
grant all on public.memories to service_role;
alter table public.memories enable row level security;
create policy "own memories" on public.memories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- vector search RPC scoped to caller
create or replace function public.match_memories(
  query_embedding vector(1536),
  match_count int default 8
) returns table (
  id uuid, content text, source text, metadata jsonb, similarity float, created_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select m.id, m.content, m.source, m.metadata,
         1 - (m.embedding <=> query_embedding) as similarity,
         m.created_at
  from public.memories m
  where m.user_id = auth.uid()
    and m.embedding is not null
  order by m.embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function public.match_memories(vector, int) to authenticated;

-- biometrics
create table public.biometrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  value jsonb not null,
  recorded_at timestamptz not null default now(),
  ingested_at timestamptz not null default now()
);
create index biometrics_user_time on public.biometrics(user_id, recorded_at desc);
grant select, insert, update, delete on public.biometrics to authenticated;
grant all on public.biometrics to service_role;
alter table public.biometrics enable row level security;
create policy "own biometrics" on public.biometrics for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- staged_tasks (HOTL)
create table public.staged_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.threads(id) on delete set null,
  title text not null,
  description text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','executed','expired')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);
create index staged_user_status on public.staged_tasks(user_id, status, created_at desc);
grant select, insert, update, delete on public.staged_tasks to authenticated;
grant all on public.staged_tasks to service_role;
alter table public.staged_tasks enable row level security;
create policy "own staged" on public.staged_tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_staged_updated before update on public.staged_tasks
  for each row execute function public.touch_updated_at();
