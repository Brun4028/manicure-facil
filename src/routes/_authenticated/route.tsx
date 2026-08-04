import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { getContaDe, contaTemAcesso } from "@/lib/access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // ── Controle de acesso: a conta deve estar ATIVA ─────────────────────
    // Mesmo com sessão válida, conta bloqueada/inativa/suspensa/expirada é
    // desconectada e redirecionada. (Defesa extra: o banco também bloqueia
    // via RLS verificar_acesso e as server functions via middleware.)
    const conta = await getContaDe(data.user.id);
    if (!contaTemAcesso(conta)) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }

    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
