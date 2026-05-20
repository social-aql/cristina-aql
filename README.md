# AI LICHIDITATE

Social media analytics with AI-generated positioning insights. Financial-editorial visual identity — stark black, warm off-white, electric lime, coral red.

## Local Setup

### 1. Create a Supabase project

See `supabase/README.md` for full instructions.

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the values from your Supabase project settings and generate an encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Apply the database migration

In your Supabase Dashboard → SQL Editor, run the contents of `supabase/migrations/0001_initial_schema.sql`.

### 4. Install and run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

Three pluggable axes:

### Themes

Themes live in `src/themes/{theme-id}/`. The active theme is set in `src/config/theme.config.ts`:
```ts
export const activeThemeId: ThemeId = 'ai-lichiditate';
```
Adding a new theme: copy `src/themes/ai-lichiditate/`, update token values, add to the `themes` map.

### Social Providers

Providers live in `src/providers/{provider-id}/index.ts` and implement `SocialProvider` from `src/providers/types.ts`.

**Adding a new provider:**
1. Create `src/providers/{name}/index.ts` implementing `SocialProvider`
2. Add one entry to `src/config/providers.config.ts`:
   ```ts
   import { myProvider } from '@/providers/my-provider';
   export const registeredProviders: SocialProvider[] = [
     mockProvider,
     myProvider, // ← one line
   ];
   ```
No UI changes, no DB migrations, no sync logic changes needed.

### AI Analyses

Analysis definitions are in `src/config/ai.config.ts`. Each analysis has a system prompt and a user template. The sync engine is in `src/lib/sync/sync-account.ts` — provider-agnostic, same code for all providers.

## Tech Stack

- Next.js 14 App Router
- React 18 + TypeScript 5
- Ant Design 5 (UI components)
- Supabase (auth + Postgres + RLS)
- Zod (runtime validation)
- @faker-js/faker (mock data)
- @anthropic-ai/sdk (AI analysis — future)
