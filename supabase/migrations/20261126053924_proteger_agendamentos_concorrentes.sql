create extension if not exists btree_gist with schema extensions;

set local search_path = public, extensions;

create or replace function public.agendamento_periodo(
  p_inicio timestamptz,
  p_duracao_min integer
)
returns tstzrange
language sql
immutable
strict
parallel safe
set search_path = public, pg_temp
as $$
  select tstzrange(p_inicio, p_inicio + (interval '1 minute' * p_duracao_min), '[)');
$$;

do $$
declare
  v_conflitos bigint;
begin
  select count(*) into v_conflitos
  from public.agendamentos a
  join public.agendamentos b
    on b.user_id = a.user_id
   and b.id > a.id
   and a.status <> 'cancelado'::public.agendamento_status
   and b.status <> 'cancelado'::public.agendamento_status
   and public.agendamento_periodo(a.data_hora, a.duracao_min)
       && public.agendamento_periodo(b.data_hora, b.duracao_min);

  if v_conflitos > 0 then
    raise exception 'Existem % pares de agendamentos sobrepostos; resolva antes de aplicar a migration', v_conflitos;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agendamentos_sem_sobreposicao'
      and conrelid = 'public.agendamentos'::regclass
  ) then
    alter table public.agendamentos
      add constraint agendamentos_sem_sobreposicao
      exclude using gist (
        user_id with =,
        public.agendamento_periodo(data_hora, duracao_min) with &&
      )
      where (status <> 'cancelado'::public.agendamento_status);
  end if;
end $$;

create or replace function public.agendar_servico(
  p_user_id UUID,
  p_cliente_nome TEXT,
  p_cliente_telefone TEXT,
  p_cliente_email TEXT DEFAULT NULL,
  p_cliente_data_nascimento DATE DEFAULT NULL,
  p_cliente_observacoes TEXT DEFAULT NULL,
  p_servico_id UUID DEFAULT NULL,
  p_data_hora TIMESTAMPTZ DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL,
  p_valor_final NUMERIC(10,2) DEFAULT NULL
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cliente_id UUID;
  v_servico RECORD;
  v_agendamento_id UUID;
  v_conflito BOOLEAN;
  v_valor_final NUMERIC(10,2);
  v_dia_local DATE;
  v_hora_local TIME;
begin
  if not exists (
    select 1 from public.contas c
    where c.user_id = p_user_id
      and c.status = 'ativo'
      and (c.acesso_termina_em is null or c.acesso_termina_em > now())
  ) then
    return jsonb_build_object('success', false, 'error', 'Agenda indisponível no momento');
  end if;

  if p_cliente_nome is null or trim(p_cliente_nome) = '' then
    return jsonb_build_object('success', false, 'error', 'Nome do cliente é obrigatório');
  end if;

  if p_cliente_telefone is null or trim(p_cliente_telefone) = '' then
    return jsonb_build_object('success', false, 'error', 'Telefone do cliente é obrigatório');
  end if;

  if p_servico_id is null then
    return jsonb_build_object('success', false, 'error', 'Serviço não informado');
  end if;

  if p_data_hora is null or p_data_hora < now() then
    return jsonb_build_object('success', false, 'error', 'Data/hora inválida ou no passado');
  end if;

  if p_data_hora > now() + interval '365 days' then
    return jsonb_build_object('success', false, 'error', 'Data muito distante (máx. 1 ano de antecedência)');
  end if;

  select id, nome, valor, custo, duracao_min, ativo
  into v_servico
  from public.servicos
  where id = p_servico_id and user_id = p_user_id and ativo = true;

  if v_servico.id is null then
    return jsonb_build_object('success', false, 'error', 'Serviço não encontrado ou inativo');
  end if;

  v_dia_local := (p_data_hora at time zone 'America/Sao_Paulo')::date;
  v_hora_local := (p_data_hora at time zone 'America/Sao_Paulo')::time;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text || '|' || v_dia_local::text));

  if exists (
    select 1 from public.bloqueios_agenda b
    where b.user_id = p_user_id
      and b.data_inicio <= v_dia_local
      and (b.data_fim is null or b.data_fim >= v_dia_local)
      and (
        b.horario_inicio is null
        or (
          v_hora_local < coalesce(b.horario_fim, b.horario_inicio)
          and v_hora_local + (interval '1 minute' * v_servico.duracao_min) > b.horario_inicio
        )
      )
  ) then
    return jsonb_build_object('success', false, 'error', 'Horário bloqueado pela profissional');
  end if;

  if exists (
    select 1 from public.horarios_trabalho h
    where h.user_id = p_user_id and h.ativo = true
  ) and not exists (
    select 1 from public.horarios_trabalho h
    where h.user_id = p_user_id
      and h.ativo = true
      and h.dia_semana::int = extract(dow from v_dia_local)::int
      and v_hora_local >= h.hora_inicio
      and v_hora_local + (interval '1 minute' * v_servico.duracao_min) <= h.hora_fim
  ) then
    return jsonb_build_object('success', false, 'error', 'Horário fora do expediente da profissional');
  end if;

  if to_regclass('public.expediente_intervalos') is not null then
    if exists (
      select 1 from public.expediente_intervalos i
      where i.user_id = p_user_id
        and i.dia_semana::int = extract(dow from v_dia_local)::int
        and v_hora_local < i.hora_fim::time
        and v_hora_local + (interval '1 minute' * v_servico.duracao_min) > i.hora_inicio::time
    ) then
      return jsonb_build_object('success', false, 'error', 'Horário cai em um intervalo/pausa cadastrado');
    end if;
  end if;

  select exists (
    select 1 from public.agendamentos
    where user_id = p_user_id
      and status != 'cancelado'
      and public.agendamento_periodo(data_hora, duracao_min)
          && public.agendamento_periodo(p_data_hora, v_servico.duracao_min)
  ) into v_conflito;

  if v_conflito then
    return jsonb_build_object('success', false, 'error', 'Conflito de horário');
  end if;

  v_valor_final := round(coalesce(p_valor_final, v_servico.valor), 2);
  if v_valor_final < 0 then
    return jsonb_build_object('success', false, 'error', 'Valor inválido');
  end if;

  select id into v_cliente_id
  from public.clientes
  where user_id = p_user_id and telefone = p_cliente_telefone
  limit 1;

  if v_cliente_id is null then
    insert into public.clientes (user_id, nome, telefone, email, data_nascimento, observacoes)
    values (p_user_id, p_cliente_nome, p_cliente_telefone, p_cliente_email, p_cliente_data_nascimento, p_cliente_observacoes)
    returning id into v_cliente_id;
  end if;

  insert into public.agendamentos (
    user_id, cliente_id, servico_id, data_hora, duracao_min,
    valor, custo, status, pagamento, observacoes
  ) values (
    p_user_id, v_cliente_id, p_servico_id, p_data_hora, v_servico.duracao_min,
    v_valor_final, v_servico.custo, 'agendado', 'pendente', p_observacoes
  )
  returning id into v_agendamento_id;

  insert into public.audit_log (user_id, acao, entidade, entidade_id, detalhes)
  values (p_user_id, 'create', 'agendamento', v_agendamento_id::text,
    jsonb_build_object(
      'source', 'public_booking',
      'cliente_nome', p_cliente_nome,
      'servico', v_servico.nome,
      'valor', v_servico.valor
    )
  );

  return jsonb_build_object(
    'success', true,
    'agendamento_id', v_agendamento_id,
    'message', 'Agendamento realizado com sucesso'
  );
exception
  when sqlstate '23P01' then
    return jsonb_build_object('success', false, 'error', 'Conflito de horário');
end;
$$;

revoke execute on function public.agendar_servico(uuid, text, text, text, date, text, uuid, timestamptz, text, numeric) from public;
grant execute on function public.agendar_servico(uuid, text, text, text, date, text, uuid, timestamptz, text, numeric) to service_role;
