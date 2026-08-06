import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";

import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import logoIconWhite from "@/assets/logo-icon-white.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getContaDe, contaTemAcesso, statusMensagem, type MinhaConta } from "@/lib/access";
import { mensagemErroAuth } from "@/lib/auth-errors";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    // Se já houver sessão com acesso ativo, vai direto para o painel.
    // Sessão com conta sem acesso (bloqueada/inativa) permanece nesta página.
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const conta = await getContaDe(data.session.user.id);
      if (contaTemAcesso(conta)) throw redirect({ to: "/dashboard" });
    }
  },
  component: AuthPage,
});

const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

const signupSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe seu nome").max(80),
    email: z.string().trim().email("E-mail inválido").max(255),
    password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres").max(72),
    confirmPassword: z.string().min(6, "Confirme sua senha").max(72),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem",
  });

type AuthView = "login" | "signup" | "success";

function AuthPage() {
  usePageTitle("Entrar — Manicure Fácil");

  const navigate = useNavigate();
  const [view, setView] = useState<AuthView>("login");

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});
  const [googleLoading, setGoogleLoading] = useState(false);

  // Cadastro
  const [nome, setNome] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupErrors, setSignupErrors] = useState<Record<string, string>>({});
  const [createdEmail, setCreatedEmail] = useState("");
  const [needsConfirmation, setNeedsConfirmation] = useState(true);

  // Conta logada porém sem acesso (bloqueada/inativa) → tela própria
  const [blockedConta, setBlockedConta] = useState<MinhaConta | null>(null);
  const [checkingBlocked, setCheckingBlocked] = useState(true);

  // Fluxo de convite (link do e-mail com token_hash)
  const [pendingInvite, setPendingInvite] = useState<{ email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    (async () => {
      // 1) Trata link de convite (token_hash) antes de qualquer coisa
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");

      if (tokenHash && type) {
        const { data: otp, error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type as "signup" | "invite" | "recovery") ?? "invite",
        });
        if (otpErr) {
          toast.error("Link inválido ou expirado. Solicite um novo convite.");
        } else if (otp.user?.email) {
          setPendingInvite({ email: otp.user.email });
          // Limpa o token da URL
          window.history.replaceState({}, "", "/auth");
        }
      }

      // 2) Sessão existente com conta sem acesso → mostra o estado bloqueado
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const conta = await getContaDe(data.session.user.id);
        if (!contaTemAcesso(conta)) {
          setBlockedConta(conta);
        }
      }
      setCheckingBlocked(false);
    })();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const field = i.path[0] as string;
        errs[field] = i.message;
      });
      setLoginErrors(errs);
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoginErrors({});
    setLoading(true);
    const { data: loginData, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      setLoading(false);
      toast.error(mensagemErroAuth(error.message));
      return;
    }

    // ── Validação de status da conta APÓS o login ────────────────────────
    const conta = await getContaDe(loginData.user.id);
    if (!contaTemAcesso(conta)) {
      await supabase.auth.signOut();
      setBlockedConta(conta);
      setLoading(false);
      toast.error(statusMensagem(conta?.status, conta?.motivo_bloqueio));
      return;
    }

    setLoading(false);
    toast.success("Bem-vinda de volta!");
    navigate({ to: "/dashboard" });
  }

  async function handleGoogle() {
    if (googleLoading) return;
    setGoogleLoading(true);
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (res.error) {
      setGoogleLoading(false);
      toast.error("Não foi possível entrar com Google");
      return;
    }
    if (res.redirected) return;

    // Sessão definida — verifica se a conta tem acesso liberado
    const { data: s } = await supabase.auth.getSession();
    if (s.session) {
      const conta = await getContaDe(s.session.user.id);
      if (!contaTemAcesso(conta)) {
        await supabase.auth.signOut();
        setBlockedConta(conta);
        setGoogleLoading(false);
        toast.error(statusMensagem(conta?.status, conta?.motivo_bloqueio));
        return;
      }
    }
    setGoogleLoading(false);
    navigate({ to: "/dashboard" });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signupSchema.safeParse({ nome, email, password, confirmPassword });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        errs[String(i.path[0])] = i.message;
      });
      setSignupErrors(errs);
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSignupErrors({});
    setSignupLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { nome: parsed.data.nome },
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    });
    setSignupLoading(false);

    if (error) {
      toast.error(mensagemErroAuth(error.message));
      return;
    }

    // A conta é criada como "inativa" pelo trigger handle_new_user e a
    // liberação acontece nos bastidores (admin). Se houver confirmação de
    // e-mail, o usuário ainda precisa confirmar antes de entrar.
    setCreatedEmail(parsed.data.email);
    setNeedsConfirmation(!data.session);
    setView("success");
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("A senha precisa de no mínimo 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não conferem");
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast.error(mensagemErroAuth(error.message));
      return;
    }
    setPendingInvite(null);
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Senha definida! Faça login para continuar.");
  }

  function goToLogin() {
    setView("login");
    setSignupErrors({});
    setPassword("");
    setConfirmPassword("");
  }

  function goToSignup() {
    setView("signup");
    setLoginErrors({});
    setPassword("");
    setConfirmPassword("");
  }

  function clearLoginError(field: string) {
    setLoginErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function clearSignupError(field: string) {
    setSignupErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0F0F14] px-4">
      {/* ── Fundo decorativo premium ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 -right-40 h-[620px] w-[620px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(217,70,239,0.09),transparent)] blur-3xl animate-pulse-soft" />
        <div className="absolute -bottom-56 -left-40 h-[560px] w-[560px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.07),transparent)] blur-3xl" />
        <div className="absolute top-1/3 left-1/4 h-[300px] w-[300px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(236,72,153,0.05),transparent)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:56px_56px]" />
        <div className="absolute top-[22%] right-[16%] size-1.5 rounded-full bg-[#D946EF]/50 animate-pulse-soft" />
        <div
          className="absolute top-[62%] left-[10%] size-2 rounded-full bg-[#A855F7]/40 animate-pulse-soft"
          style={{ animationDelay: "0.8s" }}
        />
        <div
          className="absolute bottom-[20%] right-[26%] size-1 rounded-full bg-white/20 animate-pulse-soft"
          style={{ animationDelay: "1.4s" }}
        />
        <div
          className="absolute top-[38%] left-[68%] size-1.5 rounded-full bg-white/10 animate-pulse-soft"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* ── Logo ── */}
        <div className="mb-8 flex flex-col items-center animate-fade-up">
          <Link to="/" className="group relative" aria-label="Manicure Fácil — página inicial">
            <div className="relative grid size-14 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] shadow-[0_8px_32px_rgba(217,70,239,0.35)] ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-105">
              <div className="absolute -top-6 -right-6 size-12 rounded-full bg-white/20 blur-lg" />
              <img
                src={logoIconWhite}
                alt="Manicure Fácil Logo"
                className="relative size-7 object-contain"
              />
            </div>
          </Link>
          <Link to="/" className="mt-4 text-2xl font-semibold tracking-tight text-white">
            Manicure <span className="text-gradient">Fácil</span>
          </Link>
          <p className="mt-1.5 text-sm text-[#A1A1AA]">Beleza inteligente para o seu salão</p>
        </div>

        {/* ── Tela: conta sem acesso (bloqueada/inativa/suspensa) ── */}
        {!checkingBlocked && blockedConta && !pendingInvite && (
          <div className="animate-fade-up">
            <AuthCard>
              <div className="py-2 text-center">
                <div className="relative mx-auto mb-6 size-16">
                  <div className="absolute inset-0 rounded-full bg-rose-500/20 blur-xl" />
                  <div className="relative grid size-16 place-items-center rounded-full border border-rose-500/25 bg-rose-500/10">
                    <ShieldAlert className="size-8 text-rose-400" />
                  </div>
                </div>
                <h1 className="text-2xl font-semibold text-white">Acesso não liberado</h1>
                <p className="mt-3 text-sm leading-relaxed text-[#A1A1AA]">
                  {statusMensagem(blockedConta?.status, blockedConta?.motivo_bloqueio)}
                </p>
                <Button
                  className="mt-8 h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.06] text-white transition-all duration-300 hover:bg-white/[0.1] active:scale-[0.98]"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setBlockedConta(null);
                    setView("login");
                  }}
                >
                  Entrar com outra conta
                </Button>
              </div>
            </AuthCard>
          </div>
        )}

        {/* ── Tela: definir senha após convite ── */}
        {pendingInvite && (
          <div className="animate-fade-up">
            <AuthCard>
              <div className="mb-8 text-center">
                <div className="relative mx-auto mb-5 size-14">
                  <div className="absolute inset-0 rounded-2xl bg-[#D946EF]/30 blur-xl" />
                  <div className="relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] shadow-[0_8px_30px_rgba(217,70,239,0.35)] ring-1 ring-white/20">
                    <KeyRound className="size-6 text-white" />
                  </div>
                </div>
                <h1 className="text-2xl font-semibold text-white">Crie sua senha</h1>
                <p className="mt-2 text-sm text-[#A1A1AA]">
                  Conta: <span className="font-medium text-white">{pendingInvite.email}</span>
                </p>
              </div>
              <form
                onSubmit={handleSetPassword}
                className="space-y-5"
                aria-label="Formulário de definição de senha"
              >
                <PasswordField
                  id="new-password"
                  label="Nova senha"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  helper="Mínimo de 6 caracteres"
                />
                <PasswordField
                  id="confirm-password"
                  label="Confirmar senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <GradientButton type="submit" loading={savingPassword} loadingLabel="Salvando...">
                  Definir senha e continuar
                </GradientButton>
              </form>
            </AuthCard>
          </div>
        )}

        {/* ── Tela: login padrão / cadastro / sucesso ── */}
        {!checkingBlocked && !blockedConta && !pendingInvite && (
          <div key={view} className="animate-fade-up">
            {view === "login" && (
              <AuthCard>
                <div className="mb-8 text-center">
                  <Pill>
                    <Sparkles className="size-3 text-[#D946EF]" /> Área profissional
                  </Pill>
                  <h1 className="text-[26px] font-semibold text-white">Bem-vinda de volta</h1>
                  <p className="mt-2 text-sm text-[#A1A1AA]">Acesse sua agenda em segundos</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5" aria-label="Formulário de login">
                  <TextField
                    id="login-email"
                    label="E-mail"
                    icon={Mail}
                    type="email"
                    autoComplete="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearLoginError("email");
                    }}
                    error={loginErrors.email}
                    required
                  />
                  <PasswordField
                    id="login-password"
                    label="Senha"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearLoginError("password");
                    }}
                    error={loginErrors.password}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                  />

                  <GradientButton
                    type="submit"
                    loading={loading}
                    loadingLabel="Entrando..."
                    className="mt-1"
                  >
                    Entrar
                    <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </GradientButton>

                  {/* Criar conta */}
                  <button
                    type="button"
                    onClick={goToSignup}
                    className="group relative h-12 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] text-[15px] font-semibold text-white/85 transition-all duration-300 hover:border-[#D946EF]/40 hover:bg-[#D946EF]/[0.07] hover:text-white active:scale-[0.98]"
                  >
                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#D946EF]/[0.08] via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                    <span className="relative flex items-center justify-center gap-2">
                      <UserPlus
                        className="size-4 text-[#A855F7] transition-all duration-300 group-hover:scale-110 group-hover:text-[#D946EF]"
                        strokeWidth={2}
                      />
                      Criar conta
                    </span>
                  </button>
                </form>

                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="text-[11px] font-medium tracking-wider text-[#52525B] uppercase">
                    ou continue com
                  </span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>

                <Button
                  variant="outline"
                  onClick={handleGoogle}
                  disabled={googleLoading || loading}
                  className="h-12 w-full rounded-xl border-white/[0.08] bg-white/[0.02] text-[15px] font-medium text-white transition-all duration-300 hover:border-white/[0.16] hover:bg-white/[0.06] active:scale-[0.98]"
                >
                  {googleLoading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
                  Continuar com Google
                </Button>

                <div className="mt-6 text-center">
                  <ForgotPasswordDialog />
                </div>
              </AuthCard>
            )}

            {view === "signup" && (
              <AuthCard>
                <div className="mb-7 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={goToLogin}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#A1A1AA] transition-colors duration-200 hover:text-white"
                  >
                    <ArrowLeft className="size-4" /> Voltar
                  </button>
                  <span className="text-[11px] font-medium tracking-wider text-[#52525B] uppercase">
                    Novo cadastro
                  </span>
                </div>

                <div className="mb-8 text-center">
                  <Pill>
                    <Sparkles className="size-3 text-[#D946EF]" /> Cadastro rápido
                  </Pill>
                  <h1 className="text-[26px] font-semibold text-white">Crie sua conta</h1>
                  <p className="mt-2 text-sm text-[#A1A1AA]">
                    Comece a organizar sua agenda em minutos
                  </p>
                </div>

                <form
                  onSubmit={handleSignup}
                  className="space-y-5"
                  aria-label="Formulário de cadastro"
                >
                  <TextField
                    id="signup-nome"
                    label="Nome"
                    icon={User}
                    autoComplete="name"
                    placeholder="Seu nome completo"
                    value={nome}
                    onChange={(e) => {
                      setNome(e.target.value);
                      clearSignupError("nome");
                    }}
                    error={signupErrors.nome}
                    required
                  />
                  <TextField
                    id="signup-email"
                    label="E-mail"
                    icon={Mail}
                    type="email"
                    autoComplete="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearSignupError("email");
                    }}
                    error={signupErrors.email}
                    required
                  />
                  <CampoSenhaForte
                    id="signup-password"
                    label="Senha"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearSignupError("password");
                    }}
                    error={signupErrors.password}
                    autoComplete="new-password"
                    placeholder="Digite sua senha"
                    required
                    onGenerate={(senha) => {
                      setPassword(senha);
                      setConfirmPassword(senha);
                      clearSignupError("password");
                      clearSignupError("confirmPassword");
                      toast.success("Senha forte gerada! Você pode editá-la se quiser.");
                    }}
                  />
                  <PasswordField
                    id="signup-confirm"
                    label="Confirmar senha"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      clearSignupError("confirmPassword");
                    }}
                    error={signupErrors.confirmPassword}
                    autoComplete="new-password"
                    placeholder="Repita sua senha"
                    required
                  />

                  <GradientButton
                    type="submit"
                    loading={signupLoading}
                    loadingLabel="Criando conta..."
                    className="mt-1"
                  >
                    <UserPlus className="size-4" /> Criar minha conta
                  </GradientButton>

                  <p className="text-center text-[11px] leading-relaxed text-[#52525B]">
                    Ao continuar, você concorda com nossos{" "}
                    <span className="font-medium text-[#A1A1AA]">Termos de Uso</span> e{" "}
                    <span className="font-medium text-[#A1A1AA]">Política de Privacidade</span>.
                  </p>
                </form>
              </AuthCard>
            )}

            {view === "success" && (
              <AuthCard>
                <div className="py-4 text-center">
                  <div className="relative mx-auto mb-6 size-16">
                    <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse-soft" />
                    <div className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_8px_30px_rgba(34,197,94,0.35)] ring-1 ring-white/20">
                      <CheckCircle2 className="size-8 text-white" />
                    </div>
                  </div>
                  <h1 className="text-2xl font-semibold text-white">Conta criada!</h1>
                  <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-[#A1A1AA]">
                    {needsConfirmation ? (
                      <>
                        Enviamos um link de confirmação para{" "}
                        <span className="font-medium text-white">{createdEmail}</span>. Confirme seu
                        e-mail para ativar sua conta.
                      </>
                    ) : (
                      "Seu cadastro foi concluído! Estamos liberando seu acesso."
                    )}
                  </p>
                  <div className="mt-6 rounded-xl border border-[#D946EF]/15 bg-[#D946EF]/[0.06] p-3.5 text-left">
                    <div className="flex items-start gap-2.5">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#D946EF]" />
                      <p className="text-[13px] leading-relaxed text-[#A1A1AA]">
                        Assim que seu acesso for liberado, você poderá entrar normalmente com seu
                        e-mail e senha.
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={goToLogin}
                    className="mt-7 h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.06] text-white transition-all duration-300 hover:bg-white/[0.1] active:scale-[0.98]"
                  >
                    Voltar para o login
                  </Button>
                </div>
              </AuthCard>
            )}
          </div>
        )}

        {/* ── Indicadores de confiança ── */}
        <div className="mt-8 flex items-center justify-center gap-3 text-[11px] font-medium text-[#71717A]">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-[#A855F7]" /> Seus dados protegidos
          </span>
          <span className="size-1 rounded-full bg-[#3F3F46]" />
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5 text-[#A855F7]" /> Conexão segura
          </span>
        </div>

        <p className="mt-6 text-center text-[10px] tracking-wide text-[#52525B]">
          SaaS Premium para Manicures & Salões de Beleza
        </p>
      </div>
    </div>
  );
}

/* ───── Cartão padrão com vidro premium ───── */
function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-[#14151D]/85 shadow-[0_24px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D946EF]/70 to-transparent" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[130%] -translate-x-1/2 rounded-full bg-[#D946EF]/[0.07] blur-3xl" />
      <div className="relative p-7 sm:p-8">{children}</div>
    </div>
  );
}

/* ───── Selo/badge pequeno do topo dos cards ───── */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-[11px] font-medium tracking-wide text-[#A1A1AA]">
      {children}
    </span>
  );
}

/* ───── Botão primário com gradiente e brilho ───── */
function GradientButton({
  children,
  loading,
  loadingLabel,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { loading?: boolean; loadingLabel?: string }) {
  return (
    <Button
      {...props}
      className={cn(
        "group relative h-12 w-full overflow-hidden rounded-xl bg-gradient-to-r from-[#D946EF] via-[#C026D3] to-[#A855F7] text-[15px] font-semibold text-white shadow-[0_8px_30px_rgba(217,70,239,0.25)] transition-all duration-300 hover:shadow-[0_12px_44px_rgba(217,70,239,0.42)] hover:brightness-110 active:scale-[0.98] disabled:opacity-70",
        className,
      )}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative flex items-center justify-center gap-2">
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        {loading ? (loadingLabel ?? "Processando...") : children}
      </span>
    </Button>
  );
}

/* ───── Campo de texto com ícone ───── */
interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  icon: LucideIcon;
  error?: string;
  helper?: string;
}

function TextField({ id, label, icon: Icon, error, helper, className, ...props }: TextFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[13px] font-medium text-[#D4D4D8]">
        {label}
      </Label>
      <div className="group relative">
        <Icon
          className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#71717A] transition-colors duration-300 group-focus-within:text-[#D946EF]"
          strokeWidth={1.75}
        />
        <Input
          id={id}
          className={cn(
            "h-12 w-full rounded-xl border-white/[0.06] bg-[#1E2028]/80 pl-11 pr-4 text-[15px] text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] placeholder:text-[#52525B]",
            "transition-all duration-300 focus:border-[#D946EF]/60 focus:bg-[#1E2028] focus-visible:ring-2 focus-visible:ring-[#D946EF]/20",
            error && "border-rose-500/40 focus:border-rose-500/50 focus-visible:ring-rose-500/20",
            className,
          )}
          {...props}
        />
      </div>
      {error ? (
        <p className="pl-1 text-xs text-rose-400">{error}</p>
      ) : helper ? (
        <p className="pl-1 text-xs text-[#52525B]">{helper}</p>
      ) : null}
    </div>
  );
}

/* ───── Campo de senha com alternar visibilidade ───── */
interface PasswordFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  id: string;
  label: string;
  error?: string;
  helper?: string;
}

function PasswordField({ id, label, error, helper, className, ...props }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[13px] font-medium text-[#D4D4D8]">
        {label}
      </Label>
      <div className="group relative">
        <Lock
          className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#71717A] transition-colors duration-300 group-focus-within:text-[#D946EF]"
          strokeWidth={1.75}
        />
        <Input
          id={id}
          type={show ? "text" : "password"}
          className={cn(
            "h-12 w-full rounded-xl border-white/[0.06] bg-[#1E2028]/80 pl-11 pr-12 text-[15px] text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] placeholder:text-[#52525B]",
            "transition-all duration-300 focus:border-[#D946EF]/60 focus:bg-[#1E2028] focus-visible:ring-2 focus-visible:ring-[#D946EF]/20",
            error && "border-rose-500/40 focus:border-rose-500/50 focus-visible:ring-rose-500/20",
            className,
          )}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-[#71717A] transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
        >
          {show ? (
            <EyeOff className="size-[18px]" strokeWidth={1.75} />
          ) : (
            <Eye className="size-[18px]" strokeWidth={1.75} />
          )}
        </button>
      </div>
      {error ? (
        <p className="pl-1 text-xs text-rose-400">{error}</p>
      ) : helper ? (
        <p className="pl-1 text-xs text-[#52525B]">{helper}</p>
      ) : null}
    </div>
  );
}

/* ───── Gerador de senha forte ───── */
const MAIUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnopqrstuvwxyz";
const NUMEROS = "23456789";
const ESPECIAIS = "!@#$%&*+-_=?.";

function charAleatorio(conjunto: string): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return conjunto[arr[0] % conjunto.length];
}

function embaralhar(lista: string[]): string[] {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

function gerarSenhaForte(): string {
  const TODOS = MAIUSCULAS + MINUSCULAS + NUMEROS + ESPECIAIS;
  const carac = [
    charAleatorio(MAIUSCULAS),
    charAleatorio(MINUSCULAS),
    charAleatorio(NUMEROS),
    charAleatorio(ESPECIAIS),
  ];
  const restantes = new Uint32Array(12);
  crypto.getRandomValues(restantes);
  for (const n of restantes) carac.push(TODOS[n % TODOS.length]);
  return embaralhar(carac).join("");
}

/* ───── Análise de força da senha ───── */
const REQUISITOS_SENHA: Array<{ label: string; teste: (pw: string) => boolean }> = [
  { label: "Pelo menos 8 caracteres", teste: (pw) => pw.length >= 8 },
  { label: "Uma letra maiúscula", teste: (pw) => /[A-Z]/.test(pw) },
  { label: "Uma letra minúscula", teste: (pw) => /[a-z]/.test(pw) },
  { label: "Um número", teste: (pw) => /\d/.test(pw) },
  { label: "Um caractere especial", teste: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

const NIVEIS_FORCA: Array<{ min: number; label: string; cor: string }> = [
  { min: 5, label: "Muito forte", cor: "#2DD4BF" },
  { min: 4, label: "Forte", cor: "#34D399" },
  { min: 3, label: "Boa", cor: "#FBBF24" },
  { min: 2, label: "Fraca", cor: "#FB923C" },
  { min: 0, label: "Muito fraca", cor: "#F87171" },
];

function analisarForcaSenha(pw: string) {
  const score = REQUISITOS_SENHA.reduce((acc, r) => acc + (r.teste(pw) ? 1 : 0), 0);
  const nivel = NIVEIS_FORCA.find((n) => score >= n.min) ?? NIVEIS_FORCA[NIVEIS_FORCA.length - 1];
  return { score, label: nivel.label, cor: nivel.cor };
}

/* ───── Campo de senha do cadastro: gerador + força + requisitos ───── */
interface CampoSenhaForteProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  id: string;
  label: string;
  error?: string;
  onGenerate: (senha: string) => void;
}

function CampoSenhaForte({
  id,
  label,
  error,
  value,
  onGenerate,
  className,
  ...props
}: CampoSenhaForteProps) {
  const [show, setShow] = useState(false);
  const senha = typeof value === "string" ? value : "";
  const forca = analisarForcaSenha(senha);
  const digitou = senha.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-[13px] font-medium text-[#D4D4D8]">
          {label}
        </Label>
        <button
          type="button"
          onClick={() => onGenerate(gerarSenhaForte())}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg px-1 py-0.5 text-[11px] font-semibold text-[#A855F7] transition-colors duration-200 hover:text-[#D946EF]"
        >
          <Wand2 className="size-3.5 transition-transform duration-300 group-hover:rotate-12" />
          Gerar senha forte
        </button>
      </div>

      <div className="group relative">
        <Lock
          className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#71717A] transition-colors duration-300 group-focus-within:text-[#D946EF]"
          strokeWidth={1.75}
        />
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          className={cn(
            "h-12 w-full rounded-xl border-white/[0.06] bg-[#1E2028]/80 pl-11 pr-12 text-[15px] text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] placeholder:text-[#52525B]",
            "transition-all duration-300 focus:border-[#D946EF]/60 focus:bg-[#1E2028] focus-visible:ring-2 focus-visible:ring-[#D946EF]/20",
            error && "border-rose-500/40 focus:border-rose-500/50 focus-visible:ring-rose-500/20",
            className,
          )}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-[#71717A] transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
        >
          {show ? (
            <EyeOff className="size-[18px]" strokeWidth={1.75} />
          ) : (
            <Eye className="size-[18px]" strokeWidth={1.75} />
          )}
        </button>
      </div>

      {error ? <p className="pl-1 text-xs text-rose-400">{error}</p> : null}

      {digitou && (
        <div className="space-y-3 pt-1 animate-fade-up">
          {/* Indicador de força */}
          <div className="flex items-center gap-3">
            <div className="flex flex-1 gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: i < forca.score ? "100%" : "0%",
                      backgroundColor: forca.cor,
                      boxShadow: i < forca.score ? `0 0 8px ${forca.cor}55` : "none",
                    }}
                  />
                </div>
              ))}
            </div>
            <span
              className="w-[74px] text-right text-[11px] font-semibold tracking-wide transition-colors duration-300"
              style={{ color: forca.cor }}
            >
              {forca.label}
            </span>
          </div>

          {/* Requisitos atendidos */}
          <ul className="space-y-1.5">
            {REQUISITOS_SENHA.map((r) => {
              const ok = r.teste(senha);
              return (
                <li key={r.label} className="flex items-center gap-2 text-xs">
                  <span
                    key={String(ok)}
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-300",
                      ok
                        ? "border-[#34D399] bg-[#34D399]/10"
                        : "border-white/[0.08] bg-white/[0.02]",
                    )}
                  >
                    {ok ? (
                      <Check
                        className="size-2.5 text-[#34D399] animate-in zoom-in duration-300"
                        strokeWidth={3}
                      />
                    ) : (
                      <span className="size-1 rounded-full bg-[#3F3F46]" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "transition-colors duration-300",
                      ok ? "font-medium text-[#A1A1AA]" : "text-[#52525B]",
                    )}
                  >
                    {r.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
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
    const parsed = z.string().email("E-mail inválido").safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/auth?reset=true`,
    });
    setLoading(false);

    if (error) {
      toast.error(mensagemErroAuth(error.message));
      return;
    }

    setSent(true);
    toast.success("Enviamos um link de recuperação para seu email.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setSent(false);
          setEmail("");
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-[#A1A1AA] transition-colors duration-200 hover:text-[#D946EF]"
        >
          Esqueceu sua senha?
          <span className="h-px w-0 bg-[#D946EF] transition-all duration-300 group-hover:w-full" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] shadow-[0_4px_24px_rgba(217,70,239,0.15)]">
              <Mail className="size-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-display">
                {sent ? "E-mail enviado!" : "Recuperar senha"}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        {sent ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full border border-emerald-500/20 bg-emerald-500/10">
              <Mail className="size-6 text-emerald-500" />
            </div>
            <p className="text-sm text-muted-foreground">
              Verifique sua caixa de entrada e clique no link para redefinir sua senha.
            </p>
            <p className="text-xs text-muted-foreground">
              Não recebeu? Verifique a pasta de spam ou{" "}
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                }}
                className="text-primary underline-offset-2 hover:underline"
              >
                tente novamente
              </button>
              .
            </p>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
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
    <svg className="size-4 mr-2" viewBox="0 0 48 48">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16.2 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2c-2 1.5-4.5 2.4-7.3 2.4-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.3 5.2C40.9 35.7 44 30.3 44 24c0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
