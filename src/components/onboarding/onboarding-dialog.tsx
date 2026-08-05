/**
 * OnboardingDialog — Guia de início rápido para novos usuários
 *
 * Aparece na primeira vez que o usuário acessa o dashboard.
 * Mostra um passo a passo com as principais funcionalidades.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users, CalendarDays, Scissors, Wallet, ArrowRight, Check,
  Package, Percent,
} from "lucide-react";

const STORAGE_KEY = "mf-onboarding-done";

const steps = [
  {
    icon: Users,
    title: "Cadastre suas Clientes",
    description: "Adicione as clientes com nome, telefone e preferências. O histórico de agendamentos será automaticamente registrado.",
    action: "/clientes",
    actionLabel: "Ir para Clientes",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Scissors,
    title: "Configure seus Serviços",
    description: "Defina os preços, custos e duração de cada procedimento. Começamos com 4 serviços padrão para você.",
    action: "/servicos",
    actionLabel: "Ir para Serviços",
    color: "from-[#D946EF] to-[#A855F7]",
  },
  {
    icon: CalendarDays,
    title: "Agende seus Horários",
    description: "Use a agenda visual para gerenciar todos os agendamentos. Arraste para reagendar e veja conflitos em tempo real.",
    action: "/agendamentos",
    actionLabel: "Ir para Agenda",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Wallet,
    title: "Acompanhe o Financeiro",
    description: "Receitas, despesas, DRE e fluxo de caixa em um só lugar. Saiba exatamente quanto você está lucrando.",
    action: "/financeiro",
    actionLabel: "Ir para Financeiro",
    color: "from-amber-500 to-orange-500",
  },
  {
    icon: Package,
    title: "Controle seu Estoque",
    description: "Registre produtos, movimentações e receba alertas quando o estoque estiver baixo.",
    action: "/estoque",
    actionLabel: "Ir para Estoque",
    color: "from-purple-500 to-pink-500",
  },
  {
    icon: Percent,
    title: "Atraia mais Clientes",
    description: "Crie promoções, programa de fidelidade e campanhas de marketing para fazer seu salão crescer.",
    action: "/marketing",
    actionLabel: "Ir para Marketing",
    color: "from-rose-500 to-red-500",
  },
];

export function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      // Delay para não aparecer imediatamente
      const timer = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  function handleComplete() {
    localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  }

  function handleSkip() {
    localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  }

  function handleGoTo() {
    const s = steps[step];
    if (s.action) {
      navigate({ to: s.action as any });
    }
    handleComplete();
  }

  const current = steps[step];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-3xl">
        {/* Progress bar */}
        <div className="h-1 bg-muted/50">
          <div
            className="h-full bg-gradient-to-r from-[#D946EF] to-[#A855F7] transition-all duration-500 rounded-full"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="p-6 md:p-8">
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Passo {step + 1} de {steps.length}
            </span>
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`size-1.5 rounded-full transition-all duration-300 ${
                    i === step ? "bg-[#D946EF] w-4" : i < step ? "bg-[#D946EF]/50" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div className={`size-16 rounded-2xl bg-gradient-to-br ${current.color} grid place-items-center mx-auto mb-5 shadow-lg`}>
            <current.icon className="size-7 text-white" />
          </div>

          {/* Content */}
          <div className="text-center mb-6 animate-fade-up" key={step}>
            <DialogTitle className="font-display text-xl mb-2">{current.title}</DialogTitle>
            <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleGoTo}
              className="flex-1 gradient-primary text-primary-foreground shadow-glow rounded-xl h-11"
            >
              {current.actionLabel} <ArrowRight className="size-4 ml-2" />
            </Button>
            {step < steps.length - 1 ? (
              <Button
                variant="outline"
                onClick={() => setStep(s => s + 1)}
                className="rounded-xl h-11"
              >
                Próximo
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleComplete}
                className="rounded-xl h-11"
              >
                <Check className="size-4 mr-1" /> Começar a usar
              </Button>
            )}
          </div>

          {/* Skip */}
          <button
            onClick={handleSkip}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors mx-auto block mt-4 underline-offset-2 hover:underline"
          >
            Pular introdução
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
