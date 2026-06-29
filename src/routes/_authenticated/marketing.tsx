import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fallbackDb } from "@/lib/fallback-db";
import { Plus, Pencil, Trash2, Award, Percent, Gift, Settings, Sparkles, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/marketing")({
  head: () => ({ meta: [{ title: "Fidelidade & Promoções — Manicure Fácil" }] }),
  component: MarketingPage,
});

type FidConfig = {
  user_id: string;
  ativo: boolean;
  pontos_por_real: number;
  pontos_resgate: number;
  premio_resgate: string;
  niver_promo_ativa: boolean;
  niver_desconto_porcentagem: number;
  niver_dias_validade: number;
};

type FidPonto = {
  id: string;
  cliente_id: string;
  saldo_pontos: number;
  cliente_nome?: string;
  cliente_telefone?: string | null;
};

type Promo = {
  id: string;
  nome: string;
  ativo: boolean;
  tipo: "desconto_porcentagem" | "valor_fixo";
  valor: number;
  data_inicio: string | null;
  data_fim: string | null;
  servicos_elegiveis: any;
  user_id?: string;
};

type Client = {
  id: string;
  nome: string;
  telefone: string | null;
};

type Serv = {
  id: string;
  nome: string;
};

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Mock defaults
const defaultFidConfig: FidConfig = {
  user_id: "local",
  ativo: false,
  pontos_por_real: 1.00,
  pontos_resgate: 100,
  premio_resgate: "Pé e Mão Completo",
  niver_promo_ativa: false,
  niver_desconto_porcentagem: 15.00,
  niver_dias_validade: 7,
};

const defaultPromos: Promo[] = [
  { id: "pr1", nome: "Boas-vindas Boss", ativo: true, tipo: "desconto_porcentagem", valor: 10, data_inicio: null, data_fim: null, servicos_elegiveis: null },
  { id: "pr2", nome: "Combo Terça Gold", ativo: true, tipo: "valor_fixo", valor: 20, data_inicio: null, data_fim: null, servicos_elegiveis: null },
];

function MarketingPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("fidelidade");

  // Query Loyalty Config
  const fidConfigQuery = useQuery({
    queryKey: ["fidelidade_config"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("fidelidade_config").select("*").maybeSingle();
        if (error) throw error;
        if (!data) {
          // Check if user is logged in
          const u = (await supabase.auth.getUser()).data.user;
          if (u) {
            // Auto create config
            const { data: inserted } = await supabase.from("fidelidade_config").insert({
              user_id: u.id,
              ativo: false,
              pontos_por_real: 1,
              pontos_resgate: 100,
              premio_resgate: "Pé e Mão Completo",
            }).select().single();
            if (inserted) return inserted as FidConfig;
          }
          return defaultFidConfig;
        }
        return data as FidConfig;
      } catch (e) {
        console.warn("Using local config fallback", e);
        const configs = fallbackDb.get<FidConfig>("fidelidade_config", [defaultFidConfig]);
        return configs[0];
      }
    },
  });

  // Query Loyalty Points per client
  const fidPointsQuery = useQuery({
    queryKey: ["fidelidade_pontos"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("fidelidade_pontos").select("*");
        if (error) throw error;
        return data as FidPonto[];
      } catch (e) {
        return fallbackDb.get<FidPonto>("fidelidade_pontos", []);
      }
    },
  });

  // Query Promotions
  const promosQuery = useQuery({
    queryKey: ["promocoes"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("promocoes").select("*").order("nome");
        if (error) throw error;
        return data as Promo[];
      } catch (e) {
        return fallbackDb.get<Promo>("promocoes", defaultPromos);
      }
    },
  });

  // Query Clients (for loyalty names matching)
  const clientsQuery = useQuery({
    queryKey: ["clientes-marketing"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("clientes").select("id, nome, telefone");
        if (error) throw error;
        return data as Client[];
      } catch (e) {
        return [] as Client[];
      }
    },
  });

  // Query Services (for promo filtering)
  const servicesQuery = useQuery({
    queryKey: ["servicos-marketing"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("servicos").select("id, nome");
        if (error) throw error;
        return data as Serv[];
      } catch (e) {
        return [] as Serv[];
      }
    },
  });

  const config = fidConfigQuery.data ?? defaultFidConfig;
  const promotions = promosQuery.data ?? [];
  const clients = clientsQuery.data ?? [];
  const services = servicesQuery.data ?? [];

  const loyaltyPointsList = useMemo(() => {
    const rawPts = fidPointsQuery.data ?? [];
    return rawPts.map(p => {
      const match = clients.find(c => c.id === p.cliente_id);
      return {
        ...p,
        cliente_nome: match?.nome ?? "Cliente desconhecido",
        cliente_telefone: match?.telefone ?? "N/A",
      };
    });
  }, [fidPointsQuery.data, clients]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["fidelidade_config"] });
    qc.invalidateQueries({ queryKey: ["fidelidade_pontos"] });
    qc.invalidateQueries({ queryKey: ["promocoes"] });
  };

  // Mutations
  const updateConfigMut = useMutation({
    mutationFn: async (updated: Partial<FidConfig>) => {
      try {
        const { error } = await supabase.from("fidelidade_config").update(updated).eq("user_id", config.user_id);
        if (error) throw error;
      } catch (e) {
        const localConfigs = fallbackDb.get<FidConfig>("fidelidade_config", [defaultFidConfig]);
        const matched = localConfigs[0] ?? defaultFidConfig;
        const saved = { ...matched, ...updated };
        fallbackDb.set("fidelidade_config", [saved]);
      }
    },
    onSuccess: () => {
      toast.success("Configurações salvas com sucesso!");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePromoMut = useMutation({
    mutationFn: async (id: string) => {
      try {
        const { error } = await supabase.from("promocoes").delete().eq("id", id);
        if (error) throw error;
      } catch (e) {
        fallbackDb.delete("promocoes", id, defaultPromos);
      }
    },
    onSuccess: () => {
      toast.success("Promoção excluída");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Marketing & Fidelização"
        subtitle="Configure fidelidade, crie promoções e atraia mais clientes"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white dark:bg-card border-0 p-1.5 rounded-2xl shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
          <TabsTrigger value="fidelidade" className="rounded-xl flex items-center gap-1.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20"><Award className="size-4" /> Cartão Fidelidade</TabsTrigger>
          <TabsTrigger value="promocoes" className="rounded-xl flex items-center gap-1.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20"><Percent className="size-4" /> Cupons & Promoções</TabsTrigger>
          <TabsTrigger value="aniversariantes" className="rounded-xl flex items-center gap-1.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20"><Gift className="size-4" /> Promoções de Aniversário</TabsTrigger>
        </TabsList>

        {/* TAB 1: CARTÃO FIDELIDADE */}
        <TabsContent value="fidelidade" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Form settings */}
            <Card className="bg-white dark:bg-card border-0 rounded-2xl p-5 md:col-span-1 flex flex-col justify-between shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="size-11 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 grid place-items-center shadow-lg shadow-purple-500/20"><Award className="size-5 text-white" /></div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Programa Ativo</Label>
                    <Switch checked={config.ativo} onCheckedChange={(val) => updateConfigMut.mutate({ ativo: val })} />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-sm">Pontos por Real Gasto (R$)</Label>
                    <Input type="number" step="0.1" value={config.pontos_por_real} onChange={e => updateConfigMut.mutate({ pontos_por_real: Number(e.target.value) })} disabled={!config.ativo} />
                    <span className="text-[10px] text-muted-foreground mt-1 block">R$1,00 gasto = {config.pontos_por_real} ponto(s) acumulado(s)</span>
                  </div>

                  <div>
                    <Label className="text-sm">Pontos para Resgate</Label>
                    <Input type="number" value={config.pontos_resgate} onChange={e => updateConfigMut.mutate({ pontos_resgate: Number(e.target.value) })} disabled={!config.ativo} />
                    <span className="text-[10px] text-muted-foreground mt-1 block">Saldo mínimo necessário para resgatar o prêmio</span>
                  </div>

                  <div>
                    <Label className="text-sm">Prêmio / Recompensa</Label>
                    <Input value={config.premio_resgate} onChange={e => updateConfigMut.mutate({ premio_resgate: e.target.value })} disabled={!config.ativo} />
                    <span className="text-[10px] text-muted-foreground mt-1 block">Descrição do benefício (ex: Manicure Grátis, 50% de desconto)</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-purple-100/50 dark:border-purple-400/10 pt-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-500/10 dark:to-pink-500/10 p-4 rounded-xl">
                <p className="text-xs text-purple-600 dark:text-purple-400 leading-relaxed font-medium">
                  {config.ativo
                    ? `Ativo: A cada serviço concluído, o cliente acumulará pontos. Ao atingir ${config.pontos_resgate} pontos, poderá resgatar: "${config.premio_resgate}".`
                    : "Programa de fidelidade desativado. Ative para começar a pontuar seus clientes nas visitas ou vendas de produtos."}
                </p>
              </div>
            </Card>

            {/* List clients points balances */}
            <Card className="bg-white dark:bg-card border-0 rounded-2xl p-5 md:col-span-2 space-y-4 shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-lg">Pontuação dos Clientes</h3>
                  <p className="text-xs text-muted-foreground">Saldos atuais acumulados</p>
                </div>
                <PointsAdjustmentDialog clients={clients} onSaved={invalidate} />
              </div>

              <div className="overflow-hidden border border-border/40 rounded-xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="text-right">Pontos Acumulados</TableHead>
                      <TableHead className="text-center">Status de Resgate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fidPointsQuery.isLoading ? (
                      [1, 2].map(i => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-24 mx-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : loyaltyPointsList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                          Nenhum cliente possui pontos acumulados ainda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      loyaltyPointsList.map(pts => {
                        const canRedeem = pts.saldo_pontos >= config.pontos_resgate;
                        return (
                          <TableRow key={pts.id}>
                            <TableCell className="font-medium">{pts.cliente_nome}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{pts.cliente_telefone}</TableCell>
                            <TableCell className="text-right font-display font-bold text-lg">{pts.saldo_pontos} pts</TableCell>
                            <TableCell className="text-center">
                              {canRedeem ? (
                                <Badge variant="secondary" className="animate-pulse rounded-full text-[10px] bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-transparent">Apto a Resgatar</Badge>
                              ) : (
                                <Badge variant="secondary" className="rounded-full text-[10px] opacity-60">Falta {config.pontos_resgate - pts.saldo_pontos} pts</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: PROMOÇÕES */}
        <TabsContent value="promocoes" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl">Cupons de Desconto & Promoções</h2>
              <p className="text-sm text-muted-foreground">Gerencie descontos para agendamentos e vendas</p>
            </div>
            <PromoDialog services={services} onSaved={invalidate} />
          </div>

          {promosQuery.isLoading ? (
            <div className="grid md:grid-cols-3 gap-4">
              {[1, 2].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
            </div>
          ) : promotions.length === 0 ? (
            <Card className="bg-white dark:bg-card border-0 rounded-2xl p-10 text-center text-muted-foreground shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
              Nenhuma promoção ou cupom cadastrado.
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {promotions.map(promo => {
                return (
                  <Card key={promo.id} className={`bg-white dark:bg-card border-0 rounded-2xl p-5 flex flex-col justify-between shadow-[0_2px_16px_rgba(91,30,140,0.04)] hover:shadow-[0_8px_30px_rgba(122,44,191,0.08)] transition-all duration-300 ${!promo.ativo ? "opacity-60" : ""}`}>
                    <div>
                      <div className="flex items-center justify-between">
                        <Badge className="bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20 font-mono font-bold tracking-wider">{promo.nome}</Badge>
                        <div className="flex gap-1">
                          <Switch checked={promo.ativo} onCheckedChange={async (val) => {
                            try {
                              const { error } = await supabase.from("promocoes").update({ ativo: val }).eq("id", promo.id);
                              if (error) throw error;
                            } catch {
                              fallbackDb.update<Promo>("promocoes", promo.id, { ativo: val }, defaultPromos);
                            }
                            toast.success(val ? "Promoção ativada" : "Promoção pausada");
                            invalidate();
                          }} />
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                            if (confirm(`Excluir promoção ${promo.nome}?`)) deletePromoMut.mutate(promo.id);
                          }}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Desconto</span>
                        <span className="font-display text-2xl font-bold block text-primary mt-1">
                          {promo.tipo === "desconto_porcentagem" ? `${promo.valor}% Off` : `${brl(promo.valor)} de desconto`}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-border/40 pt-3 text-xs text-muted-foreground flex justify-between items-center">
                      <span>Válido para: {promo.servicos_elegiveis ? "Serviços específicos" : "Todos os serviços"}</span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 3: PROMOÇÕES DE ANIVERSÁRIO */}
        <TabsContent value="aniversariantes">
          <Card className="bg-white dark:bg-card border-0 rounded-2xl p-6 max-w-xl mx-auto space-y-6 shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 grid place-items-center shadow-lg shadow-purple-500/20">
                <Gift className="size-5 text-white" />
              </div>
              <div>
                <h3 className="font-display text-xl">Desconto para Aniversariantes</h3>
                <p className="text-xs text-muted-foreground">Premie suas clientes na semana do aniversário</p>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/40">
              <div className="flex items-center justify-between bg-accent/20 p-4 rounded-xl">
                <div>
                  <Label className="text-sm font-bold block">Ativar Promoção Automática</Label>
                  <span className="text-xs text-muted-foreground">Aplica o desconto na tela de agendamento público</span>
                </div>
                <Switch checked={config.niver_promo_ativa} onCheckedChange={val => updateConfigMut.mutate({ niver_promo_ativa: val })} />
              </div>

              <div>
                <Label className="text-sm">Porcentagem de Desconto (%)</Label>
                <Input type="number" min="1" max="100" value={config.niver_desconto_porcentagem} onChange={e => updateConfigMut.mutate({ niver_desconto_porcentagem: Number(e.target.value) })} disabled={!config.niver_promo_ativa} />
              </div>

              <div>
                <Label className="text-sm">Validade do Desconto (Dias)</Label>
                <Input type="number" min="1" value={config.niver_dias_validade} onChange={e => updateConfigMut.mutate({ niver_dias_validade: Number(e.target.value) })} disabled={!config.niver_promo_ativa} />
                <span className="text-[10px] text-muted-foreground mt-1 block">Número de dias em torno do aniversário do cliente para aplicar o cupom (ex: 7 dias = 3 dias antes, no dia, e 3 dias depois)</span>
              </div>
            </div>              <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-500/10 dark:to-pink-500/10 p-4 rounded-xl flex items-start gap-2.5 text-xs text-purple-600 dark:text-purple-400 leading-relaxed font-medium">
              <Sparkles className="size-4 shrink-0 text-purple-500 mt-0.5" />
              <span>
                {config.niver_promo_ativa
                  ? `Configurado: Clientes aniversariantes do mês receberão automaticamente ${config.niver_desconto_porcentagem}% de desconto no agendamento público se agendarem dentro de uma janela de ${config.niver_dias_validade} dias do seu aniversário.`
                  : "Promoção de aniversário inativa. Ative para presentear suas clientes e incentivar visitas recorrentes no mês de aniversário."}
              </span>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

// Dialog to adjust points manually
function PointsAdjustmentDialog({ clients, onSaved }: { clients: Client[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    cliente_id: "",
    pontos: 10,
    tipo: "ganho" as "ganho" | "resgate",
    descricao: "",
  });
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cliente_id) { toast.error("Selecione um cliente"); return; }
    if (form.pontos <= 0) { toast.error("Insira pontos maiores que 0"); return; }
    if (!form.descricao.trim()) { toast.error("Informe a descrição do motivo"); return; }

    setIsPending(true);

    try {
      const user = (await supabase.auth.getUser()).data.user;

      // Fetch current balance
      const { data: pts } = await supabase.from("fidelidade_pontos").select("*").eq("user_id", user!.id).eq("cliente_id", form.cliente_id).maybeSingle();
      const currentPts = pts ? pts.saldo_pontos : 0;

      let newPts = currentPts;
      if (form.tipo === "ganho") {
        newPts += form.pontos;
      } else {
        if (currentPts < form.pontos) {
          throw new Error(`Saldo insuficiente para resgate. Saldo do cliente: ${currentPts} pts.`);
        }
        newPts -= form.pontos;
      }

      // 1. Insert History
      await supabase.from("fidelidade_historico").insert({
        user_id: user!.id,
        cliente_id: form.cliente_id,
        pontos: form.pontos,
        tipo: form.tipo,
        descricao: form.descricao.trim(),
      });

      // 2. Update Points balance
      if (pts) {
        await supabase.from("fidelidade_pontos").update({ saldo_pontos: newPts }).eq("id", pts.id);
      } else {
        await supabase.from("fidelidade_pontos").insert({
          user_id: user!.id,
          cliente_id: form.cliente_id,
          saldo_pontos: newPts
        });
      }

    } catch (err: any) {
      console.warn("Using local fallback in loyalty points adjustment", err);
      // Fallback
      const localPts = fallbackDb.get<any>("fidelidade_pontos", []);
      const matched = localPts.find((p: any) => p.cliente_id === form.cliente_id);
      const currentPts = matched ? matched.saldo_pontos : 0;

      let newPts = currentPts;
      if (form.tipo === "ganho") {
        newPts += form.pontos;
      } else {
        if (currentPts < form.pontos) {
          toast.error(`Saldo insuficiente! Cliente tem apenas ${currentPts} pts.`);
          setIsPending(false);
          return;
        }
        newPts -= form.pontos;
      }

      if (matched) {
        matched.saldo_pontos = newPts;
        matched.updated_at = new Date().toISOString();
      } else {
        localPts.push({
          id: crypto.randomUUID(),
          user_id: "local",
          cliente_id: form.cliente_id,
          saldo_pontos: newPts,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      fallbackDb.set("fidelidade_pontos", localPts);

      fallbackDb.insert<any>("fidelidade_historico", {
        user_id: "local",
        cliente_id: form.cliente_id,
        pontos: form.pontos,
        tipo: form.tipo,
        descricao: form.descricao.trim(),
        data: new Date().toISOString()
      }, []);
    }

    toast.success("Pontos atualizados com sucesso!");
    onSaved();
    setOpen(false);
    setForm({ cliente_id: "", pontos: 10, tipo: "ganho", descricao: "" });
    setIsPending(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="glass h-9 text-xs"><Plus className="size-3.5 mr-1" /> Ajustar Pontos</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Ajustar Pontos de Fidelidade</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Cliente *</Label>
            <Select value={form.cliente_id} onValueChange={val => setForm({ ...form, cliente_id: val })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ação</Label>
              <Select value={form.tipo} onValueChange={(val: any) => setForm({ ...form, tipo: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ganho">Adicionar Pontos</SelectItem>
                  <SelectItem value="resgate">Resgatar / Debitar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pontos *</Label>
              <Input type="number" min="1" value={form.pontos} onChange={e => setForm({ ...form, pontos: Number(e.target.value) })} required />
            </div>
          </div>

          <div>
            <Label>Descrição / Motivo *</Label>
            <Input value={form.descricao} placeholder="Ex: Bônus de aniversário, resgate de Pé e Mão..." onChange={e => setForm({ ...form, descricao: e.target.value })} required />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending} className="gradient-primary text-primary-foreground w-full">
              {isPending ? "Processando..." : "Salvar Lançamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Dialog: Add/Edit promotion cupom
function PromoDialog({ services, onSaved }: { services: Serv[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    ativo: true,
    tipo: "desconto_porcentagem" as "desconto_porcentagem" | "valor_fixo",
    valor: 10,
    data_inicio: "",
    data_fim: "",
  });
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Insira o código do cupom"); return; }
    if (form.valor <= 0) { toast.error("Insira um valor maior que 0"); return; }

    setIsPending(true);

    const payload = {
      nome: form.nome.toUpperCase().replace(/\s+/g, ""),
      ativo: form.ativo,
      tipo: form.tipo,
      valor: Number(form.valor),
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
      servicos_elegiveis: null,
    };

    try {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("promocoes").insert({
        ...payload,
        user_id: user!.id,
      });
      if (error) throw error;
    } catch {
      fallbackDb.insert<Promo>("promocoes", {
        user_id: "local",
        ...payload,
      } as any, defaultPromos);
    }

    toast.success("Promoção cadastrada com sucesso!");
    onSaved();
    setOpen(false);
    setForm({ nome: "", ativo: true, tipo: "desconto_porcentagem", valor: 10, data_inicio: "", data_fim: "" });
    setIsPending(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gradient-primary text-primary-foreground shadow-glow"><Plus className="size-4 mr-1" /> Criar Cupom</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Novo Cupom Promocional</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome do Cupom (Código sem espaços) *</Label>
            <Input value={form.nome} placeholder="Ex: QUEROUNHAS10" onChange={e => setForm({ ...form, nome: e.target.value })} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo de Desconto</Label>
              <Select value={form.tipo} onValueChange={(val: any) => setForm({ ...form, tipo: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desconto_porcentagem">Porcentagem (%)</SelectItem>
                  <SelectItem value="valor_fixo">Valor Fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor do Desconto *</Label>
              <Input type="number" min="1" value={form.valor} onChange={e => setForm({ ...form, valor: Number(e.target.value) })} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data Início (Opcional)</Label>
              <Input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} />
            </div>
            <div>
              <Label>Data Fim (Opcional)</Label>
              <Input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label>Ativar Cupom Imediatamente</Label>
            <Switch checked={form.ativo} onCheckedChange={val => setForm({ ...form, ativo: val })} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending} className="gradient-primary text-primary-foreground w-full">
              {isPending ? "Criando..." : "Criar Promoção"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
