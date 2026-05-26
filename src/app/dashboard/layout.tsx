import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  console.log('[dashboard layout] user:', user?.id, 'error:', error?.message);

  if (!user) {
    console.log('[dashboard layout] redirecting to /login because no user');
    redirect('/login');
  }

  return (
    <AppShell userEmail={user.email ?? ''} pageTitle="Dashboard">
      {children}
    </AppShell>
  );
}
