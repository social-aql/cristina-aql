# Cum faci fork la social-aql

`social-aql` este o platformă white-label de analytics pentru social media (Meta Instagram + AI).
Când faci fork, primești o aplicație complet funcțională pe care o customizezi cu brandul tău.

## Pași rapizi (15 minute)

### 1. Fork repo-ul

Pe GitHub, click **Fork** → creează `your-org/your-app-name`.

### 2. Clonează fork-ul local

```bash
git clone https://github.com/your-org/your-app-name.git
cd your-app-name
pnpm install
```

### 3. Configurează upstream (pentru update-uri viitoare)

```bash
git remote add upstream https://github.com/your-org/social-aql.git
git remote -v
# Trebuie să vezi:
# origin    https://github.com/your-org/your-app-name.git
# upstream  https://github.com/your-org/social-aql.git
```

### 4. Editează `fork-config.ts`

Aceasta este SINGURUL fișier pe care îl modifici pentru brandul tău:

```ts
const config: ForkConfig = {
  app: {
    name: 'NUMELE TĂU',              // ← schimbă
    tagline: 'Descrierea ta.',        // ← schimbă
    handle: '@handle_tău',            // ← schimbă
    locale: 'ro',                     // 'ro' sau 'en'
  },
  theme: {
    accentPrimary: '#00FF88',         // ← culoarea ta principală (înlocuiește lime)
    accentSecondary: '#FF4444',       // ← culoarea ta secundară (înlocuiește coral)
    // ... rest rămâne sau customizezi după nevoie
    // IMPORTANT: actualizează și bgCardPositive/bgCardNegative
    // dacă schimbi culorile accent (sunt tinte din culorile respective)
  },
  modules: {
    contentIdeation: false,           // ← dezactivezi ce nu vrei
    // ... rest activat by default
  },
};
```

### 5. Configurează variabilele de mediu

Copiază `.env.example` → `.env.local` și completează:

```bash
cp .env.example .env.local
```

Variabile obligatorii:

```
NEXT_PUBLIC_SUPABASE_URL=          # din Supabase Dashboard → Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # din Supabase Dashboard → Settings → API
SUPABASE_SERVICE_ROLE_KEY=         # din Supabase Dashboard → Settings → API (secret)
ENCRYPTION_KEY=                    # generează: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CRON_SECRET=                       # generează: node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
GOOGLE_GENERATIVE_AI_API_KEY=      # din https://aistudio.google.com/apikey
META_APP_ID=                       # din https://developers.facebook.com/apps/
META_APP_SECRET=                   # din Meta App → Settings → Basic
META_GRAPH_API_VERSION=v22.0
META_REDIRECT_URI=http://localhost:3000/auth/callback/meta
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 6. Aplică migrările Supabase

În Supabase Dashboard → SQL Editor, rulează în ordine:
1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_kpi_columns_and_themes.sql`
3. `supabase/migrations/0003_theme_secondary_column.sql`
4. `supabase/migrations/0004_analyses_enrichment.sql`

### 7. Pornește aplicația

```bash
pnpm dev
```

Navighează la `http://localhost:3000` → ar trebui să vezi aplicația cu brandul tău.

### 8. Configurează Meta App

Urmează ghidul din `supabase/META_SETUP.md` pentru a configura aplicația Meta și a conecta un cont Instagram.

---

## Cum primești update-uri din social-aql

Când `social-aql` primește un fix sau o funcționalitate nouă:

```bash
# Fetch update-urile din upstream
git fetch upstream

# Preview ce se schimbă
git log upstream/main --oneline --not HEAD

# Merge update-urile în branch-ul tău
git merge upstream/main
```

**Conflicte:** Singurul fișier în care ar trebui să ai conflicte este `fork-config.ts` — deoarece tu l-ai modificat cu brandul tău, iar upstream-ul l-a modificat cu noile opțiuni de config.

Rezolvarea conflictului e simplă: păstrezi VALORILE tale (culori, nume, etc.) dar adaugi CHEILE NOI din upstream (module noi, opțiuni noi).

---

## Structura codebase-ului

```
social-aql/
├── fork-config.ts          ← SINGURUL fișier de customizat
├── FORK.md                 ← acest ghid
├── src/
│   ├── app/                ← Next.js App Router (pages, routes)
│   ├── ai/                 ← AI provider + analyses engine
│   ├── components/         ← UI components
│   ├── config/             ← Configuration layer (citesc din fork-config)
│   ├── lib/                ← Utilities, KPI engine, sync, diagnostics
│   ├── providers/          ← Social media providers (Meta, Mock)
│   └── themes/platform/    ← Theme tokens (citesc din fork-config)
├── supabase/
│   └── migrations/         ← Database schema migrations
└── docs/                   ← Documentation
```

---

## Ce NU schimbi în fork (și de ce)

| Nu schimba | De ce |
|------------|-------|
| `src/providers/meta-instagram/` | OAuth + API integration — vine din upstream |
| `src/lib/kpis/` | KPI calculation engine — vine din upstream |
| `src/ai/` | AI analyses engine — vine din upstream |
| `src/lib/sync/` | Sync logic — vine din upstream |
| `src/components/design-system/` | Design system components — vine din upstream |
| `supabase/migrations/` | DB schema — vine din upstream |

Dacă modifici aceste fișiere, merge conflicts la `git merge upstream/main` vor fi greu de rezolvat.

---

## Schimbarea fonturilor (singurul pas manual)

Fonturile în Next.js trebuie să fie statice la build time (nu pot fi citite din config la runtime). Dacă vrei să schimbi fontul display de la League Spartan la altul:

1. Deschide `src/app/layout.tsx`
2. Găsește importul `League_Spartan` și înlocuiește cu fontul dorit din `next/font/google`
3. Actualizează `fork-config.ts` → `theme.fontDisplay` cu noul nume (pentru documentație)

Toate celelalte customizări sunt în `fork-config.ts`.

---

## Deploy pe Vercel

1. Push fork-ul pe GitHub
2. Mergi pe vercel.com → New Project → Import fork-ul tău
3. Adaugă toate variabilele din `.env.example` în Vercel → Settings → Environment Variables
4. Adaugă și `META_REDIRECT_URI=https://your-domain.vercel.app/auth/callback/meta`
5. Deploy

Cron-ul săptămânal (Weekly Summary) se activează automat pe Vercel după deploy — rulează miercuri 16:00 UTC.
