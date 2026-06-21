import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Scissors } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/servicos")({
  head: () => ({ meta: [{ title: "Serviços — Manicure Fácil" }] }),
  component: ServicosPage,
});

type Serv = { id: string; nome: string; valor: number; custo: number; duracao_min: number; ativo: boolean };

const schema = z.object({
  nome: z.string().trim().min(2).max(80),
  valor: z.number().min(0),
  custo: z.number().min(0),
  duracao_min: z.number().min(15).max(600),
  ativo: z.boolean(),
});

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ServicosPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["servicos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servicos").select("*").order("nome");
      if (error) throw error;
      return data as Serv[];
    },
  });

  return (
    <>
      <PageHeader title="Serviços" subtitle="Catálogo de serviços" actions={<ServicoDialog onSaved={() => qc.invalidateQueries({ queryKey: ["servicos"] })} />} />

      {isLoading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      ) : !data?.length ? (
        <Card className="glass border-0 rounded-2xl p-10 text-center"><p className="text-muted-foreground">Nenhum serviço cadastrado.</p></Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.map(s => {
            const lucro = Number(s.valor) - Number(s.custo);
            return (
              <Card key={s.id} className={`glass border-0 rounded-2xl p-5 ${!s.ativo ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="size-10 rounded-xl gradient-primary grid place-items-center shrink-0"><Scissors className="size-4 text-primary-foreground" /></div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium leading-tight break-words">{s.nome}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.duracao_min} min</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <ServicoDialog serv={s} onSaved={() => qc.invalidateQueries({ queryKey: ["servicos"] })} trigger={<Button size="icon" variant="ghost"><Pencil className="size-4" /></Button>} />
                    <DeleteServ id={s.id} onDone={() => qc.invalidateQueries({ queryKey: ["servicos"] })} />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-1">
                  <div className="min-w-0"><div className="text-xs text-muted-foreground">Valor</div><div className="font-display text-lg mt-0.5 truncate">{brl(s.valor)}</div></div>
                  <div className="min-w-0"><div className="text-xs text-muted-foreground">Custo</div><div className="font-display text-lg mt-0.5 truncate">{brl(s.custo)}</div></div>
                  <div className="min-w-0"><div className="text-xs text-muted-foreground">Lucro</div><div className="font-display text-lg mt-0.5 text-primary truncate">{brl(lucro)}</div></div>
                </div>
                <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                  <Label className="text-xs">Ativo</Label>
                  <Switch checked={s.ativo} onCheckedChange={async (v) => {
                    const { error } = await supabase.from("servicos").update({ ativo: v }).eq("id", s.id);
                    if (error) toast.error(error.message);
                    else { toast.success(v ? "Ativado" : "Desativado"); qc.invalidateQueries({ queryKey: ["servicos"] }); }
                  }} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function DeleteServ({ id, onDone }: { id: string; onDone: () => void }) {
  const mut = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("servicos").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Serviço removido"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir serviço?")) mut.mutate(); }}><Trash2 className="size-4 text-destructive" /></Button>;
}

function ServicoDialog({ serv, onSaved, trigger }: { serv?: Serv; onSaved: () => void; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: serv?.nome ?? "", valor: Number(serv?.valor ?? 0), custo: Number(serv?.custo ?? 0),
    duracao_min: serv?.duracao_min ?? 60, ativo: serv?.ativo ?? true,
  });
  const mut = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form); if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      if (serv) { const { error } = await supabase.from("servicos").update(parsed.data).eq("id", serv.id); if (error) throw error; }
      else { const { data: u } = await supabase.auth.getUser(); const { error } = await supabase.from("servicos").insert({ ...parsed.data, user_id: u.user!.id }); if (error) throw error; }
    },
    onSuccess: () => { toast.success(serv ? "Atualizado" : "Criado"); onSaved(); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button className="gradient-primary text-primary-foreground shadow-glow"><Plus className="size-4 mr-1" /> Novo serviço</Button>}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display text-2xl">{serv ? "Editar serviço" : "Novo serviço"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Valor</Label><Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })} /></div>
            <div><Label>Custo</Label><Input type="number" step="0.01" value={form.custo} onChange={(e) => setForm({ ...form, custo: Number(e.target.value) })} /></div>
            <div><Label>Duração</Label><Input type="number" value={form.duracao_min} onChange={(e) => setForm({ ...form, duracao_min: Number(e.target.value) })} /></div>
          </div>
          <div className="flex items-center justify-between pt-2"><Label>Ativo</Label><Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /></div>
          <DialogFooter><Button type="submit" disabled={mut.isPending} className="gradient-primary text-primary-foreground shadow-glow w-full">{mut.isPending ? "Salvando..." : "Salvar"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
