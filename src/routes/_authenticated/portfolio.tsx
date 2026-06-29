import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { fallbackDb } from "@/lib/fallback-db";
import { Plus, Pencil, Trash2, Image, Star, Eye, EyeOff, Sparkles, Heart, Split } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({ meta: [{ title: "Portfólio & Avaliações — Manicure Fácil" }] }),
  component: PortfolioPage,
});

type Photo = {
  id: string;
  user_id: string;
  titulo: string;
  descricao: string | null;
  imagem_url: string;
  foto_antes_url: string | null;
  cliente_id: string | null;
  tags: string[] | null;
  publico: boolean;
  created_at: string;
};

type Review = {
  id: string;
  cliente_nome: string;
  nota: number;
  comentario: string | null;
  data: string;
  publico: boolean;
  created_at: string;
};

// Image Templates for ease of use
const imgTemplates = [
  { name: "Fibra de Vidro Nude", url: "https://images.unsplash.com/photo-1632345031435-8797b2d58045?q=80&w=600&auto=format&fit=crop" },
  { name: "Vermelho Luxo", url: "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=600&auto=format&fit=crop" },
  { name: "Unhas Decoradas Flores", url: "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=600&auto=format&fit=crop" },
  { name: "Francesinha Champagne", url: "https://images.unsplash.com/photo-1607779097040-26e80aa78e66?q=80&w=600&auto=format&fit=crop" },
];

const defaultPhotos: Photo[] = [
  {
    id: "ph1",
    user_id: "local",
    titulo: "Alongamento em Fibra Nude",
    descricao: "Formato amendoado com finalização em brilho vitrificado.",
    imagem_url: "https://images.unsplash.com/photo-1632345031435-8797b2d58045?q=80&w=600&auto=format&fit=crop",
    foto_antes_url: null,
    cliente_id: null,
    tags: ["Fibra de Vidro", "Alongamento", "Nude"],
    publico: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "ph2",
    user_id: "local",
    titulo: "Vermelho Sedutor Clássico",
    descricao: "Esmaltação tradicional com cutilagem perfeita.",
    imagem_url: "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=600&auto=format&fit=crop",
    foto_antes_url: null,
    cliente_id: null,
    tags: ["Esmaltação", "Vermelho"],
    publico: true,
    created_at: new Date().toISOString(),
  },
];

const defaultReviews: Review[] = [
  {
    id: "re1",
    cliente_nome: "Juliana Mendes",
    nota: 5,
    comentario: "Atendimento impecável! O alongamento dura muito e o ambiente com o tema Rosé é super relaxante.",
    data: new Date().toISOString(),
    publico: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "re2",
    cliente_nome: "Renata Abreu",
    nota: 4,
    comentario: "Muito caprichosa e pontual. Adorei a francesinha champagne!",
    data: new Date().toISOString(),
    publico: true,
    created_at: new Date().toISOString(),
  },
];

function PortfolioPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("portfolio");

  // Query Photos
  const photosQuery = useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("portfolio").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        return data as Photo[];
      } catch (e) {
        return fallbackDb.get<Photo>("portfolio", defaultPhotos);
      }
    },
  });

  // Query Reviews
  const reviewsQuery = useQuery({
    queryKey: ["avaliacoes"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("avaliacoes").select("*").order("data", { ascending: false });
        if (error) throw error;
        return data as Review[];
      } catch (e) {
        return fallbackDb.get<Review>("avaliacoes", defaultReviews);
      }
    },
  });

  const photos = photosQuery.data ?? [];
  const reviews = reviewsQuery.data ?? [];

  const stats = useMemo(() => {
    if (reviews.length === 0) return { avg: 5.0, total: 0 };
    const sum = reviews.reduce((s, r) => s + r.nota, 0);
    return {
      avg: Number((sum / reviews.length).toFixed(1)),
      total: reviews.length,
    };
  }, [reviews]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["portfolio"] });
    qc.invalidateQueries({ queryKey: ["avaliacoes"] });
  };

  // Mutations
  const deletePhotoMut = useMutation({
    mutationFn: async (id: string) => {
      try {
        const { error } = await supabase.from("portfolio").delete().eq("id", id);
        if (error) throw error;
      } catch {
        fallbackDb.delete("portfolio", id, defaultPhotos);
      }
    },
    onSuccess: () => {
      toast.success("Foto removida da galeria");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteReviewMut = useMutation({
    mutationFn: async (id: string) => {
      try {
        const { error } = await supabase.from("avaliacoes").delete().eq("id", id);
        if (error) throw error;
      } catch {
        fallbackDb.delete("avaliacoes", id, defaultReviews);
      }
    },
    onSuccess: () => {
      toast.success("Avaliação excluída");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Galeria & Avaliações"
        subtitle="Gerencie seu portfólio de trabalhos e acompanhe os feedbacks das clientes"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white dark:bg-card border-0 p-1.5 rounded-2xl shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
          <TabsTrigger value="portfolio" className="rounded-xl flex items-center gap-1.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20"><Image className="size-4" /> Galeria Portfólio</TabsTrigger>
          <TabsTrigger value="antesedepois" className="rounded-xl flex items-center gap-1.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20"><Split className="size-4" /> Antes & Depois</TabsTrigger>
          <TabsTrigger value="avaliacoes" className="rounded-xl flex items-center gap-1.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20"><Star className="size-4" /> Avaliações ({stats.total})</TabsTrigger>
        </TabsList>

        {/* TAB 1: GALERIA DE PORTFÓLIO */}
        <TabsContent value="portfolio" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl">Sua Vitrine de Trabalhos</h2>
              <p className="text-xs text-muted-foreground">Fotos exibidas no seu perfil público de agendamento</p>
            </div>
            <PhotoDialog onSaved={invalidate} />
          </div>

          {photosQuery.isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)}
            </div>
          ) : photos.length === 0 ? (
            <Card className="glass border-0 rounded-2xl p-10 text-center text-muted-foreground">
              Sua galeria de portfólio está vazia. Adicione fotos elegantes dos seus designs!
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {photos.map(p => (
                <Card key={p.id} className="glass border-0 rounded-3xl overflow-hidden group hover:shadow-glow transition-all duration-300 flex flex-col justify-between">
                  <div className="relative aspect-square overflow-hidden bg-accent/40">
                    <img src={p.imagem_url} alt={p.titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    
                    <div className="absolute top-3 right-3 flex gap-1">
                      <Button size="icon" variant="secondary" className="size-8 rounded-full glass hover:bg-background/80" onClick={async () => {
                        const nextVal = !p.publico;
                        try {
                          const { error } = await supabase.from("portfolio").update({ publico: nextVal }).eq("id", p.id);
                          if (error) throw error;
                        } catch {
                          fallbackDb.update<Photo>("portfolio", p.id, { publico: nextVal }, defaultPhotos);
                        }
                        toast.success(nextVal ? "Foto visível ao público" : "Foto ocultada do público");
                        invalidate();
                      }}>
                        {p.publico ? <Eye className="size-4" /> : <EyeOff className="size-4 text-muted-foreground" />}
                      </Button>
                      <Button size="icon" variant="destructive" className="size-8 rounded-full shadow-md" onClick={() => {
                        if (confirm("Deseja mesmo remover esta foto?")) deletePhotoMut.mutate(p.id);
                      }}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-medium text-base truncate">{p.titulo}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.descricao || "Sem descrição"}</p>
                    </div>
                    {p.tags && p.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-2 border-t border-border/40">
                        {p.tags.map(t => (
                          <Badge key={t} variant="secondary" className="text-[10px] rounded-lg">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: ANTES & DEPOIS (F7) */}
        <TabsContent value="antesedepois" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl">Antes & Depois</h2>
              <p className="text-xs text-muted-foreground">Compare resultados dos seus trabalhos com fotos de antes e depois</p>
            </div>
            <BeforeAfterDialog onSaved={invalidate} />
          </div>

          {(() => {
            const baPhotos = photos.filter(p => p.foto_antes_url);
            if (baPhotos.length === 0) {
              return (
                <Card className="glass border-0 rounded-2xl p-10 text-center text-muted-foreground">
                  Nenhum comparativo Antes & Depois cadastrado ainda.
                </Card>
              );
            }
            return (
              <div className="grid md:grid-cols-2 gap-6">
                {baPhotos.map(p => (
                  <BeforeAfterCard key={p.id} photo={p} onDelete={invalidate} />
                ))}
              </div>
            );
          })()}
        </TabsContent>

        {/* TAB 3: AVALIAÇÕES DE CLIENTES */}
        <TabsContent value="avaliacoes" className="space-y-6">
          {/* Rating Summary Header */}
          <div className="grid md:grid-cols-4 gap-4">
            <Card className="bg-white dark:bg-card border-0 rounded-2xl p-5 flex items-center gap-4 shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
              <div className="size-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 grid place-items-center shadow-lg shadow-purple-500/20">
                <Star className="size-6 text-white fill-white" />
              </div>
              <div>
                <span className="text-3xl font-display font-bold block">{stats.avg} / 5.0</span>
                <span className="text-[10px] text-muted-foreground block uppercase mt-0.5">Nota Média</span>
              </div>
            </Card>

            <Card className="bg-white dark:bg-card border-0 rounded-2xl p-5 flex items-center gap-4 shadow-[0_2px_16px_rgba(91,30,140,0.04)]">
              <div className="size-14 rounded-2xl bg-gradient-to-br from-pink-100 to-purple-100 dark:from-pink-500/20 dark:to-purple-500/20 grid place-items-center">
                <Heart className="size-6 text-pink-500" />
              </div>
              <div>
                <span className="text-3xl font-display font-bold block">{stats.total}</span>
                <span className="text-[10px] text-muted-foreground block uppercase mt-0.5">Feedbacks Recebidos</span>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <h2 className="font-display text-xl">Feedbacks Recentes</h2>
            
            {reviewsQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
              </div>
            ) : reviews.length === 0 ? (
              <Card className="glass border-0 rounded-2xl p-10 text-center text-muted-foreground">
                Nenhum feedback de cliente cadastrado ou recebido.
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {reviews.map(r => (
                  <Card key={r.id} className="bg-white dark:bg-card border-0 rounded-2xl p-5 relative flex flex-col justify-between shadow-[0_2px_16px_rgba(91,30,140,0.04)] hover:shadow-[0_8px_30px_rgba(122,44,191,0.08)] transition-all duration-300">
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium text-sm">{r.cliente_nome}</h4>
                          <span className="text-[10px] text-muted-foreground block mt-0.5">
                            {format(new Date(r.data + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-lg">
                          <Star className="size-3 text-amber-500 fill-amber-500" />
                          <span className="text-xs font-bold text-amber-500">{r.nota}</span>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground mt-3 italic leading-relaxed">
                        "{r.comentario || "Sem comentário escrito."}"
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Label className="text-[10px] uppercase">Mostrar no Perfil Público</Label>
                        <Switch checked={r.publico} onCheckedChange={async (val) => {
                          try {
                            const { error } = await supabase.from("avaliacoes").update({ publico: val }).eq("id", r.id);
                            if (error) throw error;
                          } catch {
                            fallbackDb.update<Review>("avaliacoes", r.id, { publico: val }, defaultReviews);
                          }
                          toast.success(val ? "Exibido no perfil" : "Ocultado do perfil");
                          invalidate();
                        }} />
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => {
                        if (confirm("Deseja mesmo remover esta avaliação?")) deleteReviewMut.mutate(r.id);
                      }}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ───── F7: Before/After Card ───── */
function BeforeAfterCard({ photo, onDelete }: { photo: Photo; onDelete: () => void }) {
  const [sliderPos, setSliderPos] = useState(50);
  
  return (
    <Card className="glass border-0 rounded-3xl overflow-hidden shadow-card">
      <div className="relative aspect-[4/3] bg-accent/40 overflow-hidden select-none">
        {/* After image (full width) */}
        <img src={photo.imagem_url} alt={`${photo.titulo} - Depois`} className="absolute inset-0 w-full h-full object-cover" />
        {/* Before image (clipped) */}
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
          <img src={photo.foto_antes_url!} alt={`${photo.titulo} - Antes`} className="w-full h-full object-cover" />
        </div>
        {/* Labels */}
        <div className="absolute bottom-2 left-2 bg-black/60 text-[10px] text-white px-2 py-0.5 rounded font-medium">Antes</div>
        <div className="absolute bottom-2 right-2 bg-black/60 text-[10px] text-white px-2 py-0.5 rounded font-medium">Depois</div>
        {/* Slider handle */}
        <input
          type="range"
          min="0"
          max="100"
          value={sliderPos}
          onChange={(e) => setSliderPos(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
        />
        <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${sliderPos}%` }}>
          <div className="h-full w-0.5 bg-white shadow-md" style={{ transform: 'translateX(-50%)' }} />
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-7 rounded-full bg-white/90 shadow-lg grid place-items-center">
            <Split className="size-3.5 text-[#D946EF]" />
          </div>
        </div>
      </div>
      <div className="p-4 flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="font-medium text-sm truncate">{photo.titulo}</h3>
          {photo.tags && photo.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {photo.tags.map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
            </div>
          )}
        </div>
        <Button size="icon" variant="ghost" className="shrink-0 text-destructive hover:bg-destructive/10" onClick={async () => {
          if (!confirm("Remover este comparativo?")) return;
          try {
            await supabase.from("portfolio").update({ foto_antes_url: null }).eq("id", photo.id);
          } catch {
            fallbackDb.update<Photo>("portfolio", photo.id, { foto_antes_url: null }, defaultPhotos);
          }
          toast.success("Comparativo removido");
          onDelete();
        }}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

/* ───── F7: Before/After Dialog ───── */
function BeforeAfterDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    imagem_url: "",
    foto_antes_url: "",
    tagsInput: "",
    publico: true,
  });
  const [isPending, setIsPending] = useState(false);

  const { data: clientes } = useQuery({
    queryKey: ["clientes-portfolio"],
    queryFn: async () => {
      try {
        const { data } = await supabase.from("clientes").select("id, nome");
        return data ?? [];
      } catch { return []; }
    },
    enabled: open,
  });

  const [clienteId, setClienteId] = useState("");

  const imgTemplatesBA = [
    { name: "Fibra de Vidro Nude", url: "https://images.unsplash.com/photo-1632345031435-8797b2d58045?q=80&w=600&auto=format&fit=crop" },
    { name: "Vermelho Luxo", url: "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=600&auto=format&fit=crop" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim()) { toast.error("Insira um título"); return; }
    if (!form.imagem_url.trim()) { toast.error("Insira a URL da foto 'depois'"); return; }
    if (!form.foto_antes_url.trim()) { toast.error("Insira a URL da foto 'antes'"); return; }

    setIsPending(true);

    const tags = form.tagsInput.split(",").map(t => t.trim()).filter(t => t.length > 0);
    const payload = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      imagem_url: form.imagem_url.trim(),
      foto_antes_url: form.foto_antes_url.trim(),
      cliente_id: clienteId || null,
      tags: tags.length > 0 ? tags : null,
      publico: form.publico,
    };

    try {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("portfolio").insert({ ...payload, user_id: user!.id });
      if (error) throw error;
    } catch {
      fallbackDb.insert<Photo>("portfolio", { user_id: "local", ...payload } as any, defaultPhotos);
    }

    toast.success("Comparativo adicionado com sucesso!");
    onSaved();
    setOpen(false);
    setForm({ titulo: "", descricao: "", imagem_url: "", foto_antes_url: "", tagsInput: "", publico: true });
    setClienteId("");
    setIsPending(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gradient-primary text-primary-foreground shadow-glow"><Plus className="size-4 mr-1" /> Novo Comparativo</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Novo Antes & Depois</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={form.titulo} placeholder="Ex: Alongamento em Gel" onChange={e => setForm({ ...form, titulo: e.target.value })} required />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={form.descricao} placeholder="Detalhes do procedimento..." onChange={e => setForm({ ...form, descricao: e.target.value })} />
          </div>

          {/* Quick templates */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="size-3.5" /> Templates rápidos:</Label>
            <div className="grid grid-cols-2 gap-2">
              {imgTemplatesBA.map(t => (
                <button key={t.name} type="button" className="relative aspect-video rounded-xl overflow-hidden border border-border/40 hover:border-primary transition-all" onClick={() => setForm({ ...form, imagem_url: t.url, titulo: form.titulo || t.name })}>
                  <img src={t.url} alt={t.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-background/20" />
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Foto Antes *</Label>
              <Input className="text-xs" value={form.foto_antes_url} placeholder="URL da foto antes..." onChange={e => setForm({ ...form, foto_antes_url: e.target.value })} required />
            </div>
            <div>
              <Label className="text-xs">Foto Depois *</Label>
              <Input className="text-xs" value={form.imagem_url} placeholder="URL da foto depois..." onChange={e => setForm({ ...form, imagem_url: e.target.value })} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cliente (opcional)</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {(clientes as any[] ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tags</Label>
              <Input className="text-xs" value={form.tagsInput} placeholder="Gel, Alongamento..." onChange={e => setForm({ ...form, tagsInput: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label>Exibir publicamente</Label>
            <Switch checked={form.publico} onCheckedChange={val => setForm({ ...form, publico: val })} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending} className="gradient-primary text-primary-foreground w-full">
              {isPending ? "Salvando..." : "Salvar Comparativo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Dialog: Add photo to portfolio
function PhotoDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    imagem_url: "",
    tagsInput: "",
    publico: true,
  });
  const [isPending, setIsPending] = useState(false);

  const selectTemplate = (url: string, name: string) => {
    setForm(f => ({
      ...f,
      imagem_url: url,
      titulo: f.titulo || name,
    }));
    toast.success("Template selecionado!");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim()) { toast.error("Insira um título"); return; }
    if (!form.imagem_url.trim()) { toast.error("Insira a URL da imagem"); return; }

    setIsPending(true);

    const tags = form.tagsInput
      .split(",")
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const payload = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      imagem_url: form.imagem_url.trim(),
      tags: tags.length > 0 ? tags : null,
      publico: form.publico,
    };

    try {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("portfolio").insert({
        ...payload,
        user_id: user!.id,
      });
      if (error) throw error;
    } catch {
      fallbackDb.insert<Photo>("portfolio", {
        user_id: "local",
        ...payload,
      } as any, defaultPhotos);
    }

    toast.success("Foto adicionada com sucesso!");
    onSaved();
    setOpen(false);
    setForm({ titulo: "", descricao: "", imagem_url: "", tagsInput: "", publico: true });
    setIsPending(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gradient-primary text-primary-foreground shadow-glow"><Plus className="size-4 mr-1" /> Adicionar Foto</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Adicionar ao Portfólio</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={form.titulo} placeholder="Ex: Alongamento em Gel Rosé..." onChange={e => setForm({ ...form, titulo: e.target.value })} required />
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea value={form.descricao} placeholder="Fale um pouco sobre o serviço, cores utilizadas..." onChange={e => setForm({ ...form, descricao: e.target.value })} />
          </div>

          <div>
            <Label>Link da Imagem / Foto *</Label>
            <Input value={form.imagem_url} placeholder="Insira o link da imagem (URL)..." onChange={e => setForm({ ...form, imagem_url: e.target.value })} required />
          </div>

          {/* Quick templates selection */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="size-3.5" /> Ou use um template de alta qualidade:</Label>
            <div className="grid grid-cols-4 gap-2">
              {imgTemplates.map(t => (
                <button key={t.name} type="button" className="relative aspect-square rounded-xl overflow-hidden border border-border/40 hover:border-primary transition-all group" onClick={() => selectTemplate(t.url, t.name)}>
                  <img src={t.url} alt={t.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-background/20 group-hover:bg-background/0 transition-colors" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Tags / Categorias (separadas por vírgula)</Label>
            <Input value={form.tagsInput} placeholder="Ex: Alongamento, Esmalte em Gel, Rosé" onChange={e => setForm({ ...form, tagsInput: e.target.value })} />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label>Exibir publicamente no agendamento</Label>
            <Switch checked={form.publico} onCheckedChange={val => setForm({ ...form, publico: val })} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending} className="gradient-primary text-primary-foreground w-full">
              {isPending ? "Adicionando..." : "Confirmar Lançamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
