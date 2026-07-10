import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Search, Phone, Mail, Cake, Users, Trophy, Award, Star, History } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { differenceInDays } from "date-fns";
import { ClienteHistoryDialog } from "@/components/clientes/cliente-history-dialog";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Manicure Fácil" }] }),
  component: ClientesPage,
});

type Cliente = {
  id: string; nome: string; telefone: string | null; email: string | null;
  data_nascimento: string | null; observacoes: string | null; alergias: string | null; servico_favorito: string | null;
  created_at?: string;
};

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(80),
  telefone: z.string().max(20).optional().or(z.literal("")),
  email: z.string().email("Email inválido").max(255).optional().or(z.literal("")),
  data_nascimento: z.string().optional().or(z.literal("")),
  observacoes: z.string().max(500).optional().or(z.literal("")),
  alergias: z.string().max(500).optional().or(z.literal("")),
  servico_favorito: z.string().max(120).optional().or(z.literal("")),
});

function ClientesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("clientes");
  const [historyCliente, setHistoryCliente] = useState<Cliente | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("nome");
      if (error) throw error;
      return data as Cliente[];
    },
  });

  // F5: Query agendamentos for ranking
  const { data: ags } = useQuery({
    queryKey: ["agendamentos-ranking"],
    queryFn: async () => {
      const { data } = await supabase.from("agendamentos")
        .select("cliente_id, valor, status, data_hora")
        .eq("status", "concluido");
      return data ?? [];
    },
  });

  // F5: Calculate client ranking
  const ranking = useMemo(() => {
    if (!data || !ags) return [];
    const clientMap = new Map<string, { nome: string; atendimentos: number; totalGasto: number; ultimaVisita: Date | null }>();

    ags.forEach((a) => {
      if (!a.cliente_id) return;
      const existing = clientMap.get(a.cliente_id) ?? {
        nome: data.find(c => c.id === a.cliente_id)?.nome ?? "Desconhecido",
        atendimentos: 0,
        totalGasto: 0,
        ultimaVisita: null,
      };
      existing.atendimentos++;
      existing.totalGasto += Number(a.valor);
      const d = new Date(a.data_hora);
      if (!existing.ultimaVisita || d > existing.ultimaVisita) existing.ultimaVisita = d;
      clientMap.set(a.cliente_id, existing);
    });

    const ranked = Array.from(clientMap.entries()).map(([id, c]) => ({
      id,
      ...c,
      frequencia: c.ultimaVisita ? differenceInDays(new Date(), c.ultimaVisita) : 999,
    })).sort((a, b) => b.totalGasto - a.totalGasto);

    // Assign categories
    if (ranked.length <= 1) return ranked.map(r => ({ ...r, categoria: "🥉 Bronze" as const }));
    const top20 = Math.max(1, Math.ceil(ranked.length * 0.2));
    const top50 = Math.max(1, Math.ceil(ranked.length * 0.5));

    return ranked.map((r, i) => ({
      ...r,
      categoria: i < top20 ? "🥇 Ouro" as const : i < top50 ? "🥈 Prata" as const : "🥉 Bronze" as const,
    }));
  }, [data, ags]);

  const filtered = (data ?? []).filter(c => c.nome.toLowerCase().includes(search.toLowerCase()) || (c.telefone ?? "").includes(search));

  return (
    <>
      {/* Histórico Dialog */}
      {historyCliente && (
        <ClienteHistoryDialog
          cliente={historyCliente}
          open={!!historyCliente}
          onOpenChange={(v) => { if (!v) setHistoryCliente(null); }}
        />
      )}

      <PageHeader
        title="Clientes"
        subtitle="Gerencie seu CRM"
        actions={<ClienteDialog onSaved={() => qc.invalidateQueries({ queryKey: ["clientes"] })} />}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white dark:bg-card border-0 p-1.5 rounded-2xl shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
          <TabsTrigger value="clientes" className="rounded-xl flex items-center gap-1.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20"><Users className="size-4" /> Clientes</TabsTrigger>
          <TabsTrigger value="ranking" className="rounded-xl flex items-center gap-1.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20"><Trophy className="size-4" /> Ranking</TabsTrigger>
        </TabsList>

        {/* TAB 1: CLIENTES (original) */}
        <TabsContent value="clientes" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por nome ou telefone..." className="pl-9" />
          </div>

          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-40 rounded-[20px] bg-muted" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="bg-card border border-border rounded-[20px] p-12 text-center shadow-card">
              <div className="size-16 rounded-2xl bg-[#D946EF]/10 border border-[#D946EF]/20 grid place-items-center mx-auto mb-4">
                <Users className="size-7 text-[#D946EF]" />
              </div>
              <p className="text-muted-foreground">Nenhuma cliente cadastrada ainda.</p>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(c => (
                <Card key={c.id} className="group bg-card border border-border p-5 rounded-[20px] shadow-card hover:border-[#D946EF]/30 transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-12 rounded-xl bg-[#D946EF]/10 border border-[#D946EF]/20 grid place-items-center text-[#D946EF] font-semibold text-lg shrink-0">
                        {c.nome.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium truncate text-base text-card-foreground">{c.nome}</h3>
                        {c.servico_favorito && <p className="text-xs text-muted-foreground truncate mt-0.5">
                          Prefere: {c.servico_favorito}
                        </p>}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="hover:bg-[#D946EF]/10" onClick={() => setHistoryCliente(c)}>
                        <History className="size-4 text-[#D946EF]" />
                      </Button>
                      <ClienteDialog cliente={c} onSaved={() => qc.invalidateQueries({ queryKey: ["clientes"] })} trigger={<Button size="icon" variant="ghost" className="hover:bg-[#D946EF]/10"><Pencil className="size-4 text-[#D946EF]" /></Button>} />
                      <DeleteBtn id={c.id} onDone={() => qc.invalidateQueries({ queryKey: ["clientes"] })} />
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border space-y-2.5 text-sm">
                    {c.telefone && <p className="flex items-center gap-2.5 text-muted-foreground"><Phone className="size-3.5 text-muted-foreground shrink-0" />{c.telefone}</p>}
                    {c.email && <p className="flex items-center gap-2.5 text-muted-foreground truncate"><Mail className="size-3.5 text-muted-foreground shrink-0" /><span className="truncate">{c.email}</span></p>}
                    {c.data_nascimento && <p className="flex items-center gap-2.5 text-muted-foreground"><Cake className="size-3.5 text-muted-foreground shrink-0" />{new Date(c.data_nascimento + "T00:00:00").toLocaleDateString("pt-BR")}</p>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: RANKING (F5) */}
        <TabsContent value="ranking" className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="size-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 grid place-items-center">
              <Trophy className="size-5 text-white" />
            </div>
            <div>
              <h2 className="font-display text-xl">Ranking de Clientes</h2>
              <p className="text-xs text-muted-foreground">Classificação baseada em gasto total, frequência e número de visitas</p>
            </div>
          </div>

          {/* Category summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-amber-50/50 dark:bg-amber-500/5 border border-amber-200/30 dark:border-amber-500/20 rounded-2xl p-4 text-center">
              <span className="text-2xl">🥇</span>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">{ranking.filter(r => r.categoria === "🥇 Ouro").length}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Ouro</p>
            </Card>
            <Card className="bg-slate-50/50 dark:bg-slate-500/5 border border-slate-200/30 dark:border-slate-500/20 rounded-2xl p-4 text-center">
              <span className="text-2xl">🥈</span>
              <p className="text-xl font-bold text-slate-600 dark:text-slate-400 mt-1">{ranking.filter(r => r.categoria === "🥈 Prata").length}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Prata</p>
            </Card>
            <Card className="bg-orange-50/50 dark:bg-orange-500/5 border border-orange-200/30 dark:border-orange-500/20 rounded-2xl p-4 text-center">
              <span className="text-2xl">🥉</span>
              <p className="text-xl font-bold text-orange-600 dark:text-orange-400 mt-1">{ranking.filter(r => r.categoria === "🥉 Bronze").length}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Bronze</p>
            </Card>
          </div>

          {ranking.length === 0 ? (
            <Card className="bg-card border border-border rounded-[20px] p-12 text-center shadow-card">
              <Users className="size-7 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum agendamento concluído para gerar ranking.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {ranking.map((r, i) => (
                <Card key={r.id} className="bg-card border border-border rounded-2xl p-4 shadow-card hover:border-[#D946EF]/30 transition-all">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="text-lg font-bold text-muted-foreground w-6 shrink-0">#{i + 1}</div>
                      <div className="text-xl">{r.categoria.split(" ")[0]}</div>
                      <div className="min-w-0">
                        <p className="font-medium truncate text-card-foreground">{r.nome}</p>
                        <p className="text-[10px] text-muted-foreground">{r.atendimentos} atendimento{r.atendimentos !== 1 ? "s" : ""} • {r.frequencia <= 30 ? "Ativo" : "Inativo"}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-semibold text-card-foreground">
                        {r.totalGasto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </p>
                      <Badge variant="secondary" className={`text-[10px] ${r.categoria === "🥇 Ouro" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                          r.categoria === "🥈 Prata" ? "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" :
                            "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
                        }`}>{r.categoria}</Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function DeleteBtn({ id, onDone }: { id: string; onDone: () => void }) {
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cliente removida"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir cliente?")) mut.mutate(); }}>
      <Trash2 className="size-4 text-destructive" />
    </Button>
  );
}

function ClienteDialog({ cliente, onSaved, trigger }: { cliente?: Cliente; onSaved: () => void; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: cliente?.nome ?? "",
    telefone: cliente?.telefone ?? "",
    email: cliente?.email ?? "",
    data_nascimento: cliente?.data_nascimento ?? "",
    observacoes: cliente?.observacoes ?? "",
    alergias: cliente?.alergias ?? "",
    servico_favorito: cliente?.servico_favorito ?? "",
  });

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const payload = {
        ...parsed.data,
        email: parsed.data.email || null,
        telefone: parsed.data.telefone || null,
        data_nascimento: parsed.data.data_nascimento || null,
        observacoes: parsed.data.observacoes || null,
        alergias: parsed.data.alergias || null,
        servico_favorito: parsed.data.servico_favorito || null,
      };
      if (cliente) {
        const { error } = await supabase.from("clientes").update(payload).eq("id", cliente.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("clientes").insert({ ...payload, user_id: u.user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(cliente ? "Cliente atualizada" : "Cliente cadastrada"); onSaved(); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button className="gradient-primary text-primary-foreground shadow-glow"><Plus className="size-4 mr-1" /> Nova cliente</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl">{cliente ? "Editar cliente" : "Nova cliente"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
            <div><Label>Nascimento</Label><Input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} /></div>
          </div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Serviço favorito</Label><Input value={form.servico_favorito} onChange={(e) => setForm({ ...form, servico_favorito: e.target.value })} /></div>
          <div><Label>Alergias</Label><Textarea value={form.alergias} onChange={(e) => setForm({ ...form, alergias: e.target.value })} rows={2} /></div>
          <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} /></div>
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending} className="gradient-primary text-primary-foreground shadow-glow w-full">
              {mut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
