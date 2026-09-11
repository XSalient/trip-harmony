import fs from 'fs';
import pg from 'pg';
const line = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const url = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g,'');
let u; try { u = new URL(url); } catch (e) { console.log('parse fail', e.message); process.exit(0); }
console.log('host=', u.hostname, 'port=', u.port, 'db=', u.pathname, 'user=', u.username.slice(0,6)+'...');
const p = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 10000 });
try { const r = await p.query("select count(*)::int n from users"); console.log('OK users=', r.rows[0].n); }
catch (e) { console.log('ERR', e.code, '|', e.message); }
await p.end();
