# =============================================================================
# Dockerfile — Manicure Fácil (TanStack Start + Bun)
# Multi-stage build otimizado para produção em VPS / Easypanel
# =============================================================================

# ----------------------------------------
# STAGE 1: Instalação de dependências
# ----------------------------------------
FROM oven/bun:1 AS deps

WORKDIR /app

# Copia arquivos de lock e configuração primeiro (cache layer)
COPY bun.lock package.json bunfig.toml ./

# Instala apenas dependências de produção
RUN bun install --frozen-lockfile --production

# ----------------------------------------
# STAGE 2: Build da aplicação
# ----------------------------------------
FROM oven/bun:1 AS builder

WORKDIR /app

# Copia lock e config
COPY bun.lock package.json bunfig.toml ./

# Instala TODAS as dependências (incluindo devDependencies necessárias para build)
RUN bun install --frozen-lockfile

# Copia o restante do código-fonte
COPY . .

# Compila a aplicação para produção
# TanStack Start + Vite gera a saída em .output/ (Nitro)
RUN bun run build

# ----------------------------------------
# STAGE 3: Imagem de produção (final)
# ----------------------------------------
FROM oven/bun:1-slim AS runner

# Segurança: executa como usuário não-root
RUN addgroup --system --gid 1001 nodejs && \
  adduser --system --uid 1001 appuser

WORKDIR /app

# Copia artefatos de produção do estágio builder
COPY --from=builder --chown=appuser:nodejs /app/.output ./.output

# Copia node_modules de produção (apenas o necessário para runtime)
COPY --from=deps --chown=appuser:nodejs /app/node_modules ./node_modules

# Health check: verifica se o servidor está respondendo
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/').then(r => { process.exit(r.ok ? 0 : 1) }).catch(() => process.exit(1))"

# Expõe a porta padrão do TanStack Start / Nitro
EXPOSE 3000

# Muda para usuário não-root
USER appuser

# Define ambiente de produção
ENV NODE_ENV=production \
  PORT=3000 \
  HOST=0.0.0.0

# Comando de inicialização do servidor Nitro (gerado pelo TanStack Start)
CMD ["bun", ".output/server/index.mjs"]
