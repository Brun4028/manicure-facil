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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Building2, Clock, Bell, Palette, Globe, Save, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Manicure Fácil" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracoes").select("*").maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      if (data) return data;
      // Auto-create
      const u = (await supabase.auth.getUser()).data.user;
      if (!u) return null;
      const { data: inserted } = await supabase.from("configuracoes").insert({ user_id: u.id }).select().single();
      return inserted;
    },
  });

  const [form, setForm] = useState({
    empresa_nome: "", empresa_telefone: "", empresa_email: "", empresa_endereco: "", empresa_documento: "",
    horario_inicio_padrao: "08:00", horario_fim_padrao: "18:00", intervalo_padrao: 30,
    lembrete_ativo: true, lembrete_email: true, lembrete_whatsapp: false, lembrete_antecipacao_min: 60,
    notificacao_sonora: true,
  });

  // Sync config to form when loaded
  if (config && !form.empresa_nome && config.empresa_nome) {
    setForm({
      empresa_nome: config.empresa_nome ?? "",
      empresa_telefone: config.empresa_telefone ?? "",
      empresa_email: config.empresa_email ?? "",
      empresa_endereco: config.empresa_endereco ?? "",
      empresa_documento: config.empresa_documento ?? "",
      horario_inicio_padrao: config.horario_inicio_padrao ?? "08:00",
      horario_fim_padrao: config.horario_fim_padrao ?? "18:00",
      intervalo_padrao: config.intervalo_padrao ?? 30,
      lembrete_ativo: config.lembrete_ativo ?? true,
      lembrete_email: config.lembrete_email ?? true,
      lembrete_whatsapp: config.lembrete_whatsapp ?? false,
      lembrete_antecipacao_min: config.lembrete_antecipacao_min ?? 60,
      notificacao_sonora: config.notificacao_sonora ?? true,
    });
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const u = (await supabase.auth.getUser()).data.user;
      if (!u) throw new Error("Não autenticado");
      const { error } = await supabase.from("configuracoes").upsert({ user_id: u.id, ...form });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas!");
      qc.invalidateQueries({ queryKey: ["configuracoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <>
      <PageHeader title="Configurações" subtitle="Personalize seu salão" />
      <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-48 rounded-2xl bg-muted" />)}</div>
    </>;
  }

  return (
    <>
      <PageHeader title="Configurações" subtitle="Personalize as informações do seu salão" />

      <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }} className="space-y-6" aria-label="Formulário de configurações">
        {/* Empresa */}
        <Card className="bg-card border border-border p-6 rounded-[20px] shadow-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="size-10 rounded-xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] grid place-items-center"><Building2 className="size-5 text-white" /></div>
            <div><h3 className="font-display text-lg font-semibold text-card-foreground">Informações do Salão</h3><p className="text-xs text-muted-foreground">Dados que aparecem no link público de agendamento</p></div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label className="text-xs" htmlFor="cfg-empresa-nome">Nome do Salão</Label><Input id="cfg-empresa-nome" value={form.empresa_nome} onChange={e => setForm({ ...form, empresa_nome: e.target.value })} className="h-10 rounded-xl mt-1" placeholder="Meu Salão" /></div>
            <div><Label className="text-xs" htmlFor="cfg-empresa-tel">Telefone</Label><Input id="cfg-empresa-tel" value={form.empresa_telefone} onChange={e => setForm({ ...form, empresa_telefone: e.target.value })} className="h-10 rounded-xl mt-1" placeholder="(11) 99999-9999" /></div>
            <div><Label className="text-xs" htmlFor="cfg-empresa-email">Email</Label><Input id="cfg-empresa-email" value={form.empresa_email} onChange={e => setForm({ ...form, empresa_email: e.target.value })} className="h-10 rounded-xl mt-1" placeholder="contato@salao.com" /></div>
            <div><Label className="text-xs" htmlFor="cfg-empresa-doc">CNPJ/CPF</Label><Input id="cfg-empresa-doc" value={form.empresa_documento} onChange={e => setForm({ ...form, empresa_documento: e.target.value })} className="h-10 rounded-xl mt-1" placeholder="00.000.000/0001-00" /></div>
          </div>
          <div className="mt-4"><Label className="text-xs" htmlFor="cfg-empresa-end">Endereço</Label><Input id="cfg-empresa-end" value={form.empresa_endereco} onChange={e => setForm({ ...form, empresa_endereco: e.target.value })} className="h-10 rounded-xl mt-1" placeholder="Rua, número, bairro" /></div>
        </Card>

        {/* Horários */}
        <Card className="bg-card border border-border p-6 rounded-[20px] shadow-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="size-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 grid place-items-center"><Clock className="size-5 text-white" /></div>
            <div><h3 className="font-display text-lg font-semibold text-card-foreground">Horários Padrão</h3><p className="text-xs text-muted-foreground">Usados como padrão para novos agendamentos</p></div>
          </div>
          <div className="grid md:grid-cols-4 gap-4">
            <div><Label className="text-xs" htmlFor="cfg-horario-inicio">Início</Label><Input id="cfg-horario-inicio" type="time" value={form.horario_inicio_padrao} onChange={e => setForm({ ...form, horario_inicio_padrao: e.target.value })} className="h-10 rounded-xl mt-1" /></div>
            <div><Label className="text-xs" htmlFor="cfg-horario-fim">Fim</Label><Input id="cfg-horario-fim" type="time" value={form.horario_fim_padrao} onChange={e => setForm({ ...form, horario_fim_padrao: e.target.value })} className="h-10 rounded-xl mt-1" /></div>
            <div><Label className="text-xs" htmlFor="cfg-intervalo">Intervalo (min)</Label><Input id="cfg-intervalo" type="number" min={15} max={120} value={form.intervalo_padrao} onChange={e => setForm({ ...form, intervalo_padrao: Number(e.target.value) })} className="h-10 rounded-xl mt-1" /></div>
          </div>
        </Card>

        {/* Notificações */}
        <Card className="bg-card border border-border p-6 rounded-[20px] shadow-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="size-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 grid place-items-center"><Bell className="size-5 text-white" /></div>
            <div><h3 className="font-display text-lg font-semibold text-card-foreground">Notificações</h3><p className="text-xs text-muted-foreground">Lembretes e alertas para agendamentos</p></div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between"><Label htmlFor="cfg-lembrete-ativo" className="text-sm cursor-pointer">Lembretes automáticos</Label><Switch id="cfg-lembrete-ativo" checked={form.lembrete_ativo} onCheckedChange={v => setForm({ ...form, lembrete_ativo: v })} /></div>
            <div className="flex items-center justify-between"><Label htmlFor="cfg-lembrete-email" className="text-sm cursor-pointer">Notificação por Email</Label><Switch id="cfg-lembrete-email" checked={form.lembrete_email} onCheckedChange={v => setForm({ ...form, lembrete_email: v })} /></div>
            <div className="flex items-center justify-between"><Label htmlFor="cfg-lembrete-whats" className="text-sm cursor-pointer">Notificação WhatsApp</Label><Switch id="cfg-lembrete-whats" checked={form.lembrete_whatsapp} onCheckedChange={v => setForm({ ...form, lembrete_whatsapp: v })} /></div>
            <div className="flex items-center justify-between"><Label htmlFor="cfg-som" className="text-sm cursor-pointer">Som de notificação</Label><Switch id="cfg-som" checked={form.notificacao_sonora} onCheckedChange={v => setForm({ ...form, notificacao_sonora: v })} /></div>
            <div className="grid md:grid-cols-2 gap-4 pt-2">
              <div><Label className="text-xs" htmlFor="cfg-lembrete-antes">Antecedência do lembrete (min)</Label><Input id="cfg-lembrete-antes" type="number" min={15} max={2880} value={form.lembrete_antecipacao_min} onChange={e => setForm({ ...form, lembrete_antecipacao_min: Number(e.target.value) })} className="h-10 rounded-xl mt-1" /></div>
            </div>
          </div>
        </Card>

        <Button type="submit" disabled={saveMut.isPending} className="gradient-primary text-primary-foreground shadow-glow rounded-xl h-11 px-8" aria-label={saveMut.isPending ? "Salvando configurações" : "Salvar configurações"}>
          <Save className="size-4 mr-2" aria-hidden="true" /> {saveMut.isPending ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </form>
    </>
  );
}
