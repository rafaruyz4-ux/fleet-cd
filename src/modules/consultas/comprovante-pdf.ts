import PDFDocument from 'pdfkit';
import type { DebitoMulta } from '../../integrations/infosimples/client';

/**
 * Comprovante em PDF gerado pelo próprio sistema a partir da resposta oficial
 * do órgão. Substitui o "site receipt" da Infosimples como arquivo principal
 * (aquele HTML é um dump técnico ilegível); o receipt original fica guardado
 * ao lado apenas como via de auditoria.
 */

const AZUL = '#2D6BFF';
const ESCURO = '#111827';
const CINZA = '#6b7280';
const LINHA = '#d1d5db';

export interface DadosComprovante {
  consultaId: string;
  fonte: string; // nome amigável da consulta (ex.: DETRAN/SP — Débitos...)
  simulado: boolean;
  mensagem: string;
  consultadoEm: Date;
  placa: string;
  renavam: string | null;
  /** Campos escalares devolvidos pelo órgão (dados do veículo/débitos). */
  dadosVeiculo: Record<string, unknown>;
  multas: DebitoMulta[];
}

function rotuloBonito(campo: string): string {
  const r = campo.replace(/_/g, ' ');
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function dataHoraBr(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function moeda(v: number | undefined): string | null {
  if (v === undefined || !Number.isFinite(v)) return null;
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

export function gerarPdfComprovante(d: DadosComprovante): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 56, left: 48, right: 48 },
      info: { Title: `Comprovante de consulta — ${d.placa}` },
    });
    const partes: Buffer[] = [];
    doc.on('data', (c: Buffer) => partes.push(c));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const larguraUtil = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const parDeLinha = (rotulo: string, valor: string) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(ESCURO)
        .text(`${rotulo}:  `, { continued: true })
        .font('Helvetica')
        .fillColor(ESCURO)
        .text(valor);
    };

    const tituloSecao = (titulo: string) => {
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(AZUL).text(titulo.toUpperCase());
      const y = doc.y + 2;
      doc
        .moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.margins.left + larguraUtil, y)
        .strokeColor(LINHA)
        .lineWidth(0.8)
        .stroke();
      doc.moveDown(0.5);
    };

    // ---- Cabeçalho ----
    doc.font('Helvetica-Bold').fontSize(24).fillColor(AZUL).text('NEXUS FROTA');
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(CINZA)
      .text('INTELIGÊNCIA EM MOVIMENTO', { characterSpacing: 1.5 });
    doc.moveDown(0.6);
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(ESCURO)
      .text('Comprovante de consulta de débitos e multas');

    if (d.simulado) {
      doc.moveDown(0.4);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#dc2626')
        .text('CONSULTA SIMULADA — DADOS DE EXEMPLO, SEM VALOR OFICIAL');
    }

    // ---- Dados da consulta ----
    tituloSecao('Consulta');
    parDeLinha('Fonte', d.fonte);
    parDeLinha('Realizada em', dataHoraBr(d.consultadoEm));
    parDeLinha('Placa', d.placa);
    if (d.renavam) parDeLinha('Renavam', d.renavam);
    parDeLinha('Resultado', d.mensagem);
    parDeLinha('Nº da consulta', d.consultaId);

    // ---- Dados devolvidos pelo órgão (só campos simples) ----
    const escalares = Object.entries(d.dadosVeiculo).filter(
      ([, v]) => v !== null && v !== undefined && typeof v !== 'object',
    );
    if (escalares.length > 0) {
      tituloSecao('Dados devolvidos pelo órgão');
      for (const [campo, valor] of escalares) {
        parDeLinha(rotuloBonito(campo), String(valor));
      }
    }

    // ---- Multas ----
    tituloSecao(`Multas encontradas (${d.multas.length})`);
    if (d.multas.length === 0) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(ESCURO)
        .text('Nenhuma multa encontrada nesta consulta.');
    }
    d.multas.forEach((m, i) => {
      if (i > 0) doc.moveDown(0.6);
      doc
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .fillColor(ESCURO)
        .text(`Multa ${i + 1} — Auto nº ${m.numero_auto}`);
      if (m.tipo) parDeLinha('Descrição', m.tipo);
      const valor = moeda(m.valor);
      if (valor) parDeLinha('Valor', valor);
      if (m.pontos_cnh !== undefined) parDeLinha('Pontos na CNH', String(m.pontos_cnh));
      if (m.ocorrida_em) parDeLinha('Data da infração', dataHoraBr(new Date(m.ocorrida_em)));
      if (m.local) parDeLinha('Local', m.local);
    });

    // ---- Rodapé ----
    doc.moveDown(1.5);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(CINZA)
      .text(
        `Documento gerado automaticamente pelo Nexus Frota em ${dataHoraBr(new Date())}, ` +
          'a partir da resposta oficial do órgão de trânsito obtida via Infosimples. ' +
          'A resposta bruta da consulta fica arquivada no sistema para auditoria.',
        { width: larguraUtil },
      );

    doc.end();
  });
}

/** Nome amigável da consulta a partir do endpoint configurado. */
export function nomeDaFonte(endpoint: string): string {
  const NOMES: Record<string, string> = {
    'detran/sp/debitos': 'DETRAN/SP — Débitos e Restrições do Veículo',
    'sefaz/sp/debitos-veiculo': 'SEFAZ/SP — Débitos do Veículo',
  };
  return NOMES[endpoint] ?? endpoint;
}
