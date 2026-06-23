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
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fallbackDb } from "@/lib/fallback-db";
import { Plus, Pencil, Trash2, Package, ShoppingCart, ArrowUpDown, AlertTriangle, Check, Trash, Box } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({ meta: [{ title: "Estoque & Vendas — Manicure Fácil" }] }),
  component: EstoquePage,
});

type Prod = {
  id: string;
  nome: string;
  descricao: string | null;
  preco_venda: number;
  preco_custo: number;
  quantidade: number;
  quantidade_minima: number;
  created_at: string;
  user_id?: string;
};

type Mov = {
  id: string;
  produto_id: string;
  tipo: "entrada" | "saida";
  quantidade: number;
  motivo: string;
  data: string;
  created_at: string;
  produto_nome?: string;
  user_id?: string;
};

type Client = {
  id: string;
  nome: string;
  telefone: string | null;
};

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Default Mock Data
const defaultProds: Prod[] = [
  { id: "p1", nome: "Base Fortalecedora Premium", descricao: "Base de tratamento nutritiva para unhas fracas", preco_venda: 18.00, preco_custo: 6.00, quantidade: 15, quantidade_minima: 5, created_at: new Date().toISOString() },
  { id: "p2", nome: "Esmalte Gel Rosé Luxo", descricao: "Esmalte gel de alta durabilidade cor Rosé", preco_venda: 28.00, preco_custo: 12.00, quantidade: 3, quantidade_minima: 5, created_at: new Date().toISOString() },
  { id: "p3", nome: "Óleo de Cutículas Champagne", descricao: "Hidratante com fragrância suave e brilho dourado", preco_venda: 15.00, preco_custo: 5.00, quantidade: 25, quantidade_minima: 8, created_at: new Date().toISOString() },
];

const defaultMovs: Mov[] = [
  { id: "m1", produto_id: "p1", tipo: "entrada", quantidade: 15, motivo: "Estoque Inicial", data: new Date().toISOString(), created_at: new Date().toISOString() },
  { id: "m2", produto_id: "p2", tipo: "entrada", quantidade: 5, motivo: "Estoque Inicial", data: new Date().toISOString(), created_at: new Date().toISOString() },
  { id: "m3", produto_id: "p3", tipo: "entrada", quantidade: 25, motivo: "Estoque Inicial", data: new Date().toISOString(), created_at: new Date().toISOString() },
  { id: "m4", produto_id: "p2", tipo: "saida", quantidade: 2, motivo: "Venda PDV", data: new Date().toISOString(), created_at: new Date().toISOString() },
];

function EstoquePage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("estoque");

  // Query Products
  const prodsQuery = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("produtos").select("*").order("nome");
        if (error) throw error;
        return data as Prod[];
      } catch (e) {
        console.warn("Using local fallback for produtos", e);
        return fallbackDb.get<Prod>("produtos", defaultProds);
      }
    },
  });

  // Query Movements
  const movsQuery = useQuery({
    queryKey: ["movimentacoes_estoque"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("movimentacoes_estoque").select("*").order("data", { ascending: false });
        if (error) throw error;
        return data as Mov[];
      } catch (e) {
        console.warn("Using local fallback for movimentacoes", e);
        return fallbackDb.get<Mov>("movimentacoes_estoque", defaultMovs);
      }
    },
  });

  // Query Clients
  const clientsQuery = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("clientes").select("id, nome, telefone").order("nome");
        if (error) throw error;
        return data as Client[];
      } catch (e) {
        return [] as Client[];
      }
    },
  });

  const products = prodsQuery.data ?? [];
  const movements = useMemo(() => {
    const rawMovs = movsQuery.data ?? [];
    return rawMovs.map(m => ({
      ...m,
      produto_nome: products.find(p => p.id === m.produto_id)?.nome ?? "Produto desconhecido",
    }));
  }, [movsQuery.data, products]);

  // Actions/Mutations
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["produtos"] });
    qc.invalidateQueries({ queryKey: ["movimentacoes_estoque"] });
  };

  const deleteProdMut = useMutation({
    mutationFn: async (id: string) => {
      try {
        const { error } = await supabase.from("produtos").delete().eq("id", id);
        if (error) throw error;
      } catch (e) {
        fallbackDb.delete("produtos", id, defaultProds);
      }
    },
    onSuccess: () => {
      toast.success("Produto removido com sucesso");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Estoque & Vendas"
        subtitle="Gerencie seus produtos, estoque e realize vendas rápidas"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white dark:bg-card border-0 p-1.5 rounded-2xl shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
          <TabsTrigger value="estoque" className="rounded-xl flex items-center gap-1.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20"><Package className="size-4" /> Estoque</TabsTrigger>
          <TabsTrigger value="movimentacoes" className="rounded-xl flex items-center gap-1.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20"><ArrowUpDown className="size-4" /> Movimentações</TabsTrigger>
          <TabsTrigger value="vendas" className="rounded-xl flex items-center gap-1.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20"><ShoppingCart className="size-4" /> Frente de Caixa</TabsTrigger>
        </TabsList>

        {/* TAB 1: ESTOQUE */}
        <TabsContent value="estoque">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <h2 className="font-display text-xl">Controle de Inventário</h2>
            <ProductDialog onSaved={invalidate} products={products} />
          </div>

          {prodsQuery.isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-36 rounded-2xl" />)}
            </div>
          ) : products.length === 0 ? (
            <Card className="bg-white dark:bg-card border-0 rounded-2xl p-12 text-center shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
              <div className="size-16 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-500/20 dark:to-pink-500/20 grid place-items-center mx-auto mb-4">
                <Package className="size-7 text-purple-500" />
              </div>
              <p className="text-muted-foreground">Nenhum produto cadastrado no estoque.</p>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map(p => {
                const lowStock = p.quantidade <= p.quantidade_minima;
                return (
                  <Card key={p.id} className={`group bg-white dark:bg-card border-0 rounded-2xl p-5 shadow-[0_2px_16px_rgba(91,30,140,0.04)] hover:shadow-[0_8px_30px_rgba(122,44,191,0.08)] transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden ${lowStock ? "border-l-4 border-l-red-400" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-base">{p.nome}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.descricao || "Sem descrição"}</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <ProductDialog serv={p} onSaved={invalidate} products={products} trigger={
                          <Button size="icon" variant="ghost" className="hover:bg-purple-100 dark:hover:bg-purple-500/20"><Pencil className="size-4 text-purple-500" /></Button>
                        } />
                        <Button size="icon" variant="ghost" className="hover:bg-red-100 dark:hover:bg-red-500/20" onClick={() => {
                          if (confirm(`Deseja mesmo excluir ${p.nome}?`)) deleteProdMut.mutate(p.id);
                        }}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="bg-gradient-to-b from-purple-50/50 to-transparent dark:from-purple-500/5 dark:to-transparent rounded-xl p-3 text-center">
                        <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">Estoque</span>
                        <span className={`font-display text-2xl font-bold mt-1 block ${lowStock ? "text-red-500" : ""}`}>
                          {p.quantidade}
                        </span>
                      </div>
                      <div className="bg-gradient-to-b from-pink-50/50 to-transparent dark:from-pink-500/5 dark:to-transparent rounded-xl p-3 text-center">
                        <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">Preço Venda</span>
                        <span className="font-display text-xl text-purple-600 dark:text-purple-400 font-bold mt-1 block">
                          {brl(p.preco_venda)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground border-t border-purple-100/50 dark:border-purple-400/10 pt-3">
                      <span>Custo: <span className="font-medium">{brl(p.preco_custo)}</span></span>
                      <span>Mínimo: <span className="font-medium">{p.quantidade_minima} un</span></span>
                    </div>

                    {lowStock && (
                      <div className="mt-3 flex items-center gap-1.5 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-xl text-xs font-medium">
                        <AlertTriangle className="size-4 shrink-0" />
                        Estoque Baixo! Repor urgente.
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: MOVIMENTAÇÕES */}
        <TabsContent value="movimentacoes">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="font-display text-xl">Histórico de Movimentações</h2>
              <p className="text-sm text-muted-foreground">Entradas e saídas de estoque registradas</p>
            </div>
            <MovementDialog products={products} onSaved={invalidate} />
          </div>

          <Card className="bg-white dark:bg-card border-0 rounded-2xl overflow-hidden shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-purple-100/50 dark:border-purple-400/10">
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Produto</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Tipo</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Qtd</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Motivo</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movsQuery.isLoading ? (
                  [1, 2, 3].map(i => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-5 w-8 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhuma movimentação de estoque registrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map(m => (
                    <TableRow key={m.id} className="border-b border-purple-100/30 dark:border-purple-400/5">
                      <TableCell className="font-medium">{m.produto_nome}</TableCell>
                      <TableCell>
                        <Badge variant={m.tipo === "entrada" ? "secondary" : "destructive"} className={`rounded-full text-[10px] px-2.5 ${m.tipo === "entrada" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 hover:bg-emerald-100 border-transparent" : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 hover:bg-red-100 border-transparent"}`}>
                          {m.tipo === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-bold ${m.tipo === "entrada" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {m.tipo === "entrada" ? "+" : "-"}{m.quantidade}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.motivo}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(m.data), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* TAB 3: POS / VENDAS */}
        <TabsContent value="vendas">
          <SalesPOS products={products} clients={clientsQuery.data ?? []} onCompleted={invalidate} />
        </TabsContent>
      </Tabs>
    </>
  );
}

// Dialog: Add/Edit Product
function ProductDialog({ serv, onSaved, products, trigger }: { serv?: Prod; onSaved: () => void; products: Prod[]; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: serv?.nome ?? "",
    descricao: serv?.descricao ?? "",
    preco_venda: serv?.preco_venda ?? 0,
    preco_custo: serv?.preco_custo ?? 0,
    quantidade: serv?.quantidade ?? 0,
    quantidade_minima: serv?.quantidade_minima ?? 5,
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Nome do produto é obrigatório");
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        preco_venda: Number(form.preco_venda),
        preco_custo: Number(form.preco_custo),
        quantidade: Number(form.quantidade),
        quantidade_minima: Number(form.quantidade_minima),
      };

      try {
        if (serv) {
          const diff = payload.quantidade - serv.quantidade;
          if (diff !== 0) {
            const type = diff > 0 ? "entrada" : "saida";
            const user = (await supabase.auth.getUser()).data.user;
            await supabase.from("movimentacoes_estoque").insert({
              user_id: user!.id,
              produto_id: serv.id,
              tipo: type,
              quantidade: Math.abs(diff),
              motivo: "Ajuste manual de saldo",
            });
          }

          const { error } = await supabase.from("produtos").update(payload).eq("id", serv.id);
          if (error) throw error;
        } else {
          const user = (await supabase.auth.getUser()).data.user;
          const { data: inserted, error } = await supabase.from("produtos").insert({
            ...payload,
            user_id: user!.id,
          }).select().single();
          
          if (error) throw error;

          if (payload.quantidade > 0 && inserted) {
            await supabase.from("movimentacoes_estoque").insert({
              user_id: user!.id,
              produto_id: inserted.id,
              tipo: "entrada",
              quantidade: payload.quantidade,
              motivo: "Estoque Inicial",
            });
          }
        }
      } catch (e) {
        console.warn("Using local fallback in save product", e);
        if (serv) {
          const diff = payload.quantidade - serv.quantidade;
          if (diff !== 0) {
            fallbackDb.insert<Mov>("movimentacoes_estoque", {
              user_id: "local",
              produto_id: serv.id,
              tipo: diff > 0 ? "entrada" : "saida",
              quantidade: Math.abs(diff),
              motivo: "Ajuste manual de saldo",
              data: new Date().toISOString(),
            } as any, defaultMovs);
          }
          fallbackDb.update<Prod>("produtos", serv.id, payload, defaultProds);
        } else {
          const inserted = fallbackDb.insert<Prod>("produtos", {
            user_id: "local",
            ...payload,
          } as any, defaultProds);

          if (payload.quantidade > 0) {
            fallbackDb.insert<Mov>("movimentacoes_estoque", {
              user_id: "local",
              produto_id: inserted.id,
              tipo: "entrada",
              quantidade: payload.quantidade,
              motivo: "Estoque Inicial",
              data: new Date().toISOString(),
            } as any, defaultMovs);
          }
        }
      }
    },
    onSuccess: () => {
      toast.success(serv ? "Produto atualizado!" : "Produto cadastrado!");
      onSaved();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button className="bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all"><Plus className="size-4 mr-1" /> Novo Produto</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{serv ? "Editar Produto" : "Novo Produto"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
          <div>
            <Label>Nome do Produto *</Label>
            <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required className="rounded-xl border-purple-200/40 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} className="rounded-xl border-purple-200/40 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Preço de Venda (R$)</Label>
              <Input type="number" step="0.01" value={form.preco_venda} onChange={e => setForm({ ...form, preco_venda: Number(e.target.value) })} className="rounded-xl border-purple-200/40 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20" />
            </div>
            <div>
              <Label>Custo de Aquisição (R$)</Label>
              <Input type="number" step="0.01" value={form.preco_custo} onChange={e => setForm({ ...form, preco_custo: Number(e.target.value) })} className="rounded-xl border-purple-200/40 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Qtd Atual em Estoque</Label>
              <Input type="number" value={form.quantidade} onChange={e => setForm({ ...form, quantidade: Number(e.target.value) })} className="rounded-xl border-purple-200/40 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20" />
            </div>
            <div>
              <Label>Qtd Mínima (Alerta)</Label>
              <Input type="number" value={form.quantidade_minima} onChange={e => setForm({ ...form, quantidade_minima: Number(e.target.value) })} className="rounded-xl border-purple-200/40 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending} className="w-full bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25">
              {mut.isPending ? "Salvando..." : "Salvar Produto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Dialog: Register Manual Stock Movement
function MovementDialog({ products, onSaved }: { products: Prod[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    produto_id: "",
    tipo: "entrada" as "entrada" | "saida",
    quantidade: 1,
    motivo: "",
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!form.produto_id) throw new Error("Selecione um produto");
      if (form.quantidade <= 0) throw new Error("Quantidade deve ser maior que 0");
      if (!form.motivo.trim()) throw new Error("Informe o motivo da movimentação");

      const prod = products.find(p => p.id === form.produto_id);
      if (!prod) throw new Error("Produto inválido");

      if (form.tipo === "saida" && prod.quantidade < form.quantidade) {
        throw new Error(`Saldo insuficiente! Apenas ${prod.quantidade} unidades em estoque.`);
      }

      const newQty = form.tipo === "entrada" ? prod.quantidade + form.quantidade : prod.quantidade - form.quantidade;

      try {
        const user = (await supabase.auth.getUser()).data.user;
        
        const { error: movErr } = await supabase.from("movimentacoes_estoque").insert({
          user_id: user!.id,
          produto_id: form.produto_id,
          tipo: form.tipo,
          quantidade: form.quantidade,
          motivo: form.motivo.trim(),
        });
        if (movErr) throw movErr;

        const { error: prodErr } = await supabase.from("produtos").update({
          quantidade: newQty
        }).eq("id", form.produto_id);
        
        if (prodErr) throw prodErr;

      } catch (e) {
        console.warn("Using local fallback in manually posting movement", e);
        fallbackDb.insert<Mov>("movimentacoes_estoque", {
          user_id: "local",
          produto_id: form.produto_id,
          tipo: form.tipo,
          quantidade: form.quantidade,
          motivo: form.motivo.trim(),
          data: new Date().toISOString(),
        } as any, defaultMovs);

        fallbackDb.update<Prod>("produtos", form.produto_id, {
          quantidade: newQty
        }, defaultProds);
      }
    },
    onSuccess: () => {
      toast.success("Movimentação registrada com sucesso!");
      onSaved();
      setOpen(false);
      setForm({ produto_id: "", tipo: "entrada", quantidade: 1, motivo: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-purple-200/30 hover:bg-purple-50 dark:hover:bg-purple-500/20 hover:border-purple-300 transition-all"><ArrowUpDown className="size-4 mr-1.5" /> Lançar Entrada/Saída</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Lançar Movimentação</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
          <div>
            <Label>Produto *</Label>
            <Select value={form.produto_id} onValueChange={val => setForm({ ...form, produto_id: val })}>
              <SelectTrigger className="rounded-xl border-purple-200/40">
                <SelectValue placeholder="Selecione o produto..." />
              </SelectTrigger>
              <SelectContent>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome} (Qtd: {p.quantidade})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo de Lançamento</Label>
              <Select value={form.tipo} onValueChange={(val: "entrada" | "saida") => setForm({ ...form, tipo: val })}>
                <SelectTrigger className="rounded-xl border-purple-200/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada (Adicionar)</SelectItem>
                  <SelectItem value="saida">Saída (Remover)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade *</Label>
              <Input type="number" min="1" value={form.quantidade} onChange={e => setForm({ ...form, quantidade: Number(e.target.value) })} required className="rounded-xl border-purple-200/40 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20" />
            </div>
          </div>

          <div>
            <Label>Motivo *</Label>
            <Input value={form.motivo} placeholder="Ex: Compra de mercadoria, descarte por validade..." onChange={e => setForm({ ...form, motivo: e.target.value })} required className="rounded-xl border-purple-200/40 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20" />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={mut.isPending} className="w-full bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25">
              {mut.isPending ? "Processando..." : "Confirmar Movimentação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Front Of Cash (POS) Page Content
function SalesPOS({ products, clients, onCompleted }: { products: Prod[]; clients: Client[]; onCompleted: () => void }) {
  const [basket, setBasket] = useState<{ id: string; prod: Prod; qty: number }[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("anonimo");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "dinheiro" | "debito" | "credito">("pix");
  const [discount, setDiscount] = useState<number>(0);
  const [isPending, setIsPending] = useState(false);

  const availableProducts = useMemo(() => {
    return products.filter(p => p.quantidade > 0);
  }, [products]);

  const subtotal = useMemo(() => {
    return basket.reduce((sum, item) => sum + item.prod.preco_venda * item.qty, 0);
  }, [basket]);

  const total = useMemo(() => {
    return Math.max(0, subtotal - discount);
  }, [subtotal, discount]);

  const addToBasket = (prod: Prod) => {
    const existing = basket.find(item => item.id === prod.id);
    if (existing) {
      if (existing.qty >= prod.quantidade) {
        toast.error("Quantidade máxima disponível em estoque atingida!");
        return;
      }
      setBasket(basket.map(item => item.id === prod.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setBasket([...basket, { id: prod.id, prod, qty: 1 }]);
    }
  };

  const updateQty = (id: string, newQty: number, maxQty: number) => {
    if (newQty <= 0) {
      removeFromBasket(id);
      return;
    }
    if (newQty > maxQty) {
      toast.error("Quantidade máxima disponível em estoque atingida!");
      return;
    }
    setBasket(basket.map(item => item.id === id ? { ...item, qty: newQty } : item));
  };

  const removeFromBasket = (id: string) => {
    setBasket(basket.filter(item => item.id !== id));
  };

  const handleCheckout = async () => {
    if (basket.length === 0) {
      toast.error("Seu carrinho de vendas está vazio!");
      return;
    }

    setIsPending(true);
    const clientVal = selectedClient === "anonimo" ? null : selectedClient;

    try {
      const user = (await supabase.auth.getUser()).data.user;

      const { data: sale, error: saleErr } = await supabase.from("vendas").insert({
        user_id: user!.id,
        cliente_id: clientVal,
        total: total,
        pagamento_metodo: paymentMethod,
      }).select().single();

      if (saleErr) throw saleErr;

      for (const item of basket) {
        const { error: itemErr } = await supabase.from("venda_itens").insert({
          user_id: user!.id,
          venda_id: sale.id,
          produto_id: item.id,
          quantidade: item.qty,
          preco_unitario: item.prod.preco_venda,
        });
        if (itemErr) throw itemErr;

        const { error: prodErr } = await supabase.from("produtos").update({
          quantidade: item.prod.quantidade - item.qty,
        }).eq("id", item.id);
        if (prodErr) throw prodErr;

        const { error: movErr } = await supabase.from("movimentacoes_estoque").insert({
          user_id: user!.id,
          produto_id: item.id,
          tipo: "saida",
          quantidade: item.qty,
          motivo: "Venda Frente de Caixa",
        });
        if (movErr) throw movErr;
      }

      if (clientVal) {
        const { data: config } = await supabase.from("fidelidade_config").select("*").eq("user_id", user!.id).maybeSingle();
        if (config && config.ativo) {
          const pointsEarned = Math.floor(total * Number(config.pontos_por_real));
          if (pointsEarned > 0) {
            const { data: pts } = await supabase.from("fidelidade_pontos").select("*").eq("user_id", user!.id).eq("cliente_id", clientVal).maybeSingle();
            
            const currentPoints = pts ? pts.saldo_pontos : 0;
            const newPoints = currentPoints + pointsEarned;

            if (pts) {
              await supabase.from("fidelidade_pontos").update({ saldo_pontos: newPoints }).eq("id", pts.id);
            } else {
              await supabase.from("fidelidade_pontos").insert({
                user_id: user!.id,
                cliente_id: clientVal,
                saldo_pontos: pointsEarned
              });
            }

            await supabase.from("fidelidade_historico").insert({
              user_id: user!.id,
              cliente_id: clientVal,
              pontos: pointsEarned,
              tipo: "ganho",
              descricao: `Pontos ganhos na Venda PDV`,
            });

            toast.success(`Cliente acumulou +${pointsEarned} pontos de fidelidade!`);
          }
        }
      }

    } catch (e) {
      console.warn("Using local fallback in checkout sales PDV", e);
      const fallbackSales = fallbackDb.get<any>("vendas", []);
      const newSaleId = crypto.randomUUID();
      const saleObj = {
        id: newSaleId,
        user_id: "local",
        cliente_id: clientVal,
        total: total,
        pagamento_metodo: paymentMethod,
        data_venda: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      fallbackSales.push(saleObj);
      fallbackDb.set("vendas", fallbackSales);

      for (const item of basket) {
        fallbackDb.update<Prod>("produtos", item.id, {
          quantidade: item.prod.quantidade - item.qty,
        }, defaultProds);

        fallbackDb.insert<Mov>("movimentacoes_estoque", {
          user_id: "local",
          produto_id: item.id,
          tipo: "saida",
          quantidade: item.qty,
          motivo: "Venda Frente de Caixa",
          data: new Date().toISOString()
        } as any, defaultMovs);
      }

      if (clientVal) {
        const localFidConfigs = fallbackDb.get<any>("fidelidade_config", []);
        const config = localFidConfigs.find((c: any) => c.user_id === "local") || { ativo: true, pontos_por_real: 1 };
        
        if (config.ativo) {
          const pointsEarned = Math.floor(total * Number(config.pontos_por_real));
          if (pointsEarned > 0) {
            const localPointsList = fallbackDb.get<any>("fidelidade_pontos", []);
            const pts = localPointsList.find((p: any) => p.cliente_id === clientVal);
            
            if (pts) {
              pts.saldo_pontos += pointsEarned;
              pts.updated_at = new Date().toISOString();
            } else {
              localPointsList.push({
                id: crypto.randomUUID(),
                user_id: "local",
                cliente_id: clientVal,
                saldo_pontos: pointsEarned,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            }
            fallbackDb.set("fidelidade_pontos", localPointsList);

            fallbackDb.insert<any>("fidelidade_historico", {
              user_id: "local",
              cliente_id: clientVal,
              pontos: pointsEarned,
              tipo: "ganho",
              descricao: `Pontos ganhos na Venda PDV (local)`,
              data: new Date().toISOString()
            }, []);

            toast.success(`Cliente acumulou +${pointsEarned} pontos de fidelidade!`);
          }
        }
      }
    }

    toast.success("Venda finalizada com sucesso!");
    setBasket([]);
    setDiscount(0);
    setIsPending(false);
    onCompleted();
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Catálogo de Produtos</h2>
          <span className="text-xs text-muted-foreground">{availableProducts.length} itens disponíveis</span>
        </div>

        {availableProducts.length === 0 ? (
          <Card className="bg-white dark:bg-card border-0 rounded-2xl p-8 text-center text-muted-foreground shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
            Adicione produtos com saldo de estoque positivo para realizar vendas.
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {availableProducts.map(p => (
              <Card key={p.id} className="group bg-white dark:bg-card border-0 rounded-2xl p-4 flex flex-col justify-between hover:border-purple-300/50 dark:hover:border-purple-400/30 border border-purple-100/30 dark:border-purple-400/10 transition-all hover:shadow-[0_8px_30px_rgba(122,44,191,0.08)] shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
                <div>
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-sm">{p.nome}</h3>
                    <Badge variant="secondary" className="text-[10px] rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-transparent">Qtd: {p.quantidade}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{p.descricao || "Sem descrição"}</p>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="font-display font-bold bg-gradient-to-br from-purple-600 to-pink-600 bg-clip-text text-transparent">{brl(p.preco_venda)}</span>
                  <Button size="sm" className="bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20 h-8 rounded-xl text-xs hover:shadow-purple-500/40 transition-all" onClick={() => addToBasket(p)}>
                    Adicionar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-xl">Carrinho</h2>
        <Card className="bg-white dark:bg-card border-0 rounded-2xl p-5 flex flex-col justify-between min-h-[450px] shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
          <div>
            <div className="flex-1 space-y-3 max-h-[200px] overflow-y-auto pr-1">
              {basket.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Carrinho vazio. Adicione produtos ao lado.
                </div>
              ) : (
                basket.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-2 border-b border-purple-100/50 dark:border-purple-400/10 pb-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{item.prod.nome}</p>
                      <p className="text-[10px] text-muted-foreground">{brl(item.prod.preco_venda)} / un</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="number" className="h-7 w-12 text-center text-xs p-1 rounded-lg border-purple-200/40" min="1" max={item.prod.quantidade} value={item.qty} onChange={e => updateQty(item.id, Number(e.target.value), item.prod.quantidade)} />
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20" onClick={() => removeFromBasket(item.id)}>
                        <Trash className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3 pt-4 border-t border-purple-100/50 dark:border-purple-400/10 mt-4">
              <div>
                <Label className="text-xs">Cliente</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger className="h-9 text-xs rounded-xl border-purple-200/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anonimo">Consumidor Geral (Sem Nome)</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Pagamento</Label>
                  <Select value={paymentMethod} onValueChange={(val: any) => setPaymentMethod(val)}>
                    <SelectTrigger className="h-9 text-xs rounded-xl border-purple-200/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="debito">Débito</SelectItem>
                      <SelectItem value="credito">Crédito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Desconto (R$)</Label>
                  <Input type="number" min="0" step="0.01" className="h-9 text-xs rounded-xl border-purple-200/40 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20" value={discount} onChange={e => setDiscount(Number(e.target.value))} />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-purple-100/50 dark:border-purple-400/10 space-y-3">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Subtotal:</span>
              <span>{brl(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-xs text-red-500">
                <span>Desconto:</span>
                <span>-{brl(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <span>Total:</span>
              <span className="bg-gradient-to-br from-purple-600 to-pink-600 bg-clip-text text-transparent">{brl(total)}</span>
            </div>

            <Button className="w-full bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all mt-2" disabled={basket.length === 0 || isPending} onClick={handleCheckout}>
              {isPending ? "Processando..." : "Finalizar Venda"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
