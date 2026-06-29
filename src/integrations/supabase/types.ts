export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          cliente_id: string | null
          created_at: string
          custo: number
          data_hora: string
          duracao_min: number
          id: string
          observacoes: string | null
          pagamento: Database["public"]["Enums"]["pagamento_metodo"]
          servico_id: string | null
          status: Database["public"]["Enums"]["agendamento_status"]
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          custo?: number
          data_hora: string
          duracao_min?: number
          id?: string
          observacoes?: string | null
          pagamento?: Database["public"]["Enums"]["pagamento_metodo"]
          servico_id?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          updated_at?: string
          user_id: string
          valor?: number
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          custo?: number
          data_hora?: string
          duracao_min?: number
          id?: string
          observacoes?: string | null
          pagamento?: Database["public"]["Enums"]["pagamento_metodo"]
          servico_id?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          alergias: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          servico_favorito: string | null
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alergias?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          servico_favorito?: string | null
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alergias?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          servico_favorito?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      servicos: {
        Row: {
          ativo: boolean
          created_at: string
          custo: number
          duracao_min: number
          id: string
          intervalo_recomendado: number
          dias_manutencao: number
          nome: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          custo?: number
          duracao_min?: number
          id?: string
          intervalo_recomendado?: number
          dias_manutencao?: number
          nome: string
          updated_at?: string
          user_id: string
          valor?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          custo?: number
          duracao_min?: number
          id?: string
          intervalo_recomendado?: number
          dias_manutencao?: number
          nome?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      produtos: {
        Row: {
          id: string
          user_id: string
          nome: string
          descricao: string | null
          preco_venda: number
          preco_custo: number
          quantidade: number
          quantidade_minima: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nome: string
          descricao?: string | null
          preco_venda?: number
          preco_custo?: number
          quantidade?: number
          quantidade_minima?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nome?: string
          descricao?: string | null
          preco_venda?: number
          preco_custo?: number
          quantidade?: number
          quantidade_minima?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      movimentacoes_estoque: {
        Row: {
          id: string
          user_id: string
          produto_id: string
          tipo: "entrada" | "saida"
          quantidade: number
          motivo: string
          data: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          produto_id: string
          tipo: "entrada" | "saida"
          quantidade: number
          motivo: string
          data?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          produto_id?: string
          tipo?: "entrada" | "saida"
          quantidade?: number
          motivo?: string
          data?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          }
        ]
      }
      fidelidade_config: {
        Row: {
          user_id: string
          ativo: boolean
          pontos_por_real: number
          pontos_resgate: number
          premio_resgate: string
          niver_promo_ativa: boolean
          niver_desconto_porcentagem: number
          niver_dias_validade: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          ativo?: boolean
          pontos_por_real?: number
          pontos_resgate?: number
          premio_resgate?: string
          niver_promo_ativa?: boolean
          niver_desconto_porcentagem?: number
          niver_dias_validade?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          ativo?: boolean
          pontos_por_real?: number
          pontos_resgate?: number
          premio_resgate?: string
          niver_promo_ativa?: boolean
          niver_desconto_porcentagem?: number
          niver_dias_validade?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      fidelidade_pontos: {
        Row: {
          id: string
          user_id: string
          cliente_id: string
          saldo_pontos: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          cliente_id: string
          saldo_pontos?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          cliente_id?: string
          saldo_pontos?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fidelidade_pontos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          }
        ]
      }
      fidelidade_historico: {
        Row: {
          id: string
          user_id: string
          cliente_id: string
          pontos: number
          tipo: "ganho" | "resgate"
          descricao: string
          data: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          cliente_id: string
          pontos: number
          tipo: "ganho" | "resgate"
          descricao: string
          data?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          cliente_id?: string
          pontos?: number
          tipo?: "ganho" | "resgate"
          descricao?: string
          data?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fidelidade_historico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          }
        ]
      }
      promocoes: {
        Row: {
          id: string
          user_id: string
          nome: string
          ativo: boolean
          tipo: "desconto_porcentagem" | "valor_fixo"
          valor: number
          data_inicio: string | null
          data_fim: string | null
          servicos_elegiveis: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nome: string
          ativo?: boolean
          tipo: "desconto_porcentagem" | "valor_fixo"
          valor?: number
          data_inicio?: string | null
          data_fim?: string | null
          servicos_elegiveis?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nome?: string
          ativo?: boolean
          tipo?: "desconto_porcentagem" | "valor_fixo"
          valor?: number
          data_inicio?: string | null
          data_fim?: string | null
          servicos_elegiveis?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      portfolio: {
        Row: {
          id: string
          user_id: string
          titulo: string
          descricao: string | null
          imagem_url: string
          foto_antes_url: string | null
          cliente_id: string | null
          tags: string[] | null
          publico: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          titulo: string
          descricao?: string | null
          imagem_url: string
          foto_antes_url?: string | null
          cliente_id?: string | null
          tags?: string[] | null
          publico?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          titulo?: string
          descricao?: string | null
          imagem_url?: string
          foto_antes_url?: string | null
          cliente_id?: string | null
          tags?: string[] | null
          publico?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          }
        ]
      }
      vendas: {
        Row: {
          id: string
          user_id: string
          cliente_id: string | null
          total: number
          pagamento_metodo: Database["public"]["Enums"]["pagamento_metodo"]
          data_venda: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          cliente_id?: string | null
          total?: number
          pagamento_metodo?: Database["public"]["Enums"]["pagamento_metodo"]
          data_venda?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          cliente_id?: string | null
          total?: number
          pagamento_metodo?: Database["public"]["Enums"]["pagamento_metodo"]
          data_venda?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          }
        ]
      }
      venda_itens: {
        Row: {
          id: string
          user_id: string
          venda_id: string
          produto_id: string
          quantidade: number
          preco_unitario: number
        }
        Insert: {
          id?: string
          user_id: string
          venda_id: string
          produto_id: string
          quantidade: number
          preco_unitario: number
        }
        Update: {
          id?: string
          user_id?: string
          venda_id?: string
          produto_id?: string
          quantidade?: number
          preco_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "venda_itens_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          }
        ]
      }
      avaliacoes: {
        Row: {
          id: string
          user_id: string
          cliente_id: string | null
          cliente_nome: string
          nota: number
          comentario: string | null
          data: string
          publico: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          cliente_id?: string | null
          cliente_nome: string
          nota: number
          comentario?: string | null
          data?: string
          publico?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          cliente_id?: string | null
          cliente_nome?: string
          nota?: number
          comentario?: string | null
          data?: string
          publico?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          }
        ]
      }
      metas_mensais: {
        Row: {
          id: string
          user_id: string
          mes_ano: string
          faturamento_alvo: number
          lucro_alvo: number
          servicos_alvo: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          mes_ano: string
          faturamento_alvo?: number
          lucro_alvo?: number
          servicos_alvo?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          mes_ano?: string
          faturamento_alvo?: number
          lucro_alvo?: number
          servicos_alvo?: number
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      agendamento_status: "agendado" | "confirmado" | "concluido" | "cancelado"
      pagamento_metodo: "pix" | "dinheiro" | "debito" | "credito" | "pendente"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agendamento_status: ["agendado", "confirmado", "concluido", "cancelado"],
      pagamento_metodo: ["pix", "dinheiro", "debito", "credito", "pendente"],
    },
  },
} as const
