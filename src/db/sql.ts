/**
 * Peças reutilizáveis para montar SQL parametrizado sem controlar o índice
 * dos placeholders ($1, $2, ...) na mão.
 *
 * Antes, cada serviço repetia o mesmo trecho: um contador `i`, um array
 * `values` e o cuidado de manter os dois sincronizados (`$${i++}` + push).
 * Esquecer um push ou um i++ gerava bug silencioso. Estas classes guardam o
 * valor e devolvem o placeholder na ordem certa automaticamente.
 */

/** Monta a parte SET de um UPDATE: "col = $1, col2 = $2, ...". */
export class MontadorUpdate {
  private readonly sets: string[] = [];
  readonly valores: unknown[] = [];

  /** "coluna = $N" guardando o valor. */
  set(coluna: string, valor: unknown): this {
    this.valores.push(valor);
    this.sets.push(`${coluna} = $${this.valores.length}`);
    return this;
  }

  /** Registra um valor avulso e devolve seu placeholder ($N) — para
   *  expressões SQL especiais (ST_MakePoint, CASE, etc.). */
  ph(valor: unknown): string {
    this.valores.push(valor);
    return `$${this.valores.length}`;
  }

  /** Trecho de SET sem valor próprio, ex.: "chegada_real = now()". */
  setExpr(expr: string): this {
    this.sets.push(expr);
    return this;
  }

  /** true quando nada foi marcado para atualizar. */
  get vazio(): boolean {
    return this.sets.length === 0;
  }

  /** "col = $1, col2 = $2" pronto para entrar no UPDATE. */
  get sql(): string {
    return this.sets.join(', ');
  }
}

/** Monta a cláusula WHERE de uma listagem: "WHERE a AND b AND ...". */
export class MontadorWhere {
  private readonly clausulas: string[] = [];
  readonly valores: unknown[] = [];

  /** Registra um valor e devolve seu placeholder ($N). */
  ph(valor: unknown): string {
    this.valores.push(valor);
    return `$${this.valores.length}`;
  }

  /** Adiciona uma condição booleana (combinadas com AND). */
  add(clausula: string): this {
    this.clausulas.push(clausula);
    return this;
  }

  /** "WHERE a AND b" — ou "" se nenhuma condição foi adicionada. */
  get whereSql(): string {
    return this.clausulas.length ? `WHERE ${this.clausulas.join(' AND ')}` : '';
  }
}
