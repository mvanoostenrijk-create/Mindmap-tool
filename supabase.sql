-- Eenmalig uitvoeren in Supabase: SQL Editor > plakken > Run.
create table public.maps (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default '',
  data jsonb,
  updated bigint not null,
  deleted boolean not null default false
);
alter table public.maps enable row level security;
create policy "alleen eigen mindmaps" on public.maps for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
