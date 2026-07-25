#!/bin/bash
# =============================================================================
# backup.sh — Backup do banco de dados Supabase (Manicure Fácil)
# =============================================================================
# Uso: ./scripts/backup.sh [output-dir]
#
# Pré-requisitos:
#   - Supabase CLI instalado (npm install -g supabase)
#   - pg_dump instalado (vem com PostgreSQL)
#   - Projeto Supabase linkado: supabase link --project-ref <ref>
#
# Opcional (para backup em cloud):
#   - AWS CLI configurado (para S3)
#   - Ou rclone configurado
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ─── Configuração ──────────────────────────────────────────────────────────

# Diretório de saída (argumento ou padrão)
OUTPUT_DIR="${1:-./backups}"

# Timestamp para o nome do arquivo
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

# Nome do arquivo de backup
BACKUP_FILE="${OUTPUT_DIR}/manicure-facil_${TIMESTAMP}.sql"

# ─── Cria diretório de saída ──────────────────────────────────────────────

mkdir -p "$OUTPUT_DIR"

# ─── Verifica ferramentas ──────────────────────────────────────────────────

if ! command -v pg_dump &> /dev/null; then
    echo "❌ ERRO: pg_dump não encontrado. Instale PostgreSQL Client."
    echo "   brew install postgresql-client (macOS)"
    echo "   sudo apt install postgresql-client (Linux)"
    exit 1
fi

# ─── Lê configuração do arquivo .env ──────────────────────────────────────

if [ -f "$PROJECT_DIR/.env" ]; then
    source "$PROJECT_DIR/.env"
fi

# ─── Verifica se SUPABASE_URL está configurado ────────────────────────────

if [ -z "${SUPABASE_URL:-}" ] && [ -z "${VITE_SUPABASE_URL:-}" ]; then
    echo "⚠️  SUPABASE_URL ou VITE_SUPABASE_URL não encontrado no .env"
    echo "   Tentando usar Supabase CLI para obter connection string..."
    
    if command -v supabase &> /dev/null; then
        echo "   Use: supabase db dump --local > $BACKUP_FILE"
        supabase db dump --local > "$BACKUP_FILE"
        echo "✅ Backup local concluído: $BACKUP_FILE"
        exit 0
    else
        echo "❌ Supabase CLI não encontrado. Configure SUPABASE_URL no .env"
        exit 1
    fi
fi

# Extrai informações da URL do Supabase
SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL}}"

# Formato: https://<ref>.supabase.co
SUPABASE_REF="$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\..*|\1|')"

if [ -z "$SUPABASE_REF" ]; then
    echo "❌ Não foi possível extrair o project ref da URL: $SUPABASE_URL"
    exit 1
fi

# ─── Obtém connection string do Supabase ──────────────────────────────────

if command -v supabase &> /dev/null; then
    echo "📦 Usando Supabase CLI para obter connection string..."
    
    # Tenta usar o Supabase CLI linkado
    if [ -f "$PROJECT_DIR/supabase/.temp/linked-project.json" ]; then
        echo "✅ Projeto Supabase já linkado"
    fi
    
    # Usa pg_dump com o connection string do Supabase
    # NOTA: Você precisa da Database URL do Supabase Dashboard:
    # Project Settings > Database > Connection string > URI
    echo "⚠️  Para backup remoto, use a Database URL do Supabase Dashboard:"
    echo "   1. Acesse: https://supabase.com/dashboard/project/${SUPABASE_REF}/settings/database"
    echo "   2. Copie a 'Connection string' (URI) na seção de PostgreSQL"
    echo "   3. Defina DATABASE_URL no seu .env"
    echo ""
    echo "   Exemplo de comando:"
    echo "   pg_dump \"\$DATABASE_URL\" --clean --if-exists --no-owner > \"$BACKUP_FILE\""
    echo ""
    
    # Se DATABASE_URL estiver configurada, faz o backup
    if [ -n "${DATABASE_URL:-}" ]; then
        echo "📦 Fazendo backup do banco de dados remoto..."
        pg_dump "$DATABASE_URL" --clean --if-exists --no-owner > "$BACKUP_FILE"
        echo "✅ Backup remoto concluído: $BACKUP_FILE"
        
        # Compacta
        gzip -f "$BACKUP_FILE"
        echo "✅ Backup compactado: ${BACKUP_FILE}.gz"
        
        # Tamanho
        SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
        echo "📊 Tamanho: $SIZE"
    else
        echo "⚠️  DATABASE_URL não configurada. Defina no .env para backup automático."
        echo "   Criando backup local como fallback..."
        
        if command -v supabase &> /dev/null; then
            supabase db dump --local > "$BACKUP_FILE"
            echo "✅ Backup local concluído: $BACKUP_FILE"
        fi
    fi
else
    echo "❌ Supabase CLI não encontrado. Instale com:"
    echo "   npm install -g supabase"
    exit 1
fi

# ─── Opcional: Envia para S3 ──────────────────────────────────────────────

if [ -n "${BACKUP_S3_BUCKET:-}" ] && command -v aws &> /dev/null; then
    echo "☁️  Enviando backup para S3..."
    aws s3 cp "${BACKUP_FILE}.gz" "s3://${BACKUP_S3_BUCKET}/database/manicure-facil_${TIMESTAMP}.sql.gz"
    echo "✅ Backup enviado para S3"
fi

echo ""
echo "✅ Backup concluído com sucesso!"
echo "   Arquivo: ${BACKUP_FILE}.gz"
