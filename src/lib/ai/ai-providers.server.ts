/**
 * AI Providers — Server-only helpers
 *
 * Contém a lógica real de chamada às APIs OpenAI e Gemini.
 * Inclui:
 * - System prompt profissional e completo
 * - Observabilidade (timing, tokens, custo)
 * - Configurações (modelo, temperatura, max_tokens) via env vars
 * - Fallback entre provedores
 *
 * Tree-shaken do bundle do cliente (`.server.ts`).
 */

import { AiServiceError } from "./ai-service";
import { aiLogger } from "./ai-logger";

// ─── Types ──────────────────────────────────────────────────────────────────

type ChatMessage = { role: string; content: string };

export type AiContextData = {
  appName: string;
  appDescription: string;
  totalClientes: number;
  totalAgendamentos: number;
  totalServicos: number;
  faturamentoMes: number;
  // Contexto expandido
  estoqueBaixo: number;
  contasAReceber: number;
  contasVencidas: number;
  aniversariantesMes: number;
  metasFaturamento: number;
  metasLucro: number;
  servicosMaisVendidos: string;
  clientesInativos: number;
  ticketMedio: number;
  ocupacaoAgenda: number;
  lucroMes: number;
};

export type ServerAiResponse = { text: string; suggestions?: string[] };

// ─── System Prompt Profissional ─────────────────────────────────────────────

export function buildSystemPrompt(context: AiContextData): string {
  const contexto = [
    `- Nome: ${context.appName}`,
    `- Descrição: ${context.appDescription}`,
    `- Clientes cadastradas: ${context.totalClientes}`,
    `- Agendamentos registrados: ${context.totalAgendamentos}`,
    `- Serviços disponíveis: ${context.totalServicos}`,
    `- Faturamento do mês: R$ ${context.faturamentoMes.toFixed(2)}`,
    `- Lucro do mês: R$ ${context.lucroMes.toFixed(2)}`,
    `- Ticket médio: R$ ${context.ticketMedio.toFixed(2)}`,
    `- Ocupação da agenda: ${context.ocupacaoAgenda}%`,
    `- Produtos com estoque baixo: ${context.estoqueBaixo}`,
    `- Contas a receber: R$ ${context.contasAReceber.toFixed(2)}`,
    `- Contas vencidas: R$ ${context.contasVencidas.toFixed(2)}`,
    `- Aniversariantes do mês: ${context.aniversariantesMes}`,
    `- Clientes inativas (+30 dias sem visitar): ${context.clientesInativos}`,
    `- Meta de faturamento: R$ ${context.metasFaturamento.toFixed(2)}`,
    `- Meta de lucro: R$ ${context.metasLucro.toFixed(2)}`,
    `- Serviços mais vendidos: ${context.servicosMaisVendidos}`,
  ].join("\n");

  return `Você é a assistente virtual especializada do "${context.appName}", um sistema de gestão premium para manicures e pequenos salões de beleza.

## 🎯 SEU PAPEL
Você é uma **consultora sênior de gestão** para salões de beleza. Sua missão é ajudar a profissional a administrar melhor o negócio como uma CEO, aumentando lucro, fidelizando clientes e otimizando processos.

## 📊 CONTEXTO ATUAL DO NEGÓCIO
${contexto}

**IMPORTANTE:** Use esses dados para enriquecer suas respostas com informações reais. Quando detectar oportunidades ou problemas (ex: estoque baixo, clientes inativas, baixa ocupação), aponte proativamente e sugira ações.

## 📋 FUNCIONALIDADES DO SISTEMA
- **Clientes**: CRM com cadastro, histórico completo de atendimentos, ranking (Ouro/Prata/Bronze), aniversariantes, clientes inativas
- **Agendamentos**: Agenda com conflitos de horário, status (agendado/confirmado/concluído/cancelado), link público para agendamento online
- **Serviços**: Catálogo com preço, custo, duração, intervalo recomendado, margem de lucro
- **Financeiro**: Receitas, despesas, metas mensais de faturamento/lucro, contas a receber/vencidas
- **Estoque & Vendas**: Controle de produtos com alerta de estoque baixo, vendas com fidelidade
- **Marketing**: Programa de fidelidade (pontos por real), promoção de aniversário, campanhas
- **Galeria & Feedbacks**: Portfólio com fotos antes/depois, avaliações de clientes
- **Relatórios & Backup**: Exportação CSV, backup manual

## 🤖 INTELIGÊNCIA DE NEGÓCIO
Sempre que os dados indicarem oportunidades, sugira PROATIVAMENTE:
- 🎯 **Promoções** e campanhas para clientes inativas
- 💰 **Aumento de preço** se o ticket médio estiver baixo
- 📦 **Serviços mais lucrativos** para divulgar
- 📅 **Clientes que precisam retornar** com base no intervalo recomendado
- ✂️ **Novos serviços** para oferecer com base nos mais vendidos
- 📉 **Redução de custos** se a margem estiver apertada

## ✅ REGRAS OBRIGATÓRIAS
1. **Sempre responda em português do Brasil**, com tom amigável, profissional e acolhedor
2. Use emojis com moderação para tornar a conversa mais agradável
3. **Seja objetiva e prática** — priorize ações que a profissional pode executar AGORA
4. Use formatação **negrito** para destacar informações importantes
5. Quando apropriado, use listas, títulos e tabelas para organizar a informação
6. **NUNCA invente informações** — se não souber, diga honestamente
7. Se um dado não estiver disponível, informe educadamente
8. Sempre que possível, relacione suas sugestões aos dados reais do negócio

## 📝 FORMATO DA RESPOSTA
Responda em markdown. Se quiser sugerir perguntas de acompanhamento, INCLUA um bloco JSON no FINAL da sua resposta:

\`\`\`json
{
  "suggestions": ["Pergunta 1?", "Pergunta 2?", "Pergunta 3?"]
}
\`\`\`

Forneça de 2 a 3 sugestões curtas e relevantes.`;
}

// ─── Parse suggestions ──────────────────────────────────────────────────────

function parseSuggestions(text: string): { text: string; suggestions?: string[] } {
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
        return {
          text: text.replace(jsonMatch[0], "").trim(),
          suggestions: parsed.suggestions.slice(0, 5),
        };
      }
    } catch {
      // JSON inválido, ignora silenciosamente
    }
  }
  return { text };
}

// ─── Obter configurações do servidor ────────────────────────────────────────

function getServerConfig() {
  return {
    provider: (process.env.AI_PROVIDER ?? "openai").toLowerCase() as "openai" | "gemini",
    openAiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    openAiTemperature: Number(process.env.OPENAI_TEMPERATURE ?? "0.7"),
    openAiMaxTokens: Number(process.env.OPENAI_MAX_TOKENS ?? "2048"),
    geminiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    geminiTemperature: Number(process.env.GEMINI_TEMPERATURE ?? "0.7"),
    geminiMaxTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? "2048"),
  };
}

// ─── OpenAI Call ────────────────────────────────────────────────────────────

export async function callOpenAI(
  messages: ChatMessage[],
  configOverrides?: { temperature?: number; maxTokens?: number },
): Promise<ServerAiResponse> {
  const config = getServerConfig();
  const startTime = Date.now();

  // Client settings override env vars
  const temperature = configOverrides?.temperature ?? config.openAiTemperature;
  const maxTokens = configOverrides?.maxTokens ?? config.openAiMaxTokens;

  if (!config.openAiKey) {
    throw new AiServiceError(
      "server-error",
      "OPENAI_API_KEY não configurada",
      "O assistente não foi configurado com uma chave de IA. Entre em contato com o suporte.",
    );
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiKey}`,
    },
    body: JSON.stringify({
      model: config.openAiModel,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const duration = Date.now() - startTime;
    aiLogger.log(aiLogger.createLog({
      provider: "openai",
      model: config.openAiModel,
      startTime,
      messageLength: messages.reduce((s, m) => s + m.content.length, 0),
      responseLength: 0,
      success: false,
      error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
      cached: false,
    }));

    if (res.status === 429) {
      throw new AiServiceError("rate-limit", `OpenAI rate limit: ${body}`);
    }
    throw new AiServiceError("api-error", `OpenAI error ${res.status}: ${body}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";

  if (!text) {
    throw new AiServiceError("api-error", "OpenAI retornou resposta vazia");
  }

  const result = parseSuggestions(text);

  // Log de observabilidade
  aiLogger.log(aiLogger.createLog({
    provider: "openai",
    model: config.openAiModel,
    startTime,
    messageLength: messages.reduce((s, m) => s + m.content.length, 0),
    responseLength: result.text.length,
    success: true,
    cached: false,
    promptTokens: json.usage?.prompt_tokens,
    completionTokens: json.usage?.completion_tokens,
  }));

  return result;
}

// ─── Gemini Call ────────────────────────────────────────────────────────────

export async function callGemini(
  messages: ChatMessage[],
  configOverrides?: { temperature?: number; maxTokens?: number },
): Promise<ServerAiResponse> {
  const config = getServerConfig();
  const startTime = Date.now();

  // Client settings override env vars
  const temperature = configOverrides?.temperature ?? config.geminiTemperature;
  const maxTokens = configOverrides?.maxTokens ?? config.geminiMaxTokens;

  if (!config.geminiKey) {
    throw new AiServiceError(
      "server-error",
      "GEMINI_API_KEY não configurada",
      "O assistente não foi configurado com uma chave de IA. Entre em contato com o suporte.",
    );
  }

  // Converte para formato Gemini
  const contents: { role: string; parts: { text: string }[] }[] = [];
  let systemContent = "";

  for (const msg of messages) {
    if (msg.role === "system") {
      systemContent = msg.content;
    } else {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  if (systemContent && contents.length > 0) {
    contents[0].parts[0].text = `${systemContent}\n\n${contents[0].parts[0].text}`;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    aiLogger.log(aiLogger.createLog({
      provider: "gemini",
      model: config.geminiModel,
      startTime,
      messageLength: messages.reduce((s, m) => s + m.content.length, 0),
      responseLength: 0,
      success: false,
      error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
      cached: false,
    }));

    if (res.status === 429) {
      throw new AiServiceError("rate-limit", `Gemini rate limit: ${body}`);
    }
    throw new AiServiceError("api-error", `Gemini error ${res.status}: ${body}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

  if (!text) {
    throw new AiServiceError("api-error", "Gemini retornou resposta vazia");
  }

  const result = parseSuggestions(text);

  // Log de observabilidade
  const promptTokens =
    json.usageMetadata?.promptTokenCount ??
    json.usageMetadata?.prompt_tokens;
  const completionTokens =
    json.usageMetadata?.candidatesTokenCount ??
    json.usageMetadata?.completion_tokens;

  aiLogger.log(aiLogger.createLog({
    provider: "gemini",
    model: config.geminiModel,
    startTime,
    messageLength: messages.reduce((s, m) => s + m.content.length, 0),
    responseLength: result.text.length,
    success: true,
    cached: false,
    promptTokens,
    completionTokens,
  }));

  return result;
}
