# Preparação para venda na Kirvano — Manicure Fácil

Este documento explica como o controle de acesso SaaS funciona e como preparar
a integração futura com a Kirvano (pagamentos). **A Kirvano ainda NÃO está
integrada** — toda a estrutura já está pronta para recebê-la.

---

## 1. Modelo de acesso (o que foi implementado)

Cada conta possui um **status** que é validado em **3 camadas** (defesa em
profundidade — nunca depende só do frontend):

| Camada                   | Onde                                                   | O que faz                                                                                                                           |
| ------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1. Banco (RLS)           | `verificar_acesso()` em **todas** as políticas `own_*` | Conta com status ≠ `ativo` (ou expirada) deixa de **enxergar e modificar** qualquer dado no mesmo instante, mesmo com sessão aberta |
| 2. Servidor (middleware) | `requireSupabaseAuth` (server functions)               | Qualquer server function rejeita JWT de conta não ativa                                                                             |
| 3. Frontend              | Login + guard de rotas `/` autenticadas                | Bloqueado/inativa: mensagem amigável + logout automático                                                                            |

### Status possíveis

- `ativo` — acesso completo
- `inativo` — conta criada (convidada) mas ainda não liberada
- `bloqueado` — acesso cortado por administração (motivo opcional)
- `suspenso` — suspensão temporária (motivo opcional)

Campos futuros já existentes na tabela `public.contas`:
`plano`, `fonte` (`admin` | `kirvano` | `email`), `kirvano_transacao_id`,
`trial_inicio`, `trial_fim`, `acesso_termina_em` (renovação), `motivo_bloqueio`.

---

## 2. Aplicar a migration e promover-se a admin

1. Aplique a migration `supabase/migrations/20260804000000_saas_access_control.sql`
   (no painel do Supabase: **SQL Editor** → cole → Run; ou `supabase db push`).
2. Usuários existentes são backfilled como `ativo` automaticamente.
3. Promova-se a admin no SQL Editor:

```sql
SELECT public.definir_admin('seu-email@exemplo.com');
```

> Alternativa: definir a env `ADMIN_EMAILS=voce@email.com` também concede acesso
> ao painel Admin (não precisa de SQL).

4. Opcional — garantir que **"Confirm email"** esteja habilitado em
   _Authentication → Providers → Email_ (necessário para o e-mail de convite).

---

## 3. Fluxo de uso (já funcionando)

1. Você abre o painel **Admin** (menu lateral) → **Convidar cliente**.
2. Informe e-mail + nome (+ plano opcional).
3. A cliente recebe um **e-mail de convite** com link para criar a conta
   (definir senha). O link também aparece no painel para envio manual.
4. A conta nasce com status `inativo` — a cliente **não acessa o sistema**.
5. Você libera o acesso: **Ativar** (ou Trial 7d, ou +30 dias, ou Vitalício).
6. A cliente faz login normalmente e usa o sistema.

A página pública `/` e `/agendar/:id` (agendamento online) continuam acessíveis
a qualquer pessoa — mas **nenhum dado interno** é exposto.

---

## 4. Integração futura com a Kirvano (estrutura pronta)

O fluxo que será ativado quando a Kirvano for integrada:

```
1. Cliente compra o acesso na Kirvano (checkout / link de pagamento)
2. Kirvano aprova o pagamento e chama um WEBHOOK no seu backend
3. O webhook:
   a. Cria/atualiza a conta do cliente (status 'ativo')
   b. Grava: plano, kirvano_transacao_id, acesso_termina_em (renovação)
4. A cliente recebe o e-mail de convite (ou já recebeu na compra)
5. Cria a conta → faz login → usa o sistema
```

### Passos quando for integrar

1. Criar a endpoint de webhook (server function `createServerFn` ou route
   `POST /api/kirvano/webhook`):
   - Validar a assinatura do payload com o **token secreto** da Kirvano.
   - Usar `supabaseAdmin` (service_role) para atualizar `public.contas`.
2. Mapear os eventos da Kirvano:
   - `purchase.approved` → `status = 'ativo'`, gravar `plano`,
     `kirvano_transacao_id`, calcular `acesso_termina_em`.
   - `subscription.cancelled` / reembolso → `status = 'inativo'` (ou `suspenso`).
   - Renovação → atualizar `acesso_termina_em`.
3. Teste gratuito: quando decidir oferecer, o webhook define `trial_fim` e o
   cron (`SELECT public.atualizar_status_expirados()`) desativa contas cujo
   acesso expirou. Pode ser agendado com `pg_cron`:
   ```sql
   -- Exemplo (após habilitar pg_cron):
   select cron.schedule('expirar-acessos', '0 3 * * *',
     $$select public.atualizar_status_expirados()$$);
   ```

### Segurança do webhook

- Nunca confie no `user_id` enviado pelo cliente — o webhook recebe o e-mail
  e a transação da Kirvano (assinada) e resolve a conta no servidor.
- Use a coluna `kirvano_transacao_id` como chave idempotente (evita duplicar
  ativações se o webhook for reentregue).

---

## 5. Resumo de segurança aplicado nesta etapa

- ❌ Removidos cadastros públicos (só convite).
- ❌ Removidas políticas RLS `USING (true)` em clientes, agendamentos, perfis,
  serviços, fidelidade (vazamento total de dados estava ativo).
- ❌ Removidos inserts anônimos sem validação.
- ❌ View `vw_dre_mensal` reconstruída com `security_invoker` (antes ignorava
  RLS e expunha o financeiro de todos).
- ✅ RLS em todas as tabelas exige conta ativa + dono (`auth.uid()`).
- ✅ Server functions públicas de agendamento usam service_role no servidor
  (preço calculado no servidor, conflitos validados no banco).
- ✅ Middleware de auth valida status da conta (server functions).
- ✅ Painel Admin protegido por `requireAdminAuth` (admin só no servidor).
