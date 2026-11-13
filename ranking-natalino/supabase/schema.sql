-- ============================================================
-- Ranking Natalino de Chocotones — Schema Supabase (PostgreSQL)
-- Sem login: acesso público controlado via RLS para leitura e votos.
-- Cole este arquivo no SQL Editor do Supabase e clique em "Run".
-- ============================================================

create table if not exists public.chocotone_weeks (
  week integer primary key check (week >= 1 and week <= 52),
  chocotone text not null check (char_length(trim(chocotone)) between 1 and 120),
  brand text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.chocotone_votes (
  id bigint generated always as identity primary key,
  week integer not null references public.chocotone_weeks(week) on delete cascade,
  person text not null check (char_length(trim(person)) between 1 and 60),
  person_key text generated always as (lower(trim(person))) stored,
  sabor numeric(4,2) not null check (sabor >= 0 and sabor <= 10),
  recheio numeric(4,2) not null check (recheio >= 0 and recheio <= 10),
  maciez numeric(4,2) not null check (maciez >= 0 and maciez <= 10),
  docura numeric(4,2) not null check (docura >= 0 and docura <= 10),
  comment text not null default '',
  updated_at timestamptz not null default now(),
  unique (week, person_key)
);

create index if not exists idx_chocotone_votes_week
  on public.chocotone_votes (week);

-- Permissões e Row-Level Security (app aberto sem login)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.chocotone_weeks to anon, authenticated;
grant select, insert, update, delete on public.chocotone_votes to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter table public.chocotone_weeks enable row level security;
alter table public.chocotone_votes enable row level security;

drop policy if exists "Leitura pública de semanas" on public.chocotone_weeks;
create policy "Leitura pública de semanas"
  on public.chocotone_weeks for select
  to anon, authenticated
  using (true);

drop policy if exists "Cadastro público de semanas" on public.chocotone_weeks;
create policy "Cadastro público de semanas"
  on public.chocotone_weeks for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Atualização pública de semanas" on public.chocotone_weeks;
create policy "Atualização pública de semanas"
  on public.chocotone_weeks for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Leitura pública de avaliações" on public.chocotone_votes;
create policy "Leitura pública de avaliações"
  on public.chocotone_votes for select
  to anon, authenticated
  using (true);

drop policy if exists "Envio público de avaliações" on public.chocotone_votes;
create policy "Envio público de avaliações"
  on public.chocotone_votes for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Edição pública de avaliações" on public.chocotone_votes;
create policy "Edição pública de avaliações"
  on public.chocotone_votes for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Remoção pública de avaliações" on public.chocotone_votes;
create policy "Remoção pública de avaliações"
  on public.chocotone_votes for delete
  to anon, authenticated
  using (true);

-- ============================================================
-- Dados iniciais da planilha "Ranking natalino.xlsx"
-- ============================================================

insert into public.chocotone_weeks (week, chocotone, brand, notes)
values
  (1, 'Santa edwides avelã', 'Santa Edwiges', 'Avelã • Importado da planilha inicial'),
  (2, 'Bauducco gotas', 'Bauducco', 'Gotas de chocolate • Importado da planilha inicial')
on conflict (week) do nothing;

insert into public.chocotone_votes (week, person, sabor, recheio, maciez, docura, comment)
values
  (1, 'Ana', 7, 8, 4, 6, ''),
  (1, 'André', 7, 8, 3, 5, ''),
  (1, 'Carol', 6, 6, 4, 6, ''),
  (1, 'João', 9, 9, 7, 5, ''),
  (1, 'Jonas', 7, 8, 6, 8, ''),
  (1, 'Mandy', 7, 7, 5, 8, ''),
  (1, 'Mariana', 8, 7, 5, 9, ''),
  (1, 'Regina', 7, 8, 7, 6, ''),
  (1, 'Ortiga', 8, 5, 8, 7, ''),

  (2, 'Ana', 8, 6, 8, 7.5, ''),
  (2, 'André', 6, 4, 9, 8, ''),
  (2, 'Carolina', 8, 9, 10, 8, ''),
  (2, 'João', 7, 6, 9, 8, ''),
  (2, 'Jonas', 8, 6, 7, 8, ''),
  (2, 'Mandy', 8, 5, 8, 8, ''),
  (2, 'Mariana', 9, 5, 8.5, 8, ''),
  (2, 'Barbara', 8.5, 9, 8.5, 8.5, ''),
  (2, 'Ortiga', 7, 7, 9, 8, ''),
  (2, 'Samuel', 7, 6, 9, 6, '')
on conflict (week, person_key) do nothing;
