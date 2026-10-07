(async function () {
  await initPage();
  var categories = await getCategories();

  // fill the category dropdown
  $('#category').innerHTML = '<option value="">All</option>' + categories.map(function (c) {
    return '<option value="' + esc(c.name) + '">' + c.icon + ' ' + esc(c.name) + '</option>';
  }).join('');

  // hero statistics
  var stats = await api('/api/public-stats');
  $('#st-total').textContent = stats.total;
  $('#st-open').textContent = stats.open;
  $('#st-returned').textContent = stats.returned;

  async function search() {
    var params = new URLSearchParams();
    ['q', 'type', 'category', 'status'].forEach(function (id) {
      var value = $('#' + id).value.trim();
      if (value) params.set(id, value);
    });
    try {
      var items = await api('/api/items?' + params.toString());
      $('#count').textContent = items.length + ' item(s) found';
      $('#results').innerHTML = items.length
        ? items.map(function (item) { return itemCard(item, categories); }).join('')
        : '<div class="empty" style="grid-column: 1 / -1">Nothing matches your search. Try fewer filters or <a href="post.html">report the item yourself</a>.</div>';
    } catch (err) {
      $('#results').innerHTML = '<div class="alert alert-error">' + esc(err.message) + '</div>';
    }
  }

  $('#filter-form').addEventListener('submit', function (e) { e.preventDefault(); search(); });
  search();
})();
