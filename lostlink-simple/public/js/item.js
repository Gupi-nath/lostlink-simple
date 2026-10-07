(async function () {
  var user = await initPage();
  var id = new URLSearchParams(location.search).get('id');
  var categories = await getCategories();
  var box = $('#content');

  async function load() {
    var item;
    try {
      item = await api('/api/items/' + encodeURIComponent(id));
    } catch (err) {
      box.innerHTML = '<div class="alert alert-error">' + esc(err.message) + '</div>';
      return;
    }
    document.title = item.title + ' · LostLink';

    // ----- left column: the item itself
    var html = '<div class="grid-2"><div>';
    html += '<div class="card"><div class="detail-icon">' + iconFor(categories, item.category) + '</div><div class="card-body">';
    html += '<div>' + badge(item.type) + ' ' + badge(item.status) + ' <span class="badge">' + esc(item.category) + '</span></div>';
    html += '<h1 style="margin-top:8px">' + esc(item.title) + '</h1>';
    html += '<p class="muted">📍 ' + esc(item.location) + ' · 📅 ' + esc(item.event_date) + '</p>';
    html += '<p style="white-space:pre-line">' + esc(item.description || 'No description provided.') + '</p>';
    if (item.canEdit) {
      html += '<div class="row-between" style="justify-content:flex-start">';
      html += '<a class="btn btn-outline btn-small" href="post.html?id=' + item.id + '">Edit</a>';
      html += '<button class="btn btn-danger btn-small" id="delete-btn">Delete</button>';
      if (item.isAdmin && item.status !== 'returned') html += '<button class="btn btn-success btn-small" id="returned-btn">Mark returned</button>';
      html += '</div>';
    }
    html += '</div></div></div>';

    // ----- right column: poster, claim form, claims list
    html += '<div>';
    html += '<div class="card card-pad"><h3>Posted by</h3><p>👤 ' + esc(item.poster) + '</p>';
    if (item.contact) {
      html += '<p class="small">✉️ ' + esc(item.contact.email) + (item.contact.phone ? '<br>📞 ' + esc(item.contact.phone) : '') + '</p>';
    } else {
      html += '<p class="small muted">🔒 Contact details are shown after a claim is approved.</p>';
    }
    html += '</div>';

    if (!item.isOwner) {
      html += '<div class="card card-pad mt"><h3>' + (item.type === 'found' ? 'Is this yours?' : 'Did you find this?') + '</h3>';
      if (item.status !== 'open') {
        html += '<p class="small muted">This item is <b>' + esc(item.status) + '</b> and no longer accepts claims.</p>';
      } else if (!user) {
        html += '<p class="small">Log in to submit a claim.</p><a class="btn btn-small" href="login.html?next=' + encodeURIComponent('item.html?id=' + item.id) + '">Log in</a>';
      } else if (item.myClaim && item.myClaim.status === 'pending') {
        html += '<div class="alert alert-warning">⏳ Your claim is waiting for admin review.</div>';
      } else {
        if (item.myClaim && item.myClaim.status === 'rejected') {
          html += '<div class="alert alert-error small">Your last claim was rejected' + (item.myClaim.note ? ': ' + esc(item.myClaim.note) : '.') + ' You may try again.</div>';
        }
        var question = item.type === 'found' ? (item.verify_question || 'Describe the item') : 'Where did you find it?';
        html += '<form id="claim-form"><div class="field"><label for="answer">' + esc(question) + '</label>' +
                '<input id="answer" maxlength="500" required></div>' +
                '<button class="btn btn-block" type="submit">' + (item.type === 'found' ? 'Submit claim' : 'I found this item') + '</button></form>';
      }
      html += '</div>';
    }

    if (item.claims.length) {
      html += '<div class="card card-pad mt"><h3>Claims on this item</h3><ul class="list">';
      item.claims.forEach(function (c) {
        html += '<li><div class="row-between"><b>' + esc(c.claimant) + '</b>' + badge(c.status) + '</div>' +
                (c.answer ? '<div class="small muted">Answer: ' + esc(c.answer) + '</div>' : '') +
                '<div class="small muted">' + esc(String(c.created_at).slice(0, 10)) + '</div></li>';
      });
      html += '</ul>';
      if (item.isAdmin) html += '<a class="btn btn-outline btn-small" href="admin.html">Review in admin panel</a>';
      html += '</div>';
    }
    html += '</div></div>';
    box.innerHTML = html;

    // ----- button actions
    var del = $('#delete-btn');
    if (del) del.addEventListener('click', async function () {
      if (!confirm('Delete this post permanently?')) return;
      try { await api('/api/items/' + item.id, 'DELETE'); location.href = 'dashboard.html'; }
      catch (err) { showMsg(err.message, 'error'); }
    });
    var ret = $('#returned-btn');
    if (ret) ret.addEventListener('click', async function () {
      try { await api('/api/admin/items/' + item.id + '/returned', 'POST'); load(); }
      catch (err) { showMsg(err.message, 'error'); }
    });
    var form = $('#claim-form');
    if (form) form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await api('/api/items/' + item.id + '/claims', 'POST', { answer: $('#answer').value });
        await load();
        showMsg('Claim submitted. An admin will review it shortly.', 'success');
      } catch (err) { showMsg(err.message, 'error'); }
    });
  }

  load();
})();
