import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Small compatibility layer: the application already speaks the D1 prepared
// statement API. Keeping that contract makes the data move reversible and
// avoids rewriting game rules during the infrastructure migration.
class Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new Statement(this.database, this.sql, values);
  }

  run() {
    const prepared = this.database.prepare(this.sql);
    // D1 devolve `results` quando um SELECT participa de batch(). O backend
    // usa exatamente isso para a lista de presença. Executar SELECT com
    // `.run()` no SQLite gravava o pulso, mas descartava as linhas lidas e o
    // portal recebia a lista vazia, caindo no fallback "Você".
    if (/^\s*(?:SELECT|PRAGMA|EXPLAIN)\b/i.test(this.sql)) {
      return { results: prepared.all(...this.values), meta: { changes: 0, last_row_id: 0 } };
    }
    const result = prepared.run(...this.values);
    return { meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) } };
  }

  first() {
    return this.database.prepare(this.sql).get(...this.values) || null;
  }
}

export function createSqliteD1(filename) {
  mkdirSync(path.dirname(filename), { recursive: true });
  const database = new DatabaseSync(filename);
  database.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

  return {
    prepare(sql) {
      return new Statement(database, sql);
    },
    batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement) => statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      database.close();
    },
  };
}
