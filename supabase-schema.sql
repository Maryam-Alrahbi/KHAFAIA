-- KHAFAIA marketplace MVP. Run this once in Supabase Dashboard > SQL Editor.
-- Public visitors can read published posts. Signed-in users can manage only their own posts.

create table if not exists public.material_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_kind text not null check (post_kind in ('supplier_offer', 'buyer_need')),
  category text not null check (category in (
    'Palm fronds and leaves', 'Palm leaflets', 'Palm rachis and midribs',
    'Palm leaf sheaths and fibers', 'Palm trunks and stems',
    'Palm petioles and stalks', 'Palm pruning residues',
    'Palm processing residues', 'Mixed palm biomass', 'Other palm waste'
  )),
  species text,
  quantity numeric(12,2) not null check (quantity > 0),
  unit text not null check (unit in ('kg', 'tonnes', 'bundles', 'm³')),
  governorate text not null,
  moisture text not null default 'Unknown',
  material_state text not null default 'Mixed / unknown',
  availability text,
  preparation text,
  intended_application text,
  verification_status text not null default 'Unverified' check (verification_status in ('Unverified', 'Review requested', 'Verified')),
  status text not null default 'published' check (status in ('published', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists material_posts_category_idx on public.material_posts (category);
create index if not exists material_posts_governorate_idx on public.material_posts (governorate);
create index if not exists material_posts_owner_id_idx on public.material_posts (owner_id);

alter table public.material_posts enable row level security;
grant select on public.material_posts to anon, authenticated;
grant insert, update, delete on public.material_posts to authenticated;

drop policy if exists "Anyone can view published material posts" on public.material_posts;
create policy "Anyone can view published material posts"
  on public.material_posts for select
  to anon, authenticated
  using (status = 'published' or owner_id = (select auth.uid()));

drop policy if exists "Signed-in users can create their own material posts" on public.material_posts;
create policy "Signed-in users can create their own material posts"
  on public.material_posts for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'published'
    and verification_status = 'Unverified'
  );

drop policy if exists "Users can update their own material posts" on public.material_posts;
create policy "Users can update their own material posts"
  on public.material_posts for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and status = 'published'
    and verification_status = 'Unverified'
  );

drop policy if exists "Users can remove their own material posts" on public.material_posts;
create policy "Users can remove their own material posts"
  on public.material_posts for delete
  to authenticated
  using (owner_id = (select auth.uid()));
