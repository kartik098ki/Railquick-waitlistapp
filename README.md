# RailQuick Waitlist

A polished coming-soon waitlist website for RailQuick.

## Run locally

```bash
cp .env.example .env
npm run dev
```

Set `RESEND_API_KEY` in `.env` before testing welcome emails.

## Supabase table

Create a `waitlist` table with at least these columns:

```sql
create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  city text not null,
  created_at timestamptz not null default now()
);
```

Enable insert access for the anon key according to your Supabase RLS policy.
