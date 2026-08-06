/**
 * AI Assistant — Gatilho premium (botão do header)
 *
 * Componente LEVE, separado do painel (ai-assistant.tsx) para permitir
 * lazy-load do painel pesado (react-markdown) sem atrasar o header.
 */
import { BrainCircuit } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { setAiPanelOpen, useAiPanelOpen } from "./ai-panel-store";

/**
 * Gatilho premium — botão no header (topo direito)
 * Visual: pill com gradiente da marca, ícone exclusivo de IA (cérebro com
 * circuitos), brilho suave, ponto "online" e micro-interações.
 */
export function AiAssistantLauncher() {
  const open = useAiPanelOpen();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setAiPanelOpen(!open)}
          aria-label={open ? "Fechar assistente IA" : "Abrir assistente IA"}
          aria-pressed={open}
          className={`group relative h-9 rounded-full flex items-center gap-1.5 pl-2.5 pr-2.5 md:pr-4 text-white text-xs font-semibold tracking-wide bg-gradient-to-r from-[#D946EF] to-[#A855F7] transition-all duration-300 ease-out overflow-hidden ${
            open
              ? "shadow-[0_4px_28px_rgba(217,70,239,0.55)] ring-2 ring-[#D946EF]/60 ring-offset-2 ring-offset-background"
              : "shadow-[0_4px_20px_rgba(217,70,239,0.35)] hover:shadow-[0_4px_28px_rgba(217,70,239,0.55)] hover:scale-[1.04] active:scale-95"
          }`}
        >
          {/* Brilho que atravessa o botão no hover */}
          <span
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 bg-white/20 blur-md rotate-12 transition-transform duration-700 ease-out group-hover:translate-x-[400%]"
            aria-hidden="true"
          />
          <BrainCircuit className="size-4 shrink-0 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
          <span className="hidden md:inline">Assistente IA</span>
          {/* Ponto "online" — sugere assistente vivo e inteligente */}
          <span
            className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 border-2 border-background animate-pulse-soft"
            aria-hidden="true"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8} className="bg-[#171923] text-white border border-[#252836]">
        {open ? "Fechar assistente IA" : "Assistente IA — sua consultora de gestão"}
      </TooltipContent>
    </Tooltip>
  );
}
