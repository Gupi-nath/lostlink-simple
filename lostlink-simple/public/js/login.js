(async function () {
  var user = await initPage();
  var params = new URLSearchParams(location.search);

  // Already logged in? Go to the dashboard.
  if (user) { location.href = 'dashboard.html'; return; }

  function showTab(name) {
    clearMsg();
    $('#login-form').classList.toggle('hidden', name !== 'login');
    $('#register-form').classList.toggle('hidden', name !== 'register');
    $('#tab-login').classList.toggle('active', name === 'login');
    $('#tab-register').classList.toggle('active', name === 'register');
  }
  $('#tab-login').addEventListener('click', function () { showTab('login'); });
  $('#tab-register').addEventListener('click', function () { showTab('register'); });
  if (params.get('tab') === 'register') showTab('register');

  // After login go back to the page the user wanted (only our own pages).
  function destination(role) {
    var next = params.get('next');
    if (next && /^[a-z]+\.html/.test(next)) return next;
    return role === 'admin' ? 'admin.html' : 'dashboard.html';
  }

  $('#login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    try {
      var result = await api('/api/login', 'POST', { email: $('#l-email').value, password: $('#l-password').value });
      location.href = destination(result.role);
    } catch (err) { showMsg(err.message, 'error'); }
  });

  $('#register-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    if ($('#r-password').value !== $('#r-confirm').value) return showMsg('Passwords do not match.', 'error');
    try {
      await api('/api/register', 'POST', {
        name: $('#r-name').value, email: $('#r-email').value,
        phone: $('#r-phone').value, password: $('#r-password').value,
      });
      location.href = destination('student');
    } catch (err) { showMsg(err.message, 'error'); }
  });
})();
