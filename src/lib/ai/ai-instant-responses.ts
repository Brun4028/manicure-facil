/**
 * AI Instant Responses — Respostas Rápidas e Humanizadas para Conversas e Perguntas Frequentes
 *
 * Permite que saudações ("oiii", "olá", "bom dia"), perguntas de bem-estar,
 * agradecimentos e dúvidas básicas do sistema sejam respondidas:
 * 1. Instantaneamente (sem latência de rede)
 * 2. Sem consumir a cota de requisições do Gemini/OpenAI
 * 3. Sem riscos de instabilidade/erro 503 da API externa
 * 4. Com tom caloroso, empático e acolhedor focado no dia a dia da manicure
 */

export type InstantResponse = {
  text: string;
  suggestions: string[];
};

// Normaliza texto para facilitar correspondência (sem pontuação, minúsculo, sem acentos repetidos)
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^\w\s]/gi, " ") // remove pontuação
    .replace(/\s+/g, " ")
    .trim();
}

// Reduz letras repetidas excessivas (ex: "oiiiii" -> "oii", "olaaaa" -> "ola")
function collapseRepeatedLetters(text: string): string {
  return text.replace(/(.)\1{2,}/g, "$1$1");
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Tenta identificar se a mensagem é uma conversa informal, saudação ou pergunta frequente.
 * Retorna a resposta imediata se houver correspondência, ou null caso precise da IA completa.
 */
export function getInstantQuickResponse(
  rawText: string,
  userName?: string,
): InstantResponse | null {
  if (!rawText || !rawText.trim()) return null;

  const rawTrimmed = rawText.trim();
  const normalized = normalizeText(rawTrimmed);
  const collapsed = collapseRepeatedLetters(normalized);

  const cleanName = userName ? userName.split(" ")[0].trim() : "";
  const nameGreeting = cleanName ? ` ${cleanName}` : "";

  // ─── 1. Saudações Simples / Casuais ("oi", "oiii", "olá", "e aí") ──────────
  const isSimpleGreeting =
    /^(oi|oii|ola|oie|hey|e ai|opa|fala|hello|salve|alo)$/.test(collapsed) ||
    /^(oi|oii|ola|oie|hey|e ai|opa)\s+(tudo bem|tudo bom|beleza|como vai)$/.test(collapsed);

  if (isSimpleGreeting) {
    const greetingVariations = [
      `Oi${nameGreeting}! ✨ Que alegria ter você aqui no Manicure Fácil! 💅\n\nComo posso ajudar você e o seu salão hoje? Posso tirar dúvidas da sua agenda, te ajudar com clientes, financeiro ou dar ideias de promoções!`,
      `Oii${nameGreeting}! 💖 Tudo ótimo por aqui! Prontíssima para descomplicar a sua rotina no salão. O que você gostaria de ver ou organizar agora?`,
      `Olá${nameGreeting}! ✨ Seja muito bem-vinda! Pronta para deixar seu salão ainda mais organizado e lucrativo hoje? Me conta: no que posso te apoiar?`,
      `Oie${nameGreeting}! 🌸 Que bom falar com você! Estou aqui para ser sua parceira de negócios. Você prefere ver dicas de faturamento, cadastrar clientes ou checar sua agenda?`,
    ];

    return {
      text: pickRandom(greetingVariations),
      suggestions: [
        "Como cadastrar uma nova cliente?",
        "Dicas para aumentar meu faturamento",
        "Como funciona o ranking de clientes?",
        "Como registrar um agendamento?",
      ],
    };
  }

  // ─── 2. Saudações por Horário ("bom dia", "boa tarde", "boa noite") ────────
  if (/^bom dia/.test(collapsed)) {
    return {
      text: `Bom dia${nameGreeting}! ☀️ Que seu dia seja maravilhoso, com a agenda cheia de atendimentos incríveis e muito sucesso! 💅✨\n\nComo posso ajudar a organizar seu dia de trabalho hoje?`,
      suggestions: [
        "Como registrar um agendamento?",
        "Dicas para aumentar meu faturamento",
        "Como funciona o ranking de clientes?",
      ],
    };
  }

  if (/^boa tarde/.test(collapsed)) {
    return {
      text: `Boa tarde${nameGreeting}! 🌸 Espero que seu dia esteja sendo muito produtivo e abençoado! 💖\n\nPrecisa de alguma ajuda rápida com clientes, estoque ou finanças do salão?`,
      suggestions: [
        "Sugestões de promoções",
        "Como funciona o ranking de clientes?",
        "Dicas para aumentar meu faturamento",
      ],
    };
  }

  if (/^boa noite/.test(collapsed)) {
    return {
      text: `Boa noite${nameGreeting}! ✨ Espero que seu dia de atendimentos tenha sido um sucesso incrível! 💅\n\nQuer aproveitar para conferir o resumo do seu dia, planejar a agenda de amanhã ou verificar seu faturamento?`,
      suggestions: [
        "Dicas para aumentar meu faturamento",
        "Como funciona o ranking de clientes?",
        "Como funciona o sistema?",
      ],
    };
  }

  // ─── 3. Perguntas de Bem-Estar / Small Talk ("tudo bem?", "como vai?") ──────
  if (
    /^(tudo bem|tudo bom|como vai|como voce esta|tudo joia|tudo certo|beleza)$/.test(collapsed) ||
    /^(como estao as coisas|tudo bem com voce|como vai voce)$/.test(collapsed)
  ) {
    return {
      text: `Tudo maravilhoso por aqui, muito obrigada por perguntar${nameGreeting}! 🥰✨\n\nEstou 100% pronta para ser sua consultora de negócios e te ajudar a faturar mais e ter total controle do seu salão. E com você, tudo certinho? O que vamos organizar hoje?`,
      suggestions: [
        "Dicas para aumentar meu faturamento",
        "Como funciona o ranking de clientes?",
        "Sugestões de promoções",
      ],
    };
  }

  // ─── 4. Agradecimentos ("obrigada", "valeu", "gratidão") ────────────────────
  if (
    /^(obrigad[ao]|valeu|gratidao|agradeco|muito obrigad[ao]|obg|obrigadao|brigad[ao])$/.test(
      collapsed,
    ) ||
    /^(muito legal|valeu mesmo|obrigada querida|obrigada amiga)$/.test(collapsed)
  ) {
    const thankVariations = [
      `Imagina${nameGreeting}! É sempre um prazer enorme ajudar você e seu salão a brilharem! ✨💖 Se precisar de qualquer outra coisa, estou sempre por aqui!`,
      `Por nada! 💅 Você é uma empreendedora maravilhosa e merece todo o sucesso. Conte comigo sempre que precisar analisar números ou planejar seus atendimentos!`,
      `De nada! 🥰 Estou à disposição a qualquer momento. Um excelente trabalho para você! ✨`,
    ];

    return {
      text: pickRandom(thankVariations),
      suggestions: [
        "Dicas para aumentar meu faturamento",
        "Como funciona o ranking de clientes?",
        "Sugestões de promoções",
      ],
    };
  }

  // ─── 5. Elogios ("você é ótima", "adorei", "perfeita", "arrasou") ──────────
  if (
    /^(voce e (otima|incrivel|maravilhosa|perfeita|muito boa|top|demais))$/.test(collapsed) ||
    /^(adorei|arraso|arrasou|perfeita|maravilhosa|amei|top demais)$/.test(collapsed)
  ) {
    return {
      text: `Aaaah, muito obrigada pelo carinho${nameGreeting}! 🥰💅 Fico muito feliz em poder te ajudar no dia a dia. Juntas vamos fazer o seu salão crescer ainda mais! Conte comigo para o que der e vier! ✨`,
      suggestions: [
        "Sugestões de promoções",
        "Dicas para aumentar meu faturamento",
        "Como gerenciar o estoque?",
      ],
    };
  }

  // ─── 6. Quem é você / O que você faz / Ajuda ───────────────────────────────
  if (
    /^(quem e voce|qual o seu nome|o que voce faz|o que voce pode fazer|como voce pode me ajudar|me ajuda|ajuda|quem e a ia)$/.test(
      collapsed,
    ) ||
    /^(como funciona a assistente|para que voce serve)$/.test(collapsed)
  ) {
    return {
      text: `Sou a sua **assistente virtual inteligente do Manicure Fácil**! 💅✨\n\nMinha missão é ser sua parceira e consultora de negócios para você administrar seu salão com a postura de uma verdadeira CEO. Posso te ajudar em várias áreas:\n\n- 👥 **Clientes:** Como cadastrar, histórico, aniversariantes e programa de fidelidade\n- 🏆 **Ranking de Clientes:** Como funciona o sistema Ouro, Prata e Bronze para valorizar quem mais gasta\n- 📅 **Agenda:** Agendamentos diários, link público para clientes e bloqueio de horários\n- 💰 **Financeiro:** Análise de faturamento, controle de despesas e sugestões para aumentar o lucro\n- 📦 **Estoque:** Alertas de produtos acabando e controle de materiais\n- 🎯 **Marketing:** Ideias de promoções inteligentes e recuperação de clientes sumidas\n\nVocê pode me fazer perguntas práticas sobre o sistema ou pedir sugestões para seu salão! Como posso te ajudar agora?`,
      suggestions: [
        "Como cadastrar uma nova cliente?",
        "Como registrar um agendamento?",
        "Dicas para aumentar meu faturamento",
        "Como funciona o ranking de clientes?",
      ],
    };
  }

  // ─── 7. Perguntas Frequentes do Sistema (Instantâneas) ──────────────────────

  // Como cadastrar cliente?
  if (/^como (cadastr|cadastrar|cadastro) (uma )?cliente/.test(collapsed)) {
    return {
      text: `### 👩‍🦰 Como cadastrar uma nova cliente no sistema:\n\n1. No menu lateral, clique em **Clientes**\n2. Clique no botão **+ Nova Cliente** (no canto superior direito)\n3. Preencha o **Nome** e o **Telefone / WhatsApp** (são os campos principais)\n4. Se desejar, adicione data de nascimento (para lembretes de aniversário), alergias e observações\n5. Clique em **Salvar Cliente**\n\n💡 **Dica de ouro:** Clientes com data de nascimento preenchida aparecem automaticamente na lista de **Aniversariantes do Mês**, perfeito para você enviar uma mensagem de parabéns com desconto! ✨`,
      suggestions: [
        "Como funciona o ranking de clientes?",
        "Como registrar um agendamento?",
        "Sugestões de promoções",
      ],
    };
  }

  // Como registrar um agendamento?
  if (
    /^como (agendar|fazer um agendamento|registrar (um )?agendamento|marcar (um )?horario)/.test(
      collapsed,
    )
  ) {
    return {
      text: `### 📅 Como registrar um agendamento:\n\n1. Acesse **Agendamentos** no menu lateral\n2. Clique em **+ Novo Agendamento**\n3. Selecione a **Cliente** e o **Serviço** desejado\n4. Escolha a **Data** e o **Horário** do atendimento\n5. Clique em **Confirmar Agendamento**\n\n💡 **Importante:** Quando o atendimento terminar, marque o status como **Concluído**. Isso atualiza automaticamente seu faturamento e o ranking da cliente! 💰`,
      suggestions: [
        "Como cadastrar uma nova cliente?",
        "Como funciona o ranking de clientes?",
        "Dicas para aumentar meu faturamento",
      ],
    };
  }

  // Como funciona o ranking de clientes?
  if (
    /^como funciona o ranking/.test(collapsed) ||
    /^o que e o ranking/.test(collapsed) ||
    /^ranking de clientes/.test(collapsed)
  ) {
    return {
      text: `### 🏆 Como funciona o Ranking de Clientes:\n\nO sistema classifica automaticamente suas clientes em 3 categorias com base no valor total investido no seu salão:\n\n- 🥇 **Ouro:** Suas melhores clientes! As que mais consomem e trazem maior receita.\n- 🥈 **Prata:** Clientes frequentes que mantêm um excelente fluxo de visitas.\n- 🥉 **Bronze:** Clientes que estão começando ou que têm menor frequência.\n\n💡 **Estratégia de Gestão:** Use o ranking para criar ações VIP para clientes Ouro (como brindes ou mimos exclusivos) e promoções para estimular as clientes Prata e Bronze a subirem de nível! 💅✨`,
      suggestions: [
        "Sugestões de promoções",
        "Dicas para aumentar meu faturamento",
        "Como cadastrar uma nova cliente?",
      ],
    };
  }

  // Como gerenciar estoque?
  if (/^como (gerenciar|funciona|controlar) o estoque/.test(collapsed)) {
    return {
      text: `### 📦 Como gerenciar seu Estoque & Materiais:\n\n1. Acesse **Estoque & Vendas** no menu lateral\n2. Clique em **+ Novo Produto** para cadastrar esmaltes, lixas, bases ou produtos para revenda\n3. Informe o preço de custo, quantidade atual e a **Quantidade Mínima**\n4. Sempre que a quantidade chegar no limite mínimo, o sistema emitirá um **Alerta de Estoque Baixo**\n\n💡 **Dica:** Manter a quantidade mínima atualizada garante que você nunca seja pega de surpresa sem esmalte ou material no meio de um atendimento!`,
      suggestions: [
        "Dicas para aumentar meu faturamento",
        "Como registrar uma despesa?",
        "Como funciona o sistema?",
      ],
    };
  }

  // Como funciona o sistema em geral?
  if (
    /^como funciona o sistema/.test(collapsed) ||
    /^o que cada tela faz/.test(collapsed) ||
    /^conhecer o sistema/.test(collapsed)
  ) {
    return {
      text: `### ✨ Guia Rápido do Manicure Fácil:\n\nO sistema foi pensado exclusivamente para descomplicar a sua rotina:\n\n- 📊 **Menu Geral:** Visão rápida de atendimentos do dia, faturamento e alertas importantes\n- 👥 **Clientes:** Cadastro completo, histórico de visitas, aniversários e ranking de consumo\n- 📅 **Agendamentos:** Sua agenda organizada por dia/semana, com link público para as clientes agendarem sozinhas\n- 💅 **Serviços:** Catálogo de procedimentos com preços, duração e margem de lucro\n- 💰 **Financeiro:** Controle de entradas, saídas, contas a pagar/receber e metas mensais\n- 📦 **Estoque & Vendas:** Materiais em estoque e revenda de produtos\n- 📣 **Marketing:** Campanhas prontas e recuperação de clientes sumidas\n\nQual dessas áreas você gostaria de explorar primeiro?`,
      suggestions: [
        "Como cadastrar uma nova cliente?",
        "Como registrar um agendamento?",
        "Dicas para aumentar meu faturamento",
      ],
    };
  }

  // Dicas de faturamento
  if (
    /^(dicas para aumentar (o|meu) faturamento|como faturar mais|como ganhar mais dinheiro)/.test(
      collapsed,
    )
  ) {
    return {
      text: `### 💰 4 Dicas Práticas para Aumentar seu Faturamento como Manicure:\n\n1. **Aumente seu Ticket Médio com Serviços Adicionais (Upsell):**\n   Ofereça esfoliação, spa dos pés, blindagem ou nail art simples no momento do agendamento.\n\n2. **Resgate Clientes Inativas:**\n   Vá na tela de Clientes e filtre por quem não visita há mais de 30 dias. Envie uma mensagem carinhosa: *"Oi linda, saudades de cuidar de você! Vamos renovar suas unhas essa semana?"*.\n\n3. **Crie Pacotes Mensais:**\n   Venda planos mensais com pagamento antecipado (ex: 4 atendimentos por mês com um pequeno benefício). Isso garante fluxo de caixa previsível no início do mês!\n\n4. **Revenda Produtos de Home Care:**\n   Tenha óleos de cutícula, hidratantes e séruns para vender ao final de cada atendimento.\n\nQuer ajuda para montar uma mensagem promocional para enviar no WhatsApp? 💅`,
      suggestions: [
        "Sugestões de promoções",
        "Como funciona o ranking de clientes?",
        "Como cadastrar uma nova cliente?",
      ],
    };
  }

  // Se não coincidiu com nenhuma resposta rápida pré-definida, retorna null para ir à IA completa
  return null;
}
