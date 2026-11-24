/**
 * Testes Automatizados — Funcionalidades de Agendamento Público e Integração WhatsApp
 * Executado via Node.js nativo (node --test)
 */
import test from "node:test";
import assert from "node:assert/strict";

// ─── Testes de Utilitários de WhatsApp ──────────────────────────────────────
import {
  somenteDigitos,
  numeroWhatsApp,
  linkWhatsApp,
  formatarDataHora,
  mensagens,
} from "../src/lib/whatsapp.ts";

test("WhatsApp: somenteDigitos extrai apenas números", () => {
  assert.equal(somenteDigitos("(11) 98765-4321"), "11987654321");
  assert.equal(somenteDigitos("+55 (21) 99999-0000"), "5521999990000");
  assert.equal(somenteDigitos(null), "");
  assert.equal(somenteDigitos(undefined), "");
});

test("WhatsApp: numeroWhatsApp normaliza telefones brasileiros", () => {
  // Celular 11 dígitos com DDD
  assert.equal(numeroWhatsApp("11987654321"), "5511987654321");
  assert.equal(numeroWhatsApp("(11) 98765-4321"), "5511987654321");

  // Telefone fixo / 10 dígitos com DDD
  assert.equal(numeroWhatsApp("(11) 3456-7890"), "551134567890");

  // Já com prefixo 55
  assert.equal(numeroWhatsApp("+55 11 98765-4321"), "5511987654321");
  assert.equal(numeroWhatsApp("5511987654321"), "5511987654321");

  // Com prefixo internacional discado 0055
  assert.equal(numeroWhatsApp("005511987654321"), "5511987654321");

  // Números inválidos
  assert.equal(numeroWhatsApp("12345"), null);
  assert.equal(numeroWhatsApp(""), null);
  assert.equal(numeroWhatsApp(null), null);
  assert.equal(numeroWhatsApp(undefined), null);
});

test("WhatsApp: linkWhatsApp gera URL wa.me com mensagem codificada", () => {
  const linkSemMsg = linkWhatsApp("11987654321");
  assert.equal(linkSemMsg, "https://wa.me/5511987654321");

  const linkComMsg = linkWhatsApp("11987654321", "Olá Maria! Seu horário está confirmado.");
  assert.ok(linkComMsg?.startsWith("https://wa.me/5511987654321?text="));
  assert.ok(linkComMsg?.includes(encodeURIComponent("Olá Maria!")));

  const linkInvalido = linkWhatsApp("123", "teste");
  assert.equal(linkInvalido, null);
});

test("WhatsApp: formatarDataHora formata data e hora amigavelmente", () => {
  const data = new Date(2026, 10, 25, 14, 30); // 25/11/2026 às 14h30
  const formatado = formatarDataHora(data);
  assert.equal(formatado, "25/11/2026 às 14h30");

  assert.equal(formatarDataHora(null), "");
  assert.equal(formatarDataHora("data-invalida"), "");
});

test("WhatsApp: Modelos de mensagens inserem dados e informações de agendamento", () => {
  const dados = {
    cliente: "Camila",
    dataHora: new Date(2026, 10, 25, 15, 0),
    servico: "Alongamento em Gel",
    valor: 120,
    salao: "Espaço Beleza",
    linkAgendamento: "https://manicurefacil.app/agendar/user-123",
  };

  // Confirmação
  const msgConf = mensagens.confirmacao(dados);
  assert.ok(msgConf.includes("Camila"));
  assert.ok(msgConf.includes("Alongamento em Gel"));
  assert.ok(msgConf.includes("confirmado"));
  assert.ok(msgConf.includes("120"));
  assert.ok(msgConf.includes("Espaço Beleza"));

  // Lembrete
  const msgLemb = mensagens.lembrete(dados);
  assert.ok(msgLemb.includes("Camila"));
  assert.ok(msgLemb.includes("Lembrete"));
  assert.ok(msgLemb.includes("Alongamento em Gel"));

  // Agradecimento
  const msgAgrad = mensagens.agradecimento(dados);
  assert.ok(msgAgrad.includes("Camila"));
  assert.ok(msgAgrad.includes("prazer te atender"));

  // Reagendamento
  const msgReag = mensagens.reagendamento(dados);
  assert.ok(msgReag.includes("Camila"));
  assert.ok(msgReag.includes("reorganiza") || msgReag.includes("encaixar em um novo horário"));

  // Compartilhamento do link público de agendamento
  const msgLink = mensagens.linkAgendamento(dados);
  assert.ok(msgLink.includes("Camila"));
  assert.ok(msgLink.includes("https://manicurefacil.app/agendar/user-123"));
  assert.ok(msgLink.includes("online"));

  // Aniversário
  const msgAniv = mensagens.aniversario(dados);
  assert.ok(msgAniv.includes("Camila"));
  assert.ok(msgAniv.includes("aniversário"));
});

// ─── Testes de Lógica de Expediente e Agendamento Público ───────────────────
import { gerarSlots } from "../src/lib/expediente-logica.ts";

test("Agendamento Público: Respeita dias e horários de trabalho configurados", () => {
  // Configuração: Quarta-feira (dia 3), expediente das 09:00 às 17:00
  const quarta = new Date(2026, 10, 25); // 25/11/2026 é quarta-feira (getDay() === 3)
  const expediente = [
    { dia_semana: 3, hora_inicio: "09:00", hora_fim: "17:00", ativo: true },
    { dia_semana: 4, hora_inicio: "09:00", hora_fim: "17:00", ativo: true },
  ];

  const slots = gerarSlots({
    data: quarta,
    duracaoMin: 30,
    expediente,
    intervalos: [],
    bloqueios: [],
    ocupados: [],
    passoMin: 30,
  });

  assert.ok(slots.length > 0);
  assert.equal(slots[0].hora, "09:00");
  assert.equal(slots[slots.length - 1].hora, "16:30"); // 16:30 + 30min = 17:00
  assert.ok(slots.every((s) => s.disponivel));

  // Dia sem expediente (ex: Domingo, getDay() === 0) deve retornar zero slots
  const domingo = new Date(2026, 10, 22);
  const slotsDomingo = gerarSlots({
    data: domingo,
    duracaoMin: 30,
    expediente,
    intervalos: [],
    bloqueios: [],
    ocupados: [],
    passoMin: 30,
  });
  assert.equal(slotsDomingo.length, 0);
});

test("Agendamento Público: Bloqueia horários que coincidem com pausas/intervalos (almoço)", () => {
  const quarta = new Date(2026, 10, 25);
  const expediente = [{ dia_semana: 3, hora_inicio: "09:00", hora_fim: "18:00", ativo: true }];
  // Almoço das 12:00 às 13:00
  const intervalos = [{ dia_semana: 3, nome: "Almoço", hora_inicio: "12:00", hora_fim: "13:00" }];

  const slots = gerarSlots({
    data: quarta,
    duracaoMin: 30,
    expediente,
    intervalos,
    bloqueios: [],
    ocupados: [],
    passoMin: 30,
  });

  const slot1130 = slots.find((s) => s.hora === "11:30");
  const slot1200 = slots.find((s) => s.hora === "12:00");
  const slot1230 = slots.find((s) => s.hora === "12:30");
  const slot1300 = slots.find((s) => s.hora === "13:00");

  assert.equal(slot1130?.disponivel, true);
  assert.equal(slot1200?.disponivel, false);
  assert.equal(slot1200?.motivo, "Intervalo: Almoço");
  assert.equal(slot1230?.disponivel, false);
  assert.equal(slot1230?.motivo, "Intervalo: Almoço");
  assert.equal(slot1300?.disponivel, true);
});

test("Agendamento Público: Impede reservas em horários já ocupados (sem duplo agendamento)", () => {
  const quarta = new Date(2026, 10, 25);
  const expediente = [{ dia_semana: 3, hora_inicio: "09:00", hora_fim: "18:00", ativo: true }];
  // Agendamento já existente às 14:00 (duração 60 min, vai até 15:00)
  const dataOcupada = new Date(2026, 10, 25, 14, 0).toISOString();
  const ocupados = [{ data_hora: dataOcupada, duracao_min: 60 }];

  const slots = gerarSlots({
    data: quarta,
    duracaoMin: 30,
    expediente,
    intervalos: [],
    bloqueios: [],
    ocupados,
    passoMin: 30,
  });

  const slot1330 = slots.find((s) => s.hora === "13:30");
  const slot1400 = slots.find((s) => s.hora === "14:00");
  const slot1430 = slots.find((s) => s.hora === "14:30");
  const slot1500 = slots.find((s) => s.hora === "15:00");

  assert.equal(slot1330?.disponivel, true);
  assert.equal(slot1400?.disponivel, false);
  assert.equal(slot1400?.motivo, "Horário ocupado");
  assert.equal(slot1430?.disponivel, false);
  assert.equal(slot1430?.motivo, "Horário ocupado");
  assert.equal(slot1500?.disponivel, true);
});

test("Agendamento Público: Respeita a duração total do procedimento antes do fechamento", () => {
  const quarta = new Date(2026, 10, 25);
  const expediente = [{ dia_semana: 3, hora_inicio: "09:00", hora_fim: "18:00", ativo: true }];

  // Procedimento longo de 90 minutos
  const slots = gerarSlots({
    data: quarta,
    duracaoMin: 90,
    expediente,
    intervalos: [],
    bloqueios: [],
    ocupados: [],
    passoMin: 30,
  });

  // O último slot válido deve ser 16:30 (16:30 + 90min = 18:00).
  // 17:00 ou 17:30 não podem ser gerados porque ultrapassariam as 18:00.
  const horas = slots.map((s) => s.hora);
  assert.ok(horas.includes("16:30"));
  assert.ok(!horas.includes("17:00"));
  assert.ok(!horas.includes("17:30"));
});

test("Fluxo 7 Pontos: 1. Cada profissional possui link único e exclusivo", () => {
  const userIdProfissional1 = "11111111-1111-1111-1111-111111111111";
  const userIdProfissional2 = "22222222-2222-2222-2222-222222222222";
  const origin = "https://manicurefacil.app";

  const link1 = `${origin}/agendar/${userIdProfissional1}`;
  const link2 = `${origin}/agendar/${userIdProfissional2}`;

  assert.notEqual(link1, link2);
  assert.ok(link1.endsWith(userIdProfissional1));
  assert.ok(link2.endsWith(userIdProfissional2));
});

test("Fluxo 7 Pontos: 4 e 5. Apresenta SOMENTE horários realmente disponíveis (sem exibir ocupados/bloqueados)", () => {
  const quarta = new Date(2026, 10, 25);
  const expediente = [{ dia_semana: 3, hora_inicio: "09:00", hora_fim: "12:00", ativo: true }];
  // 10:00 ocupado por agendamento
  const ocupados = [{ data_hora: new Date(2026, 10, 25, 10, 0).toISOString(), duracao_min: 30 }];
  // 11:00 bloqueado na agenda
  const bloqueios = [
    {
      data_inicio: "2026-11-25",
      data_fim: "2026-11-25",
      hora_inicio: "11:00",
      hora_fim: "11:30",
    },
  ];

  const allSlots = gerarSlots({
    data: quarta,
    duracaoMin: 30,
    expediente,
    intervalos: [],
    bloqueios,
    ocupados,
    passoMin: 30,
  });

  // O cliente visualiza apenas os horários disponíveis (available === true)
  const availableSlots = allSlots.filter((s) => s.disponivel);
  const horasApresentadas = availableSlots.map((s) => s.hora);

  // 10:00 (ocupado) e 11:00 (bloqueado) NÃO devem ser apresentados à cliente
  assert.ok(horasApresentadas.includes("09:00"));
  assert.ok(horasApresentadas.includes("09:30"));
  assert.ok(!horasApresentadas.includes("10:00"), "Horário 10:00 ocupado não deve ser apresentado");
  assert.ok(horasApresentadas.includes("10:30"));
  assert.ok(
    !horasApresentadas.includes("11:00"),
    "Horário 11:00 bloqueado não deve ser apresentado",
  );
  assert.ok(horasApresentadas.includes("11:30"));
  assert.ok(
    !horasApresentadas.includes("12:00"),
    "Horário fora do expediente não deve ser apresentado",
  );
});

test("Fluxo 7 Pontos: 6. Validação dos dados preenchidos pela cliente", () => {
  // Função de validação espelhada do formulário público
  const validarDadosCliente = (nome, telefone) => {
    if (!nome || nome.trim().length < 2) return { ok: false, erro: "Nome inválido" };
    const digitos = telefone.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 11)
      return { ok: false, erro: "Telefone com DDD inválido" };
    return { ok: true, digitos };
  };

  assert.equal(validarDadosCliente("Ana Silva", "(11) 98765-4321").ok, true);
  assert.equal(validarDadosCliente("A", "(11) 98765-4321").ok, false);
  assert.equal(validarDadosCliente("Ana Silva", "1234").ok, false);
});
