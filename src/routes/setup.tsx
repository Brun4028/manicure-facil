/**
 * Setup Wizard — Configuração guiada de primeira execução
 *
 * Aparece quando o appdetecta que o Supabase não está configurado.
 * Guia o comprador passo a passo para criar conta no Supabase,
 * colar as credenciais e rodar as migrations.
 */

import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Database,
  Key,
  Brain,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Rocket,
  Shield,
  Terminal,
  Sparkles,
  Loader2,
} from "lucide-react";
import logoIconWhite from "@/assets/logo-icon-white.png";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/setup")({
  ssr: false,
  beforeLoad: async () => {
    // Se o Supabase já está configurado, vai pro login
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (url && key && url.includes("supabase.co") && key.length > 20) {
      throw redirect({ to: "/auth" });
    }
  },
  component: SetupPage,
});

type SetupStep = "welcome" | "supabase" | "sql" | "ai" | "done";

function SetupPage() {
  usePageTitle("Configuração — Manicure Fácil");

  const [step, setStep] = useState<SetupStep>("welcome");
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [supabaseServiceKey, setSupabaseServiceKey] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [showEnvDownload, setShowEnvDownload] = useState(false);

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast.success("Copiado!");
  }

  function generateEnvFile(): string {
    return `# =============================================================================
# .env — Manicure Fácil (configurado pelo wizard)
# =============================================================================

# ─── Supabase ────────────────────────────────────────
VITE_SUPABASE_URL=${supabaseUrl}
SUPABASE_URL=${supabaseUrl}
VITE_SUPABASE_PUBLISHABLE_KEY=${supabaseAnonKey}
SUPABASE_PUBLISHABLE_KEY=${supabaseAnonKey}
SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceKey}

# ─── Admin ───────────────────────────────────────────
ADMIN_EMAILS=${adminEmail}

# ─── IA (Gemini gratuito) ───────────────────────────
AI_PROVIDER=gemini
GEMINI_API_KEY=${geminiKey || "SUA_CHAVE_AQUI"}

# ─── Node ────────────────────────────────────────────
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
`;
  }

  function downloadEnv() {
    const content = generateEnvFile();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ".env";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Arquivo .env baixado!");
  }

  const steps: SetupStep[] = ["welcome", "supabase", "sql", "ai", "done"];
  const currentIdx = steps.indexOf(step);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0F0F14] px-4">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 -right-40 h-[620px] w-[620px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(217,70,239,0.09),transparent)] blur-3xl" />
        <div className="absolute -bottom-56 -left-40 h-[560px] w-[560px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.07),transparent)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:56px_56px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center animate-fade-up">
          <div className="relative grid size-14 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] shadow-[0_8px_32px_rgba(217,70,239,0.35)] ring-1 ring-white/20">
            <div className="absolute -top-6 -right-6 size-12 rounded-full bg-white/20 blur-lg" />
            <img src={logoIconWhite} alt="Logo" className="relative size-7 object-contain" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
            Configuração Inicial
          </h1>
          <p className="mt-1.5 text-sm text-[#A1A1AA]">
            Vamos configurar seu sistema em poucos passos
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-6 flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex-1 flex items-center gap-2">
              <div
                className={cn(
                  "size-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300",
                  i < currentIdx
                    ? "bg-emerald-500 text-white"
                    : i === currentIdx
                      ? "bg-gradient-to-br from-[#D946EF] to-[#A855F7] text-white shadow-[0_4px_20px_rgba(217,70,239,0.3)]"
                      : "bg-white/[0.06] text-[#52525B] border border-white/[0.06]",
                )}
              >
                {i < currentIdx ? <Check className="size-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 rounded-full transition-all duration-500",
                    i < currentIdx ? "bg-emerald-500" : "bg-white/[0.06]",
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <Card className="relative overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-[#14151D]/85 shadow-[0_24px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D946EF]/70 to-transparent" />

          <div className="p-7 sm:p-8">
            {/* ── STEP: Welcome ── */}
            {step === "welcome" && (
              <div className="animate-fade-up">
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-5 size-16 rounded-2xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] grid place-items-center shadow-[0_8px_30px_rgba(217,70,239,0.35)]">
                    <Rocket className="size-7 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-white">
                    Bem-vinda ao Manicure Fácil!
                  </h2>
                  <p className="mt-2 text-sm text-[#A1A1AA] leading-relaxed">
                    Para usar o sistema, você precisa de uma conta gratuita no{" "}
                    <strong className="text-white">Supabase</strong> (banco de dados +
                    autenticação).
                    <br />
                    Vamos te guiar passo a passo — é rápido e fácil!
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  {[
                    {
                      icon: Database,
                      text: "Criar conta no Supabase (gratuito)",
                      color: "text-emerald-400",
                    },
                    { icon: Key, text: "Colar as 3 chaves no formulário", color: "text-[#D946EF]" },
                    {
                      icon: Terminal,
                      text: "Rodar o script SQL (copiar e colar)",
                      color: "text-amber-400",
                    },
                    {
                      icon: Brain,
                      text: "Configurar IA opcional (gratuita)",
                      color: "text-[#A855F7]",
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]"
                    >
                      <div
                        className={cn(
                          "size-9 rounded-lg bg-white/[0.06] grid place-items-center shrink-0",
                          item.color,
                        )}
                      >
                        <item.icon className="size-4.5" />
                      </div>
                      <span className="text-sm text-[#D4D4D8]">{item.text}</span>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={() => setStep("supabase")}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-[#D946EF] via-[#C026D3] to-[#A855F7] text-[15px] font-semibold text-white shadow-[0_8px_30px_rgba(217,70,239,0.25)] hover:shadow-[0_12px_44px_rgba(217,70,239,0.42)] hover:brightness-110 active:scale-[0.98]"
                >
                  <span className="flex items-center gap-2">
                    Começar configuração <ArrowRight className="size-4" />
                  </span>
                </Button>
              </div>
            )}

            {/* ── STEP: Supabase Credentials ── */}
            {step === "supabase" && (
              <div className="animate-fade-up">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="size-10 rounded-xl bg-emerald-500/15 grid place-items-center">
                      <Database className="size-5 text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Conectar ao Supabase</h2>
                      <p className="text-xs text-[#A1A1AA]">Passo 1 de 3</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 mb-5">
                    <div className="flex items-start gap-3">
                      <Shield className="size-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-300">
                          Criar conta gratuita no Supabase
                        </p>
                        <p className="text-xs text-amber-200/70 mt-1 leading-relaxed">
                          1. Acesse{" "}
                          <a
                            href="https://supabase.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-semibold hover:text-amber-100"
                          >
                            supabase.com
                          </a>{" "}
                          e crie uma conta (gratuito)
                          <br />
                          2. Clique em <strong>"New Project"</strong> e preencha nome + senha
                          <br />
                          3. Vá em <strong>Settings → API</strong> e copie as 3 chaves abaixo
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-[13px] font-medium text-[#D4D4D8]">URL do Projeto</Label>
                    <p className="text-[11px] text-[#52525B] mb-1.5">
                      Ex: https://abc123.supabase.co
                    </p>
                    <Input
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      placeholder="https://seu-projeto.supabase.co"
                      className="h-11 rounded-xl bg-[#1E2028]/80 border-white/[0.06] text-white placeholder:text-[#52525B]"
                    />
                  </div>

                  <div>
                    <Label className="text-[13px] font-medium text-[#D4D4D8]">
                      Chave Anon (pública)
                    </Label>
                    <p className="text-[11px] text-[#52525B] mb-1.5">
                      Em Settings → API → "anon public"
                    </p>
                    <Input
                      value={supabaseAnonKey}
                      onChange={(e) => setSupabaseAnonKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIs..."
                      className="h-11 rounded-xl bg-[#1E2028]/80 border-white/[0.06] text-white placeholder:text-[#52525B]"
                    />
                  </div>

                  <div>
                    <Label className="text-[13px] font-medium text-[#D4D4D8]">
                      Chave Service Role (secreta)
                    </Label>
                    <p className="text-[11px] text-[#52525B] mb-1.5">
                      Em Settings → API → "service_role secret"
                    </p>
                    <Input
                      value={supabaseServiceKey}
                      onChange={(e) => setSupabaseServiceKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIs..."
                      className="h-11 rounded-xl bg-[#1E2028]/80 border-white/[0.06] text-white placeholder:text-[#52525B]"
                    />
                  </div>

                  <div>
                    <Label className="text-[13px] font-medium text-[#D4D4D8]">
                      Seu e-mail (admin)
                    </Label>
                    <p className="text-[11px] text-[#52525B] mb-1.5">
                      Este e-mail terá acesso ao painel administrativo
                    </p>
                    <Input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="h-11 rounded-xl bg-[#1E2028]/80 border-white/[0.06] text-white placeholder:text-[#52525B]"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setStep("welcome")}
                    className="flex-1 h-11 rounded-xl border-white/[0.08] text-[#A1A1AA] hover:text-white hover:border-white/[0.16]"
                  >
                    <ArrowLeft className="size-4 mr-1" /> Voltar
                  </Button>
                  <Button
                    onClick={() => {
                      if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !adminEmail) {
                        toast.error("Preencha todos os campos");
                        return;
                      }
                      if (!supabaseUrl.includes("supabase.co")) {
                        toast.error("URL deve ser do Supabase (ex: https://xxx.supabase.co)");
                        return;
                      }
                      setStep("sql");
                    }}
                    className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white font-semibold shadow-[0_4px_24px_rgba(217,70,239,0.15)] hover:shadow-[0_8px_30px_rgba(217,70,239,0.3)]"
                  >
                    Próximo <ArrowRight className="size-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP: SQL Migration ── */}
            {step === "sql" && (
              <div className="animate-fade-up">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="size-10 rounded-xl bg-amber-500/15 grid place-items-center">
                      <Terminal className="size-5 text-amber-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        Configurar o banco de dados
                      </h2>
                      <p className="text-xs text-[#A1A1AA]">Passo 2 de 3</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-5">
                    <p className="text-sm text-[#D4D4D8] leading-relaxed">
                      <strong className="text-white">Copie o script SQL abaixo</strong> e cole no{" "}
                      <strong className="text-white">SQL Editor</strong> do Supabase, depois clique
                      em <strong className="text-white">Run</strong>.
                    </p>
                  </div>
                </div>

                {/* SQL Script */}
                <div className="relative rounded-xl bg-[#0D0D12] border border-white/[0.06] overflow-hidden mb-4">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
                    <span className="text-[11px] text-[#52525B] font-mono">SQL Editor</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(getFullSQLScript(), "full-sql")}
                      className="h-7 text-[11px] text-[#A1A1AA] hover:text-white"
                    >
                      {copied === "full-sql" ? (
                        <>
                          <Check className="size-3 mr-1 text-emerald-400" /> Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="size-3 mr-1" /> Copiar tudo
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="p-4 text-[11px] text-[#A1A1AA] font-mono overflow-x-auto max-h-64 leading-relaxed">
                    <code>{getFullSQLScript()}</code>
                  </pre>
                </div>

                {/* Admin promotion SQL */}
                <div className="rounded-xl bg-[#D946EF]/10 border border-[#D946EF]/20 p-4 mb-4">
                  <p className="text-xs text-[#D946EF] font-semibold mb-2">
                    ⚠️ IMPORTANTE: Execute também este comando para se tornar admin:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] text-[#D4D4D8] font-mono bg-black/20 rounded-lg px-3 py-2">
                      SELECT public.definir_admin('{adminEmail || "seu@email.com"}');
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        copyToClipboard(
                          `SELECT public.definir_admin('${adminEmail}');`,
                          "admin-sql",
                        )
                      }
                      className="h-8 shrink-0"
                    >
                      {copied === "admin-sql" ? (
                        <Check className="size-3 text-emerald-400" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 mb-5">
                  <p className="text-xs text-emerald-300 leading-relaxed">
                    💡 <strong>Dica:</strong> No Supabase, vá em <strong>SQL Editor</strong> (menu
                    lateral esquerdo) → cole o script → clique em <strong>Run</strong>. Repita para
                    o comando de admin.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep("supabase")}
                    className="flex-1 h-11 rounded-xl border-white/[0.08] text-[#A1A1AA] hover:text-white hover:border-white/[0.16]"
                  >
                    <ArrowLeft className="size-4 mr-1" /> Voltar
                  </Button>
                  <Button
                    onClick={() => setStep("ai")}
                    className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white font-semibold shadow-[0_4px_24px_rgba(217,70,239,0.15)]"
                  >
                    Próximo <ArrowRight className="size-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP: AI Key ── */}
            {step === "ai" && (
              <div className="animate-fade-up">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="size-10 rounded-xl bg-[#A855F7]/15 grid place-items-center">
                      <Brain className="size-5 text-[#A855F7]" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        Assistente de IA (opcional)
                      </h2>
                      <p className="text-xs text-[#A1A1AA]">Passo 3 de 3</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-[#A855F7]/10 border border-[#A855F7]/20 p-4 mb-5">
                  <p className="text-sm text-[#D4D4D8] leading-relaxed">
                    O assistente de IA ajuda suas clientes com dicas de beleza e análise do negócio.
                    É <strong className="text-white">gratuito</strong> com o Google Gemini!
                  </p>
                </div>

                <div className="space-y-4 mb-5">
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                    <p className="text-sm text-[#D4D4D8] leading-relaxed">
                      1. Acesse{" "}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#A855F7] underline font-semibold hover:text-[#D946EF] inline-flex items-center gap-1"
                      >
                        ai.google.dev <ExternalLink className="size-3" />
                      </a>
                      <br />
                      2. Clique em <strong className="text-white">"Create API Key"</strong>
                      <br />
                      3. Cole a chave abaixo
                    </p>
                  </div>

                  <div>
                    <Label className="text-[13px] font-medium text-[#D4D4D8]">
                      Chave do Gemini (gratuita)
                    </Label>
                    <p className="text-[11px] text-[#52525B] mb-1.5">
                      Opcional — o funciona sem, mas com IA é melhor!
                    </p>
                    <Input
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIza-sua-chave-aqui"
                      className="h-11 rounded-xl bg-[#1E2028]/80 border-white/[0.06] text-white placeholder:text-[#52525B]"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep("sql")}
                    className="flex-1 h-11 rounded-xl border-white/[0.08] text-[#A1A1AA] hover:text-white hover:border-white/[0.16]"
                  >
                    <ArrowLeft className="size-4 mr-1" /> Voltar
                  </Button>
                  <Button
                    onClick={() => setStep("done")}
                    className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white font-semibold shadow-[0_4px_24px_rgba(217,70,239,0.15)]"
                  >
                    Finalizar <Check className="size-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP: Done ── */}
            {step === "done" && (
              <div className="animate-fade-up">
                <div className="text-center mb-6">
                  <div className="relative mx-auto mb-5 size-16">
                    <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse-soft" />
                    <div className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_8px_30px_rgba(34,197,94,0.35)] ring-1 ring-white/20">
                      <CheckCircle2 className="size-8 text-white" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-semibold text-white">Tudo pronto! 🎉</h2>
                  <p className="mt-2 text-sm text-[#A1A1AA] leading-relaxed">
                    Agora você precisa{" "}
                    <strong className="text-white">aplicar as configurações</strong> no seu
                    ambiente.
                  </p>
                </div>

                {/* Download .env */}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 mb-5">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Sparkles className="size-4 text-[#D946EF]" /> Baixar arquivo de configuração
                  </h3>
                  <p className="text-xs text-[#A1A1AA] mb-4 leading-relaxed">
                    Clique abaixo para baixar o arquivo <code className="text-[#D946EF]">.env</code>{" "}
                    com todas as suas credenciais preenchidas. Coloque este arquivo na pasta raiz do
                    projeto antes de rodar <code className="text-[#D946EF]">npm run dev</code>.
                  </p>
                  <Button
                    onClick={downloadEnv}
                    className="w-full h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-semibold hover:bg-emerald-500/25"
                  >
                    <Database className="size-4 mr-2" /> Baixar arquivo .env
                  </Button>
                </div>

                {/* Deploy options */}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 mb-5">
                  <h3 className="text-sm font-semibold text-white mb-3">Opções de deploy:</h3>
                  <div className="space-y-3">
                    <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
                      <p className="text-xs font-semibold text-white mb-1">
                        🖥️ Local (recomendado para começar)
                      </p>
                      <code className="text-[11px] text-[#A1A1AA] font-mono">
                        npm install && npm run dev
                      </code>
                    </div>
                    <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
                      <p className="text-xs font-semibold text-white mb-1">☁️ Vercel (gratuito)</p>
                      <p className="text-[11px] text-[#A1A1AA]">
                        Suba o código no GitHub → vercel.com → Import → Configure as env vars →
                        Deploy
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
                      <p className="text-xs font-semibold text-white mb-1">🐳 Docker</p>
                      <code className="text-[11px] text-[#A1A1AA] font-mono">
                        docker compose up -d --build
                      </code>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => (window.location.href = "/auth")}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-[#D946EF] via-[#C026D3] to-[#A855F7] text-[15px] font-semibold text-white shadow-[0_8px_30px_rgba(217,70,239,0.25)] hover:shadow-[0_12px_44px_rgba(217,70,239,0.42)]"
                >
                  <span className="flex items-center gap-2">
                    Ir para o login <ArrowRight className="size-4" />
                  </span>
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Help link */}
        <p className="mt-6 text-center text-[11px] text-[#52525B]">
          Precisa de ajuda?{" "}
          <a
            href="mailto:suporte@manicurefacil.com"
            className="text-[#A855F7] hover:text-[#D946EF] underline"
          >
            Fale conosco
          </a>
        </p>
      </div>
    </div>
  );
}

/** SQL completo para configurar o banco (compacto para copiar) */
function getFullSQLScript(): string {
  return `-- ========================================
-- Manicure Fácil — Script de Configuração
-- Cole no SQL Editor do Supabase e clique Run
-- ========================================

-- 1. Status de conta
CREATE TYPE public.conta_status AS ENUM ('ativo', 'inativo', 'bloqueado', 'suspenso');

-- 2. Tabela de contas
CREATE TABLE IF NOT EXISTS public.contas (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.conta_status NOT NULL DEFAULT 'ativo',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  plano TEXT,
  fonte TEXT NOT NULL DEFAULT 'admin',
  kirvano_transacao_id TEXT,
  trial_inicio TIMESTAMPTZ,
  trial_fim TIMESTAMPTZ,
  acesso_termina_em TIMESTAMPTZ,
  motivo_bloqueio TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contas_status ON public.contas(status);
CREATE INDEX IF NOT EXISTS idx_contas_fonte ON public.contas(fonte);

GRANT SELECT ON public.contas TO authenticated;
GRANT ALL ON public.contas TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.contas FROM authenticated;

ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contas_own_select" ON public.contas
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3. Função verificar_acesso
CREATE OR REPLACE FUNCTION public.verificar_acesso()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public AS $$ SELECT true; $$;

REVOKE EXECUTE ON FUNCTION public.verificar_acesso() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_acesso() TO authenticated;

-- 4. Trigger handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.servicos (user_id, nome, valor, custo, duracao_min) VALUES
    (NEW.id, 'Unha Simples', 35, 5, 45),
    (NEW.id, 'Unha em Gel', 90, 20, 90),
    (NEW.id, 'Pé e Mão', 70, 10, 90),
    (NEW.id, 'Alongamento', 150, 40, 120);

  INSERT INTO public.fidelidade_config (user_id, ativo, pontos_por_real, pontos_resgate, premio_resgate, niver_promo_ativa, niver_desconto_porcentagem, niver_dias_validade)
  VALUES (NEW.id, false, 1.00, 100, 'Pé e Mão Simples', false, 10.00, 7);

  INSERT INTO public.configuracoes (user_id, empresa_nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', 'Meu Salão'));

  INSERT INTO public.horarios_trabalho (user_id, dia_semana, hora_inicio, hora_fim)
  VALUES
    (NEW.id, 1, '08:00', '18:00'), (NEW.id, 2, '08:00', '18:00'),
    (NEW.id, 3, '08:00', '18:00'), (NEW.id, 4, '08:00', '18:00'),
    (NEW.id, 5, '08:00', '18:00')
  ON CONFLICT (user_id, dia_semana) DO NOTHING;

  INSERT INTO public.contas (user_id, status)
  VALUES (NEW.id, 'ativo'::public.conta_status)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Remover políticas públicas (segurança)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','servicos','clientes','agendamentos','avaliacoes',
    'portfolio','promocoes','fidelidade_config'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'allow_public_select_'||t, t);
  END LOOP;
END $$;

-- 6. Revogar acesso anon
REVOKE ALL ON public.contas FROM anon;
REVOKE ALL ON public.clientes FROM anon;
REVOKE ALL ON public.agendamentos FROM anon;
REVOKE ALL ON public.servicos FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.fidelidade_config FROM anon;
REVOKE ALL ON public.fidelidade_pontos FROM anon;
REVOKE ALL ON public.fidelidade_historico FROM anon;
REVOKE ALL ON public.avaliacoes FROM anon;
REVOKE ALL ON public.portfolio FROM anon;
REVOKE ALL ON public.promocoes FROM anon;
REVOKE ALL ON public.vendas FROM anon;
REVOKE ALL ON public.venda_itens FROM anon;
REVOKE ALL ON public.produtos FROM anon;
REVOKE ALL ON public.movimentacoes_estoque FROM anon;
REVOKE ALL ON public.metas_mensais FROM anon;
REVOKE ALL ON public.despesas FROM anon;
REVOKE ALL ON public.horarios_trabalho FROM anon;
REVOKE ALL ON public.bloqueios_agenda FROM anon;
REVOKE ALL ON public.configuracoes FROM anon;
REVOKE ALL ON public.notificacoes_internas FROM anon;
REVOKE ALL ON public.recorrencias FROM anon;
REVOKE ALL ON public.audit_log FROM anon;
REVOKE ALL ON public.backup_log FROM anon;

-- 7. Políticas own_* (isolamento por usuário)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','servicos','agendamentos','produtos',
    'movimentacoes_estoque','fidelidade_config','fidelidade_pontos',
    'fidelidade_historico','promocoes','portfolio','vendas','venda_itens',
    'metas_mensais','despesas','horarios_trabalho','configuracoes',
    'notificacoes_internas','recorrencias'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS own_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY own_%I ON public.%I FOR ALL TO authenticated
       USING (auth.uid() = user_id AND public.verificar_acesso())
       WITH CHECK (auth.uid() = user_id AND public.verificar_acesso())',
      t, t
    );
  END LOOP;
END $$;

-- profiles (coluna id)
DROP POLICY IF EXISTS "own_profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "own_profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "own_profiles_update" ON public.profiles;
CREATE POLICY "own_profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own_profiles_insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own_profiles_update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- bloqueios_agenda
DROP POLICY IF EXISTS "own_bloqueios" ON public.bloqueios_agenda;
CREATE POLICY "own_bloqueios" ON public.bloqueios_agenda
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- backup_log
DROP POLICY IF EXISTS "own_backup_log" ON public.backup_log;
CREATE POLICY "own_backup_log" ON public.backup_log
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- audit_log
DROP POLICY IF EXISTS "own_audit_log_insert" ON public.audit_log;
DROP POLICY IF EXISTS "own_audit_log_select" ON public.audit_log;
CREATE POLICY "own_audit_log_insert" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_audit_log_select" ON public.audit_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 8. Funções de agendamento/avaliação
CREATE OR REPLACE FUNCTION public.agendar_servico(
  p_user_id UUID, p_cliente_nome TEXT, p_cliente_telefone TEXT,
  p_cliente_email TEXT DEFAULT NULL, p_cliente_data_nascimento DATE DEFAULT NULL,
  p_cliente_observacoes TEXT DEFAULT NULL, p_servico_id UUID DEFAULT NULL,
  p_data_hora TIMESTAMPTZ DEFAULT NULL, p_observacoes TEXT DEFAULT NULL,
  p_valor_final NUMERIC(10,2) DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_cliente_id UUID; v_servico RECORD; v_agendamento_id UUID;
  v_conflito BOOLEAN; v_valor_final NUMERIC(10,2);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.contas c WHERE c.user_id = p_user_id AND c.status = 'ativo' AND (c.acesso_termina_em IS NULL OR c.acesso_termina_em > now())) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agenda indisponível no momento');
  END IF;
  IF p_cliente_nome IS NULL OR trim(p_cliente_nome) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome do cliente é obrigatório');
  END IF;
  IF p_cliente_telefone IS NULL OR trim(p_cliente_telefone) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Telefone do cliente é obrigatório');
  END IF;
  IF p_servico_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serviço não informado');
  END IF;
  IF p_data_hora IS NULL OR p_data_hora < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Data/hora inválida ou no passado');
  END IF;
  SELECT id, nome, valor, custo, duracao_min, ativo INTO v_servico
  FROM public.servicos WHERE id = p_servico_id AND user_id = p_user_id AND ativo = true;
  IF v_servico.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serviço não encontrado ou inativo');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.agendamentos
    WHERE user_id = p_user_id AND status != 'cancelado'
      AND data_hora < p_data_hora + (v_servico.duracao_min || ' minutes')::INTERVAL
      AND data_hora + (duracao_min || ' minutes')::INTERVAL > p_data_hora
  ) INTO v_conflito;
  IF v_conflito THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conflito de horário');
  END IF;
  v_valor_final := ROUND(COALESCE(p_valor_final, v_servico.valor), 2);
  IF v_valor_final < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor inválido');
  END IF;
  SELECT id INTO v_cliente_id FROM public.clientes
  WHERE user_id = p_user_id AND telefone = p_cliente_telefone LIMIT 1;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (user_id, nome, telefone, email, data_nascimento, observacoes)
    VALUES (p_user_id, p_cliente_nome, p_cliente_telefone, p_cliente_email, p_cliente_data_nascimento, p_cliente_observacoes)
    RETURNING id INTO v_cliente_id;
  END IF;
  INSERT INTO public.agendamentos (user_id, cliente_id, servico_id, data_hora, duracao_min, valor, custo, status, pagamento, observacoes)
  VALUES (p_user_id, v_cliente_id, p_servico_id, p_data_hora, v_servico.duracao_min, v_valor_final, v_servico.custo, 'agendado', 'pendente', p_observacoes)
  RETURNING id INTO v_agendamento_id;
  INSERT INTO public.audit_log (user_id, acao, entidade, entidade_id, detalhes)
  VALUES (p_user_id, 'create', 'agendamento', v_agendamento_id::TEXT,
    jsonb_build_object('source', 'public_booking', 'cliente_nome', p_cliente_nome, 'servico', v_servico.nome, 'valor', v_servico.valor));
  RETURN jsonb_build_object('success', true, 'agendamento_id', v_agendamento_id, 'message', 'Agendamento realizado com sucesso');
END; $$;

REVOKE EXECUTE ON FUNCTION public.agendar_servico FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agendar_servico TO service_role;

CREATE OR REPLACE FUNCTION public.criar_avaliacao(
  p_user_id UUID, p_cliente_nome TEXT, p_nota INTEGER, p_comentario TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id UUID; BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.contas c WHERE c.user_id = p_user_id AND c.status = 'ativo' AND (c.acesso_termina_em IS NULL OR c.acesso_termina_em > now())) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conta indisponível');
  END IF;
  IF p_cliente_nome IS NULL OR trim(p_cliente_nome) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome é obrigatório');
  END IF;
  IF p_nota IS NULL OR p_nota < 1 OR p_nota > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nota deve ser entre 1 e 5');
  END IF;
  INSERT INTO public.avaliacoes (user_id, cliente_nome, nota, comentario, publico)
  VALUES (p_user_id, p_cliente_nome, p_nota, p_comentario, true) RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'avaliacao_id', v_id);
END; $$;

REVOKE EXECUTE ON FUNCTION public.criar_avaliacao FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_avaliacao TO service_role;

-- 9. Utilitários admin
CREATE OR REPLACE FUNCTION public.definir_admin(p_email TEXT)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.contas c SET is_admin = true, atualizado_em = now()
  FROM auth.users u WHERE u.id = c.user_id AND lower(u.email) = lower(p_email);
$$;
REVOKE EXECUTE ON FUNCTION public.definir_admin FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_admin TO service_role;

-- 10. Backfill contas existentes
INSERT INTO public.contas (user_id, status)
SELECT id, 'ativo'::public.conta_status FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ✅ Script completo! Agora execute o comando de admin:
-- SELECT public.definir_admin('SEU_EMAIL_AQUI');`;
}
