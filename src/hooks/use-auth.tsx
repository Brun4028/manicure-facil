import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};
const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const userIdRef = useRef<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const aplicarSessao = (s: Session | null) => {
      const userId = s?.user?.id ?? null;
      if (userIdRef.current && userId !== userIdRef.current) qc.clear();
      userIdRef.current = userId;
      setSession(s);
      setLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => aplicarSessao(s));
    supabase.auth.getSession().then(({ data }) => aplicarSessao(data.session));
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
          qc.clear();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
