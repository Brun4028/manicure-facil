/**
 * AI Assistant — Estado compartilhado do painel (mini-store)
 *
 * O gatilho (header) e o painel (AppShell) são componentes separados e o
 * painel agora é carregado de forma LAZY (dynamic import) para não arrastar
 * o react-markdown para o bundle inicial. Este módulo é leve e concentra o
 * estado de aberto/fechado usado pelos dois lados.
 */
import { useSyncExternalStore } from "react";

const aiPanelListeners = new Set<() => void>();
let aiPanelOpen = false;

function subscribeAiPanel(listener: () => void) {
  aiPanelListeners.add(listener);
  return () => {
    aiPanelListeners.delete(listener);
  };
}

function getAiPanelOpen() {
  return aiPanelOpen;
}

function getAiPanelOpenServer() {
  return false;
}

export function setAiPanelOpen(open: boolean) {
  aiPanelOpen = open;
  aiPanelListeners.forEach((l) => l());
}

/** Hook usado tanto pelo launcher quanto pelo painel para ler o estado. */
export function useAiPanelOpen() {
  return useSyncExternalStore(subscribeAiPanel, getAiPanelOpen, getAiPanelOpenServer);
}
