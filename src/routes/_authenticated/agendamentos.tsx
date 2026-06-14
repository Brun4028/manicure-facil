import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Calendar, Clock } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/agendamentos")({
  validateSearch: (s: Record<string, unknown>) => ({ new: s.new ? 1 : undefined }),
  head: () => ({ meta: [{ title: "Agendamentos — Manicure Fácil" }] }),
  component: AgendamentosPage,
});

type Status = "agendado" | "confirmado" | "concluido" | "cancelado";
type Pagamento = "pix" | "dinheiro" | "debito" | "credito" | "pendente";

type Ag = {
  id: string; cliente_id: string | null; servico_id: string | null;
  data_hora: string; duracao_min: number; valor: number; custo: number;
  status: Status; pagamento: Pagamento; observacoes: string | null;
};

const statusColor: Record<Status, string> = {
  agendado: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  confirmado: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  concluido: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  cancelado: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
};

const schema = z.object({
  cliente_id: z.string().uuid("Selecione uma cliente"),
  servico_id: z.string().uuid("Selecione um serviço"),
  data: z.string().min(1, "Informe a data"),
  hora: z.string().min(1, "Informe a hora"),
  valor: z.number().min(0),
  custo: z.number().min(0),
  duracao_min: z.number().min(15).max(600),
  status: z.enum(["agendado","confirmado","concluido","cancelado"]),
  pagamento: z.enum(["pix","dinheiro","debito","credito","pendente"]),
  observacoes: z.string().max(500).optional().or(z.literal("")),
});

function AgendamentosPage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [openNew, setOpenNew] = useState(false);

  useEffect(() => { if (search.new) { setOpenNew(true); navigate({ to: "/agendamentos", search: {} as never, replace: true }); } }, [search.new, navigate]);

  const { data: ags, isLoading } = useQuery({
    queryKey: ["agendamentos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agendamentos")
        .select("*, clientes(nome), servicos(nome)")
        .order("data_hora", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <PageHeader
        title="Agendamentos"
        subtitle="Sua agenda visual"
        actions={
          <AgendamentoDialog
            open={openNew} setOpen={setOpenNew}
            onSaved={() => qc.invalidateQueries({ queryKey: ["agendamentos"] })}
          />
        }
      />

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : !ags?.length ? (
        <Card className="glass border-0 rounded-2xl p-10 text-center">
          <p className="text-muted-foreground">Nenhum agendamento ainda. Clique em <strong>Novo</strong> para começar.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {ags.map((a: any) => (
            <Card key={a.id} className="glass border-0 rounded-2xl p-5">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="size-12 rounded-2xl gradient-primary text-primary-foreground grid place-items-center shrink-0 text-center font-display leading-none">
                    <div>
                      <div className="text-xs opacity-80">{format(new Date(a.data_hora), "MMM", { locale: ptBR }).toUpperCase()}</div>
                      <div className="text-xl">{format(new Date(a.data_hora), "dd")}</div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{a.clientes?.nome ?? "Cliente"}</h3>
                    <p className="text-sm text-muted-foreground truncate">{a.servicos?.nome ?? "Serviço"}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="size-3" />{format(new Date(a.data_hora), "dd/MM/yyyy")}</span>
                      <span className="flex items-center gap-1"><Clock className="size-3" />{format(new Date(a.data_hora), "HH:mm")}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-display text-lg">{Number(a.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                    <Badge variant="outline" className={statusColor[a.status as Status]}>{a.status}</Badge>
                  </div>
                  <AgendamentoDialog ag={a} onSaved={() => qc.invalidateQueries({ queryKey: ["agendamentos"] })} trigger={<Button size="icon" variant="ghost"><Pencil className="size-4" /></Button>} />
                  <DeleteAg id={a.id} onDone={() => qc.invalidateQueries({ queryKey: ["agendamentos"] })} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function DeleteAg({ id, onDone }: { id: string; onDone: () => void }) {
  const mut = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("agendamentos").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Agendamento removido"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir agendamento?")) mut.mutate(); }}><Trash2 className="size-4 text-destructive" /></Button>;
}

function AgendamentoDialog({ ag, onSaved, trigger, open: openProp, setOpen: setOpenProp }: {
  ag?: Ag; onSaved: () => void; trigger?: React.ReactNode;
  open?: boolean; setOpen?: (o: boolean) => void;
}) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = setOpenProp ?? setOpenInternal;

  const [form, setForm] = useState(() => {
    const d = ag ? new Date(ag.data_hora) : new Date();
    return {
      cliente_id: ag?.cliente_id ?? "",
      servico_id: ag?.servico_id ?? "",
      data: format(d, "yyyy-MM-dd"),
      hora: ag ? format(d, "HH:mm") : "09:00",
      valor: Number(ag?.valor ?? 0),
      custo: Number(ag?.custo ?? 0),
      duracao_min: ag?.duracao_min ?? 60,
      status: (ag?.status ?? "agendado") as Status,
      pagamento: (ag?.pagamento ?? "pendente") as Pagamento,
      observacoes: ag?.observacoes ?? "",
    };
  });

  const { data: clientes } = useQuery({ queryKey: ["clientes-list"], queryFn: async () => {
    const { data, error } = await supabase.from("clientes").select("id,nome").order("nome");
    if (error) throw error; return data;
  }, enabled: open });

  const { data: servicos } = useQuery({ queryKey: ["servicos-list"], queryFn: async () => {
    const { data, error } = await supabase.from("servicos").select("id,nome,valor,custo,duracao_min").eq("ativo", true).order("nome");
    if (error) throw error; return data;
  }, enabled: open });

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const data_hora = new Date(`${parsed.data.data}T${parsed.data.hora}:00`).toISOString();

      // Conflict check
      const { data: u } = await supabase.auth.getUser();
      const { data: conflict } = await supabase.from("agendamentos")
        .select("id").eq("user_id", u.user!.id).eq("data_hora", data_hora).neq("status", "cancelado");
      if (conflict?.some(c => c.id !== ag?.id)) throw new Error("Já existe um agendamento neste horário");

      const payload = {
        cliente_id: parsed.data.cliente_id,
        servico_id: parsed.data.servico_id,
        data_hora,
        duracao_min: parsed.data.duracao_min,
        valor: parsed.data.valor,
        custo: parsed.data.custo,
        status: parsed.data.status,
        pagamento: parsed.data.pagamento,
        observacoes: parsed.data.observacoes || null,
      };
      if (ag) {
        const { error } = await supabase.from("agendamentos").update(payload).eq("id", ag.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("agendamentos").insert({ ...payload, user_id: u.user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(ag ? "Agendamento atualizado" : "Agendamento criado"); onSaved(); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button className="gradient-primary text-primary-foreground shadow-glow"><Plus className="size-4 mr-1" /> Novo</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl">{ag ? "Editar agendamento" : "Novo agendamento"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div>
            <Label>Cliente *</Label>
            <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>{clientes?.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Serviço *</Label>
            <Select value={form.servico_id} onValueChange={(v) => {
              const s = servicos?.find(x => x.id === v);
              setForm({ ...form, servico_id: v, valor: s ? Number(s.valor) : form.valor, custo: s ? Number(s.custo) : form.custo, duracao_min: s ? s.duracao_min : form.duracao_min });
            }}>
              <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>{servicos?.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Data</Label><Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
            <div><Label>Hora</Label><Input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} /></div>
            <div><Label>Duração (min)</Label><Input type="number" value={form.duracao_min} onChange={(e) => setForm({ ...form, duracao_min: Number(e.target.value) })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })} /></div>
            <div><Label>Custo (R$)</Label><Input type="number" step="0.01" value={form.custo} onChange={(e) => setForm({ ...form, custo: Number(e.target.value) })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="confirmado">Confirmado</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pagamento</Label>
              <Select value={form.pagamento} onValueChange={(v) => setForm({ ...form, pagamento: v as Pagamento })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="debito">Débito</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Observações</Label><Textarea rows={2} value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
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
