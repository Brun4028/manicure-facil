import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Search, Phone, Mail, Cake } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Manicure Fácil" }] }),
  component: ClientesPage,
});

type Cliente = {
  id: string; nome: string; telefone: string | null; email: string | null;
  data_nascimento: string | null; observacoes: string | null; alergias: string | null; servico_favorito: string | null;
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
  const { data, isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("nome");
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const filtered = (data ?? []).filter(c => c.nome.toLowerCase().includes(search.toLowerCase()) || (c.telefone ?? "").includes(search));

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Gerencie seu CRM"
        actions={<ClienteDialog onSaved={() => qc.invalidateQueries({ queryKey: ["clientes"] })} />}
      />

      <div className="relative mb-4 max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por nome ou telefone..." className="pl-9" />
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="glass border-0 rounded-2xl p-10 text-center">
          <p className="text-muted-foreground">Nenhuma cliente cadastrada ainda.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <Card key={c.id} className="glass border-0 rounded-2xl p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-11 rounded-full gradient-primary grid place-items-center text-primary-foreground font-display text-lg shrink-0">
                    {c.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{c.nome}</h3>
                    {c.servico_favorito && <p className="text-xs text-muted-foreground truncate">Prefere: {c.servico_favorito}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <ClienteDialog cliente={c} onSaved={() => qc.invalidateQueries({ queryKey: ["clientes"] })} trigger={<Button size="icon" variant="ghost"><Pencil className="size-4" /></Button>} />
                  <DeleteBtn id={c.id} onDone={() => qc.invalidateQueries({ queryKey: ["clientes"] })} />
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-sm">
                {c.telefone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="size-3.5" />{c.telefone}</p>}
                {c.email && <p className="flex items-center gap-2 text-muted-foreground truncate"><Mail className="size-3.5 shrink-0" /><span className="truncate">{c.email}</span></p>}
                {c.data_nascimento && <p className="flex items-center gap-2 text-muted-foreground"><Cake className="size-3.5" />{new Date(c.data_nascimento + "T00:00:00").toLocaleDateString("pt-BR")}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}
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
