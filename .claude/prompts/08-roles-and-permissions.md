# AI LICHIDITATE — Prompt 08: Roluri și Permisiuni (Admin + Viewer)

## Context

Aplicația are un singur utilizator acum (admin). Această funcționalitate adaugă un sistem de roluri cu două niveluri:

- **ADMIN:** acces complet la toate acțiunile
- **VIEWER:** read-only + chat activ, fără acțiuni costisitoare

Fluxul de invitare: admin trimite un email de invitație din `/dashboard/settings` → userul primește link → se înregistrează → primește automat rol VIEWER.

## SCOPE BOUNDARY

Acest prompt face ȘASE lucruri:
1. DB migration: tabel `user_profiles` + tabel `invitations`
2. Middleware de rol: helper `getRole()` și guard `requireRole()`
3. Restricții pe server actions (sync, connect, disconnect, generate analysis)
4. Restricții pe UI (ascunde butoane pentru viewer)
5. Pagina de invite în `/dashboard/settings`
6. Flow de acceptare invitație

Nu se schimbă logica de business, nu se adaugă features noi.

## Carry-over (LOCKED)

- Tot codul existent — neschimbat în comportament pentru admin
- Design system, tokens, fonts
- KPI engine, sync, analyses, chat — funcționale ca înainte pentru admin
- DB schema existentă — doar adăugăm tabele noi

## Files allowed to change

DB:
- New: `supabase/migrations/0006_roles_and_invitations.sql`

Role helpers:
- New: `src/lib/roles.ts`
- `src/lib/env.ts` — adaugă ADMIN_EMAIL opțional

Server actions (adaugă role check):
- `src/app/dashboard/accounts/actions.ts`
- `src/app/dashboard/analyses/actions.ts`
- `src/app/api/chat/message/route.ts` — chat rămâne activ pt viewer
- `src/app/api/cron/weekly-summary/route.ts` — doar admin trigger

UI (ascunde/dezactivează butoane):
- `src/app/dashboard/accounts/page.tsx`
- `src/app/dashboard/analyses/page.tsx`
- `src/app/dashboard/posts/[id]/page.tsx`
- `src/components/providers/ConnectedAccountsList.tsx`

Settings (invite flow):
- `src/app/dashboard/settings/page.tsx`
- New: `src/app/dashboard/settings/actions.ts` (sau extinde ce există)
- New: `src/app/(auth)/accept-invite/page.tsx`
- New: `src/app/api/invite/accept/route.ts`

## DO NOT TOUCH

- KPI engine
- Sync logic core
- Meta provider
- Theme detection
- AI analyses runner
- Gemini provider
- Chat UI components (dincolo de ascunderea input-ului pentru viewer dacă e cazul)
- All other pages

---

## Deliverable 1: DB Migration

Create `supabase/migrations/0006_roles_and_invitations.sql`:

```sql
-- =====================================================================
-- 0006: User profiles (roles) + invitations system
-- =====================================================================

-- User profiles: one row per registered user, holds role
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('admin', 'viewer')),
  display_name text,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast role lookups
create index user_profiles_role_idx on public.user_profiles(role);

-- Invitations: admin creates these, viewer accepts via email link
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text not null unique default encode(gen_random_bytes(32), 'base64url'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index invitations_token_idx on public.invitations(token);
create index invitations_email_idx on public.invitations(email);
create index invitations_invited_by_idx on public.invitations(invited_by);

-- RLS
alter table public.user_profiles enable row level security;
alter table public.invitations enable row level security;

-- user_profiles: users see their own profile always
create policy "user_profiles_select_own" on public.user_profiles
  for select using (auth.uid() = user_id);

-- user_profiles: admin can see all profiles (for user management)
create policy "user_profiles_admin_select_all" on public.user_profiles
  for select using (
    exists (
      select 1 from public.user_profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

-- user_profiles: only the system (service role) can insert/update
-- (handled via service role in server actions, not direct user writes)
create policy "user_profiles_service_insert" on public.user_profiles
  for insert with check (true);  -- service role bypasses RLS anyway

create policy "user_profiles_service_update" on public.user_profiles
  for update using (true);

-- invitations: admin can see all invitations they created
create policy "invitations_admin_all" on public.invitations
  for all using (
    auth.uid() = invited_by or
    exists (
      select 1 from public.user_profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

-- Anyone can read an invitation by token (for accept flow — unauthenticated)
-- This is handled via service role in the accept route, not direct RLS

-- updated_at trigger for user_profiles
create trigger user_profiles_touch before update on public.user_profiles
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Auto-create user_profile on new user signup
-- First user ever to sign up becomes admin automatically.
-- All subsequent users become viewer.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
  admin_count integer;
begin
  -- Count existing admins
  select count(*) into admin_count
  from public.user_profiles
  where role = 'admin';

  -- First user = admin, everyone else = viewer
  insert into public.user_profiles (user_id, role)
  values (
    new.id,
    case when admin_count = 0 then 'admin' else 'viewer' end
  );

  return new;
end;
$$ language plpgsql security definer;

-- Trigger on auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

**Notă critică:** Trigger-ul `handle_new_user` creează automat profilul la signup. Primul user = admin, toți ceilalți = viewer. Asta înseamnă că nu trebuie să setezi manual rolul admin — dacă ești primul user înregistrat în proiect, ești automat admin.

**Backfill pentru userii existenți:** Dacă ai deja useri în DB, trebuie să creezi profiluri pentru ei. Adaugă la finalul SQL-ului:

```sql
-- Backfill: create profiles for existing users
-- First user (oldest created_at) becomes admin, rest become viewer
insert into public.user_profiles (user_id, role)
select
  id,
  case
    when row_number() over (order by created_at asc) = 1 then 'admin'
    else 'viewer'
  end as role
from auth.users
where id not in (select user_id from public.user_profiles)
on conflict (user_id) do nothing;
```

---

## Deliverable 2: Role helpers

Create `src/lib/roles.ts`:

```ts
import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export type UserRole = 'admin' | 'viewer';

export interface UserProfile {
  userId: string;
  role: UserRole;
  displayName: string | null;
}

/**
 * Get the role of the currently authenticated user.
 * Returns null if not authenticated.
 */
export async function getCurrentUserRole(): Promise<UserProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, display_name')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    // Profile doesn't exist yet (edge case) — treat as viewer
    return { userId: user.id, role: 'viewer', displayName: null };
  }

  return {
    userId: user.id,
    role: profile.role as UserRole,
    displayName: profile.display_name,
  };
}

/**
 * Returns true if current user is admin.
 * Use in server components and server actions for quick checks.
 */
export async function isAdmin(): Promise<boolean> {
  const profile = await getCurrentUserRole();
  return profile?.role === 'admin';
}

/**
 * Require admin role. If not admin, redirects to /dashboard with error.
 * Use at the top of server actions that should be admin-only.
 */
export async function requireAdmin(): Promise<UserProfile> {
  const profile = await getCurrentUserRole();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin') {
    // Don't throw — redirect gracefully
    redirect('/dashboard?error=unauthorized');
  }
  return profile;
}

/**
 * For server actions that return results (cannot redirect).
 * Returns an error result instead of redirecting.
 */
export async function checkAdmin(): Promise
  { ok: true; profile: UserProfile } |
  { ok: false; error: 'unauthenticated' | 'forbidden' }
> {
  const profile = await getCurrentUserRole();
  if (!profile) return { ok: false, error: 'unauthenticated' };
  if (profile.role !== 'admin') return { ok: false, error: 'forbidden' };
  return { ok: true, profile };
}
```

---

## Deliverable 3: Restricții pe server actions

### 3.1 Account actions (connect, disconnect, sync)

In `src/app/dashboard/accounts/actions.ts`, adaugă `checkAdmin()` la TOATE acțiunile:

```ts
import { checkAdmin } from '@/lib/roles';

export async function connectProviderAction(providerId: string): Promise<void> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) {
    throw new Error(roleCheck.error === 'forbidden' 
      ? 'Doar adminul poate conecta conturi.' 
      : 'Autentificare necesară.');
  }
  // ... rest unchanged
}

export async function disconnectAccountAction(
  accountId: string,
  confirmationHandle: string
): Promise<{ success: true } | { success: false; error: string }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) {
    return { success: false, error: roleCheck.error === 'forbidden' ? 'forbidden' : 'unauthenticated' };
  }
  // ... rest unchanged
}

export async function syncAccountAction(
  accountId: string
): Promise<{ success: true; postsCount: number } | { success: false; error: string }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) {
    return { success: false, error: roleCheck.error === 'forbidden' ? 'forbidden' : 'unauthenticated' };
  }
  // ... rest unchanged
}
```

### 3.2 Analysis actions

In `src/app/dashboard/analyses/actions.ts`:

```ts
import { checkAdmin } from '@/lib/roles';

export async function runAnalysisAction(
  analysisType: AnalysisType,
  accountId: string
): Promise<{ success: true; analysisId: string } | { success: false; error: string }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) {
    return {
      success: false,
      error: roleCheck.error === 'forbidden'
        ? 'Generarea de analize este disponibilă doar pentru admin.'
        : 'unauthenticated',
    };
  }
  // ... rest unchanged
}
```

### 3.3 Chat API route

In `src/app/api/chat/message/route.ts`, chat rămâne activ pentru ambele roluri. Adaugă doar un log pentru monitorizare:

```ts
// After auth check, get role (no blocking for viewer):
const supabase = await createSupabaseRouteHandlerClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// Log role for monitoring (no blocking)
const { data: profile } = await supabase
  .from('user_profiles')
  .select('role')
  .eq('user_id', user.id)
  .single();

console.log(`[chat] message from ${profile?.role ?? 'unknown'} user ${user.id}`);
// Continue normally — chat is available for all roles
```

### 3.4 Settings backfill action

In `src/app/dashboard/settings/actions.ts`, adaugă check pentru backfill themes (costisitor):

```ts
export async function backfillThemesAction() {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) {
    return { success: false, error: 'forbidden' };
  }
  // ... rest unchanged
}
```

---

## Deliverable 4: Restricții UI

### 4.1 Pass role to pages via server components

În paginile server component, fetch-uiesc rolul și îl pasez ca prop la componentele client:

**Pattern general** (aplică în toate paginile afectate):

```tsx
// Server Component
import { getCurrentUserRole } from '@/lib/roles';

export default async function AccountsPage() {
  const [userProfile, /* other data */] = await Promise.all([
    getCurrentUserRole(),
    // ... other fetches
  ]);

  const isAdmin = userProfile?.role === 'admin';

  return (
    <ConnectedAccountsList
      accounts={accounts}
      isAdmin={isAdmin}          // ← pasăm rolul
    />
  );
}
```

### 4.2 ConnectedAccountsList — ascunde sync și disconnect pentru viewer

In `src/components/providers/ConnectedAccountsList.tsx`, adaugă prop `isAdmin`:

```tsx
interface Props {
  accounts: AccountRow[];
  isAdmin: boolean;              // ← nou
}

// În render, ascunde butoanele pentru viewer:
{isAdmin && (
  <SyncAccountButton accountId={account.id} />
)}
{isAdmin && (
  <DisconnectButton account={account} />
)}

// Dacă viewer: arată un badge "READ ONLY" mic în loc de butoane
{!isAdmin && (
  <Mono tone="muted" style={{ fontSize: 10 }}>VIZUALIZARE</Mono>
)}
```

### 4.3 Accounts page — ascunde cardul de connect providers pentru viewer

In `src/app/dashboard/accounts/page.tsx`:

```tsx
{isAdmin && (
  <AvailableProvidersGrid
    providers={providerManifests}
    onConnectAction={connectProviderAction}
  />
)}
{!isAdmin && (
  <Card>
    <Eyebrow tone="muted">PROVIDERI · ACCES RESTRICȚIONAT</Eyebrow>
    <Body tone="secondary">
      Conectarea conturilor este disponibilă doar pentru administrator.
    </Body>
  </Card>
)}
```

### 4.4 Analyses page — ascunde butoanele de generare pentru viewer

In `src/app/dashboard/analyses/page.tsx`:

```tsx
// Viewer vede lista de analize existente dar nu poate genera noi
{isAdmin && (
  <AnalysisTypeCard
    type="weekly_summary"
    onRun={runAnalysisAction}
  />
)}
{!isAdmin && latestWeeklySummary && (
  // Afișează ultima analiză existentă fără buton de generare
  <AnalysisCard analysis={latestWeeklySummary} />
)}
```

### 4.5 Post detail page — ascunde checklist-ul diagnostic write actions

Post detail page e read-only by nature — nu are acțiuni pentru viewer. Nicio schimbare necesară.

### 4.6 Dashboard home — fără schimbări

Dashboard home e read-only (KPI cards, top posts, diagnostic flags read-only). Viewer vede tot.

### 4.7 Sidebar — indicator de rol

In `src/components/layout/Sidebar.tsx`, adaugă un indicator mic sub user email:

```tsx
// Server Component — fetch role
import { getCurrentUserRole } from '@/lib/roles';

// În sidebar, lângă email:
<div style={{ marginBottom: 4 }}>
  <Mono tone="muted" style={{ fontSize: 11 }}>
    {userEmail}
  </Mono>
  <Mono
    style={{
      fontSize: 10,
      color: role === 'admin'
        ? 'var(--color-accent-lime)'
        : 'var(--color-text-muted)',
    }}
  >
    {role === 'admin' ? '● ADMIN' : '○ VIEWER'}
  </Mono>
</div>
```

---

## Deliverable 5: Invite system

### 5.1 Invite action în settings

In `src/app/dashboard/settings/actions.ts`, adaugă:

```ts
'use server';

import { checkAdmin } from '@/lib/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

export async function inviteUserAction(
  email: string
): Promise<{ success: true; inviteUrl: string } | { success: false; error: string }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) return { success: false, error: 'forbidden' };

  const supabase = await createSupabaseServerClient();

  // Check if user already exists
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('user_id',
      supabase.from('auth.users').select('id').eq('email', email).single()
    )
    .single();

  // Check if pending invitation already exists
  const { data: existingInvite } = await supabase
    .from('invitations')
    .select('id, expires_at')
    .eq('email', email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (existingInvite) {
    // Re-use existing invitation
    const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${existingInvite.id}`;
    return { success: true, inviteUrl };
  }

  // Create new invitation
  const { data: invite, error } = await supabase
    .from('invitations')
    .insert({
      email,
      invited_by: roleCheck.profile.userId,
    })
    .select('token')
    .single();

  if (error || !invite) {
    return { success: false, error: 'Failed to create invitation' };
  }

  const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${invite.token}`;

  // Send email via Supabase's built-in email (or just return URL for manual sharing)
  // For POC: return the URL for admin to share manually
  // Production: integrate with Resend/SendGrid

  return { success: true, inviteUrl };
}

export async function revokeInviteAction(
  inviteId: string
): Promise<{ success: boolean }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) return { success: false };

  const supabase = await createSupabaseServerClient();
  await supabase
    .from('invitations')
    .delete()
    .eq('id', inviteId)
    .eq('invited_by', roleCheck.profile.userId);

  return { success: true };
}

export async function removeViewerAction(
  viewerUserId: string
): Promise<{ success: boolean }> {
  const roleCheck = await checkAdmin();
  if (!roleCheck.ok) return { success: false };

  // Can only remove viewers, not other admins
  const supabase = await createSupabaseServerClient();

  const { data: targetProfile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', viewerUserId)
    .single();

  if (!targetProfile || targetProfile.role !== 'viewer') {
    return { success: false };
  }

  // Delete the user's profile (cascades from auth.users delete is not needed here)
  // We just remove their profile — they can no longer access the app
  // For full deletion, would need service role to delete from auth.users
  await supabase
    .from('user_profiles')
    .delete()
    .eq('user_id', viewerUserId)
    .eq('role', 'viewer'); // safety: only delete viewers

  return { success: true };
}
```

### 5.2 Invite UI în settings page

In `src/app/dashboard/settings/page.tsx`, adaugă secțiunea de management useri (vizibilă DOAR pentru admin):

```tsx
// Server component — fetch users și invitații dacă e admin
import { getCurrentUserRole } from '@/lib/roles';

// Dacă e admin, fetch:
const [userProfile, viewers, pendingInvites] = await Promise.all([
  getCurrentUserRole(),
  isAdminRole ? fetchViewers(supabase) : Promise.resolve([]),
  isAdminRole ? fetchPendingInvites(supabase, userId) : Promise.resolve([]),
]);
```

Secțiunea de UI pentru admin (Client Component separat `UserManagementSection`):

```
UTILIZATORI · MANAGEMENT

[secțiune: USERI ACTIVI]
Eyebrow: "VIEWERS ACTIVI"
Lista de useri cu rol viewer:
  ● user@email.com — VIEWER — se alăturat 3 mai — [ELIMINĂ]
  ● user2@email.com — VIEWER — se alăturat 10 mai — [ELIMINĂ]

[secțiune: INVITAȚII ACTIVE]
Eyebrow: "INVITAȚII ACTIVE"
Lista de invitații pending:
  ● pending@email.com — expiră în 5 zile — [COPIAZĂ LINK] [REVOCĂ]

[secțiune: INVITĂ UTILIZATOR NOU]
Eyebrow: "INVITĂ VIEWER NOU"
Input: placeholder "email@domain.com"
Button: primary "→ TRIMITE INVITAȚIE"

Notă mică: "Userul invitat va primi rol VIEWER — poate vizualiza date și 
folosi chat-ul, dar nu poate modifica conturi sau genera analize."
```

Flow după click "Trimite invitație":
1. Apelează `inviteUserAction(email)`
2. Pe success: afișează un modal/toast cu URL-ul de invitație:
```
   INVITAȚIE CREATĂ
   Link valid 7 zile. Trimite-l manual prin email sau WhatsApp:
   
   [https://your-app.vercel.app/accept-invite?token=abc123...]
   
   [COPIAZĂ LINK] [ÎNCHIDE]
```
3. URL-ul se copiază în clipboard cu un click

**Notă pentru producție:** Integrarea cu un email provider (Resend, SendGrid) se adaugă mai târziu. Pentru POC, admin copiază și trimite manual link-ul.

### 5.3 Accept invite page

Create `src/app/(auth)/accept-invite/page.tsx`:

```tsx
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AcceptInviteForm } from '@/components/auth/AcceptInviteForm';

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function AcceptInvitePage({ searchParams }: Props) {
  const params = await searchParams;
  const token = params.token;

  if (!token) redirect('/login?error=invalid_invite');

  // Use service role to look up invitation (bypasses RLS)
  // For POC: use server client (RLS allows reading by token in our policy)
  const supabase = await createSupabaseServerClient();

  // Validate token
  const { data: invite } = await supabase
    .from('invitations')
    .select('id, email, expires_at, accepted_at')
    .eq('token', token)
    .single();

  if (!invite) {
    return <InviteError message="Invitație invalidă sau expirată." />;
  }

  if (invite.accepted_at) {
    return <InviteError message="Această invitație a fost deja folosită." />;
  }

  if (new Date(invite.expires_at) < new Date()) {
    return <InviteError message="Invitația a expirat. Cere adminului o nouă invitație." />;
  }

  // Check if user is already logged in
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    // User already has account — mark invite as accepted and redirect
    // (handles case where someone is invited but already has an account)
    redirect(`/api/invite/accept?token=${token}`);
  }

  // Show signup form pre-filled with email
  return (
    <div style={{ /* centered layout, same style as login page */ }}>
      <Eyebrow tone="lime">INVITAȚIE · AI LICHIDITATE</Eyebrow>
      <H1>
        AI FOST <span style={{ color: 'var(--color-accent-lime)' }}>INVITAT.</span>
      </H1>
      <Body tone="secondary" style={{ marginBottom: 32 }}>
        Creează-ți contul pentru a accesa platforma ca viewer.
        Email pre-completat: {invite.email}
      </Body>

      <AcceptInviteForm
        email={invite.email}
        token={token}
      />
    </div>
  );
}
```

### 5.4 AcceptInviteForm component

Create `src/components/auth/AcceptInviteForm.tsx` (Client Component):

```tsx
'use client';

// Similar cu login form dar:
// - Email pre-completat și read-only
// - Câmp parolă (set password, not existing)
// - La submit: POST la /api/invite/accept
// - Pe success: redirect la /dashboard
```

### 5.5 Accept invite API route

Create `src/app/api/invite/accept/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  const { token, password } = await request.json() as {
    token: string;
    password: string;
  };

  // Service role client to bypass RLS for invite validation + user creation
  const serviceSupabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Validate token
  const { data: invite } = await serviceSupabase
    .from('invitations')
    .select('id, email, accepted_at, expires_at, invited_by')
    .eq('token', token)
    .single();

  if (!invite || invite.accepted_at || new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  // 2. Create or find user account via Supabase Admin API
  // Check if user already exists
  const { data: existingUsers } = await serviceSupabase.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(u => u.email === invite.email);

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    // Create new user
    const { data: newUser, error: createError } = await serviceSupabase
      .auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true, // skip email verification for invited users
      });

    if (createError || !newUser.user) {
      return NextResponse.json({ error: 'user_creation_failed' }, { status: 500 });
    }

    userId = newUser.user.id;
  }

  // 3. Ensure user profile exists with viewer role
  // The trigger handles this for new users, but for existing users we need to check
  const { data: existingProfile } = await serviceSupabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!existingProfile) {
    await serviceSupabase.from('user_profiles').insert({
      user_id: userId,
      role: 'viewer',
      invited_by: invite.invited_by,
    });
  }

  // 4. Mark invitation as accepted
  await serviceSupabase
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  // 5. Return success — client will redirect to login
  return NextResponse.json({ success: true, email: invite.email });
}

// GET: handles redirect after already-logged-in user accepts invite
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/dashboard', request.url));

  const serviceSupabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  await serviceSupabase
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('token', token)
    .is('accepted_at', null);

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
```

---

## Deliverable 6: Protecție globală în middleware

In `src/middleware.ts`, adaugă o verificare pentru rute protejate (opțional dar recomandat):

```ts
// Middleware-ul existent gestionează session refresh.
// Adaugă o verificare că /dashboard/settings/admin e restricționat:
// (de fapt, settings page verifică rolul prin server component, deci e suficient)
// Middleware-ul curent e ok — nicio schimbare necesară.
```

Protecția se face la nivel de server component și server actions — mai sigur decât middleware pentru că nu poate fi bypass-ată.

---

## Deliverable 7: Error handling pentru viewer care încearcă acțiuni admin

Adaugă `src/app/dashboard/layout.tsx` un handler pentru `?error=unauthorized`:

```tsx
// În layout.tsx, citește searchParams
// Dacă există ?error=unauthorized, afișează un toast/banner:
// "Această acțiune este disponibilă doar pentru administrator."
```

Sau, mai simplu, în `DashboardShell.tsx` (client component):

```tsx
// useSearchParams() → dacă 'error=unauthorized', toast cu mesajul
```

---

## Verification checklist

1. `pnpm build` succeeds, zero TypeScript errors
2. `pnpm lint` passes
3. **DB migration:** apply `0006_roles_and_invitations.sql`. Tabelele `user_profiles` și `invitations` există.
4. **Backfill:** cel puțin un rând în `user_profiles` pentru userul existent (tu = admin).
```sql
   SELECT * FROM user_profiles;
   -- Trebuie să ai: user_id=<tău>, role='admin'
```
5. **Admin vede totul:** loghează-te cu contul tău admin. Toate butoanele (sync, connect, disconnect, generează analize) sunt vizibile și funcționale.
6. **Indicator rol în sidebar:** sub email apare "● ADMIN" în lime.
7. **Invite flow:** în `/dashboard/settings`, secțiunea "UTILIZATORI · MANAGEMENT" e vizibilă. Introduce un email test și click "Trimite invitație" — primești un URL.
8. **Invite URL valid:** accesează URL-ul de invitație într-un browser incognito. Apare pagina "AI FOST INVITAT." cu formularul de signup.
9. **Signup via invite:** completează parola, submit. Contul se creează, ești redirecționat la `/dashboard`.
10. **Noul user = viewer:** loghează-te cu noul cont. Sidebar arată "○ VIEWER".
11. **Viewer NU vede butonul de Connect:** pe `/dashboard/accounts`, secțiunea "CONECTEAZĂ UN CONT" nu apare.
12. **Viewer NU vede butoanele Sync și Disconnect:** pe lista de conturi conectate, butoanele lipsesc. Apare "VIZUALIZARE" în loc.
13. **Viewer NU vede butoanele de generare analize:** pe `/dashboard/analyses`, butoanele "Generează" lipsesc. Analizele existente sunt vizibile.
14. **Viewer POATE accesa chat:** `/dashboard/chat` funcționează complet pentru viewer.
15. **Viewer POATE vedea dashboard, posts, post detail:** toate paginile read-only funcționează.
16. **Server action protection:** încearcă manual să apelezi `syncAccountAction` cu un user viewer (poți testa din DevTools sau Postman) — trebuie să returneze `{ success: false, error: 'forbidden' }`.
17. **Invite expirat:** modifică `expires_at` în DB la o dată trecută → accesând URL-ul de invitație apare mesajul "Invitația a expirat."
18. **Invite deja folosit:** după accept, accesând același URL apare "Această invitație a fost deja folosită."
19. **Admin poate elimina viewer:** în settings, butonul "ELIMINĂ" lângă un viewer funcționează. Userul nu mai poate accesa `/dashboard` după eliminare.
20. **Primul user nou = admin:** dacă ștergi toți userii și te înregistrezi din nou, primul user devine admin automat.

## Notes pentru Claude Code

- **Trigger `handle_new_user`** e critical — fără el, userii noi nu primesc profil și nu pot accesa app-ul. Verifică că există în migrare și că se aplică corect.
- **Service role pentru accept invite:** crearea de useri prin `auth.admin.createUser()` necesită service role key. Asigură-te că `SUPABASE_SERVICE_ROLE_KEY` e în `.env.local`.
- **`getCurrentUserRole()` e apelat în multe server components** — poate deveni un bottleneck dacă nu e cached. Next.js caches fetch requests în același request, dar funcțiile custom nu. Dacă pagina apare lentă, adaugă React `cache()` wrapper: `const getCachedUserRole = cache(getCurrentUserRole)`.
- **Viewer care accesează direct URL-ul unui server action** (printr-un form sau fetch din afara UI-ului) va primi `forbidden` — protecția e server-side, nu doar UI.
- **Invite URL e plain UUID token** — e criptic suficient pentru POC. Nu expune email-ul în URL.
- **Secțiunea de management useri din Settings** e vizibilă DOAR pentru admin. Viewer-ul vede settings-ul normal (email, theme info, fork config) dar fără secțiunea de invite.
- Rolul adminului NU poate fi schimbat de alt admin prin UI (nu implementăm asta). Dacă vrei să promovezi un viewer la admin, se face direct în Supabase Dashboard → Table Editor → `user_profiles`.
- **`removeViewerAction`** nu șterge userul din `auth.users` — îi șterge doar profilul, deci nu mai poate accesa app-ul dar contul Supabase Auth există în continuare. Pentru ștergere completă, ar trebui `serviceSupabase.auth.admin.deleteUser(userId)` — de implementat dacă e necesar.