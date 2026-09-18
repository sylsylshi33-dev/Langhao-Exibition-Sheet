-- Exhibition lead-capture: database schema.
--
-- Run this once in the Supabase project's SQL Editor (Project → SQL Editor →
-- New query → paste → Run). Safe to re-run: everything is IF NOT EXISTS /
-- OR REPLACE where practical.
--
-- Design:
--   - The customer-facing form only ever INSERTs, using the public "anon" key.
--     It can never read or edit other people's leads.
--   - The admin dashboard reads/updates leads using the "service_role" key,
--     which is kept server-side only (never shipped to the browser) and
--     bypasses Row Level Security entirely.
--   - Uploaded photos go into two private Storage buckets. The form can
--     upload but not list/read; the admin dashboard views them via
--     short-lived signed URLs generated with the service_role key.

create extension if not exists "pgcrypto";

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default '新线索',

  name text not null default '',
  company text not null default '',
  job_title text not null default '',
  country text not null default '',
  phone text not null default '',
  email text not null default '',
  wechat text not null default '',

  business_card_path text,
  product_image_paths text[] not null default '{}',
  product_models text[] not null default '{}',
  requested_information text[] not null default '{}',
  message text not null default ''
);

alter table public.leads enable row level security;

drop policy if exists "anyone can submit a lead" on public.leads;
create policy "anyone can submit a lead"
  on public.leads for insert
  to anon
  with check (true);

-- Intentionally no SELECT / UPDATE / DELETE policy for `anon`: the public
-- form can create leads but never read them back. The admin dashboard uses
-- the service_role key, which ignores RLS, for everything else.

-- Storage buckets for the uploaded photos. Both private — see note above.
insert into storage.buckets (id, name, public)
values ('business-cards', 'business-cards', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', false)
on conflict (id) do nothing;

drop policy if exists "anyone can upload a business card" on storage.objects;
create policy "anyone can upload a business card"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'business-cards');

drop policy if exists "anyone can upload a product photo" on storage.objects;
create policy "anyone can upload a product photo"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'product-images');
