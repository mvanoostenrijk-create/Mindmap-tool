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

-- Bijlagen (later toegevoegd; ook eenmalig uitvoeren): opslagruimte waarin iedere gebruiker alleen bij de eigen map kan.
insert into storage.buckets (id, name, public) values ('bijlagen', 'bijlagen', false) on conflict (id) do nothing;
create policy "alleen eigen bijlagen" on storage.objects for all to authenticated
  using (bucket_id = 'bijlagen' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'bijlagen' and (storage.foldername(name))[1] = auth.uid()::text);
