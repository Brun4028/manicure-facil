/**
 * BloqueioHorariosDialog — Gerenciamento de bloqueios de agenda
 *
 * Permite criar, editar e remover bloqueios de horários:
 * - Feriados (data inteira)
 * - Férias (período)
 * - Horários personalizados (data + hora específica)
 * - Almoço (recorrente diário)
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CalendarOff, Plus, Trash2, Pencil, Umbrella, Sun, Coffee, CalendarX } from "lucide-react";
import { format } from "date-fns";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Bloqueio = {
  id: string;
  user_id: string;
  titulo: string;
  tipo: "feriado" | "ferias" | "personalizado" | "almoco";
  data_inicio: string;
  data_fim: string;
  horario_inicio: string | null;
  horario_fim: string | null;
  cor: string | null;
};

const TIPO_CONFIG: Record<string, { icon: typeof CalendarOff; label: string; color: string }> = {
  feriado: { icon: CalendarX, label: "Feriado", color: "text-red-500 bg-red-500/10 border-red-500/20" },
  ferias: { icon: Umbrella, label: "Férias", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  personalizado: { icon: Coffee, label: "Personalizado", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  almoco: { icon: Sun, label: "Almoço", color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
};

export function BloqueioHorariosDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Bloqueio | null>(null);
  const [form, setForm] = useState({
    titulo: "",
    tipo: "personalizado",
    data_inicio: format(new Date(), "yyyy-MM-dd"),
    data_fim: format(new Date(), "yyyy-MM-dd"),
    horario_inicio: "",
    horario_fim: "",
  });

  const { data: bloqueios = [] } = useQuery({
    queryKey: ["bloqueios-agenda"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bloqueios_agenda")
        .select("*")
        .order("data_inicio", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Bloqueio[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const u = (await supabase.auth.getUser()).data.user;
      if (!u) throw new Error("Não autenticado");
      const payload = {
        user_id: u.id,
        titulo: form.titulo,
        tipo: form.tipo,
        data_inicio: form.data_inicio,
        data_fim: form.tipo === "feriado" || form.tipo === "personalizado" || form.tipo === "almoco"
          ? form.data_inicio : form.data_fim,
        horario_inicio: form.horario_inicio || null,
        horario_fim: form.horario_fim || null,
      };
      if (editing) {
        const { error } = await supabase.from("bloqueios_agenda").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bloqueios_agenda").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Bloqueio atualizado" : "Bloqueio criado");
      qc.invalidateQueries({ queryKey: ["bloqueios-agenda"] });
      setFormOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bloqueios_agenda").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Bloqueio removido"); qc.invalidateQueries({ queryKey: ["bloqueios-agenda"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function resetForm() {
    setEditing(null);
    setForm({ titulo: "", tipo: "personalizado", data_inicio: format(new Date(), "yyyy-MM-dd"), data_fim: format(new Date(), "yyyy-MM-dd"), horario_inicio: "", horario_fim: "" });
  }

  function openEdit(b: Bloqueio) {
    setEditing(b);
    setForm({
      titulo: b.titulo, tipo: b.tipo, data_inicio: b.data_inicio, data_fim: b.data_fim,
      horario_inicio: b.horario_inicio ?? "", horario_fim: b.horario_fim ?? "",
    });
    setFormOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl text-xs h-9">
          <CalendarOff className="size-3.5 mr-1" /> Bloqueios
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <CalendarOff className="size-5 text-[#D946EF]" /> Bloqueios de Agenda
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {bloqueios.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum bloqueio cadastrado.</p>
          ) : (
            bloqueios.map(b => {
              const cfg = TIPO_CONFIG[b.tipo] ?? TIPO_CONFIG.personalizado;
              const Icon = cfg.icon;
              return (
                <div key={b.id} className={`flex items-center justify-between p-3 rounded-xl border ${cfg.color}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`size-8 rounded-lg border ${cfg.color} grid place-items-center`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">{b.titulo}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(b.data_inicio + "T00:00:00"), "dd/MM/yyyy")}
                        {b.data_inicio !== b.data_fim && ` — ${format(new Date(b.data_fim + "T00:00:00"), "dd/MM/yyyy")}`}
                        {b.horario_inicio && ` • ${b.horario_inicio} às ${b.horario_fim}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Badge variant="outline" className={`text-[9px] ${cfg.color}`}>{cfg.label}</Badge>
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => openEdit(b)} aria-label={`Editar bloqueio ${b.titulo}`}>
                      <Pencil className="size-3 text-muted-foreground" aria-hidden="true" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => {
                      confirm({
                        title: "Remover bloqueio?",
                        description: `Tem certeza que deseja remover "${b.titulo}"?`,
                        confirmText: "Remover", variant: "danger",
                        onConfirm: () => deleteMut.mutate(b.id),
                      });
                    }} aria-label={`Excluir bloqueio ${b.titulo}`}>
                      <Trash2 className="size-3 text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}

          <Dialog open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="w-full gradient-primary text-primary-foreground shadow-glow rounded-xl mt-2" onClick={() => resetForm()}>
                <Plus className="size-4 mr-1" /> Novo Bloqueio
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle className="font-display text-lg">{editing ? "Editar" : "Novo"} Bloqueio</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }} className="space-y-4">
                <div>
                  <Label className="text-xs">Título</Label>
                  <Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex: Feriado de Natal" className="h-10 rounded-xl" required />
                </div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feriado">Feriado</SelectItem>
                      <SelectItem value="ferias">Férias</SelectItem>
                      <SelectItem value="personalizado">Personalizado</SelectItem>
                      <SelectItem value="almoco">Horário de Almoço</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Data Início</Label>
                    <Input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} className="h-10 rounded-xl" />
                  </div>
                  {(form.tipo === "ferias") ? (
                    <div>
                      <Label className="text-xs">Data Fim</Label>
                      <Input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} className="h-10 rounded-xl" />
                    </div>
                  ) : form.tipo === "personalizado" || form.tipo === "almoco" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Início</Label>
                        <Input type="time" value={form.horario_inicio} onChange={e => setForm({ ...form, horario_inicio: e.target.value })} className="h-10 rounded-xl" />
                      </div>
                      <div>
                        <Label className="text-xs">Fim</Label>
                        <Input type="time" value={form.horario_fim} onChange={e => setForm({ ...form, horario_fim: e.target.value })} className="h-10 rounded-xl" />
                      </div>
                    </div>
                  ) : null}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saveMut.isPending} className="w-full gradient-primary text-primary-foreground shadow-glow rounded-xl">
                    {saveMut.isPending ? "Salvando..." : (editing ? "Atualizar" : "Criar Bloqueio")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </DialogContent>
    </Dialog>
  );
}
