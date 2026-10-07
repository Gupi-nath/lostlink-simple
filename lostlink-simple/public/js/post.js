(async function () {
  var user = await initPage({ login: true });
  if (!user) return;

  var params = new URLSearchParams(location.search);
  var editId = params.get('id'); // present when editing an existing post
  var categories = await getCategories();

  $('#category').innerHTML = '<option value="">Choose…</option>' + categories.map(function (c) {
    return '<option value="' + esc(c.name) + '">' + c.icon + ' ' + esc(c.name) + '</option>';
  }).join('');
  $('#event_date').value = todayLocal();

  function currentType() { return document.querySelector('input[name="type"]:checked').value; }
  function syncType() {
    var isFound = currentType() === 'found';
    $('#verify-box').classList.toggle('hidden', !isFound);
    $('#date-hint').textContent = isFound ? '(when you found it)' : '(when you lost it)';
  }
  document.querySelectorAll('input[name="type"]').forEach(function (r) { r.addEventListener('change', syncType); });

  // Pre-select type from the home page buttons: post.html?type=found
  if (params.get('type') === 'found') document.querySelector('input[value="found"]').checked = true;
  syncType();

  // Edit mode: load the existing item into the form.
  if (editId) {
    $('#page-title').textContent = 'Edit item';
    $('#submit-btn').textContent = 'Save changes';
    try {
      var item = await api('/api/items/' + encodeURIComponent(editId));
      if (!item.canEdit) { showMsg('You can only edit your own posts.', 'error'); $('#item-form').classList.add('hidden'); return; }
      document.querySelector('input[value="' + item.type + '"]').checked = true;
      $('#title').value = item.title;
      $('#category').value = item.category;
      $('#event_date').value = item.event_date;
      $('#location').value = item.location;
      $('#description').value = item.description || '';
      $('#verify_question').value = item.verify_question || '';
      syncType();
    } catch (err) { showMsg(err.message, 'error'); $('#item-form').classList.add('hidden'); return; }
  }

  $('#item-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    clearMsg();
    var body = {
      type: currentType(), title: $('#title').value, category: $('#category').value,
      event_date: $('#event_date').value, location: $('#location').value,
      description: $('#description').value, verify_question: $('#verify_question').value,
    };
    try {
      if (editId) {
        await api('/api/items/' + encodeURIComponent(editId), 'PUT', body);
        location.href = 'item.html?id=' + encodeURIComponent(editId);
      } else {
        var created = await api('/api/items', 'POST', body);
        location.href = 'item.html?id=' + created.id;
      }
    } catch (err) { showMsg(err.message, 'error'); }
  });
})();
