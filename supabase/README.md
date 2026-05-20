# Supabase Setup

## 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) and create a new project.

## 2. Copy environment variables

In your Supabase project dashboard, go to **Settings → API**. Copy the following into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 3. Generate encryption key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add the output as `ENCRYPTION_KEY=...` in `.env.local`.

## 4. Apply the migration

Go to **SQL Editor** in your Supabase dashboard and run the full contents of `migrations/0001_initial_schema.sql`.

## 5. Enable email auth

In **Authentication → Providers**, ensure Email is enabled. For local dev you can disable email confirmation in **Authentication → Settings**.

## Tables

| Table | Description |
|-------|-------------|
| `accounts` | Connected social accounts per user |
| `account_metrics_snapshots` | Time-series account-level metrics |
| `posts` | One row per post per account |
| `post_metrics_snapshots` | Time-series post-level metrics |
| `ai_analyses` | AI-generated analysis outputs |
| `sync_jobs` | Sync audit trail |

All tables have Row Level Security enabled — users only see their own data.
