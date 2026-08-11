import { z } from 'zod';

/**
 * Política de senha única do sistema (usuários, motoristas, backoffice, reset):
 *  - 10+ caracteres, OU 8+ caracteres contendo letra E número;
 *  - nunca uma senha óbvia da lista abaixo.
 * A regra "10 OU 8+mistura" premia comprimento (frases longas passam sem
 * exigir malabarismo) sem deixar entrar '12345678'.
 */

// Lista curta das senhas mais usadas do mundo (e as óbvias em PT). Comparação
// em minúsculas — 'Senha123' cai igual.
const SENHAS_OBVIAS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'senha123',
  'senha1234',
  'password',
  'password1',
  'password123',
  'qwerty123',
  'qwertyuiop',
  'abc12345',
  '11111111',
  '87654321',
  'mudar123',
  'admin123',
]);

export const MENSAGEM_SENHA_FRACA =
  'Senha fraca: use ao menos 10 caracteres, ou 8 misturando letras e números';

/**
 * Schema zod da política de senha. `maxLen` acompanha o limite que cada
 * módulo já usava (72 para motoristas — teto do bcrypt; 200 nos demais).
 */
export function schemaSenha(maxLen = 200) {
  return z
    .string()
    .max(maxLen, `A senha pode ter no máximo ${maxLen} caracteres`)
    .superRefine((senha, ctx) => {
      if (SENHAS_OBVIAS.has(senha.toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Esta senha é muito comum — escolha outra',
        });
        return;
      }
      const temLetra = /[a-zA-ZÀ-ÿ]/.test(senha);
      const temNumero = /\d/.test(senha);
      const forte = senha.length >= 10 || (senha.length >= 8 && temLetra && temNumero);
      if (!forte) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: MENSAGEM_SENHA_FRACA });
      }
    });
}
