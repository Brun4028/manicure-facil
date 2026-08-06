import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";

import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { mensagemErroAmigavel } from "@/lib/user-errors";
import {
  listarContas, atualizarConta, convidarUsuario, gerarLinkConvite,
  verificarAdmin,
  type ContaAdmin,
} from "@/lib/admin/admin.functions";
import { STATUS_LABELS, type ContaStatus } from "@/lib/access";
import { ShieldCheck, UserPlus, Copy, Check, CalendarClock, KeyRound, Users, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    // Guard SERVER-SIDE: valida JWT + conta ativa + admin no servidor
    // (requireAdminAuth). Acesso direto por URL por não-admin é bloqueado
    // aqui ANTES de qualquer dado ser carregado — e as server functions
    // revalidam em toda operação (defesa em profundidade).
    try {
      await verificarAdmin();
    } catch {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminPage,
});

function StatusBadge({ status }: { status: ContaStatus }) {
  const styles: Record<ContaStatus, string> = {
    ativo: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
    inativo: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
    bloqueado: "bg-rose-500/15 text-rose-400 border-rose-500/25",
    suspenso: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  };
  return (
    <Badge variant="outline" className={`${styles[status]} capitalize`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function AdminPage() {
  usePageTitle("Admin — Manicure Fácil");

  const qc = useQueryClient();

  const contasQuery = useQuery({
    queryKey: ["admin_contas"],
    queryFn: async () => {
      const res = await listarContas();
      return res.data;
    },
  });
  const contas = contasQuery.data ?? [];

  // ── Métricas ──
  const ativas = contas.filter(c => c.status === "ativo").length;
  const bloqueadas = contas.filter(c => c.status === "bloqueado" || c.status === "suspenso").length;
  const emTrial = contas.filter(c => c.status === "ativo" && c.trial_fim && new Date(c.trial_fim).getTime() > Date.now()).length;
  const expiradas = contas.filter(c => c.status === "ativo" && c.acesso_termina_em && new Date(c.acesso_termina_em).getTime() < Date.now()).length;

  // ── Diálogo de edição ──
  const [editing, setEditing] = useState<ContaAdmin | null>(null);
  const [editForm, setEditForm] = useState<{
    plano: string; trialFim: string; acessoTerminaEm: string; motivoBloqueio: string;
  }>({ plano: "", trialFim: "", acessoTerminaEm: "", motivoBloqueio: "" });

  const saveEditMut = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const res = await atualizarConta({
        data: {
          userId: editing.user_id,
          plano: editForm.plano,
          trialFim: editForm.trialFim,
          acessoTerminaEm: editForm.acessoTerminaEm,
          motivoBloqueio: editForm.motivoBloqueio,
        },
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_contas"] });
      setEditing(null);
      toast.success("Conta atualizada!");
    },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  // ── Convidar cliente ──
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", nome: "", plano: "" });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const inviteMut = useMutation({
    mutationFn: async () => {
      const res = await convidarUsuario({ data: { ...inviteForm } });
      if (!res.ok) throw new Error(res.error);
      // Gera o link de convite para envio manual / futuro e-mail da Kirvano
      const linkRes = await gerarLinkConvite({ data: { userId: res.userId } });
      if (!linkRes.ok) throw new Error(linkRes.error);
      return linkRes.link;
    },
    onSuccess: (link) => {
      qc.invalidateQueries({ queryKey: ["admin_contas"] });
      setInviteLink(link);
      toast.success("Convite enviado por e-mail e link gerado!");
    },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  function copyLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
    toast.success("Link copiado!");
  }

  function openEdit(c: ContaAdmin) {
    setEditing(c);
    setEditForm({
      plano: c.plano ?? "",
      trialFim: c.trial_fim ? c.trial_fim.slice(0, 10) : "",
      acessoTerminaEm: c.acesso_termina_em ? c.acesso_termina_em.slice(0, 10) : "",
      motivoBloqueio: c.motivo_bloqueio ?? "",
    });
  }

  // Ações rápidas
  function renovar30(c: ContaAdmin) {
    const base = c.acesso_termina_em && new Date(c.acesso_termina_em).getTime() > Date.now()
      ? new Date(c.acesso_termina_em)
      : new Date();
    const fim = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    atualizarConta({ data: { userId: c.user_id, status: "ativo", acessoTerminaEm: fim } })
      .then((r) => { if (r.ok) { qc.invalidateQueries({ queryKey: ["admin_contas"] }); toast.success("Acesso renovado por 30 dias"); } else toast.error(mensagemErroAmigavel(r.error)); })
      .catch((e: Error) => toast.error(mensagemErroAmigavel(e.message)));
  }

  function trial7(c: ContaAdmin) {
    const agora = new Date();
    const fim = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
    atualizarConta({
      data: {
        userId: c.user_id, status: "ativo",
        trialFim: fim.toISOString(), acessoTerminaEm: fim.toISOString(),
      },
    })
      .then((r) => { if (r.ok) { qc.invalidateQueries({ queryKey: ["admin_contas"] }); toast.success("Trial de 7 dias ativado"); } else toast.error(mensagemErroAmigavel(r.error)); })
      .catch((e: Error) => toast.error(mensagemErroAmigavel(e.message)));
  }

  function vitalicio(c: ContaAdmin) {
    atualizarConta({ data: { userId: c.user_id, status: "ativo", acessoTerminaEm: "", trialFim: "" } })
      .then((r) => { if (r.ok) { qc.invalidateQueries({ queryKey: ["admin_contas"] }); toast.success("Acesso vitalício liberado"); } else toast.error(mensagemErroAmigavel(r.error)); })
      .catch((e: Error) => toast.error(mensagemErroAmigavel(e.message)));
  }

  return (
    <>
      <PageHeader
        title="Administração do SaaS"
        subtitle="Gerencie contas, acessos, planos e convites. Pronto para a Kirvano."
        actions={
          <Button className="gradient-primary text-primary-foreground shadow-glow rounded-xl" onClick={() => { setInviteOpen(true); setInviteLink(null); }}>
            <UserPlus className="size-4 mr-2" /> Convidar cliente
          </Button>
        }
      />

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Contas ativas", value: ativas, icon: ShieldCheck, cls: "text-emerald-500" },
          { label: "Bloqueadas/Suspensas", value: bloqueadas, icon: ShieldAlert, cls: "text-rose-400" },
          { label: "Em trial", value: emTrial, icon: CalendarClock, cls: "text-amber-400" },
          { label: "Expiradas", value: expiradas, icon: Users, cls: "text-zinc-400" },
        ].map((m) => (
          <Card key={m.label} className="bg-card border border-border p-5 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-muted/40 grid place-items-center"><m.icon className={`size-5 ${m.cls}`} /></div>
              <div>
                <div className="text-2xl font-bold">{m.value}</div>
                <div className="text-xs text-muted-foreground">{m.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Lista de contas */}
      <Card className="bg-card border border-border rounded-[20px] shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60 flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <h3 className="font-display text-lg font-semibold">Contas ({contas.length})</h3>
        </div>

        {contasQuery.isLoading ? (
          <div className="p-6 space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : contas.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">Nenhuma conta cadastrada ainda.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {contas.map((c) => (
              <div key={c.user_id} className="px-6 py-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{c.nome || "Sem nome"}</span>
                    {c.is_admin && <Badge className="bg-primary/15 text-primary border-primary/25">Admin</Badge>}
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">{c.email || "sem e-mail"}</div>
                  <div className="text-[11px] text-muted-foreground/70 mt-0.5 flex flex-wrap gap-x-3">
                    {c.plano && <span>Plano: <b>{c.plano}</b></span>}
                    {c.trial_fim && <span>Trial até: <b>{new Date(c.trial_fim).toLocaleDateString("pt-BR")}</b></span>}
                    {c.acesso_termina_em
                      ? <span>Acesso até: <b>{new Date(c.acesso_termina_em).toLocaleDateString("pt-BR")}</b></span>
                      : c.status === "ativo" && <span className="text-emerald-500">Acesso vitalício</span>}
                    {c.fonte && <span>Fonte: <b>{c.fonte}</b></span>}
                    {c.motivo_bloqueio && <span className="text-rose-400">Motivo: {c.motivo_bloqueio}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                  <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openEdit(c)}>Editar</Button>
                  <Button size="sm" variant="ghost" className="text-xs h-8" title="Renovar acesso por 30 dias" onClick={() => renovar30(c)}>
                    +30 dias
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-8" title="Trial de 7 dias" onClick={() => trial7(c)}>
                    Trial 7d
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-8" title="Acesso vitalício" onClick={() => vitalicio(c)}>
                    Vitalício
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Diálogo: editar conta ── */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Editar conta</DialogTitle>
            <DialogDescription>
              {editing?.email ?? "—"} — controle total do acesso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Plano</Label>
                <Input className="mt-1 h-10" value={editForm.plano} placeholder="ex.: mensal, anual" onChange={(e) => setEditForm({ ...editForm, plano: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Fim do trial</Label>
                <Input type="date" className="mt-1 h-10" value={editForm.trialFim} onChange={(e) => setEditForm({ ...editForm, trialFim: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Acesso termina em (deixe vazio = vitalício)</Label>
              <Input type="date" className="mt-1 h-10" value={editForm.acessoTerminaEm} onChange={(e) => setEditForm({ ...editForm, acessoTerminaEm: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Motivo (para bloqueio/suspensão)</Label>
              <Input className="mt-1 h-10" value={editForm.motivoBloqueio} placeholder="ex.: inadimplência, uso indevido..." onChange={(e) => setEditForm({ ...editForm, motivoBloqueio: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="rounded-xl">Cancelar</Button>
            <Button className="rounded-xl gradient-primary text-primary-foreground" disabled={saveEditMut.isPending} onClick={() => saveEditMut.mutate()}>
              {saveEditMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: convidar cliente ── */}
      <Dialog open={inviteOpen} onOpenChange={(v) => { setInviteOpen(v); if (!v) { setInviteLink(null); setInviteForm({ email: "", nome: "", plano: "" }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <UserPlus className="size-5 text-primary" /> Convidar cliente
            </DialogTitle>
            <DialogDescription>
              Um e-mail de convite é enviado com o link para a cliente criar sua conta (e definir a senha). A conta já nasce ativa — a cliente pode usar o sistema assim que definir a senha.
            </DialogDescription>
          </DialogHeader>

          {inviteLink ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-500">
                Convite enviado! Compartilhe o link abaixo caso o e-mail não chegue:
              </div>
              <div className="flex gap-2">
                <Input readOnly value={inviteLink} className="h-10 rounded-xl text-xs" />
                <Button variant="outline" onClick={copyLink} className="rounded-xl shrink-0" aria-label="Copiar link">
                  {linkCopied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <Button className="w-full rounded-xl" onClick={() => { setInviteOpen(false); setInviteLink(null); setInviteForm({ email: "", nome: "", plano: "" }); }}>
                Concluir
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (!inviteForm.email || !inviteForm.nome) { toast.error("Preencha e-mail e nome"); return; } inviteMut.mutate(); }}
              className="space-y-4 py-2"
            >
              <div>
                <Label className="text-xs">Nome da cliente</Label>
                <Input className="mt-1 h-10" value={inviteForm.nome} placeholder="Nome completo" onChange={(e) => setInviteForm({ ...inviteForm, nome: e.target.value })} required />
              </div>
              <div>
                <Label className="text-xs">E-mail</Label>
                <Input type="email" className="mt-1 h-10" value={inviteForm.email} placeholder="cliente@email.com" onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required />
              </div>
              <div>
                <Label className="text-xs">Plano (opcional)</Label>
                <Input className="mt-1 h-10" value={inviteForm.plano} placeholder="ex.: mensal, anual, vitalício" onChange={(e) => setInviteForm({ ...inviteForm, plano: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} className="rounded-xl">Cancelar</Button>
                <Button type="submit" disabled={inviteMut.isPending} className="rounded-xl gradient-primary text-primary-foreground">
                  <KeyRound className="size-4 mr-2" /> {inviteMut.isPending ? "Enviando convite..." : "Enviar convite"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
