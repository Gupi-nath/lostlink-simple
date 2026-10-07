// Shared helpers used by every page.

// ── If opened directly as a file (file:// protocol), redirect to the local
//    dev server so that cookies / sessions work correctly.
if (location.protocol === 'file:') {
  var _page = location.pathname.split('/').pop() || 'index.html';
  location.replace('http://localhost:3000/' + _page + location.search + location.hash);
}

// If the page is opened directly as a file (file:// protocol), point API calls
// to the local dev server at http://localhost:3000 so everything works the same.
var API_BASE = location.protocol === 'file:' ? 'http://localhost:3000' : '';

// Talk to the back-end. Throws an Error with the server's message if something goes wrong.
async function api(url, method, body) {
  method = method || 'GET';
  const options = { method: method, headers: {}, credentials: 'include' };
  if (method !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body || {});
  }
  const res = await fetch(API_BASE + url, options);
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}

// Escape text before putting it inside HTML (prevents XSS).
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function $(selector) { return document.querySelector(selector); }

// Show a message box (success / error) at the top of the page.
function showMsg(text, type) {
  var box = $('#msg');
  if (!box) return;
  box.className = 'alert alert-' + (type || 'info');
  box.textContent = text;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function clearMsg() {
  var box = $('#msg');
  if (box) box.className = 'alert hidden';
}

// Category list with icons (loaded once).
var categoriesCache = null;
async function getCategories() {
  if (!categoriesCache) categoriesCache = await api('/api/categories');
  return categoriesCache;
}
function iconFor(categories, name) {
  var found = categories.find(function (c) { return c.name === name; });
  return found ? found.icon : '📦';
}

function badge(text, kind) {
  return '<span class="badge badge-' + esc(kind || text) + '">' + esc(text) + '</span>';
}

// Today's date in the user's own time zone, formatted YYYY-MM-DD (for date inputs).
function todayLocal() {
  var d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

function itemCard(item, categories) {
  return '<a class="card item-card" href="item.html?id=' + item.id + '">' +
    '<div class="item-icon">' + iconFor(categories, item.category) + '</div>' +
    '<div class="card-body">' +
      '<div class="row-between">' + badge(item.type) + badge(item.status) + '</div>' +
      '<h3>' + esc(item.title) + '</h3>' +
      '<p class="muted small">📍 ' + esc(item.location) + '<br>📅 ' + esc(item.event_date) + ' · ' + esc(item.category) + '</p>' +
    '</div></a>';
}

// Build the top menu. Returns nothing; the menu is drawn into <header id="navbar">.
function renderNav(user) {
  var links = '<a href="index.html">Browse</a>';
  if (user) {
    links += '<a href="dashboard.html">Dashboard</a>';
    if (user.role === 'admin') links += '<a href="admin.html">Admin panel</a>';
    links += '<a class="btn btn-accent btn-small" href="post.html">+ Report item</a>';
    links += '<span class="nav-user">' + esc(user.name.split(' ')[0]) + ' <small>(' + esc(user.role) + ')</small></span>';
    links += '<button class="btn btn-ghost btn-small" id="logout-btn">Log out</button>';
  } else {
    links += '<a href="login.html">Log in</a><a class="btn btn-accent btn-small" href="login.html?tab=register">Sign up</a>';
  }
  $('#navbar').innerHTML =
    '<div class="container nav-inner">' +
      '<a class="brand" href="index.html">📍 LostLink</a>' +
      '<button class="nav-toggle" id="nav-toggle" aria-label="Menu">☰</button>' +
      '<nav id="nav-links">' + links + '</nav>' +
    '</div>';
  $('#nav-toggle').addEventListener('click', function () { $('#nav-links').classList.toggle('open'); });
  var logout = $('#logout-btn');
  if (logout) logout.addEventListener('click', async function () {
    await api('/api/logout', 'POST');
    location.href = 'index.html';
  });
}

// Call at the start of every page. Options: { login: true } or { admin: true }.
// Returns the logged-in user (or null) once the menu has been drawn.
async function initPage(options) {
  options = options || {};
  var user = null;
  try {
    var data = await api('/api/me');
    user = data.user;
  } catch (e) {
    // Server not reachable or error – treat as logged out
    console.warn('Could not reach server:', e.message);
  }
  renderNav(user);
  if ((options.login || options.admin) && !user) {
    location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
    return null;
  }
  if (options.admin && user && user.role !== 'admin') {
    document.querySelector('main').innerHTML = '<div class="alert alert-error">Admins only. <a href="index.html">Go home</a></div>';
    return null;
  }
  return user;
}
