/* Restores a Visuals & posters draft after the existing Supabase sign-in. */
(() => {
  const key = 'ai-supermall-post-login-return';
  const params = new URLSearchParams(location.search);
  const valid = value => /^create-(?:visual|writing|presentation|video)\.html(?:\?(?:restoreDraft=1|project=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}))?$/i.test(String(value || '')) || /^sports-golf\.html(?:\?session=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$/i.test(String(value || ''));
  const requested = params.get('returnTo');
  if (valid(requested)) sessionStorage.setItem(key, requested);
  const target = () => {
    const value = sessionStorage.getItem(key);
    return valid(value) ? value : '';
  };
  const goBack = () => {
    const value = target();
    if (!value) return false;
    sessionStorage.removeItem(key);
    location.replace(value);
    return true;
  };
  const status = message => { const node = document.getElementById('accountStatus'); if (node) node.textContent = message; };
  const form = document.getElementById('loginForm');
  form?.addEventListener('submit', async event => {
    if (!target()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const response = await fetch('/api/account/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('loginEmail').value, password: document.getElementById('loginPassword').value })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Sign in failed.');
      goBack();
    } catch (error) { status(error.message); }
  }, true);
  setTimeout(async () => {
    if (!target()) return;
    try {
      const response = await fetch('/api/account/me');
      if (response.ok) goBack();
    } catch {}
  }, 0);
})();
