# 💅 Manicure Fácil — Sistema completo para manicures e salões

> **Parabéns pela compra!** Este é um sistema profissional de gestão para manicures e profissionais de beleza. Em poucos minutos você terá sua agenda, clientes, financeiro e muito mais funcionando.

---

## 🚀 Início rápido (5 minutos)

### Opção 1: Deploy na Vercel (recomendado — gratuito)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/SEU-REPOSITORIO/manicure-facil)

1. Clique no botão acima
2. Conecte sua conta GitHub
3. Clique em **Deploy**
4. Abra o link gerado → o **wizard de configuração** vai aparecer automaticamente!

### Opção 2: Rodar no computador

```bash
# 1. Instale as dependências
npm install

# 2. Inicie o app
npm run dev

# 3. Abra http://localhost:3000
# O wizard de configuração vai aparecer automaticamente!
```

### Opção 3: Docker

```bash
docker compose up -d --build
# Abra http://localhost:3000
```

---

## 📋 O que você vai precisar

Antes de começar, tenha em mãos:

| Item                   | Custo        | Onde pegar                                          |
| ---------------------- | ------------ | --------------------------------------------------- |
| Conta no Supabase      | **Gratuito** | [supabase.com](https://supabase.com)                |
| Chave de IA (opcional) | **Gratuito** | [ai.google.dev](https://aistudio.google.com/apikey) |

> **Não se preocupe!** O wizard dentro do app te guia passo a passo para criar tudo.

---

## 🔧 Configuração pelo wizard (in-app)

Quando você abrir o app pela primeira vez, verá um **wizard de configuração** com 4 passos:

### Passo 1: Criar conta no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita
2. Clique em **"New Project"**
3. Escolha um nome e defina uma senha para o banco
4. Aguarde o projeto ser criado (~30 segundos)

### Passo 2: Copiar as chaves

1. No painel do Supabase, vá em **Settings → API**
2. Copie estas 3 chaves e cole no wizard:
   - **URL** (ex: `https://abc123.supabase.co`)
   - **anon public** (chave pública)
   - **service_role secret** (chave secreta)

### Passo 3: Rodar o SQL

1. No Supabase, vá em **SQL Editor** (menu lateral)
2. Cole o script SQL que o wizard mostra
3. Clique em **Run**
4. Execute também o comando para se tornar admin

### Passo 4: Configurar IA (opcional)

1. Acesse [ai.google.dev](https://aistudio.google.com/apikey)
2. Crie uma chave de API gratuita
3. Cole no wizard

**Pronto!** Agora é só fazer login e usar! 🎉

---

## 📦 Funcionalidades

- **Dashboard inteligente** com resumo do negócio e gráficos
- **Agenda completa** com agendamento online público
- **Gestão de clientes** com histórico e aniversariantes
- **Controle financeiro** com DRE, despesas e fluxo de caixa
- **Relatórios e metas** com ranking de serviços
- **Estoque** com alertas de estoque baixo
- **Portfólio** para exibir trabalhos (antes/depois)
- **Marketing** com promoções e programa de fidelidade
- **Assistente de IA** para dicas e análises
- **Backup/Restore** de dados
- **Painel Admin** para gestão de contas

---

## 🛡️ Segurança

- **RLS (Row Level Security)** em todas as tabelas
- Cada usuário acessa **apenas seus dados**
- Service role usada apenas no servidor
- Validação com Zod em todas as operações
- Preço calculado no servidor (nunca no cliente)

---

## 🌐 Deploy em produção

### Vercel (recomendado)

1. Suba o código no GitHub
2. Acesse [vercel.com](https://vercel.com) e importe o repositório
3. Configure as variáveis de ambiente no painel:
   - `SUPABASE_URL`
   - `VITE_SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_EMAILS`
   - `AI_PROVIDER` = `gemini`
   - `GEMINI_API_KEY`
4. Deploy automático a cada push

### Docker (VPS / Easypanel)

```bash
# Configure o arquivo .env primeiro
cp .env.example .env
# Edite o .env com suas credenciais

# Suba o container
docker compose up -d --build
```

---

## 📁 Estrutura do projeto

```
├── src/
│   ├── routes/               # Páginas do app
│   │   ├── setup.tsx         # ⭐ Wizard de configuração
│   │   ├── auth.tsx          # Login / Cadastro
│   │   ├── index.tsx         # Landing page
│   │   └── _authenticated/   # Áreas protegidas
│   │       ├── dashboard.tsx # Menu geral
│   │       ├── agendamentos.tsx
│   │       ├── clientes.tsx
│   │       ├── financeiro.tsx
│   │       ├── admin.tsx     # Painel administrativo
│   │       └── ...
│   ├── components/           # Componentes React
│   ├── hooks/                # Hooks customizados
│   └── lib/                  # Lógica de negócio
├── supabase/
│   └── migrations/           # Scripts SQL
├── .env.example              # Template de configuração
├── docker-compose.yml        # Configuração Docker
└── Dockerfile                # Build para produção
```

---

## ❓ Dúvidas frequentes

**Preciso saber programar para usar?**
Não! O wizard de configuração te guia passo a passo. Você só precisa criar uma conta gratuita no Supabase e colar as chaves.

**Quanto custa rodar o sistema?**
O Supabase tem um nível gratuito generoso. A IA do Gemini também é gratuita. Para começar, não precisa gastar nada além da compra do código.

**Meus dados estão seguros?**
Sim! O sistema usa Row Level Security (RLS) em todas as tabelas. Cada usuário só vê seus próprios dados. Ninguém mais acessa suas informações.

**Posso personalizar o app?**
Sim! O código é 100% editável. Você pode mudar cores, textos, adicionar funcionalidades ou contratar um programador para personalizar.

**Como acesso o painel Admin?**
Depois de rodar o SQL `SELECT public.definir_admin('seu@email.com');`, seu e-mail terá acesso ao painel admin em `/admin`.

---

## 📄 Licença

Proprietário. Uso autorizado apenas para o comprador deste código.
