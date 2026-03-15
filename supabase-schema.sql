create table if not exists rooms (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id bigint generated always as identity primary key,
  room_slug text not null,
  username text not null,
  avatar_url text not null,
  is_typing boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id bigint generated always as identity primary key,
  room_slug text not null,
  username text not null,
  avatar_url text not null,
  text text,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id bigint generated always as identity primary key,
  room_slug text not null,
  title text not null,
  event_date date not null,
  event_time time not null,
  creator_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists reactions (
  id bigint generated always as identity primary key,
  room_slug text not null,
  message_id bigint not null,
  emoji text not null,
  username text not null,
  created_at timestamptz not null default now()
);

alter table rooms enable row level security;
alter table members enable row level security;
alter table messages enable row level security;
alter table events enable row level security;
alter table reactions enable row level security;

create policy "public read rooms" on rooms for select using (true);
create policy "public insert rooms" on rooms for insert with check (true);

create policy "public read members" on members for select using (true);
create policy "public insert members" on members for insert with check (true);
create policy "public update members" on members for update using (true) with check (true);

create policy "public read messages" on messages for select using (true);
create policy "public insert messages" on messages for insert with check (true);

create policy "public read events" on events for select using (true);
create policy "public insert events" on events for insert with check (true);

create policy "public read reactions" on reactions for select using (true);
create policy "public insert reactions" on reactions for insert with check (true);
