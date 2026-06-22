import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface Mensagem {
  para: string;
  assunto: string;
  texto: string;
}

// Captura em memória dos e-mails "enviados" quando NÃO há SMTP configurado
// (desenvolvimento e testes). Permite inspecionar o que seria enviado.
const capturados: Mensagem[] = [];

export function emailsCapturados(): readonly Mensagem[] {
  return capturados;
}

export function limparEmailsCapturados(): void {
  capturados.length = 0;
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

/**
 * Envia um e-mail. Com SMTP configurado (env SMTP_HOST), envia de verdade;
 * sem SMTP (dev/teste), apenas registra/loga — assim o fluxo funciona ponta a
 * ponta sem depender de um servidor de e-mail durante o desenvolvimento.
 */
export async function enviarEmail(msg: Mensagem): Promise<void> {
  const t = getTransporter();
  if (!t) {
    capturados.push(msg);
    console.log(`[email] (sem SMTP) para=${msg.para} assunto="${msg.assunto}"`);
    return;
  }
  await t.sendMail({
    from: env.smtp.remetente,
    to: msg.para,
    subject: msg.assunto,
    text: msg.texto,
  });
}
