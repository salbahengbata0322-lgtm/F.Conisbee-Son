-- ============================================================================
-- F. Conisbee & Son — Christmas Orders schema for Supabase (Postgres)
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run
-- ============================================================================

-- ---------- PRODUCTS ----------
create table if not exists products (
    id text primary key,
    product_name text not null,
    category text not null,
    uom text not null default 'kg',
    price_per_kg numeric,           -- null = price varies per order ("Quote"/"Variable")
    price_type text not null default 'Quote',   -- Fixed | Tiered | Quote | Variable
    notes text
);

-- ---------- TURKEY WEIGHT-TIER PRICING ----------
create table if not exists turkey_pricing (
    id text primary key,
    weight_min numeric not null,
    weight_max numeric not null,
    price_per_kg numeric not null
);

-- ---------- CUSTOMERS ----------
create table if not exists customers (
    id text primary key,
    name text not null,
    telephone text,
    address text,
    delivery_method text default 'Unknown',   -- Collection | Delivery | Unknown  (customer's usual preference)
    marketing_opt_in text default 'Y',        -- Y | N
    notes text,
    created_at timestamptz default now()
);

-- ---------- ORDERS ----------
-- One order per customer per season, by convention: id = 'ORD-' || customer_id
create table if not exists orders (
    id text primary key,
    order_date date not null default current_date,
    customer_id text not null references customers(id),
    status text not null default 'Pending',      -- Pending | Confirmed | Ready | Collected | Delivered | Cancelled
    delivery_method text default 'Unknown',
    collection_date date,                         -- from the paper form's "COLLECTION DATE" line
    delivery_date date,                           -- from the paper form's "DELIVERY DATE" line
    entered_on_pc text default 'Y',               -- Y | N — mirrors the paper form's own tracking checkbox;
                                                   -- 'N' means a paper form exists but hasn't been transcribed yet
    notes text,
    created_at timestamptz default now()
);

-- ---------- ORDER LINE ITEMS ----------
create table if not exists order_details (
    id bigserial primary key,
    order_id text not null references orders(id) on delete cascade,
    line_no int not null,
    product_name text not null,
    category text,                       -- denormalized from products.category at entry time —
                                          -- needed because product names repeat across categories
                                          -- (e.g. "PLAIN" exists under both Turkey Breast Roll and
                                          -- Turkey Misc), so name alone can't be trusted for reporting
    weight_kg numeric not null,
    price_per_kg numeric not null,
    line_total numeric generated always as (weight_kg * price_per_kg) stored,
    quantity numeric,                    -- head count for whole birds/game — separate from weight, per the paper form
    turkey_type text,                    -- White | Bronze — Turkey Whole only
    weight_mode text,                    -- NYD (Not Yet Decided) | EV (Estimated Value) — Turkey Whole only
    weight_range_kg numeric,             -- the "Range ±" field — Turkey Whole only
    turkey_number text,                  -- "Office Use Only" field, filled once a bird is physically allocated
    stuffing_type text,                  -- Sage and Onion | Other — Turkey Breast Roll only
    source_item_no text,
    flag text
);

-- ---------- PAYMENTS / DEPOSITS ----------
-- Amount convention: negative = money received (reduces balance due), positive = refund (increases it)
create table if not exists payments (
    id text primary key,
    customer_id text not null references customers(id),
    order_id text references orders(id),
    payment_date date not null default current_date,
    amount numeric not null,
    type text not null default 'Deposit',   -- Deposit | Balance | Refund | Other
    notes text
);

-- ---------- UNASSIGNED TRANSACTIONS (needs manual follow-up) ----------
create table if not exists unassigned (
    id bigserial primary key,
    source_sheet text,
    item_no text,
    product text not null,
    weight_kg numeric not null,
    price_per_kg numeric not null,
    total numeric generated always as (weight_kg * price_per_kg) stored,
    issue text
);

-- ---------- TILL / CHECKOUT SALES (walk-in counter sales — separate from the
-- Christmas pre-order system above: no customer required, paid in full on the
-- spot) ----------
create table if not exists sales (
    id text primary key,                          -- e.g. 'SALE-0001'
    sale_date timestamptz not null default now(),
    payment_method text not null default 'Cash',   -- Cash | Card
    amount_tendered numeric,                       -- Cash only
    change_given numeric,                          -- Cash only
    subtotal numeric not null default 0,
    status text not null default 'Completed',      -- Completed | Voided
    cashier text,
    notes text
);

create table if not exists sale_items (
    id bigserial primary key,
    sale_id text not null references sales(id) on delete cascade,
    line_no int not null,
    product_name text not null,
    mode text not null default 'Weight',           -- Weight | Qty
    weight_kg numeric,                             -- set when mode = Weight
    quantity numeric,                               -- set when mode = Qty
    price numeric not null,                        -- £/kg when Weight, £/unit when Qty
    line_total numeric generated always as (
        case when mode = 'Weight' then coalesce(weight_kg, 0) * price
             else coalesce(quantity, 0) * price end
    ) stored
);

-- ---------- VIEW: computed order balances (subtotal / amount paid / balance due) ----------
create or replace view order_balances as
select
    o.id as order_id,
    o.customer_id,
    coalesce(d.subtotal, 0) as subtotal,
    coalesce(p.amount_paid, 0) as amount_paid,
    coalesce(d.subtotal, 0) - coalesce(p.amount_paid, 0) as balance_due
from orders o
left join (
    select order_id, sum(line_total) as subtotal
    from order_details
    group by order_id
) d on d.order_id = o.id
left join (
    select order_id, -sum(amount) as amount_paid
    from payments
    where order_id is not null
    group by order_id
) p on p.order_id = o.id;

-- ============================================================================
-- Row Level Security — staff must be logged in (Supabase Auth) to read/write.
-- Create staff accounts in Dashboard -> Authentication -> Users -> Add user.
-- There is no public sign-up in this app; only accounts you create can log in.
-- ============================================================================
alter table products enable row level security;
alter table turkey_pricing enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_details enable row level security;
alter table payments enable row level security;
alter table unassigned enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;

create policy "staff full access" on products for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on turkey_pricing for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on customers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on orders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on order_details for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on payments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on unassigned for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on sales for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on sale_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- The view inherits the security of its underlying tables under Postgres's
-- default (security_invoker off) behavior in Supabase-managed Postgres; if you
-- ever see the view returning rows without login, run:
-- alter view order_balances set (security_invoker = on);

-- ============================================================================
-- MIGRATION — safe to run even if you already created the tables from an
-- earlier version of this schema. Each statement is a no-op if already applied.
-- ============================================================================
alter table orders add column if not exists collection_date date;
alter table orders add column if not exists delivery_date date;
alter table orders add column if not exists entered_on_pc text default 'Y';
alter table order_details add column if not exists quantity numeric;
alter table order_details add column if not exists turkey_type text;
alter table order_details add column if not exists weight_mode text;
alter table order_details add column if not exists weight_range_kg numeric;
alter table order_details add column if not exists turkey_number text;
alter table order_details add column if not exists stuffing_type text;
alter table order_details add column if not exists category text;
-- Backfill category for anyone upgrading from the earlier schema, from product_name
-- where it's unambiguous (Turkey Whole and Turkey Misc's CROWN/HALF/BONED are unique
-- names; everything shared with Turkey Breast Roll needs a manual check — see the
-- unassigned-style review approach if in doubt).
update order_details set category = 'Turkey' where product_name = 'TURKEY WHOLE' and category is null;
update order_details set category = 'Turkey Misc' where product_name in ('CROWN','HALF','BONED') and category is null;
-- The old per-customer delivery_date is superseded by per-order collection_date/
-- delivery_date above. Not dropped automatically — if you had one, migrate any
-- values you care about, then: alter table customers drop column if exists delivery_date;
