# Manicure Fácil (Nail Boss Suite)

Sistema SaaS completo para manicures e profissionais de beleza. Gerencie agenda, clientes, financeiro, estoque, portfólio e muito mais — tudo com um assistente de inteligência artificial integrado.

---

## Funcionalidades

- **Dashboard inteligente** com resumo do negócio, crescimento e metas
- **Agenda completa** com agendamento online público (`/agendar/:id`)
- **Gestão de clientes** com histórico, aniversariantes e fidelidade
- **Controle financeiro** com DRE mensal, despesas e fluxo de caixa
- **Relatórios e metas** com ranking de serviços, ticket médio e projeções
- **Estoque** com controle de entradas/saídas e alertas de estoque baixo
- **Portfólio** para exibir trabalhos (fotos antes/depois)
- **Marketing** com promoções, programa de pontos e resgate
- **Assistente de IA** (Gemini/OpenAI) para dicas e análises do negócio
- **Painel Admin** para gestão de contas, convites e planos
- **Backup/Restore** de dados em JSON
- **Avaliações públicas** de clientes
- **Configurações** do salão (nome, telefone, CNPJ, horários)

---

## Requisitos

- [Node.js](https://nodejs.org/) >= 18
- [npm](https://www.npmjs.com/) ou [bun](https://bun.sh/)
- Conta gratuita no [Supabase](https://supabase.com)
- Chave de API do [Google Gemini](https://aistudio.google.com/apikey) (gratuita) ou [OpenAI](https://platform.openai.com/api-keys)

---

## Instalação

### 1. Clone o repositório

```bash
git clone <url-do-repositorio>
cd nail-boss-suite
```

### 2. Instale as dependências

```bash
npm install
# ou
bun install
```

### 3. Configure as variáveis de ambiente

Copie o exemplo e preencha com suas credenciais:

```bash
cp .env.example .env
```

Abra o arquivo `.env` e preencha:

```env
# ─── Supabase ────────────────────────────────────────
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_PROJECT_ID=SEU_PROJECT_REF

# Chave anon (mesma valor nas duas linhas)
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PROJECT_ID=SEU_PROJECT_REF
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-anon
SUPABASE_PUBLISHABLE_KEY=sua-chave-anon

# Chave service_role (server-side only)
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role

# ─── Admin ───────────────────────────────────────────
ADMIN_EMAILS=seu@email.com

# ─── IA ──────────────────────────────────────────────
AI_PROVIDER=gemini
GEMINI_API_KEY=sua-chave-do-gemini
GEMINI_MODEL=gemini-flash-latest

# ─── Node ────────────────────────────────────────────
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
```

> **Onde pegar as chaves?**
> - Supabase: Dashboard → Project Settings → API
> - Gemini: https://aistudio.google.com/apikey

### 4. Configure o banco de dados

No painel do Supabase, vá em **SQL Editor** e aplique a migration de controle de acesso:

1. Abra o arquivo `supabase/migrations/20260804000000_saas_access_control.sql`
2. Cole o conteúdo no SQL Editor do Supabase
3. Clique em **Run**

Depois, promova-se a admin:

```sql
SELECT public.definir_admin('seu@email.com');
```

### 5. Inicie o servidor de desenvolvimento

```bash
npm run dev
# ou
bun run dev
```

O app estará disponível em **http://localhost:3000**

---

## Deploy

### Opção 1: Vercel (recomendado para iniciantes)

1. Faça push do código para um repositório GitHub
2. Acesse [vercel.com](https://vercel.com) e importe o repositório
3. Configure as variáveis de ambiente no painel da Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `AI_PROVIDER`
   - `GEMINI_API_KEY`
   - `ADMIN_EMAILS`
4. Deploy automático a cada push

### Opção 2: Docker (VPS / Easypanel)

```bash
# Com o .env configurado:
docker compose up -d --build
```

O app estará em **http://localhost:3000**

### Opção 3: Docker com Easypanel

1. Acesse o painel Easypanel
2. New Service → Import from Git
3. Conecte o repositório
4. Configure as variáveis de ambiente
5. Deploy

---

## Estrutura do projeto

```
nail-boss-suite/
├── src/
│   ├── routes/                    # Rotas (file-based)
│   │   ├── index.tsx              # Página inicial
│   │   ├── auth.tsx               # Login / Cadastro / Recuperação
│   │   ├── agendar.$userId.tsx    # Agendamento público
│   │   └── _authenticated/        # Rotas protegidas (login obrigatório)
│   │       ├── dashboard.tsx      # Menu geral
│   │       ├── agendamentos.tsx   # Agenda completa
│   │       ├── clientes.tsx       # Gestão de clientes
│   │       ├── servicos.tsx       # Cadastro de serviços
│   │       ├── financeiro.tsx     # Controle financeiro
│   │       ├── relatorios.tsx     # Relatórios e metas
│   │       ├── estoque.tsx        # Controle de estoque
│   │       ├── marketing.tsx      # Fidelidade e promoções
│   │       ├── portfolio.tsx      # Portfólio de trabalhos
│   │       ├── configuracoes.tsx  # Configurações do salão
│   │       ├── admin.tsx          # Painel administrativo
│   │       └── route.tsx          # Layout + guard de autenticação
│   ├── components/                # Componentes React
│   │   ├── agenda/
│   │   ├── assistant/             # AI Assistant
│   │   ├── clientes/
│   │   ├── layout/
│   │   ├── notifications/
│   │   ├── onboarding/
│   │   ├── profile/
│   │   └── ui/                    # Componentes base (shadcn/ui)
│   ├── hooks/                     # Custom hooks
│   ├── lib/                       # Lógica de negócio
│   │   ├── admin/                 # Server functions admin
│   │   ├── ai/                    # Serviço de IA
│   │   ├── api/                   # API routes
│   │   └── public/                # Server functions públicas
│   └── integrations/supabase/     # Configuração do Supabase
├── supabase/
│   └── migrations/                # SQL migrations do banco
├── docs/
│   └── KIRVANO-SETUP.md           # Documentação da integração Kirvano
├── .env.example                   # Template de variáveis de ambiente
├── docker-compose.yml             # Configuração Docker
├── Dockerfile                     # Build multi-stage para produção
└── vercel.json                    # Configuração Vercel
```

---

## Segurança

- **RLS (Row Level Security)** em todas as tabelas — cada usuário acessa apenas seus dados
- **Service role** usada apenas no servidor (nunca exposta ao cliente)
- **Validação com Zod** em todas as server functions
- **Preço calculado no servidor** — cliente nunca controla valores
- **Middleware admin** com verificação dupla (banco + allowlist por e-mail)
- **Políticas de anon** removidas — nenhum acesso anônimo a dados sensíveis

---

## IA (Assistente)

O assistente de IA responde perguntas sobre o negócio usando os dados do usuário.

- **Gemini** (recomendado): nível gratuito disponível em https://aistudio.google.com/apikey
- **OpenAI**: configure `AI_PROVIDER=openai` e adicione `OPENAI_API_KEY`

Para configurar no Vercel, adicione as variáveis de IA no painel: Project → Settings → Environment Variables.

---

## Integração com Kirvano (futura)

O app está preparado para venda de assinaturas via Kirvano. Consulte `docs/KIRVANO-SETUP.md` para detalhes da estrutura de planos, trials e webhooks.

---

## Comandos úteis

```bash
npm run dev          # Servidor de desenvolvimento
npm run build        # Build de produção
npm run preview      # Preview do build
npm run lint         # Verificar código
npm run format       # Formatar com Prettier
```

---

## Licença

Proprietário. Uso autorizado apenas para o comprador deste código.
