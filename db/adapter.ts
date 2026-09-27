export type QueryResult = {rows: Record<string, unknown>[]; count: number};
export type Executor = (sql: string, values: unknown[]) => Promise<QueryResult>;
// SQL is application-owned; user values always remain separate parameters.
export function compileSql(sql: string) {
  let parameter = 0;
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?|\b[A-Za-z_][A-Za-z_0-9]*\b/g, token => {
    if (token === '?') return `$${++parameter}`;
    if (token.startsWith("'") || token.startsWith('"')) return token;
    return /[a-z][A-Z]/.test(token) ? `"${token}"` : token;
  });
}
export class Statement {
  readonly sql: string;
  readonly execute: Executor;
  readonly values: unknown[];
  constructor(sql: string, execute: Executor, values: unknown[] = []) {this.sql=sql;this.execute=execute;this.values=values;}
  bind(...values: unknown[]) { return new Statement(this.sql, this.execute, values); }
  async all<T = Record<string, unknown>>() {
    const result = await this.execute(compileSql(this.sql), this.values);
    return {results: result.rows as T[], meta: {changes: result.count}};
  }
  async first<T = Record<string, unknown>>() { return (await this.all<T>()).results[0] ?? null; }
  async run() { return this.all(); }
}
export function createDatabase(execute: Executor, transaction: (statements: Statement[]) => Promise<{results: Record<string, unknown>[]; meta: {changes: number}}[]>) {
  return {prepare: (sql: string) => new Statement(sql, execute), batch: transaction};
}
