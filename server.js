// Vincithe1 site server. Plain Node, no dependencies.
// Serves the site from ./public, takes form submissions, and gives the owner an inbox at /admin.
// Env: PORT, ADMIN_PASSWORD (owner sets it in Railway), DATA_DIR (Railway volume, default ./data), NTFY_TOPIC (optional push alerts).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const PASS = process.env.ADMIN_PASSWORD || '';
fs.mkdirSync(path.join(DATA, 'photos'), { recursive: true });

const INBOX = path.join(DATA, 'inbox.json');
const FEATURED = path.join(DATA, 'featured.json');
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return []; } };
const writeJ = (f, v) => { fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(f + '.tmp', f); };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };
const KINDS = new Set(['Music booking', 'Design / media request', 'Fan photo submission', 'Subscriber', 'Contact message']);

// simple per-IP rate limit: 10 submissions per 10 minutes
const hits = new Map();
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < 600000);
  arr.push(now); hits.set(ip, arr); return arr.length > 10;
}

function send(res, code, body, type = 'application/json', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authed(req) {
  if (!PASS) return false;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const pw = Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':');
  const a = Buffer.from(pw), b = Buffer.from(PASS);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function notify(title, msg) {
  const topic = process.env.NTFY_TOPIC; if (!topic) return;
  fetch('https://ntfy.sh/' + topic, { method: 'POST', headers: { Title: title }, body: msg }).catch(() => {});
}

function clean(v, n = 2000) { return String(v ?? '').slice(0, n); }

function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', 'text/plain');
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const cache = type.startsWith('text/html') ? 'no-cache' : 'public, max-age=604800';
    const range = req.headers.range;
    if (range && type === 'video/mp4') {
      const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
      const start = m[1] ? +m[1] : 0, end = m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (start >= st.size) return send(res, 416, '', 'text/plain', { 'Content-Range': `bytes */${st.size}` });
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': cache });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': cache });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try {
    if (url.pathname === '/health') return send(res, 200, { ok: true });

    if (url.pathname === '/api/submit' && req.method === 'POST') {
      if (limited(ip)) return send(res, 429, { error: 'Too many submissions. Try again in a few minutes.' });
      const body = JSON.parse(await readBody(req, 3_000_000));
      if (!KINDS.has(body.kind)) return send(res, 400, { error: 'Unknown form' });
      const entry = { id: crypto.randomUUID(), kind: body.kind, at: new Date().toISOString(), read: false };
      for (const [k, v] of Object.entries(body)) {
        if (k === 'kind' || k === 'photo') continue;
        entry[clean(k, 40)] = Array.isArray(v) ? v.slice(0, 20).map((x) => clean(x, 200)) : clean(v);
      }
      if (body.photo) {
        const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(body.photo));
        if (!m) return send(res, 400, { error: 'Bad photo' });
        const name = entry.id + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
        fs.writeFileSync(path.join(DATA, 'photos', name), Buffer.from(m[2], 'base64'));
        entry.photo = '/photos/' + name;
      }
      const inbox = readJ(INBOX); inbox.push(entry); writeJ(INBOX, inbox);
      notify('New ' + entry.kind, [entry.name, entry.email, entry.type || entry.subject || ''].filter(Boolean).join(' · '));
      return send(res, 200, { ok: true });
    }

    if (url.pathname === '/api/featured' && req.method === 'GET') {
      return send(res, 200, readJ(FEATURED), 'application/json', { 'Cache-Control': 'no-cache' });
    }

    if (url.pathname.startsWith('/photos/')) {
      const name = path.basename(url.pathname);
      const isFeatured = readJ(FEATURED).some((f) => f.photo === '/photos/' + name);
      if (!isFeatured && !authed(req)) return send(res, 401, 'Login required', 'text/plain', { 'WWW-Authenticate': 'Basic realm="Vinci inbox"' });
      const file = path.join(DATA, 'photos', name);
      if (!fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(name)] || 'image/jpeg');
    }

    if (url.pathname.startsWith('/admin')) {
      if (!PASS) return send(res, 503, 'Inbox is locked until ADMIN_PASSWORD is set in Railway.', 'text/plain');
      if (!authed(req)) return send(res, 401, 'Login required', 'text/plain', { 'WWW-Authenticate': 'Basic realm="Vinci inbox"' });
      if (url.pathname === '/admin/api/inbox') return send(res, 200, { inbox: readJ(INBOX), featured: readJ(FEATURED) });
      if (url.pathname === '/admin/api/action' && req.method === 'POST') {
        const { id, action } = JSON.parse(await readBody(req, 10000));
        const inbox = readJ(INBOX), e = inbox.find((x) => x.id === id);
        if (!e) return send(res, 404, { error: 'Not found' });
        let featured = readJ(FEATURED);
        if (action === 'read') e.read = true;
        if (action === 'unread') e.read = false;
        if (action === 'feature' && e.photo) { featured = featured.filter((f) => f.id !== id); featured.push({ id, name: e.name || 'Fan', piece: e.piece || '', photo: e.photo, at: e.at }); }
        if (action === 'unfeature') featured = featured.filter((f) => f.id !== id);
        if (action === 'delete') { inbox.splice(inbox.indexOf(e), 1); featured = featured.filter((f) => f.id !== id); }
        writeJ(INBOX, inbox); writeJ(FEATURED, featured);
        return send(res, 200, { ok: true });
      }
      if (url.pathname === '/admin/subscribers.csv') {
        const rows = readJ(INBOX).filter((e) => e.kind === 'Subscriber');
        const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
        const csv = 'name,email,interests,joined\n' + rows.map((r) => [r.name, r.email, [].concat(r.interests || []).join('; '), r.at].map(q).join(',')).join('\n');
        return send(res, 200, csv, 'text/csv', { 'Content-Disposition': 'attachment; filename="subscribers.csv"' });
      }
      return send(res, 200, fs.readFileSync(path.join(__dirname, 'admin.html')), 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
    }

    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url.pathname);
    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('ERR', req.method, url.pathname, e.message);
    return send(res, 400, { error: 'Bad request' });
  }
});

server.listen(PORT, () => console.log('Vincithe1 site on port ' + PORT + (PASS ? '' : ' (inbox locked: set ADMIN_PASSWORD)')));
