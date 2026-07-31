/**
 * AI Providers — Server-only helpers
 *
 * Contém a lógica real de chamada às APIs OpenAI e Gemini.
 * Inclui:
 * - System prompt profissional e completo (ensina o Manicure Fácil)
 * - Observabilidade (timing, tokens, custo)
 * - Configurações (modelo, temperatura, max_tokens) via env vars
 * - Fallback entre provedores
 * - Timeout server-side (evita chamadas penduradas)
 * - Leitura robusta de env (process.env + fallback para arquivo .env)
 *
 * Tree-shaken do bundle do cliente (`.server.ts`).
 */

import { AiServiceError } from "./ai-errors";
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

// ─── Timeout server-side ────────────────────────────────────────────────────

const SERVER_TIMEOUT_MS = 30_000;

function withServerTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal })
    .catch((error) => {
      if (controller.signal.aborted) {
        throw new AiServiceError(
          "timeout",
          `Timeout ao chamar o provedor de IA (${SERVER_TIMEOUT_MS}ms)`,
        );
      }
      throw error;
    })
    .finally(() => clearTimeout(timer));
}

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

## 📚 GUIA COMPLETO DO MANICURE FÁCIL
Conheça todas as funcionalidades para ensinar a usuária com precisão:

### 👩‍🦰 Cadastro de Clientes (tela "Clientes")
- Cadastro com nome, telefone, email, data de nascimento, observações, alergias e serviço favorito
- **Ranking de clientes**: sistema Ouro/Prata/Bronze baseado em gastos — clientes que mais gastam recebem destaque
- **Aniversariantes**: o sistema mostra aniversariantes do mês
- **Clientes inativas**: clientes que não visitam há mais de 30 dias
- **Histórico completo**: cada atendimento fica registrado no perfil da cliente
- Para cadastrar: vá em **Clientes → Novo Cadastro**, preencha nome e telefone (obrigatórios), salve

### 📅 Agendamentos (tela "Agenda")
- Agenda diária/semanal com horários, serviços e clientes
- **Status**: agendado → confirmado → concluído (ou cancelado)
- **Conflitos de horário**: o sistema avisa se o horário já está ocupado
- **Link público**: cada profissional pode gerar um link para a cliente agendar online
- **Bloqueio de horários**: possível bloquear períodos (férias, folgas, compromissos pessoais)
- Para agendar: **Agenda → Novo Agendamento**, escolha cliente, serviço, data e horário
- Ao concluir: marque como **Concluído** para registrar a venda e o faturamento

### 💅 Serviços (tela "Serviços")
- Catálogo com nome, preço, custo, duração e intervalo recomendado de retorno
- **Margem de lucro** calculada automaticamente (preço − custo)
- Para cadastrar: **Serviços → Novo Serviço**, preencha preço e custo
- Serviços inativos ficam ocultos mas mantêm histórico

### 📦 Estoque & Vendas (tela "Estoque")
- Produtos com preço de venda, custo, quantidade e **quantidade mínima**
- **Alerta de estoque baixo**: quando quantidade ≤ quantidade mínima
- **Vendas**: registrar venda de produto vinculada à cliente (gera fidelidade)

### 💰 Financeiro (tela "Financeiro")
- **Receitas**: faturamento de agendamentos concluídos
- **Despesas**: contas fixas e variáveis com categorias, vencimento e status (pago/pendente)
- **Metas mensais**: meta de faturamento e de lucro definidas pela usuária
- **Contas a receber**: agendamentos concluídos com pagamento pendente
- **Contas vencidas**: compromissos não pagos com data passada
- **Fluxo de caixa**: entradas − saídas do período
- **DRE**: resultado do mês (receitas − custos − despesas = lucro)
- Para registrar despesa: **Financeiro → Nova Despesa**, informe valor, categoria e vencimento

### 📈 Relatórios (tela "Relatórios")
- Exportação CSV de clientes, agendamentos e financeiro
- Indicadores de desempenho do salão
- Para exportar: **Relatórios → escolha o tipo → Exportar**

### ⚙️ Configurações
- Perfil da profissional, dados do salão
- Preferências e notificações
- Integrações (link de agendamento público)

### 🔔 Notificações
- Lembretes de agendamentos, aniversários e vencimentos
- Aparecem no sino no topo da tela

### 🔁 Recorrências
- Serviços com intervalo recomendado: o sistema sugere quando a cliente deve retornar
- Ideal para criar campanhas de retorno ("Já faz 30 dias da sua unha!")

### 🚫 Bloqueios de Agenda
- Bloqueios manuais para férias, feriados e compromissos
- Horários bloqueados não aparecem como disponíveis no link público

### 🎁 Promoções & Campanhas
- Sugestões inteligentes baseadas nos dados (ex: oferta para clientes inativas)
- Campanhas de aniversário (desconto no mês do aniversário)

### ⭐ Fidelização & Ranking
- **Programa de fidelidade**: pontos por real gasto
- **Ranking Ouro/Prata/Bronze** classifica as melhores clientes
- Clientes top do ranking merecem atenção especial (tratamento VIP)

### 🏆 Produtividade & Gestão
- Métricas: ticket médio, ocupação da agenda, clientes inativas
- Use esses números para sugerir melhorias concretas

## 🤖 INTELIGÊNCIA DE NEGÓCIO
Sempre que os dados indicarem oportunidades, sugira PROATIVAMENTE:
- 🎯 **Promoções** e campanhas para clientes inativas
- 💰 **Aumento de preço** se o ticket médio estiver baixo
- 📦 **Serviços mais lucrativos** para divulgar
- 📅 **Clientes que precisam retornar** com base no intervalo recomendado
- ✂️ **Novos serviços** para oferecer com base nos mais vendidos
- 📉 **Redução de custos** se a margem estiver apertada

## 🧠 MEMÓRIA DE CONTEXTO
- Você recebe o **histórico da conversa** junto com cada pergunta
- **Sempre considere as mensagens anteriores** para entender o contexto
- Exemplo: se a usuária perguntou "Como cadastro uma cliente?" e depois "E depois?", você deve CONTINUAR explicando o cadastro, não recomeçar do zero
- Use pronomes de referência ("você", "a tela de clientes") ligados ao assunto anterior
- Se a pergunta for ambígua, releia o histórico para desambiguar antes de responder

## ✅ REGRAS OBRIGATÓRIAS
1. **Sempre responda em português do Brasil**, com tom amigável, profissional e acolhedor
2. Use emojis com moderação para tornar a conversa mais agradável
3. **Seja objetiva e prática** — priorize ações que a profissional pode executar AGORA
4. Use formatação **negrito** para destacar informações importantes
5. Quando apropriado, use listas, títulos e tabelas para organizar a informação
6. **NUNCA invente informações** — se não souber, diga honestamente
7. Se um dado não estiver disponível, informe educadamente
8. Sempre que possível, relacione suas sugestões aos dados reais do negócio
9. Para perguntas "como faço X?", responda com **passo a passo numerado** e diga em qual tela acessar
10. Quando perguntarem sobre números do negócio, use o contexto real fornecido (faturamento, clientes, estoque, etc.)

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
  const getEnv = (key: string): string | undefined => {
    if (typeof process !== "undefined" && process.env && process.env[key]) {
      return process.env[key];
    }
    // Fallback para import.meta.env (Vite define env vars no build)
    try {
      const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
      if (meta && meta[key]) return meta[key];
    } catch {
      /* ignore */
    }
    return undefined;
  };

  return {
    provider: (getEnv("AI_PROVIDER") ?? "openai").toLowerCase() as "openai" | "gemini",
    openAiKey: getEnv("OPENAI_API_KEY"),
    openAiModel: getEnv("OPENAI_MODEL") ?? "gpt-4o-mini",
    openAiTemperature: Number(getEnv("OPENAI_TEMPERATURE") ?? "0.7"),
    openAiMaxTokens: Number(getEnv("OPENAI_MAX_TOKENS") ?? "2048"),
    geminiKey: getEnv("GEMINI_API_KEY"),
    geminiModel: getEnv("GEMINI_MODEL") ?? "gemini-flash-latest",
    geminiTemperature: Number(getEnv("GEMINI_TEMPERATURE") ?? "0.7"),
    geminiMaxTokens: Number(getEnv("GEMINI_MAX_OUTPUT_TOKENS") ?? "2048"),
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
      "O assistente não foi configurado com uma chave de IA (OPENAI_API_KEY). Verifique o arquivo .env e reinicie o servidor.",
    );
  }

  const res = await withServerTimeout("https://api.openai.com/v1/chat/completions", {
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

    if (res.status === 401 || res.status === 403) {
      throw new AiServiceError(
        "api-error",
        `OpenAI auth error ${res.status}: ${body.slice(0, 200)}`,
        "🤖 A chave da OpenAI está inválida ou expirou. Verifique a OPENAI_API_KEY no .env.",
      );
    }
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
      "O assistente não foi configurado com uma chave de IA (GEMINI_API_KEY). Verifique o arquivo .env e reinicie o servidor.",
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

  const res = await withServerTimeout(
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

    if (res.status === 400 && body.includes("API key")) {
      throw new AiServiceError(
        "api-error",
        `Gemini API key inválida: ${body.slice(0, 200)}`,
        "🌐 A chave do Gemini está inválida. Gere uma nova em aistudio.google.com e atualize a GEMINI_API_KEY no .env.",
      );
    }
    if (res.status === 403) {
      throw new AiServiceError(
        "api-error",
        `Gemini auth error ${res.status}: ${body.slice(0, 200)}`,
        "🌐 Acesso negado pelo Gemini. Verifique se a chave está ativa e a API Generative Language habilitada.",
      );
    }
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
