// A real, in-memory SQLite-backed stand-in for Cloudflare D1's PreparedStatement
// API, used where a test needs genuine SQL semantics (CHECK constraints, UNIQUE,
// ALTER TABLE, sqlite_master introspection) rather than a hand-rolled fake that
// can drift from what real D1 actually enforces. D1 is itself SQLite-compatible,
// so this is a faithful stand-in, not a mock of behavior we're guessing at.
const { DatabaseSync } = require('node:sqlite');

function createSqliteD1() {
  const db = new DatabaseSync(':memory:');
  function statement(sql) {
    const trimmed = sql.trim();
    const bound = (args) => ({
      async run() {
        const info = db.prepare(trimmed).run(...args);
        return { meta: { changes: Number(info.changes || 0), last_row_id: Number(info.lastInsertRowid || 0) } };
      },
      async first() {
        const row = db.prepare(trimmed).get(...args);
        return row === undefined ? null : row;
      },
      async all() {
        const rows = db.prepare(trimmed).all(...args);
        return { results: rows };
      }
    });
    return {
      bind: (...args) => bound(args),
      run: () => bound([]).run(),
      first: () => bound([]).first(),
      all: () => bound([]).all()
    };
  }
  return { _raw: db, prepare: statement };
}

module.exports = { createSqliteD1 };
