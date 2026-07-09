import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import logoIconWhite from "@/assets/logo-icon-white.png";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fallbackDb } from "@/lib/fallback-db";
import {
  CalendarDays, Scissors, User, Phone, Mail, Clock, Sparkles, CheckCircle2, Star, Award, Heart, Cake, ChevronLeft, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays, isSameDay, parse, differenceInYears } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/agendar/$userId")({
  head: () => ({ meta: [{ title: "Agendamento Online — Manicure Fácil" }] }),
  component: PublicAgendamentoPage,
});

type Serv = { id: string; nome: string; valor: number; custo: number; duracao_min: number; ativo: boolean };
type Photo = { id: string; titulo: string; imagem_url: string; tags: string[] | null; publico: boolean };
type Review = { id: string; user_id?: string; cliente_nome: string; nota: number; comentario: string | null; data: string; publico: boolean; created_at?: string };

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PublicAgendamentoPage() {
  const params = Route.useParams() as { userId: string };
  const userId = params.userId;

  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<Serv | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [clientForm, setClientForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    data_nascimento: "",
    observacoes: "",
  });

  const [reviewForm, setReviewForm] = useState({
    nome: "",
    nota: 5,
    comentario: "",
  });
  const [showReviewForm, setShowReviewForm] = useState(false);

  // 1. Fetch Manicure Profile
  const profileQuery = useQuery({
    queryKey: ["public_profile", userId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("nome, avatar_url").eq("id", userId).single();
        if (error) throw error;
        return data;
      } catch (e) {
        return { nome: "Manicure Boss Studio", avatar_url: null };
      }
    },
  });

  // 2. Fetch Active Services
  const servicesQuery = useQuery({
    queryKey: ["public_services", userId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("servicos").select("*").eq("user_id", userId).eq("ativo", true).order("nome");
        if (error) throw error;
        return data as Serv[];
      } catch (e) {
        return fallbackDb.get<any>("servicos", []).filter(s => s.ativo);
      }
    },
  });

  // 3. Fetch Existing Bookings (to block slots)
  const bookingsQuery = useQuery({
    queryKey: ["public_bookings", userId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("agendamentos").select("data_hora, duracao_min, status").eq("user_id", userId);
        if (error) throw error;
        return data;
      } catch (e) {
        return fallbackDb.get<any>("agendamentos", []);
      }
    },
  });

  // 4. Fetch Loyalty Config
  const loyaltyConfigQuery = useQuery({
    queryKey: ["public_loyalty_config", userId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("fidelidade_config").select("*").eq("user_id", userId).maybeSingle();
        if (error) throw error;
        return data;
      } catch (e) {
        const local = fallbackDb.get<any>("fidelidade_config", []);
        return local[0] || null;
      }
    },
  });

  // 5. Fetch Portfolio Photos
  const portfolioQuery = useQuery({
    queryKey: ["public_portfolio", userId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("portfolio").select("*").eq("user_id", userId).eq("publico", true);
        if (error) throw error;
        return data as Photo[];
      } catch (e) {
        return fallbackDb.get<any>("portfolio", []).filter(p => p.publico);
      }
    },
  });

  // 6. Fetch Public Feedbacks
  const reviewsQuery = useQuery({
    queryKey: ["public_reviews", userId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("avaliacoes").select("*").eq("user_id", userId).eq("publico", true);
        if (error) throw error;
        return data as Review[];
      } catch (e) {
        return fallbackDb.get<any>("avaliacoes", []).filter(r => r.publico);
      }
    },
  });

  const services = servicesQuery.data ?? [];
  const bookings = bookingsQuery.data ?? [];
  const loyaltyConfig = loyaltyConfigQuery.data;
  const portfolio = portfolioQuery.data ?? [];
  const reviews = reviewsQuery.data ?? [];

  // Generate date options (next 10 days)
  const dateOptions = useMemo(() => {
    return Array.from({ length: 10 }, (_, i) => addDays(new Date(), i));
  }, []);

  // Time Slot generator & overlap checker
  const timeSlots = useMemo(() => {
    if (!selectedService) return [];
    
    // Day slots (e.g. 08:00 to 18:00 every 30 min)
    const startHour = 8;
    const endHour = 18;
    const intervalMin = 30;
    const slots: string[] = [];

    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += intervalMin) {
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        slots.push(`${hh}:${mm}`);
      }
    }

    // Filter slots based on overlaps
    return slots.map(time => {
      // Slot start & end time
      const slotDate = new Date(selectedDate);
      const [h, m] = time.split(":").map(Number);
      slotDate.setHours(h, m, 0, 0);
      const slotStart = slotDate.getTime();
      const slotEnd = slotStart + (selectedService.duracao_min * 60 * 1000);

      // Check overlap
      const isBooked = bookings.some((b: any) => {
        if (b.status === "cancelado") return false;
        const bStart = new Date(b.data_hora).getTime();
        const bEnd = bStart + (b.duracao_min * 60 * 1000);
        return slotStart < bEnd && bStart < slotEnd;
      });

      // Also prevent booking past hours if selected date is today
      const isPast = isSameDay(selectedDate, new Date()) && slotStart < Date.now();

      return {
        time,
        available: !isBooked && !isPast
      };
    });
  }, [selectedService, selectedDate, bookings]);

  // Birthday discount checker (compare only month, ignore year)
  const birthdayDiscount = useMemo(() => {
    if (!clientForm.data_nascimento || !loyaltyConfig || !loyaltyConfig.niver_promo_ativa) return null;
    try {
      const birthDate = new Date(`${clientForm.data_nascimento}T00:00:00`);
      if (isNaN(birthDate.getTime())) return null;
      const today = new Date();
      if (birthDate.getMonth() === today.getMonth()) {
        return loyaltyConfig.niver_desconto_porcentagem;
      }
      return null;
    } catch {
      return null;
    }
  }, [clientForm.data_nascimento, loyaltyConfig]);

  // Final Price calculator
  const pricing = useMemo(() => {
    if (!selectedService) return { original: 0, final: 0, discount: 0 };
    const original = selectedService.valor;
    let final = original;
    let discount = 0;

    if (birthdayDiscount) {
      discount = original * (birthdayDiscount / 100);
      final = original - discount;
    }
    return { original, final, discount };
  }, [selectedService, birthdayDiscount]);

  // Booking Mutation
  const bookingMut = useMutation({
    mutationFn: async () => {
      if (!selectedService || !selectedTime) throw new Error("Serviço e horário inválidos");
      if (!clientForm.nome.trim() || !clientForm.telefone.trim()) throw new Error("Preencha seu nome e telefone");

      // Format ISO Date Time
      const appointmentDate = new Date(selectedDate);
      const [h, m] = selectedTime.split(":").map(Number);
      appointmentDate.setHours(h, m, 0, 0);

      const clientPayload = {
        nome: clientForm.nome.trim(),
        telefone: clientForm.telefone.trim(),
        email: clientForm.email.trim() || null,
        data_nascimento: clientForm.data_nascimento || null,
        observacoes: clientForm.observacoes.trim() || null,
      };

      try {
        // 1. Create or Find Client in Supabase
        // (For unauthenticated inserts, we associate with manicure userId)
        let client_id = null;
        
        // Find existing client for this manicure by phone
        const { data: existing } = await supabase
          .from("clientes")
          .select("id")
          .eq("user_id", userId)
          .eq("telefone", clientPayload.telefone)
          .maybeSingle();

        if (existing) {
          client_id = existing.id;
        } else {
          const { data: newClient, error: cliErr } = await supabase
            .from("clientes")
            .insert({ ...clientPayload, user_id: userId })
            .select("id")
            .single();
          if (cliErr) throw cliErr;
          client_id = newClient.id;
        }

        // 2. Insert Appointment
        const { error: appErr } = await supabase.from("agendamentos").insert({
          user_id: userId,
          cliente_id: client_id,
          servico_id: selectedService.id,
          data_hora: appointmentDate.toISOString(),
          duracao_min: selectedService.duracao_min,
          valor: pricing.final,
          custo: selectedService.custo,
          status: "agendado",
          pagamento: "pendente",
        });

        if (appErr) throw appErr;

      } catch (e) {
        console.warn("Using local fallback for public agendamento booking", e);
        // Fallback
        const localClients = fallbackDb.get<any>("clientes", []);
        let matchedClient = localClients.find((c: any) => c.telefone === clientPayload.telefone);
        if (!matchedClient) {
          matchedClient = fallbackDb.insert<any>("clientes", {
            user_id: userId,
            ...clientPayload
          }, []);
        }

        fallbackDb.insert<any>("agendamentos", {
          user_id: userId,
          cliente_id: matchedClient.id,
          servico_id: selectedService.id,
          data_hora: appointmentDate.toISOString(),
          duracao_min: selectedService.duracao_min,
          valor: pricing.final,
          custo: selectedService.custo,
          status: "agendado",
          pagamento: "pendente",
        }, []);
      }
    },
    onSuccess: () => {
      setStep(4); // Success step
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Review submission Mutation
  const reviewMut = useMutation({
    mutationFn: async () => {
      if (!reviewForm.nome.trim()) throw new Error("Insira seu nome");
      const payload = {
        cliente_nome: reviewForm.nome.trim(),
        nota: reviewForm.nota,
        comentario: reviewForm.comentario.trim() || null,
        publico: true,
      };

      try {
        await supabase.from("avaliacoes").insert({
          ...payload,
          user_id: userId,
        });
      } catch {
        fallbackDb.insert<Review>("avaliacoes", {
          id: crypto.randomUUID(),
          user_id: userId,
          data: new Date().toISOString().split("T")[0],
          created_at: new Date().toISOString(),
          ...payload,
        }, []);
      }
    },
    onSuccess: () => {
      toast.success("Obrigada pelo seu feedback!");
      setShowReviewForm(false);
      setReviewForm({ nome: "", nota: 5, comentario: "" });
      reviewsQuery.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between p-4 md:p-8">
      {/* Top Header */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between pb-6 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl gradient-primary grid place-items-center shadow-glow">
            <img src={logoIconWhite} alt="Logo" className="size-5 object-contain" />
          </div>
          <div>
            <h1 className="font-display text-xl leading-none">{profileQuery.data?.nome || "Carregando..."}</h1>
            <p className="text-[10px] text-muted-foreground mt-1">Agendamento Online Premium</p>
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={() => {
          if (step > 1 && step < 4) setStep(step - 1);
        }} disabled={step === 1 || step === 4}>
          <ChevronLeft className="size-4 mr-1" /> Voltar
        </Button>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl w-full mx-auto py-8 flex-1 grid md:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: BOOKING STEPS */}
        <div className="md:col-span-2 space-y-6">
          
          {/* STEP 1: SELECT SERVICE */}
          {step === 1 && (
            <Card className="bg-white/80 dark:bg-card/80 backdrop-blur-xl border-0 rounded-3xl p-5 md:p-6 space-y-4 shadow-[0_2px_16px_rgba(91,30,140,0.06)]">
              <h2 className="font-display text-2xl flex items-center gap-2"><Scissors className="size-5 text-purple-500" /> Escolha o Serviço</h2>
              <p className="text-xs text-muted-foreground">Selecione o procedimento desejado para continuar</p>

              {servicesQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
                </div>
              ) : services.length === 0 ? (
                <p className="text-sm text-center py-6 text-muted-foreground">Nenhum serviço disponível no momento.</p>
              ) : (
                <div className="space-y-2">
                  {services.map(s => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelectedService(s);
                        setStep(2);
                      }}
                      className="w-full text-left p-4 rounded-2xl bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-purple-100/30 dark:border-purple-400/10 hover:border-purple-300/50 dark:hover:border-purple-400/30 hover:bg-purple-50/50 dark:hover:bg-purple-500/10 transition-all flex justify-between items-center group"
                    >
                      <div>
                        <h4 className="font-medium text-sm text-foreground">{s.nome}</h4>
                        <span className="text-xs text-muted-foreground block mt-0.5">{s.duracao_min} minutos</span>
                      </div>
                      <div className="text-right">
                        <span className="font-display font-bold bg-gradient-to-br from-purple-600 to-pink-600 bg-clip-text text-transparent text-base group-hover:scale-105 transition-transform block">{brl(s.valor)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* STEP 2: DATE & TIME SLOTS */}
          {step === 2 && selectedService && (
            <Card className="bg-white/80 dark:bg-card/80 backdrop-blur-xl border-0 rounded-3xl p-5 md:p-6 space-y-4 shadow-[0_2px_16px_rgba(91,30,140,0.06)]">
              <h2 className="font-display text-2xl flex items-center gap-2"><CalendarDays className="size-5 text-purple-500" /> Data & Horário</h2>
              <p className="text-xs text-muted-foreground">Procedimento: <span className="font-semibold">{selectedService.nome}</span> ({selectedService.duracao_min} min)</p>

              {/* Date slider */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Selecione a data:</Label>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {dateOptions.map(date => {
                    const active = isSameDay(date, selectedDate);
                    return (
                      <button
                        key={date.toISOString()}
                        onClick={() => { setSelectedDate(date); setSelectedTime(""); }}
                        className={`px-4 py-2.5 rounded-xl text-center shrink-0 min-w-[70px] transition-all flex flex-col items-center ${
                          active
                            ? "gradient-primary text-primary-foreground shadow-glow"
                            : "glass hover:bg-accent/40"
                        }`}
                      >
                        <span className="text-[10px] uppercase font-bold tracking-wider">
                          {format(date, "eee", { locale: ptBR })}
                        </span>
                        <span className="font-display text-lg font-bold mt-1">
                          {format(date, "dd")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hours Grid */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Horários disponíveis:</Label>
                {timeSlots.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">Nenhum horário disponível para a data selecionada.</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {timeSlots.map(slot => (
                      <button
                        key={slot.time}
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        className={`py-2 rounded-xl text-center text-xs font-medium transition-all ${
                          !slot.available
                            ? "opacity-30 bg-muted/20 cursor-not-allowed"
                            : selectedTime === slot.time
                              ? "gradient-primary text-primary-foreground shadow-glow scale-105 font-bold"
                              : "glass hover:bg-accent/40"
                        }`}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button
                className="w-full gradient-primary text-primary-foreground shadow-glow mt-4"
                disabled={!selectedTime}
                onClick={() => setStep(3)}
              >
                Prosseguir com Agendamento
              </Button>
            </Card>
          )}

          {/* STEP 3: CLIENT FORM */}
          {step === 3 && selectedService && (
            <Card className="bg-white/80 dark:bg-card/80 backdrop-blur-xl border-0 rounded-3xl p-5 md:p-6 space-y-4 shadow-[0_2px_16px_rgba(91,30,140,0.06)]">
              <h2 className="font-display text-2xl flex items-center gap-2"><User className="size-5 text-purple-500" /> Suas Informações</h2>
              <p className="text-xs text-muted-foreground">Confirme seus dados para garantir a reserva</p>

              <form onSubmit={(e) => { e.preventDefault(); bookingMut.mutate(); }} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Seu Nome *</Label>
                    <Input value={clientForm.nome} placeholder="Como deseja ser chamada?" onChange={e => setClientForm({ ...clientForm, nome: e.target.value })} required />
                  </div>
                  <div>
                    <Label className="text-xs">Seu Telefone / WhatsApp *</Label>
                    <Input value={clientForm.telefone} placeholder="(99) 99999-9999" onChange={e => setClientForm({ ...clientForm, telefone: e.target.value })} required />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Email (Opcional)</Label>
                    <Input type="email" value={clientForm.email} placeholder="para receber confirmações" onChange={e => setClientForm({ ...clientForm, email: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Data de Nascimento (Para desconto de Aniversário!)</Label>
                    <Input type="date" value={clientForm.data_nascimento} onChange={e => setClientForm({ ...clientForm, data_nascimento: e.target.value })} />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Observações adicionais (Opcional)</Label>
                  <Textarea value={clientForm.observacoes} placeholder="Ex: alongamento em gel, unhas decoradas, etc..." onChange={e => setClientForm({ ...clientForm, observacoes: e.target.value })} />
                </div>

                {/* Birthday promo alert */}
                {birthdayDiscount && (
                  <div className="bg-emerald-500/10 text-emerald-500 p-3.5 rounded-xl text-xs flex items-center gap-2 font-medium">
                    <Cake className="size-4 shrink-0 text-emerald-500" />
                    <span>Parabéns! Identificamos aniversário este mês: <b>{birthdayDiscount}% de Desconto aplicado!</b></span>
                  </div>
                )}

                <div className="pt-2">
                  <Button type="submit" disabled={bookingMut.isPending} className="w-full gradient-primary text-primary-foreground shadow-glow">
                    {bookingMut.isPending ? "Confirmando Agendamento..." : "Confirmar e Agendar Horário"}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* STEP 4: SUCCESS CONFIRMATION */}
          {step === 4 && selectedService && (
            <Card className="bg-white/80 dark:bg-card/80 backdrop-blur-xl border-0 rounded-3xl p-6 text-center space-y-6 shadow-[0_2px_16px_rgba(91,30,140,0.06)]">
              <div className="size-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white grid place-items-center mx-auto shadow-lg shadow-purple-500/20">
                <CheckCircle2 className="size-9" />
              </div>

              <div className="space-y-2">
                <h2 className="font-display text-3xl">Agendamento Realizado!</h2>
                <p className="text-sm text-muted-foreground">Obrigada, {clientForm.nome}. Seu horário foi reservado com sucesso.</p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-500/10 dark:to-pink-500/10 rounded-2xl p-4 max-w-sm mx-auto space-y-2 text-sm text-left border border-purple-100/50 dark:border-purple-400/10">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Procedimento:</span>
                  <span className="font-medium">{selectedService.nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data:</span>
                  <span className="font-medium">{format(selectedDate, "dd/MM/yyyy")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Horário:</span>
                  <span className="font-medium">{selectedTime}</span>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-2 font-semibold">
                  <span>Valor:</span>
                  <span className="text-primary">{brl(pricing.final)}</span>
                </div>
              </div>

              <div>
                <Button className="glass border-0 hover:bg-accent/50 text-foreground" onClick={() => {
                  setStep(1);
                  setSelectedService(null);
                  setSelectedTime("");
                  setClientForm({ nome: "", telefone: "", email: "", data_nascimento: "", observacoes: "" });
                }}>
                  Novo Agendamento
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN: MANICURE PORTFOLIO & REVIEWS */}
        <div className="space-y-6">
          {/* Summary Box */}
          {step < 4 && selectedService && (
            <Card className="bg-white/80 dark:bg-card/80 backdrop-blur-xl border-0 rounded-2xl p-5 space-y-4 shadow-[0_2px_16px_rgba(91,30,140,0.06)]">
              <h3 className="font-display text-base border-b border-border/40 pb-2">Resumo da Reserva</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Serviço:</span>
                  <span className="font-medium">{selectedService.nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duração:</span>
                  <span className="font-medium">{selectedService.duracao_min} min</span>
                </div>
                {selectedTime && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data/Hora:</span>
                    <span className="font-medium">{format(selectedDate, "dd/MM")} às {selectedTime}</span>
                  </div>
                )}
                
                {birthdayDiscount && (
                  <div className="flex justify-between text-emerald-500 font-medium">
                    <span>Cupom Aniversário:</span>
                    <span>-{birthdayDiscount}%</span>
                  </div>
                )}

                <div className="flex justify-between border-t border-border/40 pt-2 font-bold text-sm">
                  <span>Valor Estimado:</span>
                  <span className="text-primary">{brl(pricing.final)}</span>
                </div>
              </div>
            </Card>
          )}

          {/* Portfolio carousel view */}
          {portfolio.length > 0 && (
            <Card className="bg-white/80 dark:bg-card/80 backdrop-blur-xl border-0 rounded-2xl p-5 space-y-3 shadow-[0_2px_16px_rgba(91,30,140,0.06)]">
              <h3 className="font-display text-base flex items-center gap-1.5"><Heart className="size-4 text-rose-500" /> Meu Portfólio</h3>
              <div className="grid grid-cols-2 gap-2">
                {portfolio.slice(0, 4).map(p => (
                  <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden bg-accent/40">
                    <img src={p.imagem_url} alt={p.titulo} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Testimonials/Reviews display */}
          <Card className="bg-white/80 dark:bg-card/80 backdrop-blur-xl border-0 rounded-2xl p-5 space-y-4 shadow-[0_2px_16px_rgba(91,30,140,0.06)]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base flex items-center gap-1.5"><Star className="size-4 text-amber-400 fill-amber-400" /> Avaliações</h3>
              
              {!showReviewForm && (
                <Button size="sm" variant="ghost" className="text-xs h-7 px-2" onClick={() => setShowReviewForm(true)}>
                  Avaliar
                </Button>
              )}
            </div>

            {/* Leave a review subform */}
            {showReviewForm ? (
              <form onSubmit={(e) => { e.preventDefault(); reviewMut.mutate(); }} className="space-y-3 p-3 bg-accent/30 rounded-xl">
                <div>
                  <Label className="text-[10px] uppercase">Seu Nome *</Label>
                  <Input className="h-8 text-xs p-2" value={reviewForm.nome} onChange={e => setReviewForm({ ...reviewForm, nome: e.target.value })} required />
                </div>
                <div>
                  <Label className="text-[10px] uppercase block">Nota (1 a 5 estrelas)</Label>
                  <div className="flex gap-1.5 mt-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewForm({ ...reviewForm, nota: star })}
                        className="text-amber-500 focus:outline-none"
                      >
                        <Star className={`size-4.5 ${reviewForm.nota >= star ? "fill-amber-500" : ""}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Comentário</Label>
                  <Textarea className="text-xs p-2 min-h-[50px]" value={reviewForm.comentario} placeholder="O que achou do serviço?" onChange={e => setReviewForm({ ...reviewForm, comentario: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={reviewMut.isPending} className="flex-1 gradient-primary text-primary-foreground text-xs h-8">
                    {reviewMut.isPending ? "Enviando..." : "Enviar"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="text-xs h-8" onClick={() => setShowReviewForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : reviews.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sem avaliações ainda.</p>
            ) : (
              <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                {reviews.slice(0, 3).map(r => (
                  <div key={r.id} className="border-b border-border/40 pb-2 space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold">{r.cliente_nome}</span>
                      <div className="flex items-center gap-0.5">
                        <Star className="size-3 text-amber-500 fill-amber-500" />
                        <span className="font-bold text-[10px]">{r.nota}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">"{r.comentario}"</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="max-w-4xl w-full mx-auto pt-6 text-center text-[10px] text-muted-foreground border-t border-border/40 mt-8">
        &copy; {new Date().getFullYear()} Manicure Fácil — Todos os direitos reservados.
      </footer>
    </div>
  );
}
