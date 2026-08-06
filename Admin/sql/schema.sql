-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Database Schema
-- =========================================================

-- ==========================
-- USERS (Boss & Staff)
-- ==========================
create table if not exists users (

    id uuid primary key default gen_random_uuid(),

    email text unique not null,

    full_name text not null,

    role text not null
        check (role in ('admin','boss')),

    created_at timestamptz default now()

);

-- ==========================
-- STORES
-- ==========================
create table if not exists stores (

    id uuid primary key default gen_random_uuid(),

    name text not null unique,

    address text,

    created_at timestamptz default now()

);

-- ==========================
-- PROMOTERS
-- ==========================
create table if not exists promoters (

    id uuid primary key default gen_random_uuid(),

    full_name text not null,

    nickname text,

    ic_number text,

    age integer,

    phone text,

    address text,

    bank_name text,

    bank_account text,

    notes text,

    active boolean default true,

    created_at timestamptz default now(),

    updated_at timestamptz default now()

);

-- ==========================
-- JOBS
-- ==========================
create table if not exists jobs (

    id uuid primary key default gen_random_uuid(),

    promoter_id uuid
        references promoters(id)
        on delete cascade,

    store_id uuid
        references stores(id)
        on delete restrict,

    work_date date not null,

    start_time time not null,

    end_time time not null,

    pay numeric(10,2) default 0,

    commission numeric(10,2) default 0,

    remarks text,

    created_at timestamptz default now(),

    updated_at timestamptz default now()

);

-- ==========================
-- SETTINGS
-- ==========================
create table if not exists settings (

    id uuid primary key default gen_random_uuid(),

    company_name text default 'Golden Panda',

    workspace_code text,

    created_at timestamptz default now()

);

-- =========================================================
-- INDEXES
-- =========================================================

create index if not exists idx_promoters_name
on promoters(full_name);

create index if not exists idx_jobs_date
on jobs(work_date);

create index if not exists idx_jobs_promoter
on jobs(promoter_id);

create index if not exists idx_jobs_store
on jobs(store_id);

-- =========================================================
-- AUTO UPDATE updated_at
-- =========================================================

create or replace function update_timestamp()
returns trigger
language plpgsql
as
$$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_promoters_updated on promoters;

create trigger trg_promoters_updated
before update
on promoters
for each row
execute function update_timestamp();

drop trigger if exists trg_jobs_updated on jobs;


create trigger trg_jobs_updated
before update
on jobs
for each row
execute function update_timestamp();