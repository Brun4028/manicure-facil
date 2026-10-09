export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      agendamentos: {
        Row: {
          cliente_id: string | null;
          created_at: string;
          custo: number;
          data_hora: string;
          duracao_min: number;
          id: string;
          observacoes: string | null;
          pagamento: Database["public"]["Enums"]["pagamento_metodo"];
          servico_id: string | null;
          status: Database["public"]["Enums"]["agendamento_status"];
          updated_at: string;
          user_id: string;
          valor: number;
        };
        Insert: {
          cliente_id?: string | null;
          created_at?: string;
          custo?: number;
          data_hora: string;
          duracao_min?: number;
          id?: string;
          observacoes?: string | null;
          pagamento?: Database["public"]["Enums"]["pagamento_metodo"];
          servico_id?: string | null;
          status?: Database["public"]["Enums"]["agendamento_status"];
          updated_at?: string;
          user_id: string;
          valor?: number;
        };
        Update: {
          cliente_id?: string | null;
          created_at?: string;
          custo?: number;
          data_hora?: string;
          duracao_min?: number;
          id?: string;
          observacoes?: string | null;
          pagamento?: Database["public"]["Enums"]["pagamento_metodo"];
          servico_id?: string | null;
          status?: Database["public"]["Enums"]["agendamento_status"];
          updated_at?: string;
          user_id?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "agendamentos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agendamentos_servico_id_fkey";
            columns: ["servico_id"];
            isOneToOne: false;
            referencedRelation: "servicos";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          user_id: string | null;
          acao: string;
          entidade: string;
          entidade_id: string | null;
          detalhes: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          acao: string;
          entidade: string;
          entidade_id?: string | null;
          detalhes?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          acao?: string;
          entidade?: string;
          entidade_id?: string | null;
          detalhes?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      backup_log: {
        Row: {
          id: string;
          user_id: string | null;
          tipo: string;
          status: string;
          tamanho_bytes: number | null;
          tabelas_incluidas: string[] | null;
          error_message: string | null;
          started_at: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          tipo: string;
          status: string;
          tamanho_bytes?: number | null;
          tabelas_incluidas?: string[] | null;
          error_message?: string | null;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          tipo?: string;
          status?: string;
          tamanho_bytes?: number | null;
          tabelas_incluidas?: string[] | null;
          error_message?: string | null;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      bloqueios_agenda: {
        Row: {
          id: string;
          user_id: string;
          titulo: string;
          tipo: string;
          data_inicio: string;
          data_fim: string;
          horario_inicio: string | null;
          horario_fim: string | null;
          cor: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          titulo: string;
          tipo: string;
          data_inicio: string;
          data_fim: string;
          horario_inicio?: string | null;
          horario_fim?: string | null;
          cor?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          titulo?: string;
          tipo?: string;
          data_inicio?: string;
          data_fim?: string;
          horario_inicio?: string | null;
          horario_fim?: string | null;
          cor?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      contas: {
        Row: {
          user_id: string;
          status: Database["public"]["Enums"]["conta_status"];
          is_admin: boolean;
          plano: string | null;
          fonte: string;
          kirvano_transacao_id: string | null;
          trial_inicio: string | null;
          trial_fim: string | null;
          acesso_termina_em: string | null;
          motivo_bloqueio: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          user_id: string;
          status?: Database["public"]["Enums"]["conta_status"];
          is_admin?: boolean;
          plano?: string | null;
          fonte?: string;
          kirvano_transacao_id?: string | null;
          trial_inicio?: string | null;
          trial_fim?: string | null;
          acesso_termina_em?: string | null;
          motivo_bloqueio?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          user_id?: string;
          status?: Database["public"]["Enums"]["conta_status"];
          is_admin?: boolean;
          plano?: string | null;
          fonte?: string;
          kirvano_transacao_id?: string | null;
          trial_inicio?: string | null;
          trial_fim?: string | null;
          acesso_termina_em?: string | null;
          motivo_bloqueio?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [];
      };
      clientes: {
        Row: {
          alergias: string | null;
          created_at: string;
          data_nascimento: string | null;
          email: string | null;
          id: string;
          nome: string;
          observacoes: string | null;
          servico_favorito: string | null;
          telefone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          alergias?: string | null;
          created_at?: string;
          data_nascimento?: string | null;
          email?: string | null;
          id?: string;
          nome: string;
          observacoes?: string | null;
          servico_favorito?: string | null;
          telefone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          alergias?: string | null;
          created_at?: string;
          data_nascimento?: string | null;
          email?: string | null;
          id?: string;
          nome?: string;
          observacoes?: string | null;
          servico_favorito?: string | null;
          telefone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      configuracoes: {
        Row: {
          id: string;
          user_id: string;
          empresa_nome: string | null;
          empresa_telefone: string | null;
          empresa_email: string | null;
          empresa_endereco: string | null;
          empresa_documento: string | null;
          horario_inicio_padrao: string;
          horario_fim_padrao: string;
          intervalo_padrao: number;
          lembrete_ativo: boolean;
          lembrete_email: boolean;
          lembrete_whatsapp: boolean;
          lembrete_antecipacao_min: number;
          notificacao_sonora: boolean;
          permite_fora_expediente: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          empresa_nome?: string | null;
          empresa_telefone?: string | null;
          empresa_email?: string | null;
          empresa_endereco?: string | null;
          empresa_documento?: string | null;
          horario_inicio_padrao?: string;
          horario_fim_padrao?: string;
          intervalo_padrao?: number;
          lembrete_ativo?: boolean;
          lembrete_email?: boolean;
          lembrete_whatsapp?: boolean;
          lembrete_antecipacao_min?: number;
          notificacao_sonora?: boolean;
          permite_fora_expediente?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          empresa_nome?: string | null;
          empresa_telefone?: string | null;
          empresa_email?: string | null;
          empresa_endereco?: string | null;
          empresa_documento?: string | null;
          horario_inicio_padrao?: string;
          horario_fim_padrao?: string;
          intervalo_padrao?: number;
          lembrete_ativo?: boolean;
          lembrete_email?: boolean;
          lembrete_whatsapp?: boolean;
          lembrete_antecipacao_min?: number;
          notificacao_sonora?: boolean;
          permite_fora_expediente?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      despesas: {
        Row: {
          id: string;
          user_id: string;
          categoria: string;
          subcategoria: string | null;
          descricao: string;
          valor: number;
          data_vencimento: string;
          data_pagamento: string | null;
          pago: boolean;
          forma_pagamento: string;
          recorrente: boolean;
          recorrencia_tipo: string | null;
          observacoes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          categoria: string;
          subcategoria?: string | null;
          descricao: string;
          valor: number;
          data_vencimento: string;
          data_pagamento?: string | null;
          pago?: boolean;
          forma_pagamento?: string;
          recorrente?: boolean;
          recorrencia_tipo?: string | null;
          observacoes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          categoria?: string;
          subcategoria?: string | null;
          descricao?: string;
          valor?: number;
          data_vencimento?: string;
          data_pagamento?: string | null;
          pago?: boolean;
          forma_pagamento?: string;
          recorrente?: boolean;
          recorrencia_tipo?: string | null;
          observacoes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      fidelidade_config: {
        Row: {
          user_id: string;
          ativo: boolean;
          pontos_por_real: number;
          pontos_resgate: number;
          premio_resgate: string;
          niver_promo_ativa: boolean;
          niver_desconto_porcentagem: number;
          niver_dias_validade: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          ativo?: boolean;
          pontos_por_real?: number;
          pontos_resgate?: number;
          premio_resgate?: string;
          niver_promo_ativa?: boolean;
          niver_desconto_porcentagem?: number;
          niver_dias_validade?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          ativo?: boolean;
          pontos_por_real?: number;
          pontos_resgate?: number;
          premio_resgate?: string;
          niver_promo_ativa?: boolean;
          niver_desconto_porcentagem?: number;
          niver_dias_validade?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fidelidade_pontos: {
        Row: {
          id: string;
          user_id: string;
          cliente_id: string;
          saldo_pontos: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          cliente_id: string;
          saldo_pontos?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          cliente_id?: string;
          saldo_pontos?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fidelidade_pontos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
        ];
      };
      fidelidade_historico: {
        Row: {
          id: string;
          user_id: string;
          cliente_id: string;
          pontos: number;
          tipo: "ganho" | "resgate";
          descricao: string;
          data: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          cliente_id: string;
          pontos: number;
          tipo: "ganho" | "resgate";
          descricao: string;
          data?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          cliente_id?: string;
          pontos?: number;
          tipo?: "ganho" | "resgate";
          descricao?: string;
          data?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fidelidade_historico_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
        ];
      };
      horarios_trabalho: {
        Row: {
          id: string;
          user_id: string;
          dia_semana: string;
          hora_inicio: string;
          hora_fim: string;
          ativo: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          dia_semana: string;
          hora_inicio: string;
          hora_fim: string;
          ativo?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          dia_semana?: string;
          hora_inicio?: string;
          hora_fim?: string;
          ativo?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      metas_mensais: {
        Row: {
          id: string;
          user_id: string;
          mes_ano: string;
          faturamento_alvo: number;
          lucro_alvo: number;
          servicos_alvo: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          mes_ano: string;
          faturamento_alvo?: number;
          lucro_alvo?: number;
          servicos_alvo?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          mes_ano?: string;
          faturamento_alvo?: number;
          lucro_alvo?: number;
          servicos_alvo?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      movimentacoes_estoque: {
        Row: {
          id: string;
          user_id: string;
          produto_id: string;
          tipo: "entrada" | "saida";
          quantidade: number;
          motivo: string;
          data: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          produto_id: string;
          tipo: "entrada" | "saida";
          quantidade: number;
          motivo: string;
          data?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          produto_id?: string;
          tipo?: "entrada" | "saida";
          quantidade?: number;
          motivo?: string;
          data?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "movimentacoes_estoque_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      notificacoes_internas: {
        Row: {
          id: string;
          user_id: string;
          titulo: string;
          mensagem: string;
          tipo: string;
          lida: boolean;
          acao_texto: string | null;
          acao_link: string | null;
          entidade: string | null;
          entidade_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          titulo: string;
          mensagem: string;
          tipo?: string;
          lida?: boolean;
          acao_texto?: string | null;
          acao_link?: string | null;
          entidade?: string | null;
          entidade_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          titulo?: string;
          mensagem?: string;
          tipo?: string;
          lida?: boolean;
          acao_texto?: string | null;
          acao_link?: string | null;
          entidade?: string | null;
          entidade_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          id: string;
          nome: string;
          telefone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          id: string;
          nome?: string;
          telefone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          nome?: string;
          telefone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      promocoes: {
        Row: {
          id: string;
          user_id: string;
          nome: string;
          ativo: boolean;
          tipo: "desconto_porcentagem" | "valor_fixo";
          valor: number;
          data_inicio: string | null;
          data_fim: string | null;
          servicos_elegiveis: Json | null;
          valor_minimo: number;
          limite_usos: number | null;
          usos: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          nome: string;
          ativo?: boolean;
          tipo: "desconto_porcentagem" | "valor_fixo";
          valor?: number;
          data_inicio?: string | null;
          data_fim?: string | null;
          servicos_elegiveis?: Json | null;
          valor_minimo?: number;
          limite_usos?: number | null;
          usos?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          nome?: string;
          ativo?: boolean;
          tipo?: "desconto_porcentagem" | "valor_fixo";
          valor?: number;
          data_inicio?: string | null;
          data_fim?: string | null;
          servicos_elegiveis?: Json | null;
          valor_minimo?: number;
          limite_usos?: number | null;
          usos?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      cupom_usos: {
        Row: {
          id: string;
          user_id: string;
          promocao_id: string;
          cliente_id: string | null;
          origem: string;
          entidade_id: string | null;
          valor_desconto: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          promocao_id: string;
          cliente_id?: string | null;
          origem?: string;
          entidade_id?: string | null;
          valor_desconto?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          promocao_id?: string;
          cliente_id?: string | null;
          origem?: string;
          entidade_id?: string | null;
          valor_desconto?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cupom_usos_promocao_id_fkey";
            columns: ["promocao_id"];
            isOneToOne: false;
            referencedRelation: "promocoes";
            referencedColumns: ["id"];
          },
        ];
      };
      lembretes_whatsapp: {
        Row: {
          id: string;
          user_id: string;
          chave: string;
          tipo: string;
          cliente_id: string | null;
          agendamento_id: string | null;
          cliente_nome: string;
          telefone: string | null;
          motivo: string;
          mensagem: string;
          data_referencia: string | null;
          status: string;
          adiado_ate: string | null;
          resolvido_em: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          chave: string;
          tipo: string;
          cliente_id?: string | null;
          agendamento_id?: string | null;
          cliente_nome: string;
          telefone?: string | null;
          motivo: string;
          mensagem: string;
          data_referencia?: string | null;
          status?: string;
          adiado_ate?: string | null;
          resolvido_em?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          chave?: string;
          tipo?: string;
          cliente_id?: string | null;
          agendamento_id?: string | null;
          cliente_nome?: string;
          telefone?: string | null;
          motivo?: string;
          mensagem?: string;
          data_referencia?: string | null;
          status?: string;
          adiado_ate?: string | null;
          resolvido_em?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      expediente_intervalos: {
        Row: {
          id: string;
          user_id: string;
          dia_semana: number;
          nome: string;
          hora_inicio: string;
          hora_fim: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          dia_semana: number;
          nome?: string;
          hora_inicio: string;
          hora_fim: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          dia_semana?: number;
          nome?: string;
          hora_inicio?: string;
          hora_fim?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      portfolio: {
        Row: {
          id: string;
          user_id: string;
          titulo: string;
          descricao: string | null;
          imagem_url: string;
          foto_antes_url: string | null;
          cliente_id: string | null;
          tags: string[] | null;
          publico: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          titulo: string;
          descricao?: string | null;
          imagem_url: string;
          foto_antes_url?: string | null;
          cliente_id?: string | null;
          tags?: string[] | null;
          publico?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          titulo?: string;
          descricao?: string | null;
          imagem_url?: string;
          foto_antes_url?: string | null;
          cliente_id?: string | null;
          tags?: string[] | null;
          publico?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portfolio_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
        ];
      };
      produtos: {
        Row: {
          id: string;
          user_id: string;
          nome: string;
          descricao: string | null;
          preco_venda: number;
          preco_custo: number;
          quantidade: number;
          quantidade_minima: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          nome: string;
          descricao?: string | null;
          preco_venda?: number;
          preco_custo?: number;
          quantidade?: number;
          quantidade_minima?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          nome?: string;
          descricao?: string | null;
          preco_venda?: number;
          preco_custo?: number;
          quantidade?: number;
          quantidade_minima?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recorrencias: {
        Row: {
          id: string;
          user_id: string;
          cliente_id: string | null;
          servico_id: string | null;
          frequencia: string;
          intervalo_dias: number | null;
          dia_semana: number | null;
          dia_mes: number | null;
          hora: string;
          duracao_min: number;
          valor: number | null;
          custo: number | null;
          observacoes: string | null;
          data_inicio: string;
          data_fim: string | null;
          ativo: boolean;
          proxima_geracao: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          cliente_id?: string | null;
          servico_id?: string | null;
          frequencia: string;
          intervalo_dias?: number | null;
          dia_semana?: number | null;
          dia_mes?: number | null;
          hora: string;
          duracao_min?: number;
          valor?: number | null;
          custo?: number | null;
          observacoes?: string | null;
          data_inicio: string;
          data_fim?: string | null;
          ativo?: boolean;
          proxima_geracao?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          cliente_id?: string | null;
          servico_id?: string | null;
          frequencia?: string;
          intervalo_dias?: number | null;
          dia_semana?: number | null;
          dia_mes?: number | null;
          hora?: string;
          duracao_min?: number;
          valor?: number | null;
          custo?: number | null;
          observacoes?: string | null;
          data_inicio?: string;
          data_fim?: string | null;
          ativo?: boolean;
          proxima_geracao?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recorrencias_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recorrencias_servico_id_fkey";
            columns: ["servico_id"];
            isOneToOne: false;
            referencedRelation: "servicos";
            referencedColumns: ["id"];
          },
        ];
      };
      servicos: {
        Row: {
          ativo: boolean;
          created_at: string;
          custo: number;
          duracao_min: number;
          id: string;
          intervalo_recomendado: number;
          dias_manutencao: number;
          nome: string;
          updated_at: string;
          user_id: string;
          valor: number;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          custo?: number;
          duracao_min?: number;
          id?: string;
          intervalo_recomendado?: number;
          dias_manutencao?: number;
          nome: string;
          updated_at?: string;
          user_id: string;
          valor?: number;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          custo?: number;
          duracao_min?: number;
          id?: string;
          intervalo_recomendado?: number;
          dias_manutencao?: number;
          nome?: string;
          updated_at?: string;
          user_id?: string;
          valor?: number;
        };
        Relationships: [];
      };
      vendas: {
        Row: {
          id: string;
          user_id: string;
          cliente_id: string | null;
          total: number;
          pagamento_metodo: Database["public"]["Enums"]["pagamento_metodo"];
          data_venda: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          cliente_id?: string | null;
          total?: number;
          pagamento_metodo?: Database["public"]["Enums"]["pagamento_metodo"];
          data_venda?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          cliente_id?: string | null;
          total?: number;
          pagamento_metodo?: Database["public"]["Enums"]["pagamento_metodo"];
          data_venda?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
        ];
      };
      venda_itens: {
        Row: {
          id: string;
          user_id: string;
          venda_id: string;
          produto_id: string;
          quantidade: number;
          preco_unitario: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          venda_id: string;
          produto_id: string;
          quantidade: number;
          preco_unitario: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          venda_id?: string;
          produto_id?: string;
          quantidade?: number;
          preco_unitario?: number;
        };
        Relationships: [
          {
            foreignKeyName: "venda_itens_venda_id_fkey";
            columns: ["venda_id"];
            isOneToOne: false;
            referencedRelation: "vendas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "venda_itens_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      avaliacoes: {
        Row: {
          id: string;
          user_id: string;
          cliente_id: string | null;
          cliente_nome: string;
          nota: number;
          comentario: string | null;
          data: string;
          publico: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          cliente_id?: string | null;
          cliente_nome: string;
          nota: number;
          comentario?: string | null;
          data?: string;
          publico?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          cliente_id?: string | null;
          cliente_nome?: string;
          nota?: number;
          comentario?: string | null;
          data?: string;
          publico?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "avaliacoes_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      vw_dre_mensal: {
        Row: {
          user_id: string;
          mes: string | null;
          conta: string | null;
          valor: number | null;
          tipo: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      verificar_acesso: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      definir_admin: {
        Args: { p_email: string };
        Returns: undefined;
      };
      atualizar_status_expirados: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      agendar_servico: {
        Args: {
          p_user_id: string;
          p_cliente_nome: string;
          p_cliente_telefone: string;
          p_cliente_email?: string | null;
          p_cliente_data_nascimento?: string | null;
          p_cliente_observacoes?: string | null;
          p_servico_id: string;
          p_data_hora: string;
          p_observacoes?: string | null;
          p_valor_final?: number;
        };
        Returns: Json;
      };
      criar_avaliacao: {
        Args: {
          p_user_id: string;
          p_cliente_nome: string;
          p_nota: number;
          p_comentario?: string | null;
        };
        Returns: Json;
      };
      fluxo_caixa_projetado: {
        Args: { p_user_id: string; p_dias?: number };
        Returns: {
          data: string;
          tipo: string;
          descricao: string;
          valor: number;
          saldo_acumulado: number;
        }[];
      };
    };
    Enums: {
      agendamento_status: "agendado" | "confirmado" | "concluido" | "cancelado";
      pagamento_metodo: "pix" | "dinheiro" | "debito" | "credito" | "pendente";
      conta_status: "ativo" | "inativo" | "bloqueado" | "suspenso";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      agendamento_status: ["agendado", "confirmado", "concluido", "cancelado"],
      pagamento_metodo: ["pix", "dinheiro", "debito", "credito", "pendente"],
      conta_status: ["ativo", "inativo", "bloqueado", "suspenso"],
    },
  },
} as const;
