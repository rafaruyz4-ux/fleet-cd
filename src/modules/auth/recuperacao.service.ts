import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../../errors/AppError';
import { query, queryOne } from '../../db/pool';
import { env } from '../../config/env';
import { hashPassword } from '../../utils/password';
import { enviarEmail } from '../../infra/mailer';

// Validade do link de redefinição.
const VALIDADE_MIN = 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Inicia o "esqueci minha senha": se o e-mail existir e estiver ativo, gera um
 * token de uso único (validade curta) e manda o link por e-mail. NÃO revela se
 * o e-mail existe — sempre resolve sem erro (anti-enumeração de contas).
 */
export async function solicitarRecuperacao(email: string): Promise<void> {
  const usuario = await queryOne<{ id: string; nome: string }>(
    'SELECT id, nome FROM usuarios WHERE email = $1 AND ativo = TRUE',
    [email.toLowerCase()],
  );
  if (!usuario) return; // silêncio proposital

  // Só um token ativo por vez: invalida os anteriores ainda não usados.
  await query(
    'UPDATE tokens_recuperacao_senha SET usado_em = now() WHERE usuario_id = $1 AND usado_em IS NULL',
    [usuario.id],
  );

  const token = randomBytes(32).toString('hex');
  await query(
    `INSERT INTO tokens_recuperacao_senha (usuario_id, token_hash, expira_em)
     VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [usuario.id, hashToken(token), VALIDADE_MIN],
  );

  const link = `${env.appBaseUrl}/redefinir-senha?token=${token}`;
  await enviarEmail({
    para: email.toLowerCase(),
    assunto: 'Redefinição de senha — Fleet CD',
    texto:
      `Olá, ${usuario.nome}.\n\n` +
      `Recebemos um pedido para redefinir sua senha. Acesse o link abaixo ` +
      `(válido por ${VALIDADE_MIN} minutos):\n\n${link}\n\n` +
      `Se não foi você, ignore este e-mail — sua senha continua a mesma.`,
  });
}

/**
 * Conclui a redefinição: valida o token (existe, não usado, não expirado),
 * troca a senha e marca o token como usado (não pode ser reutilizado).
 */
export async function redefinirComToken(token: string, novaSenha: string): Promise<void> {
  const linha = await queryOne<{ id: string; usuario_id: string }>(
    `SELECT id, usuario_id FROM tokens_recuperacao_senha
     WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now()`,
    [hashToken(token)],
  );
  if (!linha) {
    throw AppError.badRequest('Link inválido ou expirado. Solicite um novo.');
  }

  const senhaHash = await hashPassword(novaSenha);
  await query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [senhaHash, linha.usuario_id]);
  await query('UPDATE tokens_recuperacao_senha SET usado_em = now() WHERE id = $1', [linha.id]);
}
