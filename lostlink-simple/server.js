// LostLink – Express + MySQL2 backend
// Database: MySQL (replaces SQLite)

const path    = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const mysql   = require('mysql2/promise');

const PORT = process.env.PORT || 3000;

const CATEGORIES = [
  { name: 'Electronics',     icon: '🎧' }, { name: 'Books & Notes', icon: '📚' },
  { name: 'ID & Cards',      icon: '🪪' }, { name: 'Wallets & Money', icon: '👛' },
  { name: 'Keys',            icon: '🔑' }, { name: 'Bags',          icon: '🎒' },
  { name: 'Clothing',        icon: '🧥' }, { name: 'Water Bottles', icon: '🧴' },
  { name: 'Other',           icon: '📦' },
];
const CATEGORY_NAMES = CATEGORIES.map(c => c.name);

// ------------------------------------------------------------------ DATABASE
const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  port:             Number(process.env.DB_PORT) || 3306,
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || 'ABcd12&&@@',
  database:         process.env.DB_NAME     || 'lostlink',
  waitForConnections: true,
  connectionLimit:  10,
  charset:          'utf8mb4',
});

// Query helpers – mirror the better-sqlite3 API style
async function q(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}
async function qGet(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}
async function qRun(sql, params = []) {
  const [r] = await pool.execute(sql, params);
  return { lastInsertRowid: r.insertId, changes: r.affectedRows };
}
async function qCount(sql, params = []) {
  const row = await qGet(sql, params);
  return row ? Number(Object.values(row)[0]) : 0;
}

// ------------------------------------------------------------------ APP SETUP
const app = express();
app.use(express.json({ limit: '50kb' }));

// CORS – allow both localhost and file:// opened pages to reach the API
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin === 'null') {
    // file:// opened pages – allow public (non-credentialed) access only
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  } else if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    // Same-machine browser – full credentialed access
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  // SameSite=lax works correctly on http://localhost (Chrome/Firefox/Edge).
  // SameSite=none requires Secure (HTTPS) – omitting Secure makes Chrome DROP the cookie.
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 8 },
}));

// CSRF: mutating requests must be JSON
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'OPTIONS') return next();
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) return res.status(415).json({ error: 'JSON request required.' });
  next();
});

// Attach logged-in user to every request
app.use(async (req, res, next) => {
  req.user = req.session.userId
    ? await qGet('SELECT id, name, email, phone, role FROM users WHERE id = ?', [req.session.userId])
    : null;
  next();
});

const fail          = (res, code, msg) => res.status(code).json({ error: msg });
const requireLogin  = (req, res, next) => req.user ? next() : fail(res, 401, 'Please log in first.');
const requireAdmin  = (req, res, next) => {
  if (!req.user)                  return fail(res, 401, 'Please log in first.');
  if (req.user.role !== 'admin')  return fail(res, 403, 'Admins only.');
  next();
};
const clean    = v => (typeof v === 'string' ? v.trim() : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ------------------------------------------------------------------ AUTH
app.post('/api/register', async (req, res) => {
  try {
    const name     = clean(req.body.name);
    const email    = clean(req.body.email).toLowerCase();
    const phone    = clean(req.body.phone);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (name.length < 2)       return fail(res, 400, 'Please enter your full name.');
    if (!EMAIL_RE.test(email)) return fail(res, 400, 'Please enter a valid email address.');
    if (password.length < 6)   return fail(res, 400, 'Password must be at least 6 characters.');
    if (await qGet('SELECT 1 FROM users WHERE email = ?', [email]))
      return fail(res, 409, 'This email is already registered.');

    const hash = await bcrypt.hash(password, 10);
    const info = await qRun(
      'INSERT INTO users (name, email, password_hash, phone) VALUES (?,?,?,?)',
      [name, email, hash, phone || null]
    );
    req.session.userId = info.lastInsertRowid;
    req.session.save((err) => {
      if (err) { console.error('Session save error:', err); return fail(res, 500, 'Session error. Please try again.'); }
      res.status(201).json({ ok: true });
    });
  } catch (e) {
    console.error('Register error:', e);
    fail(res, 500, 'Registration failed. Please try again.');
  }
});


app.post('/api/login', async (req, res) => {
  try {
    const email    = clean(req.body.email).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user     = await qGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return fail(res, 401, 'Incorrect email or password.');
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return fail(res, 401, 'Incorrect email or password.');
    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) { console.error('Session save error:', err); return fail(res, 500, 'Session error. Please try again.'); }
      res.json({ ok: true, role: user.role });
    });
  } catch (e) {
    console.error('Login error:', e);
    fail(res, 500, 'Login failed. Please try again.');
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});
app.get('/api/me',      (req, res) => res.json({ user: req.user }));

app.put('/api/me', requireLogin, async (req, res) => {
  const name = clean(req.body.name);
  if (name.length < 2) return fail(res, 400, 'Name must be at least 2 characters.');
  await qRun('UPDATE users SET name = ?, phone = ? WHERE id = ?',
    [name, clean(req.body.phone) || null, req.user.id]);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ ITEMS
app.get('/api/categories', (_req, res) => res.json(CATEGORIES));

app.get('/api/public-stats', async (_req, res) => {
  const [total, open, returned] = await Promise.all([
    qCount('SELECT COUNT(*) AS c FROM items'),
    qCount("SELECT COUNT(*) AS c FROM items WHERE status='open'"),
    qCount("SELECT COUNT(*) AS c FROM items WHERE status='returned'"),
  ]);
  res.json({ total, open, returned });
});

app.get('/api/items', async (req, res) => {
  const where = [], params = [];
  const qs = clean(req.query.q);
  if (qs) {
    where.push('(i.title LIKE ? OR i.description LIKE ? OR i.location LIKE ?)');
    params.push(`%${qs}%`, `%${qs}%`, `%${qs}%`);
  }
  if (['lost','found'].includes(req.query.type))
    { where.push('i.type = ?');     params.push(req.query.type); }
  if (['open','claimed','returned'].includes(req.query.status))
    { where.push('i.status = ?');   params.push(req.query.status); }
  if (CATEGORY_NAMES.includes(req.query.category))
    { where.push('i.category = ?'); params.push(req.query.category); }

  const rows = await q(`
    SELECT i.id, i.type, i.title, i.category, i.location,
           DATE_FORMAT(i.event_date, '%Y-%m-%d') AS event_date,
           i.status, i.created_at, u.name AS poster
    FROM items i JOIN users u ON u.id = i.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY i.created_at DESC, i.id DESC LIMIT 100`, params);
  res.json(rows);
});

function readItemBody(b) {
  const item = {
    type:            b.type === 'found' ? 'found' : 'lost',
    title:           clean(b.title),
    description:     clean(b.description),
    category:        clean(b.category),
    location:        clean(b.location),
    event_date:      clean(b.event_date),
    verify_question: clean(b.verify_question),
  };
  const limit = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  let error = null;
  if (item.title.length < 3)                               error = 'Title must be at least 3 characters.';
  else if (!CATEGORY_NAMES.includes(item.category))        error = 'Please choose a category.';
  else if (!item.location)                                 error = 'Location is required.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(item.event_date))  error = 'Please choose a valid date.';
  else if (item.event_date > limit)                        error = 'Date cannot be in the future.';
  else if (item.type === 'found' && item.verify_question.length < 5)
    error = 'For found items, add a verification question only the owner can answer.';
  if (item.type === 'lost') item.verify_question = '';
  return { item, error };
}

app.post('/api/items', requireLogin, async (req, res) => {
  const { item, error } = readItemBody(req.body);
  if (error) return fail(res, 400, error);
  const info = await qRun(
    'INSERT INTO items (user_id, type, title, description, category, location, event_date, verify_question) VALUES (?,?,?,?,?,?,?,?)',
    [req.user.id, item.type, item.title, item.description || null,
     item.category, item.location, item.event_date, item.verify_question || null]
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

app.get('/api/items/:id', async (req, res) => {
  const item = await qGet(`
    SELECT i.*, DATE_FORMAT(i.event_date,'%Y-%m-%d') AS event_date,
           u.name AS poster, u.email AS poster_email, u.phone AS poster_phone
    FROM items i JOIN users u ON u.id = i.user_id WHERE i.id = ?`, [req.params.id]);
  if (!item) return fail(res, 404, 'Item not found.');

  const me       = req.user;
  const isOwner  = !!me && me.id === item.user_id;
  const isAdmin  = !!me && me.role === 'admin';
  const myClaim  = me
    ? await qGet('SELECT id, status, note FROM claims WHERE item_id = ? AND claimant_id = ? ORDER BY id DESC LIMIT 1', [item.id, me.id])
    : null;
  const approved = !!me && !!(await qGet(
    "SELECT 1 AS x FROM claims WHERE item_id = ? AND claimant_id = ? AND status = 'approved'", [item.id, me.id]));

  const result = {
    id: item.id, type: item.type, title: item.title, description: item.description,
    category: item.category, location: item.location, event_date: item.event_date,
    status: item.status, poster: item.poster,
    verify_question: item.type === 'found' ? item.verify_question : null,
    isOwner, isAdmin, canEdit: isOwner || isAdmin, myClaim: myClaim || null,
    contact: (isOwner || isAdmin || approved)
      ? { email: item.poster_email, phone: item.poster_phone } : null,
    claims: [],
  };
  if (isOwner || isAdmin) {
    result.claims = await q(`
      SELECT c.id, c.status, c.created_at, u.name AS claimant,
             ${isAdmin ? 'c.answer' : 'NULL'} AS answer
      FROM claims c JOIN users u ON u.id = c.claimant_id
      WHERE c.item_id = ? ORDER BY c.id DESC`, [item.id]);
  }
  res.json(result);
});

app.put('/api/items/:id', requireLogin, async (req, res) => {
  const old = await qGet('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!old) return fail(res, 404, 'Item not found.');
  if (old.user_id !== req.user.id && req.user.role !== 'admin')
    return fail(res, 403, 'You can only edit your own posts.');
  const { item, error } = readItemBody(req.body);
  if (error) return fail(res, 400, error);
  await qRun(
    'UPDATE items SET type=?, title=?, description=?, category=?, location=?, event_date=?, verify_question=? WHERE id=?',
    [item.type, item.title, item.description || null, item.category,
     item.location, item.event_date, item.verify_question || null, old.id]);
  res.json({ ok: true });
});

app.delete('/api/items/:id', requireLogin, async (req, res) => {
  const old = await qGet('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!old) return fail(res, 404, 'Item not found.');
  if (old.user_id !== req.user.id && req.user.role !== 'admin')
    return fail(res, 403, 'You can only delete your own posts.');
  await qRun('DELETE FROM items WHERE id = ?', [old.id]);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ CLAIMS
app.post('/api/items/:id/claims', requireLogin, async (req, res) => {
  const item = await qGet('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!item)                         return fail(res, 404, 'Item not found.');
  if (item.user_id === req.user.id)  return fail(res, 400, 'You cannot claim your own post.');
  if (item.status !== 'open')        return fail(res, 400, 'This item is no longer open for claims.');
  if (await qGet(
    "SELECT 1 FROM claims WHERE item_id = ? AND claimant_id = ? AND status = 'pending'",
    [item.id, req.user.id]))
    return fail(res, 409, 'You already have a pending claim on this item.');

  const answer = clean(req.body.answer).slice(0, 500);
  if (answer.length < 2) return fail(res, 400, 'Please write your answer.');
  await qRun('INSERT INTO claims (item_id, claimant_id, answer) VALUES (?,?,?)',
    [item.id, req.user.id, answer]);
  res.status(201).json({ ok: true });
});

app.delete('/api/claims/:id', requireLogin, async (req, res) => {
  const claim = await qGet('SELECT * FROM claims WHERE id = ?', [req.params.id]);
  if (!claim) return fail(res, 404, 'Claim not found.');
  if (claim.claimant_id !== req.user.id || claim.status !== 'pending')
    return fail(res, 403, 'You cannot withdraw this claim.');
  await qRun('DELETE FROM claims WHERE id = ?', [claim.id]);
  res.json({ ok: true });
});

app.get('/api/my', requireLogin, async (req, res) => {
  const items  = await q(`
    SELECT i.id, i.type, i.title, i.category, i.status,
           DATE_FORMAT(i.event_date,'%Y-%m-%d') AS event_date,
           (SELECT COUNT(*) FROM claims WHERE item_id = i.id AND status = 'pending') AS pending_claims
    FROM items i WHERE i.user_id = ? ORDER BY i.created_at DESC, i.id DESC`, [req.user.id]);
  const claims = await q(`
    SELECT c.id, c.item_id, c.status, c.note, c.created_at, i.title AS item_title
    FROM claims c JOIN items i ON i.id = c.item_id
    WHERE c.claimant_id = ? ORDER BY c.id DESC`, [req.user.id]);
  res.json({ items, claims });
});

// ------------------------------------------------------------------ ADMIN
const claimCols = `
  SELECT c.id, c.item_id, c.answer, c.status, c.note, c.created_at, c.reviewed_at,
         i.title AS item_title, i.type AS item_type, i.verify_question,
         u.name AS claimant, u.email AS claimant_email, u.phone AS claimant_phone
  FROM claims c JOIN items i ON i.id = c.item_id JOIN users u ON u.id = c.claimant_id`;

app.get('/api/admin/claims', requireAdmin, async (_req, res) => {
  const [pending, handover] = await Promise.all([
    q(`${claimCols} WHERE c.status = 'pending' ORDER BY c.created_at ASC`),
    q(`${claimCols} WHERE c.status = 'approved' AND i.status = 'claimed' ORDER BY c.reviewed_at DESC`),
  ]);
  res.json({ pending, handover });
});

app.post('/api/admin/claims/:id/approve', requireAdmin, async (req, res) => {
  const claim = await qGet('SELECT * FROM claims WHERE id = ?', [req.params.id]);
  if (!claim)                        return fail(res, 404, 'Claim not found.');
  if (claim.status !== 'pending')    return fail(res, 400, 'This claim was already reviewed.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      "UPDATE claims SET status='approved', note=?, reviewed_at=NOW() WHERE id=?",
      [clean(req.body.note) || null, claim.id]);
    await conn.execute("UPDATE items SET status='claimed' WHERE id=?", [claim.item_id]);
    await conn.execute(
      "UPDATE claims SET status='rejected', note='Another claim was approved.', reviewed_at=NOW() WHERE item_id=? AND status='pending' AND id<>?",
      [claim.item_id, claim.id]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
  res.json({ ok: true });
});

app.post('/api/admin/claims/:id/reject', requireAdmin, async (req, res) => {
  const claim = await qGet('SELECT * FROM claims WHERE id = ?', [req.params.id]);
  if (!claim)                     return fail(res, 404, 'Claim not found.');
  if (claim.status !== 'pending') return fail(res, 400, 'This claim was already reviewed.');
  await qRun(
    "UPDATE claims SET status='rejected', note=?, reviewed_at=NOW() WHERE id=?",
    [clean(req.body.note) || 'The answer did not match.', claim.id]);
  res.json({ ok: true });
});

app.post('/api/admin/items/:id/returned', requireAdmin, async (req, res) => {
  const result = await qRun("UPDATE items SET status='returned' WHERE id = ?", [req.params.id]);
  if (!result.changes) return fail(res, 404, 'Item not found.');
  res.json({ ok: true });
});

app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  const [users, total, open, pendingClaims, returned, byCategory, byStatus] = await Promise.all([
    qCount('SELECT COUNT(*) AS c FROM users'),
    qCount('SELECT COUNT(*) AS c FROM items'),
    qCount("SELECT COUNT(*) AS c FROM items WHERE status='open'"),
    qCount("SELECT COUNT(*) AS c FROM claims WHERE status='pending'"),
    qCount("SELECT COUNT(*) AS c FROM items WHERE status='returned'"),
    q('SELECT category AS label, COUNT(*) AS value FROM items GROUP BY category ORDER BY value DESC'),
    q('SELECT status AS label, COUNT(*) AS value FROM items GROUP BY status'),
  ]);
  res.json({
    users, items: total, open, pendingClaims,
    recoveryRate: total ? Math.round((returned / total) * 100) : 0,
    byCategory, byStatus,
  });
});

app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  const users = await q(`
    SELECT u.id, u.name, u.email, u.role, u.created_at,
           (SELECT COUNT(*) FROM items WHERE user_id = u.id) AS item_count
    FROM users u ORDER BY u.id`);
  res.json(users);
});

app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  if (Number(req.params.id) === req.user.id) return fail(res, 400, 'You cannot change your own role.');
  if (!['student','admin'].includes(req.body.role)) return fail(res, 400, 'Invalid role.');
  await qRun('UPDATE users SET role = ? WHERE id = ?', [req.body.role, req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  if (Number(req.params.id) === req.user.id) return fail(res, 400, 'You cannot delete your own account.');
  await qRun('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ STATIC + ERRORS
app.use('/api', (_req, res) => fail(res, 404, 'Unknown API route.'));
app.use(express.static(path.join(__dirname, 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'Invalid JSON.');
  console.error(err);
  fail(res, 500, 'Something went wrong on the server.');
});

// ------------------------------------------------------------------ START
if (require.main === module) {
  pool.getConnection()
    .then(conn => { conn.release(); console.log('✅ MySQL connected.'); })
    .then(() => app.listen(PORT, () => console.log(`🚀 LostLink running → http://localhost:${PORT}`)))
    .catch(err => {
      console.error('❌ MySQL connection failed:', err.message);
      console.error('   1. Make sure MySQL is running in Workbench.');
      console.error('   2. Run:  node db_setup.js  (first time only)');
      process.exit(1);
    });
}

module.exports = { app, pool };
