(async function () {
  var me = await initPage({ admin: true });
  if (!me) return;

  // Draw a simple horizontal bar chart with plain HTML + CSS.
  function bars(rows) {
    if (!rows.length) return '<p class="muted small">No data yet.</p>';
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    return rows.map(function (r) {
      return '<div class="bar-row"><span>' + esc(r.label) + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round((r.value / max) * 100) + '%"></div></div>' +
        '<b>' + r.value + '</b></div>';
    }).join('');
  }

  async function loadStats() {
    var s = await api('/api/admin/stats');
    var boxes = [['Users', s.users], ['Reports', s.items], ['Open', s.open], ['Pending claims', s.pendingClaims], ['Recovery rate', s.recoveryRate + '%']];
    $('#stat-grid').innerHTML = boxes.map(function (b) { return '<div class="stat-box"><b>' + b[1] + '</b><span>' + b[0] + '</span></div>'; }).join('');
    $('#chart-category').innerHTML = bars(s.byCategory);
    $('#chart-status').innerHTML = bars(s.byStatus);
  }

  async function loadClaims() {
    var data = await api('/api/admin/claims');
    $('#pending-count').textContent = data.pending.length;

    $('#pending').innerHTML = data.pending.length ? data.pending.map(function (c) {
      return '<div class="card card-pad">' +
        '<div class="row-between"><a href="item.html?id=' + c.item_id + '"><b>' + esc(c.item_title) + '</b></a>' + badge(c.item_type) + '</div>' +
        '<dl><dt>Claimant</dt><dd>' + esc(c.claimant) + ' · ' + esc(c.claimant_email) + (c.claimant_phone ? ' · ' + esc(c.claimant_phone) : '') + '</dd>' +
        '<dt>Question</dt><dd>' + esc(c.item_type === 'found' ? (c.verify_question || '(none)') : 'Where did you find it?') + '</dd>' +
        '<dt>Answer given</dt><dd><b>' + esc(c.answer) + '</b></dd></dl>' +
        '<div class="inline-form"><input id="note-' + c.id + '" placeholder="Note (optional)" maxlength="300"></div>' +
        '<div class="inline-form"><button class="btn btn-success btn-small" data-approve="' + c.id + '">✓ Approve</button>' +
        '<button class="btn btn-danger btn-small" data-reject="' + c.id + '">✕ Reject</button></div></div>';
    }).join('') : '<div class="empty" style="grid-column:1/-1">No pending claims. Nice and quiet.</div>';

    $('#handover').innerHTML = data.handover.length ? data.handover.map(function (c) {
      return '<tr><td><a href="item.html?id=' + c.item_id + '">' + esc(c.item_title) + '</a></td>' +
        '<td>' + esc(c.claimant) + '<br><span class="small muted">' + esc(c.claimant_email) + '</span></td>' +
        '<td>' + esc(String(c.reviewed_at || '').slice(0, 10)) + '</td>' +
        '<td><button class="btn btn-success btn-small" data-returned="' + c.item_id + '">Mark returned</button></td></tr>';
    }).join('') : '<tr><td colspan="4" class="muted">Nothing waiting for hand-over.</td></tr>';
  }

  async function loadUsers() {
    var users = await api('/api/admin/users');
    $('#users').innerHTML = users.map(function (u) {
      var self = u.id === me.id;
      return '<tr><td>' + esc(u.name) + (self ? ' <span class="badge">you</span>' : '') + '</td><td>' + esc(u.email) + '</td>' +
        '<td>' + u.item_count + '</td><td>' + esc(String(u.created_at).slice(0, 10)) + '</td>' +
        '<td>' + (self ? badge(u.role, 'open') :
          '<select data-role="' + u.id + '"><option value="student"' + (u.role === 'student' ? ' selected' : '') + '>student</option>' +
          '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>admin</option></select>') + '</td>' +
        '<td>' + (self ? '' : '<button class="btn btn-danger btn-small" data-deluser="' + u.id + '" data-name="' + esc(u.name) + '">Delete</button>') + '</td></tr>';
    }).join('');
  }

  async function refresh() { await Promise.all([loadStats(), loadClaims(), loadUsers()]); }

  // Buttons are created dynamically, so one click listener on the document handles all of them.
  document.addEventListener('click', async function (e) {
    var t = e.target;
    var approve = t.getAttribute('data-approve');
    var reject = t.getAttribute('data-reject');
    var returned = t.getAttribute('data-returned');
    var delUser = t.getAttribute('data-deluser');
    try {
      if (approve) {
        await api('/api/admin/claims/' + approve + '/approve', 'POST', { note: $('#note-' + approve).value });
        showMsg('Claim approved. Hand the item over, then mark it returned.', 'success'); await refresh();
      } else if (reject) {
        await api('/api/admin/claims/' + reject + '/reject', 'POST', { note: $('#note-' + reject).value });
        showMsg('Claim rejected.', 'success'); await refresh();
      } else if (returned) {
        await api('/api/admin/items/' + returned + '/returned', 'POST');
        showMsg('Item marked as returned.', 'success'); await refresh();
      } else if (delUser && confirm('Delete ' + t.getAttribute('data-name') + ' and all of their posts and claims?')) {
        await api('/api/admin/users/' + delUser, 'DELETE');
        showMsg('User deleted.', 'success'); await refresh();
      }
    } catch (err) { showMsg(err.message, 'error'); }
  });

  document.addEventListener('change', async function (e) {
    var id = e.target.getAttribute('data-role');
    if (!id) return;
    try { await api('/api/admin/users/' + id + '/role', 'PUT', { role: e.target.value }); showMsg('Role updated.', 'success'); }
    catch (err) { showMsg(err.message, 'error'); }
  });

  refresh();
})();
