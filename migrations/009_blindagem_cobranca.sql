-- Blindagem da cobrança: a troca de plano só entra em vigor após a confirmação
-- de pagamento no Asaas (webhook PAYMENT_CONFIRMED). Até lá a faixa pretendida
-- fica guardada em plano_faixa_pendente e o cliente mantém o plano atual.
ALTER TABLE empresas
  ADD COLUMN plano_faixa_pendente VARCHAR(20)
    CHECK (plano_faixa_pendente IN ('starter','pro','enterprise'));

-- Novo status 'pendente': troca de plano solicitada, aguardando pagamento.
-- Não bloqueia o acesso (o cliente segue no plano antigo enquanto espera).
ALTER TABLE empresas DROP CONSTRAINT empresas_plano_check;
ALTER TABLE empresas ADD CONSTRAINT empresas_plano_check
  CHECK (plano IN ('trial','ativo','pendente','suspenso','cancelado'));
