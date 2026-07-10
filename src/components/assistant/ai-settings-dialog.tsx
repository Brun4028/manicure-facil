/**
 * AiSettingsDialog — Configurações do Assistente IA
 *
 * Permite ao usuário:
 * - Escolher entre OpenAI e Gemini
 * - Ajustar temperatura
 * - Definir tamanho máximo da resposta
 * - Visualizar estatísticas de uso
 *
 * As configurações são salvas em localStorage e enviadas ao servidor
 * junto com cada requisição para a IA.
 */

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { aiCache } from "@/lib/ai/ai-cache";
import { aiLogger } from "@/lib/ai/ai-logger";
import {
  Settings2, Brain, Thermometer, Ruler, BarChart3, RotateCcw, Trash2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AiSettings = {
  provider: "openai" | "gemini";
  temperature: number;
  maxTokens: number;
};

const STORAGE_KEY = "manicure-facil-ai-settings";

const DEFAULT_SETTINGS: AiSettings = {
  provider: "openai",
  temperature: 0.7,
  maxTokens: 2048,
};

function loadSettings(): AiSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: AiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

/** Lê as configurações atuais (para uso fora do dialog) */
export function getAiSettings(): AiSettings {
  return loadSettings();
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function AiSettingsDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    if (open) setSettings(loadSettings());
  }, [open]);

  const updateSetting = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  };

  const stats = aiLogger.summary();
  const cacheStats = aiCache.stats();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Settings2 className="size-5 text-[#D946EF]" />
            Configurações do Assistente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Provedor */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Brain className="size-4 text-[#D946EF]" />
              Provedor de IA
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={settings.provider === "openai" ? "default" : "outline"}
                onClick={() => updateSetting("provider", "openai")}
                className={`rounded-xl h-auto py-3 px-4 text-xs font-medium ${
                  settings.provider === "openai"
                    ? "bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white shadow-glow"
                    : "border-border hover:border-[#D946EF]/30"
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-sm">🤖</span>
                  <span>OpenAI</span>
                  <span className="opacity-70">GPT-4o Mini</span>
                </div>
              </Button>
              <Button
                variant={settings.provider === "gemini" ? "default" : "outline"}
                onClick={() => updateSetting("provider", "gemini")}
                className={`rounded-xl h-auto py-3 px-4 text-xs font-medium ${
                  settings.provider === "gemini"
                    ? "bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white shadow-glow"
                    : "border-border hover:border-[#D946EF]/30"
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-sm">🌐</span>
                  <span>Gemini</span>
                  <span className="opacity-70">Flash 2.0</span>
                </div>
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              O provider selecionado será enviado ao servidor em cada requisição.
              Você também pode definir um provider padrão via env var <code>AI_PROVIDER</code>.
            </p>
          </div>

          {/* Temperatura */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Thermometer className="size-4 text-[#D946EF]" />
                Temperatura
              </Label>
              <span className="text-xs font-mono text-muted-foreground">{settings.temperature.toFixed(1)}</span>
            </div>
            <Slider
              value={[settings.temperature]}
              onValueChange={([v]) => updateSetting("temperature", Math.round(v * 10) / 10)}
              min={0} max={2} step={0.1}
              className="[&_[role=slider]]:bg-[#D946EF]"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>📐 Preciso</span>
              <span>🎨 Criativo</span>
            </div>
          </div>

          {/* Max tokens */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Ruler className="size-4 text-[#D946EF]" />
                Tamanho máximo
              </Label>
              <span className="text-xs font-mono text-muted-foreground">{settings.maxTokens} tok</span>
            </div>
            <Slider
              value={[settings.maxTokens]}
              onValueChange={([v]) => updateSetting("maxTokens", v)}
              min={256} max={4096} step={256}
              className="[&_[role=slider]]:bg-[#D946EF]"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>📄 Curta</span>
              <span>📚 Longa</span>
            </div>
          </div>

          {/* Estatísticas */}
          <div>
            <Button
              variant="ghost" size="sm"
              onClick={() => setShowStats(!showStats)}
              className="text-xs text-muted-foreground hover:text-foreground w-full justify-start"
            >
              <BarChart3 className="size-3.5 mr-2 text-[#D946EF]" />
              {showStats ? "Ocultar" : "Mostrar"} estatísticas de uso
            </Button>

            {showStats && (
              <Card className="bg-muted/50 border-border rounded-xl p-4 mt-2 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Chamadas</p>
                    <p className="text-lg font-semibold text-card-foreground">{stats.totalCalls}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cache</p>
                    <p className="text-lg font-semibold text-card-foreground">{cacheStats.size} itens</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tempo médio</p>
                    <p className="text-lg font-semibold text-card-foreground">{stats.avgDurationMs.toFixed(0)}ms</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Custo est.</p>
                    <p className="text-lg font-semibold text-card-foreground">${stats.totalEstimatedCostUsd.toFixed(4)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/5 border-emerald-500/20">
                    {(stats.successRate * 100).toFixed(0)}% sucesso
                  </Badge>
                  <Badge variant="outline" className="text-[10px] bg-blue-500/5 border-blue-500/20">
                    {stats.cachedCalls} em cache
                  </Badge>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => { aiCache.clear(); setSettings({ ...settings }); }}
                    className="text-xs h-7 px-2"
                  ><Trash2 className="size-3 mr-1" /> Limpar cache</Button>
                  <Button variant="outline" size="sm" onClick={() => { aiLogger.clearLogs(); setSettings({ ...settings }); }}
                    className="text-xs h-7 px-2"
                  ><RotateCcw className="size-3 mr-1" /> Limpar logs</Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
