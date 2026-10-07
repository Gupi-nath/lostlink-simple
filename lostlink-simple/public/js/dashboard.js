(async function () {
  var user = await initPage({ login: true });
  if (!user) return;

  $('#hello').textContent = 'Hello, ' + user.name;
  $('#p-name').value = user.name;
  $('#p-email').value = user.email;
  $('#p-phone').value = user.phone || '';

  async function load() {
    var data = await api('/api/my');

    $('#c-posts').textContent = data.items.length;
    $('#c-open').textContent = data.items.filter(function (i) { return i.status === 'open'; }).length;
    $('#c-returned').textContent = data.items.filter(function (i) { return i.status === 'returned'; }).length;
    $('#c-claims').textContent = data.claims.length;

    $('#my-items').innerHTML = data.items.length ? data.items.map(function (i) {
      return '<li><div class="row-between"><a href="item.html?id=' + i.id + '"><b>' + esc(i.title) + '</b></a>' +
        '<span>' + badge(i.type) + ' ' + badge(i.status) + '</span></div>' +
        '<div class="small muted">' + esc(i.category) + ' · ' + esc(i.event_date) +
        (i.pending_claims ? ' · <b>' + i.pending_claims + ' pending claim(s)</b>' : '') + '</div>' +
        '<div class="inline-form"><a class="btn btn-outline btn-small" href="post.html?id=' + i.id + '">Edit</a>' +
        '<button class="btn btn-danger btn-small" data-delete="' + i.id + '">Delete</button></div></li>';
    }).join('') : '<li class="muted">You have not posted anything yet.</li>';

    $('#my-claims').innerHTML = data.claims.length ? data.claims.map(function (c) {
      return '<li><div class="row-between"><a href="item.html?id=' + c.item_id + '"><b>' + esc(c.item_title) + '</b></a>' + badge(c.status) + '</div>' +
        '<div class="small muted">Submitted ' + esc(String(c.created_at).slice(0, 10)) + '</div>' +
        (c.note ? '<div class="small">💬 Admin note: ' + esc(c.note) + '</div>' : '') +
        (c.status === 'pending' ? '<div class="inline-form"><button class="btn btn-outline btn-small" data-withdraw="' + c.id + '">Withdraw</button></div>' : '') +
        '</li>';
    }).join('') : '<li class="muted">No claims yet. <a href="index.html">Browse items</a> to find yours.</li>';
  }

  // one click listener handles every delete / withdraw button
  document.addEventListener('click', async function (e) {
    var del = e.target.getAttribute('data-delete');
    var wd = e.target.getAttribute('data-withdraw');
    try {
      if (del && confirm('Delete this post permanently?')) { await api('/api/items/' + del, 'DELETE'); await load(); }
      if (wd && confirm('Withdraw this claim?')) { await api('/api/claims/' + wd, 'DELETE'); await load(); }
    } catch (err) { showMsg(err.message, 'error'); }
  });

  $('#profile-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    try {
      await api('/api/me', 'PUT', { name: $('#p-name').value, phone: $('#p-phone').value });
      showMsg('Profile saved.', 'success');
      $('#hello').textContent = 'Hello, ' + $('#p-name').value;
    } catch (err) { showMsg(err.message, 'error'); }
  });

  load();
})();
