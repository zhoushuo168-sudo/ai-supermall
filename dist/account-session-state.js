/* The account screen stays in the same document when a user signs out and
   then signs in again. Reset only the old button UI when the member view is
   shown again; never interrupt a live sign-out request. */
(() => {
  const sync = () => {
    const member = document.getElementById('memberArea');
    const button = document.getElementById('logoutButton');
    if (!member || member.hidden || !button) return;
    const chinese = document.documentElement.lang === 'zh-CN';
    button.disabled = false;
    button.textContent = chinese ? '退出登录' : 'Sign out';
  };
  const member = document.getElementById('memberArea');
  if (!member) return;
  new MutationObserver(sync).observe(member, { attributes: true, attributeFilter: ['hidden'] });
  sync();
})();
