// API smoke test: starts the real server on a temporary database and walks through every role.
const os = require('os');
const fs = require('fs');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lostlink-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
const { app, db } = require('../server');

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}

function client(base) {
  let cookie = '';
  return async function call(method, url, body, rawHeaders) {
    const headers = { ...(cookie ? { cookie } : {}) };
    let payload;
    if (method !== 'GET') { headers['content-type'] = 'application/json'; payload = JSON.stringify(body || {}); }
    if (rawHeaders) Object.assign(headers, rawHeaders);
    const res = await fetch(base + url, { method, headers, body: payload });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };
}

(async () => {
  const server = app.listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const today = new Date().toISOString().slice(0, 10);

  try {
    console.log('Static pages');
    const anon = client(base);
    for (const p of ['/', '/login.html', '/post.html', '/item.html', '/dashboard.html', '/admin.html', '/css/style.css', '/js/common.js']) {
      check('GET ' + p + ' -> 200', (await anon('GET', p)).status === 200);
    }

    console.log('Public API');
    check('categories list', (await anon('GET', '/api/categories')).data.length === 9);
    const list = await anon('GET', '/api/items');
    check('seeded items listed', list.data.length === 4);
    check('search by keyword', (await anon('GET', '/api/items?q=earbuds')).data.length === 1);
    check('filter by type', (await anon('GET', '/api/items?type=lost')).data.every(i => i.type === 'lost'));
    check('filter by category', (await anon('GET', '/api/items?category=Keys')).data.length === 0);
    check('unknown item -> 404', (await anon('GET', '/api/items/9999')).status === 404);
    check('anonymous /api/me -> user null', (await anon('GET', '/api/me')).data.user === null);

    console.log('Security');
    check('anonymous cannot post item (401)', (await anon('POST', '/api/items', { title: 'x' })).status === 401);
    check('anonymous cannot open admin API (401)', (await anon('GET', '/api/admin/stats')).status === 401);
    const form = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
    check('non-JSON POST rejected (415)', form.status === 415);
    check('wrong password -> 401', (await anon('POST', '/api/login', { email: 'student@lostlink.test', password: 'nope' })).status === 401);

    console.log('Registration & login');
    const user = client(base);
    check('invalid registration -> 400', (await user('POST', '/api/register', { name: 'A', email: 'bad', password: '1' })).status === 400);
    check('register works', (await user('POST', '/api/register', { name: 'Test Student', email: 'test@lostlink.test', password: 'secret1' })).status === 201);
    check('duplicate email -> 409', (await anon('POST', '/api/register', { name: 'Test', email: 'test@lostlink.test', password: 'secret1' })).status === 409);
    check('/api/me returns the new user', (await user('GET', '/api/me')).data.user.email === 'test@lostlink.test');
    check('student cannot open admin API (403)', (await user('GET', '/api/admin/stats')).status === 403);
    check('profile update', (await user('PUT', '/api/me', { name: 'Test Renamed', phone: '017' })).status === 200);

    console.log('Items CRUD');
    check('invalid item -> 400', (await user('POST', '/api/items', { type: 'found', title: 'x' })).status === 400);
    check('found item without question -> 400', (await user('POST', '/api/items', { type: 'found', title: 'Keychain', category: 'Keys', location: 'Library', event_date: today })).status === 400);
    check('future date -> 400', (await user('POST', '/api/items', { type: 'lost', title: 'Umbrella', category: 'Other', location: 'Gate', event_date: '2999-01-01' })).status === 400);
    const made = await user('POST', '/api/items', { type: 'found', title: 'Silver keychain', category: 'Keys', location: 'Library', event_date: today, description: 'Three keys', verify_question: 'What colour is the tag?' });
    check('create item', made.status === 201 && made.data.id);
    const id = made.data.id;
    const shown = await anon('GET', '/api/items/' + id);
    check('anonymous sees item, contact hidden', shown.data.title === 'Silver keychain' && shown.data.contact === null);
    check('owner can edit', (await user('PUT', '/api/items/' + id, { type: 'found', title: 'Silver keychain (edited)', category: 'Keys', location: 'Library', event_date: today, verify_question: 'What colour is the tag?' })).status === 200);
    check('edit saved', (await anon('GET', '/api/items/' + id)).data.title.includes('(edited)'));

    console.log('Claim workflow');
    const rafi = client(base);
    await rafi('POST', '/api/login', { email: 'rafi@lostlink.test', password: 'student123' });
    check('owner cannot claim own item', (await user('POST', '/api/items/' + id + '/claims', { answer: 'Blue' })).status === 400);
    check('other student cannot edit it (403)', (await rafi('PUT', '/api/items/' + id, { type: 'lost', title: 'Hijack', category: 'Keys', location: 'x', event_date: today })).status === 403);
    check('short answer -> 400', (await rafi('POST', '/api/items/' + id + '/claims', { answer: '' })).status === 400);
    check('claim submitted', (await rafi('POST', '/api/items/' + id + '/claims', { answer: 'Blue' })).status === 201);
    check('duplicate pending claim -> 409', (await rafi('POST', '/api/items/' + id + '/claims', { answer: 'Blue' })).status === 409);
    check('contact hidden before approval', (await rafi('GET', '/api/items/' + id)).data.contact === null);
    check('owner sees claim but not the answer', (await user('GET', '/api/items/' + id)).data.claims[0].answer === null);

    const admin = client(base);
    check('admin logs in', (await admin('POST', '/api/login', { email: 'admin@lostlink.test', password: 'admin123' })).data.role === 'admin');
    const pending = await admin('GET', '/api/admin/claims');
    check('admin sees pending claim with answer', pending.data.pending.length === 1 && pending.data.pending[0].answer === 'Blue');
    const claimId = pending.data.pending[0].id;
    check('admin approves', (await admin('POST', '/api/admin/claims/' + claimId + '/approve', { note: 'Collect at desk' })).status === 200);
    check('item is now claimed', (await anon('GET', '/api/items/' + id)).data.status === 'claimed');
    check('contact revealed to approved claimant', (await rafi('GET', '/api/items/' + id)).data.contact.email === 'test@lostlink.test');
    check('re-approving is blocked', (await admin('POST', '/api/admin/claims/' + claimId + '/approve', {})).status === 400);
    check('admin marks returned', (await admin('POST', '/api/admin/items/' + id + '/returned')).status === 200);
    check('no claims on returned item', (await rafi('POST', '/api/items/' + id + '/claims', { answer: 'late' })).status === 400);

    console.log('Reject + withdraw');
    const other = list.data.find(i => i.type === 'found');
    await rafi('POST', '/api/items/' + other.id + '/claims', { answer: 'guess' });
    const c2 = (await admin('GET', '/api/admin/claims')).data.pending[0];
    check('admin rejects with note', (await admin('POST', '/api/admin/claims/' + c2.id + '/reject', { note: 'Wrong answer' })).status === 200);
    check('item stays open after rejection', (await anon('GET', '/api/items/' + other.id)).data.status === 'open');
    await rafi('POST', '/api/items/' + other.id + '/claims', { answer: 'second try' });
    const mine = (await rafi('GET', '/api/my')).data;
    const pendingMine = mine.claims.find(c => c.status === 'pending');
    check('my dashboard lists claims', mine.claims.length >= 3 && !!pendingMine);
    check('student can withdraw pending claim', (await rafi('DELETE', '/api/claims/' + pendingMine.id)).status === 200);

    console.log('Admin tools');
    const stats = (await admin('GET', '/api/admin/stats')).data;
    check('stats include totals and charts', stats.items === 5 && stats.recoveryRate === 20 && stats.byCategory.length > 0);
    const users = (await admin('GET', '/api/admin/users')).data;
    check('user list', users.length === 4);
    const testId = users.find(u => u.email === 'test@lostlink.test').id;
    check('admin changes role', (await admin('PUT', '/api/admin/users/' + testId + '/role', { role: 'admin' })).status === 200);
    const adminId = users.find(u => u.email === 'admin@lostlink.test').id;
    check('admin cannot delete self', (await admin('DELETE', '/api/admin/users/' + adminId)).status === 400);
    check('admin deletes a user', (await admin('DELETE', '/api/admin/users/' + testId)).status === 200);
    check('deleting a user removes their items', (await anon('GET', '/api/items/' + id)).status === 404);
    check('admin can delete any post', (await admin('DELETE', '/api/items/' + other.id)).status === 200);

    console.log('Logout');
    await admin('POST', '/api/logout');
    check('after logout admin API is closed', (await admin('GET', '/api/admin/stats')).status === 401);
  } catch (e) {
    failed++;
    console.error('Unexpected error:', e);
  } finally {
    server.close();
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
