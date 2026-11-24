import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import logoIconWhite from "@/assets/logo-icon-white.png";
import {
  getDadosPublicosManicure,
  criarAgendamentoPublico,
  criarAvaliacaoPublica,
} from "@/lib/public/booking.functions";
import { avaliarCuponsPublico } from "@/lib/cupons.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarDays,
  Scissors,
  User,
  CheckCircle2,
  Star,
  Heart,
  Cake,
  Gift,
  Info,
  ChevronLeft,
  MessageCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { mensagemErroAmigavel } from "@/lib/user-errors";
import { abrirWhatsApp } from "@/lib/whatsapp";
import { gerarSlots } from "@/lib/expediente-logica";
import { format, addDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/agendar/$userId")({
  head: () => ({ meta: [{ title: "Agendamento Online — Manicure Fácil" }] }),
  component: PublicAgendamentoPage,
});

type Serv = { id: string; nome: string; valor: number; duracao_min: number };
type Photo = { id: string; titulo: string; imagem_url: string; tags: string[] | null };
type Review = {
  id: string;
  cliente_nome: string;
  nota: number;
  comentario: string | null;
  data: string;
};

const brl = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

  // Busca única dos dados públicos da manicure — 100% via server function
  // no backend (service_role). O navegador nunca consulta o banco com a chave anon.
  // Atualiza dinamicamente para manter a agenda sempre em tempo real.
  const publicoQuery = useQuery({
    queryKey: ["public_manicure", userId],
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await getDadosPublicosManicure({ data: { userId } });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  // Avalia automaticamente os cupons/promoções elegíveis para o serviço
  // escolhido. A decisão real de aplicar e consumir acontece no servidor.
  const cuponsQuery = useQuery({
    queryKey: ["cupons-publico", userId, selectedService?.id],
    enabled: !!selectedService,
    queryFn: async () => {
      if (!selectedService) return { cupom: null, rejeitados: [] };
      const res = await avaliarCuponsPublico({
        data: { userId, servicoId: selectedService.id, base: selectedService.valor },
      });
      if (!res.ok) return { cupom: null, rejeitados: [] };
      return res.data;
    },
  });
  const melhorCupomDisp = cuponsQuery.data?.cupom ?? null;

  const data = publicoQuery.data;
  // 🔧 UX: link com ID inválido/inativo → mostra a mensagem amigável do
  // servidor ("Perfil indisponível no momento.") em vez de uma tela vazia.
  const erroPublico = publicoQuery.isError
    ? publicoQuery.error instanceof Error
      ? publicoQuery.error.message
      : "Perfil indisponível no momento."
    : null;
  const services: Serv[] = useMemo(() => data?.servicos ?? [], [data?.servicos]);
  const bookings: { data_hora: string; duracao_min: number; status: string }[] = useMemo(
    () => data?.agendamentos ?? [],
    [data?.agendamentos],
  );
  const loyaltyConfig = data?.fidelidade ?? null;
  const portfolio: Photo[] = useMemo(() => data?.portfolio ?? [], [data?.portfolio]);
  const reviews: Review[] = useMemo(() => data?.avaliacoes ?? [], [data?.avaliacoes]);
  const perfil = data?.perfil;
  // 🔧 NOVO: expediente, intervalos e bloqueios da manicure (vindos da server function)
  const horarios: { dia_semana: number; hora_inicio: string; hora_fim: string }[] = useMemo(
    () => data?.horarios ?? [],
    [data?.horarios],
  );
  const intervalos: { dia_semana: number; nome: string; hora_inicio: string; hora_fim: string }[] =
    useMemo(() => data?.intervalos ?? [], [data?.intervalos]);
  const bloqueios: {
    data_inicio: string;
    data_fim: string | null;
    hora_inicio: string | null;
    hora_fim: string | null;
  }[] = useMemo(() => data?.bloqueios ?? [], [data?.bloqueios]);

  // Generate date options (next 14 days)
  const dateOptions = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => addDays(new Date(), i));
  }, []);

  // Helpers de expediente/bloqueio — espelham a validação do banco (agendar_servico)
  const diasComExpediente = useMemo(() => new Set(horarios.map((h) => h.dia_semana)), [horarios]);

  const diaTotalmenteBloqueado = useCallback(
    (date: Date): boolean => {
      if (horarios.length > 0 && !diasComExpediente.has(date.getDay())) return true;
      const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return bloqueios.some((b) => {
        const inicio = b.data_inicio;
        const fim = b.data_fim ?? b.data_inicio;
        return b.hora_inicio === null && dayKey >= inicio && dayKey <= fim;
      });
    },
    [horarios, diasComExpediente, bloqueios],
  );

  // Time Slot generator & overlap checker — usa a lógica pura unificada
  const timeSlots = useMemo(() => {
    if (!selectedService) return [];

    const slots = gerarSlots({
      data: selectedDate,
      duracaoMin: selectedService.duracao_min,
      expediente: horarios.map((h) => ({ ...h, ativo: true })),
      intervalos,
      bloqueios,
      ocupados: bookings.map((b) => ({ data_hora: b.data_hora, duracao_min: b.duracao_min })),
      passoMin: 30,
      ignoraAntesDe: isSameDay(selectedDate, new Date()) ? format(new Date(), "HH:mm") : undefined,
    });

    return slots.map((s) => ({
      time: s.hora,
      available: s.disponivel,
      motivo: s.motivo,
    }));
  }, [selectedService, selectedDate, horarios, intervalos, bloqueios, bookings]);

  // Apenas horários realmente disponíveis são apresentados à cliente
  const availableSlots = useMemo(() => {
    return timeSlots.filter((slot) => slot.available);
  }, [timeSlots]);

  // Limpa o horário caso a cliente troque de dia e o horário anterior não esteja livre
  useEffect(() => {
    if (selectedTime && !availableSlots.some((s) => s.time === selectedTime)) {
      setSelectedTime("");
    }
  }, [availableSlots, selectedTime]);

  // Máscara dinâmica de telefone brasileiro (celular ou fixo)
  const formatPhoneBR = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : "";
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10)
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  // Birthday discount checker (compare only month, ignore year)
  const birthdayDiscount = useMemo(() => {
    if (!clientForm.data_nascimento || !loyaltyConfig || !loyaltyConfig.niver_promo_ativa)
      return null;
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

  // Final Price calculator — combina cupom e aniversário SEM acumular:
  // aplica o MAIOR desconto entre os dois (mesma regra usada no servidor).
  const pricing = useMemo(() => {
    if (!selectedService)
      return {
        original: 0,
        final: 0,
        discount: 0,
        origem: null as null | "cupom" | "aniversario",
      };
    const original = selectedService.valor;
    const descCupom = melhorCupomDisp?.desconto ?? 0;
    const descAniv = birthdayDiscount ? (original * birthdayDiscount) / 100 : 0;
    const usarCupom = melhorCupomDisp !== null && descCupom >= descAniv;
    const desconto = usarCupom ? descCupom : descAniv;
    const final = Math.max(0, original - desconto);
    const origem: null | "cupom" | "aniversario" =
      desconto <= 0 ? null : usarCupom ? "cupom" : "aniversario";
    return { original, final, discount: desconto, origem };
  }, [selectedService, birthdayDiscount, melhorCupomDisp]);

  // Booking Mutation — criação via server function (validação no servidor)
  const bookingMut = useMutation({
    mutationFn: async () => {
      if (!selectedService || !selectedTime)
        throw new Error("Selecione o procedimento e o horário desejado");
      if (!clientForm.nome.trim()) throw new Error("Por favor, preencha seu nome");
      const digitosTel = clientForm.telefone.replace(/\D/g, "");
      if (digitosTel.length < 10) throw new Error("Informe seu WhatsApp completo com DDD");

      // Format ISO Date Time a partir do dia e horário selecionados
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const appointmentDate = new Date(`${dateStr}T${selectedTime}:00`);

      const res = await criarAgendamentoPublico({
        data: {
          userId,
          nome: clientForm.nome.trim(),
          telefone: clientForm.telefone.trim(),
          email: clientForm.email.trim() || "",
          dataNascimento: clientForm.data_nascimento || "",
          observacoes: clientForm.observacoes.trim() || "",
          servicoId: selectedService.id,
          dataHora: appointmentDate.toISOString(),
          cupomId: pricing.origem === "cupom" ? (melhorCupomDisp?.cupom.id ?? null) : null,
        },
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      setStep(4); // Success step
    },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  // Review submission Mutation — via server function (validação no servidor)
  const reviewMut = useMutation({
    mutationFn: async () => {
      if (!reviewForm.nome.trim()) throw new Error("Insira seu nome");
      const res = await criarAvaliacaoPublica({
        data: {
          userId,
          nome: reviewForm.nome.trim(),
          nota: reviewForm.nota,
          comentario: reviewForm.comentario.trim() || "",
        },
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Obrigada pelo seu feedback!");
      setShowReviewForm(false);
      setReviewForm({ nome: "", nota: 5, comentario: "" });
      publicoQuery.refetch();
    },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between p-4 md:p-8">
      {/* Top Header */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between gap-3 pb-6 border-b border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-xl gradient-primary grid place-items-center shadow-glow shrink-0">
            <img src={logoIconWhite} alt="Logo" className="size-5 object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl leading-none truncate">
              {erroPublico ? "Perfil indisponível" : perfil?.nome || "Carregando..."}
            </h1>
            <p className="text-[10px] text-muted-foreground mt-1 truncate">
              Agendamento Online Premium
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => {
            if (step > 1 && step < 4) setStep(step - 1);
          }}
          disabled={step === 1 || step === 4}
        >
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
              <h2 className="font-display text-2xl flex items-center gap-2">
                <Scissors className="size-5 text-purple-500" /> Escolha o Serviço
              </h2>
              <p className="text-xs text-muted-foreground">
                Selecione o procedimento desejado para continuar
              </p>

              {publicoQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-xl" />
                  ))}
                </div>
              ) : erroPublico ? (
                <p className="text-sm text-center py-6 text-muted-foreground">
                  {mensagemErroAmigavel(erroPublico)}
                </p>
              ) : services.length === 0 ? (
                <p className="text-sm text-center py-6 text-muted-foreground">
                  Nenhum serviço disponível no momento.
                </p>
              ) : (
                <div className="space-y-2">
                  {services.map((s) => (
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
                        <span className="text-xs text-muted-foreground block mt-0.5">
                          {s.duracao_min} minutos
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-display font-bold bg-gradient-to-br from-purple-600 to-pink-600 bg-clip-text text-transparent text-base group-hover:scale-105 transition-transform block">
                          {brl(s.valor)}
                        </span>
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
              <h2 className="font-display text-2xl flex items-center gap-2">
                <CalendarDays className="size-5 text-purple-500" /> Data & Horário
              </h2>
              <p className="text-xs text-muted-foreground">
                Procedimento: <span className="font-semibold">{selectedService.nome}</span> (
                {selectedService.duracao_min} min)
              </p>

              {/* Date slider */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Selecione a data:</Label>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {dateOptions.map((date) => {
                    const active = isSameDay(date, selectedDate);
                    const blocked = diaTotalmenteBloqueado(date);
                    return (
                      <button
                        key={date.toISOString()}
                        onClick={() => {
                          setSelectedDate(date);
                          setSelectedTime("");
                        }}
                        disabled={blocked}
                        className={`px-4 py-2.5 rounded-xl text-center shrink-0 min-w-[70px] transition-all flex flex-col items-center ${
                          blocked
                            ? "opacity-30 cursor-not-allowed"
                            : active
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
                {diaTotalmenteBloqueado(selectedDate) && (
                  <p className="text-xs text-muted-foreground">
                    Esta data está indisponível (fora do expediente ou bloqueada pela profissional).
                  </p>
                )}
              </div>

              {/* Hours Grid */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Horários livres para agendamento:
                </Label>
                {availableSlots.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border/60 p-4 space-y-1">
                    <Clock className="size-5 mx-auto text-muted-foreground/60 mb-1" />
                    <p className="font-medium text-foreground">
                      Nenhum horário disponível para esta data
                    </p>
                    <p className="text-[11px]">
                      Todos os horários estão ocupados, em intervalo ou fora do expediente. Escolha
                      outro dia acima.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot.time}
                        onClick={() => setSelectedTime(slot.time)}
                        className={`py-2.5 rounded-xl text-center text-xs font-medium transition-all ${
                          selectedTime === slot.time
                            ? "gradient-primary text-primary-foreground shadow-glow scale-105 font-bold ring-2 ring-purple-400/50"
                            : "glass hover:bg-purple-500/10 hover:border-purple-300/40 text-foreground"
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
              <h2 className="font-display text-2xl flex items-center gap-2">
                <User className="size-5 text-purple-500" /> Suas Informações
              </h2>
              <p className="text-xs text-muted-foreground">
                Confirme seus dados para garantir a reserva
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  bookingMut.mutate();
                }}
                className="space-y-4"
              >
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Seu Nome *</Label>
                    <Input
                      value={clientForm.nome}
                      placeholder="Como deseja ser chamada?"
                      onChange={(e) => setClientForm({ ...clientForm, nome: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Seu Telefone / WhatsApp *</Label>
                    <Input
                      value={clientForm.telefone}
                      placeholder="(99) 99999-9999"
                      maxLength={15}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, telefone: formatPhoneBR(e.target.value) })
                      }
                      required
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">E-mail (opcional)</Label>
                    <Input
                      type="email"
                      value={clientForm.email}
                      placeholder="para receber confirmações"
                      onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      Data de Nascimento (Para desconto de Aniversário!)
                    </Label>
                    <Input
                      type="date"
                      value={clientForm.data_nascimento}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, data_nascimento: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Observações adicionais (Opcional)</Label>
                  <Textarea
                    value={clientForm.observacoes}
                    placeholder="Ex: alongamento em gel, unhas decoradas, etc."
                    onChange={(e) => setClientForm({ ...clientForm, observacoes: e.target.value })}
                  />
                </div>

                {(pricing.origem !== null || (cuponsQuery.data?.rejeitados?.length ?? 0) > 0) && (
                  <div className="space-y-2">
                    {pricing.origem === "cupom" && melhorCupomDisp && (
                      <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-3.5 rounded-xl text-xs flex items-center gap-2 font-medium">
                        <Gift className="size-4 shrink-0" />
                        <span>
                          Cupom <b>{melhorCupomDisp.cupom.nome}</b> aplicado automaticamente:{" "}
                          <b>-{brl(melhorCupomDisp.desconto)}</b>
                        </span>
                      </div>
                    )}
                    {pricing.origem === "aniversario" && (
                      <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-3.5 rounded-xl text-xs flex items-center gap-2 font-medium">
                        <Cake className="size-4 shrink-0" />
                        <span>
                          Parabéns! Identificamos seu aniversário:{" "}
                          <b>{birthdayDiscount}% de desconto aplicado!</b>
                        </span>
                      </div>
                    )}
                    {pricing.origem === null && (cuponsQuery.data?.rejeitados?.length ?? 0) > 0 && (
                      <div className="bg-muted/40 border border-border/60 rounded-xl p-3.5 text-[11px] text-muted-foreground flex items-start gap-2">
                        <Info className="size-3.5 shrink-0 mt-0.5" />
                        <span>
                          Cupom <b>{cuponsQuery.data?.rejeitados?.[0]?.nome}</b> não pôde ser
                          aplicado: {cuponsQuery.data?.rejeitados?.[0]?.motivo}.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={bookingMut.isPending}
                    className="w-full gradient-primary text-primary-foreground shadow-glow"
                  >
                    {bookingMut.isPending
                      ? "Confirmando Agendamento..."
                      : "Confirmar e Agendar Horário"}
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
                <p className="text-sm text-muted-foreground">
                  Obrigada, {clientForm.nome}. Seu horário foi reservado com sucesso.
                </p>
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

              {perfil?.telefone && (
                <div className="max-w-sm mx-auto w-full pt-1">
                  <Button
                    type="button"
                    className="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white shadow-md font-medium text-xs h-10 rounded-xl flex items-center justify-center gap-2"
                    onClick={() => {
                      const msg =
                        `Olá, ${perfil.nome || "tudo bem"}! 💅\n` +
                        `Acabei de fazer um agendamento online pelo seu link:\n\n` +
                        `• *Serviço:* ${selectedService.nome}\n` +
                        `• *Data:* ${format(selectedDate, "dd/MM/yyyy")}\n` +
                        `• *Horário:* ${selectedTime}\n` +
                        `• *Cliente:* ${clientForm.nome}\n` +
                        (clientForm.observacoes
                          ? `• *Observações:* ${clientForm.observacoes}\n`
                          : "") +
                        `\nAguardo a sua confirmação! 😊`;
                      abrirWhatsApp(perfil.telefone, msg);
                    }}
                  >
                    <MessageCircle className="size-4" />
                    Enviar confirmação no WhatsApp
                  </Button>
                </div>
              )}

              <div>
                <Button
                  className="glass border-0 hover:bg-accent/50 text-foreground"
                  onClick={() => {
                    setStep(1);
                    setSelectedService(null);
                    setSelectedTime("");
                    setClientForm({
                      nome: "",
                      telefone: "",
                      email: "",
                      data_nascimento: "",
                      observacoes: "",
                    });
                  }}
                >
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
              <h3 className="font-display text-base border-b border-border/40 pb-2">
                Resumo da Reserva
              </h3>
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
                    <span className="font-medium">
                      {format(selectedDate, "dd/MM")} às {selectedTime}
                    </span>
                  </div>
                )}

                {pricing.discount > 0 && (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Preço original:</span>
                      <span>{brl(pricing.original)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-500 font-medium">
                      <span>
                        {pricing.origem === "cupom"
                          ? `Cupom ${melhorCupomDisp?.cupom.nome}`
                          : "Desconto aniversário"}
                        :
                      </span>
                      <span>-{brl(pricing.discount)}</span>
                    </div>
                  </>
                )}

                <div className="flex justify-between border-t border-border/40 pt-2 font-bold text-sm">
                  <span>Valor Final:</span>
                  <span className="text-primary">{brl(pricing.final)}</span>
                </div>
              </div>
            </Card>
          )}

          {/* Portfolio carousel view */}
          {portfolio.length > 0 && (
            <Card className="bg-white/80 dark:bg-card/80 backdrop-blur-xl border-0 rounded-2xl p-5 space-y-3 shadow-[0_2px_16px_rgba(91,30,140,0.06)]">
              <h3 className="font-display text-base flex items-center gap-1.5">
                <Heart className="size-4 text-rose-500" /> Meu Portfólio
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {portfolio.slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    className="relative aspect-square rounded-xl overflow-hidden bg-accent/40"
                  >
                    <img src={p.imagem_url} alt={p.titulo} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Testimonials/Reviews display */}
          <Card className="bg-white/80 dark:bg-card/80 backdrop-blur-xl border-0 rounded-2xl p-5 space-y-4 shadow-[0_2px_16px_rgba(91,30,140,0.06)]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base flex items-center gap-1.5">
                <Star className="size-4 text-amber-400 fill-amber-400" /> Avaliações
              </h3>

              {!showReviewForm && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 px-2"
                  onClick={() => setShowReviewForm(true)}
                >
                  Avaliar
                </Button>
              )}
            </div>

            {/* Leave a review subform */}
            {showReviewForm ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  reviewMut.mutate();
                }}
                className="space-y-3 p-3 bg-accent/30 rounded-xl"
              >
                <div>
                  <Label className="text-[10px] uppercase">Seu Nome *</Label>
                  <Input
                    className="h-8 text-xs p-2"
                    value={reviewForm.nome}
                    onChange={(e) => setReviewForm({ ...reviewForm, nome: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase block">Nota (1 a 5 estrelas)</Label>
                  <div className="flex gap-1.5 mt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewForm({ ...reviewForm, nota: star })}
                        className="text-amber-500 focus:outline-none"
                      >
                        <Star
                          className={`size-4.5 ${reviewForm.nota >= star ? "fill-amber-500" : ""}`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Comentário</Label>
                  <Textarea
                    className="text-xs p-2 min-h-[50px]"
                    value={reviewForm.comentario}
                    placeholder="O que achou do serviço?"
                    onChange={(e) => setReviewForm({ ...reviewForm, comentario: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={reviewMut.isPending}
                    className="flex-1 gradient-primary text-primary-foreground text-xs h-8"
                  >
                    {reviewMut.isPending ? "Enviando..." : "Enviar"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-xs h-8"
                    onClick={() => setShowReviewForm(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : reviews.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Sem avaliações ainda.
              </p>
            ) : (
              <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                {reviews.slice(0, 3).map((r) => (
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
