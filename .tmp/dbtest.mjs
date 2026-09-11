import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try { const r = await p.query('select count(*) from users'); console.log('OK', r.rows); }
catch (e) { console.log('ERR', e.code, e.message); }
await p.end();
