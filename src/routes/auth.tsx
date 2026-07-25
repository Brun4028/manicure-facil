import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Sparkles, Mail } from "lucide-react";
import logoIconWhite from "@/assets/logo-icon-white.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Entrar — Manicure Fácil" }] }),
  component: AuthPage,
});

const loginSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});
const signupSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome").max(80),
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "As senhas não conferem", path: ["confirm"] });

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach(i => { const field = i.path[0] as string; errs[field] = i.message; });
      setLoginErrors(errs);
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoginErrors({});
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bem-vinda de volta!");
    navigate({ to: "/dashboard" });
  }

  async function handleGoogle() {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) { toast.error("Não foi possível entrar com Google"); return; }
    if (res.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 bg-[#0F0F14]">
      {/* Fundo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-48 -right-48 w-[600px] h-[600px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(217,70,239,0.06),transparent)] blur-3xl" />
        <div className="absolute -bottom-48 -left-48 w-[500px] h-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.04),transparent)] blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="size-11 rounded-xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] grid place-items-center shadow-[0_4px_24px_rgba(217,70,239,0.15)]">
            <img src={logoIconWhite} alt="Manicure Fácil Logo" className="size-5 object-contain" />
          </div>
          <span className="text-2xl font-semibold text-white">Manicure Fácil</span>
        </Link>

        <div className="bg-[#171923]/80 backdrop-blur-2xl rounded-3xl p-8 shadow-[0_8px_40px_rgba(0,0,0,0.3)] border border-[#252836]">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-white">Entrar na sua conta</h1>
            <p className="text-sm text-[#A1A1AA] mt-2">Acesse sua agenda em segundos</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5" aria-label="Formulário de login">
            <div className="space-y-1.5">
              <Label htmlFor="login-email" className="text-sm font-medium text-[#A1A1AA]">Email</Label>
              <Input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setLoginErrors(e => { delete e.email; return {...e}; }); }} required className={`h-11 rounded-xl bg-[#1F2128] border-[#252836] text-white focus:border-[#D946EF] focus:ring-2 focus:ring-[#D946EF]/20 transition-all ${loginErrors.email ? "ring-2 ring-destructive" : ""}`} aria-invalid={!!loginErrors.email} aria-describedby={loginErrors.email ? "error-login-email" : undefined} />
              {loginErrors.email && <span id="error-login-email" className="sr-only" role="alert">{loginErrors.email}</span>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-sm font-medium text-[#A1A1AA]">Senha</Label>
              <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setLoginErrors(e => { delete e.password; return {...e}; }); }} required className={`h-11 rounded-xl bg-[#1F2128] border-[#252836] text-white focus:border-[#D946EF] focus:ring-2 focus:ring-[#D946EF]/20 transition-all ${loginErrors.password ? "ring-2 ring-destructive" : ""}`} aria-invalid={!!loginErrors.password} aria-describedby={loginErrors.password ? "error-login-password" : undefined} />
              {loginErrors.password && <span id="error-login-password" className="sr-only" role="alert">{loginErrors.password}</span>}
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white shadow-[0_4px_24px_rgba(217,70,239,0.15)] hover:shadow-[0_8px_32px_rgba(217,70,239,0.25)] transition-all text-base">
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            
            {/* Link para recuperação de senha */}
            <div className="text-center">
              <ForgotPasswordDialog />
            </div>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-[#A1A1AA]">
            <div className="h-px flex-1 bg-[#252836]" />
            <span className="font-medium">ou</span>
            <div className="h-px flex-1 bg-[#252836]" />
          </div>

          <Button variant="outline" className="w-full h-11 rounded-xl border-[#252836] bg-[#1F2128] text-white hover:bg-[#D946EF]/10 hover:border-[#D946EF]/30 transition-all" onClick={handleGoogle}>
            <GoogleIcon /> Continuar com Google
          </Button>

          <p className="text-sm text-center mt-8 text-[#A1A1AA]">
            Ainda não tem conta?{" "}
            <SignupDialog onDone={() => navigate({ to: "/dashboard" })} />
          </p>
        </div>

        {/* Decorative bottom text */}
        <p className="text-[10px] text-center text-[#A1A1AA]/50 mt-8">
          SaaS Premium para Manicures & Salões de Beleza
        </p>
      </div>
    </div>
  );
}

function SignupDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", password: "", confirm: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { nome: parsed.data.nome },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (!data.session) {
      // Auto sign-in if confirmation disabled, else inform
      const { error: e2 } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
      if (e2) { toast.success("Confira seu email para confirmar a conta."); setOpen(false); return; }
    }
    toast.success("Conta criada! Bem-vinda 💖");
    setOpen(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>          <DialogTrigger asChild>
            <button className="text-primary font-medium underline-offset-4 hover:underline" aria-label="Criar nova conta">Criar conta</button>
          </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="font-display text-2xl">Criar sua conta</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4" aria-label="Formulário de cadastro">
          <div><Label htmlFor="signup-nome">Nome</Label><Input id="signup-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></div>
          <div><Label htmlFor="signup-email">Email</Label><Input id="signup-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          <div><Label htmlFor="signup-senha">Senha</Label><Input id="signup-senha" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
          <div><Label htmlFor="signup-confirm">Confirmar senha</Label><Input id="signup-confirm" type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required /></div>
          <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground shadow-glow" aria-label={loading ? "Criando conta" : "Criar conta"}>
            {loading ? "Criando..." : "Criar conta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───── Diálogo de Recuperação de Senha ───── */
function ForgotPasswordDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z.string().email("Email inválido").safeParse(email);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/auth?reset=true`,
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSent(true);
    toast.success("Enviamos um link de recuperação para seu email.");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSent(false); setEmail(""); } }}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-xs text-[#A1A1AA] hover:text-[#D946EF] transition-colors underline-offset-2 hover:underline mt-2"
        >
          Esqueceu sua senha?
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="size-10 rounded-xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] grid place-items-center shadow-[0_4px_24px_rgba(217,70,239,0.15)]">
              <Mail className="size-5 text-white" />
            </div>
            <div>
              <DialogTitle className="font-display text-xl">
                {sent ? "Email enviado!" : "Recuperar senha"}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        {sent ? (
          <div className="space-y-4 py-4 text-center">
            <div className="size-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 grid place-items-center mx-auto">
              <Mail className="size-6 text-emerald-500" />
            </div>
            <p className="text-sm text-muted-foreground">
              Verifique sua caixa de entrada e clique no link para redefinir sua senha.
            </p>
            <p className="text-xs text-muted-foreground">
              Não recebeu? Verifique a pasta de spam ou{" "}
              <button
                type="button"
                onClick={() => { setSent(false); }}
                className="text-primary underline-offset-2 hover:underline"
              >
                tente novamente
              </button>
              .
            </p>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="rounded-xl"
            >
              Fechar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Digite seu email cadastrado e enviaremos um link para redefinir sua senha.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reset-email" className="text-sm font-medium">
                Seu email
              </Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="h-11 rounded-xl"
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading || !email.trim()}
                className="rounded-xl bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white shadow-[0_4px_24px_rgba(217,70,239,0.15)]"
              >
                {loading ? "Enviando..." : "Enviar link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4 mr-2" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.2 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2c-2 1.5-4.5 2.4-7.3 2.4-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.3 5.2C40.9 35.7 44 30.3 44 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
  );
}
