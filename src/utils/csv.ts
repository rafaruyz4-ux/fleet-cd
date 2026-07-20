import type { Response } from 'express';

/*
 * Geração de CSV "amigável ao Excel brasileiro":
 *  - BOM UTF-8 no início (sem ele o Excel pt-BR mostra acentos quebrados);
 *  - separador ponto-e-vírgula (o Excel pt-BR usa vírgula como decimal);
 *  - CRLF entre linhas;
 *  - campos com ; " ou quebra de linha ficam entre aspas (aspas dobradas).
 */

const BOM = '﻿';

function escaparCampo(valor: string): string {
  if (/[";\r\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

/** Monta o texto CSV (com BOM) a partir do cabeçalho + linhas. */
export function montarCsv(cabecalho: string[], linhas: string[][]): string {
  const todas = [cabecalho, ...linhas];
  return BOM + todas.map((l) => l.map(escaparCampo).join(';')).join('\r\n') + '\r\n';
}

/** Envia um CSV como download (Content-Disposition: attachment). */
export function enviarCsv(res: Response, nomeArquivo: string, conteudo: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
  res.send(conteudo);
}

/** Data/hora ISO → "dd/mm/aaaa hh:mm" (fuso de São Paulo), ou "" se nula. */
export function csvDataHora(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d
    .toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '');
}

/** Número → texto com vírgula decimal (Excel BR), ou "" se nulo. */
export function csvNumero(n: number | null | undefined, casas = 2): string {
  if (n === null || n === undefined) return '';
  return n.toFixed(casas).replace('.', ',');
}
