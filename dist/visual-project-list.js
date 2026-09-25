/* Adds the visual workflow status to the existing project list without
   changing the project or account APIs. */
(() => {
  const translate = status => document.documentElement.lang === 'en' ? (status === 'completed' ? 'Completed' : 'Editing') : (status === 'completed' ? '已完成' : '编辑中');
  const decorate = async () => {
    const list = document.getElementById('projectList');
    if (!list || list.dataset.visualStatusLoaded) return;
    try {
      const response = await fetch('/api/member/projects');
      if (!response.ok) return;
      const projects = await response.json();
      const visual = new Map(projects.map(project => {
        const state = (project.conversation || []).find(item => item?.type === 'workspace_state' && item.workspace === 'visual');
        return [project.id, state?.status];
      }).filter(([, status]) => status));
      list.querySelectorAll('.project-item').forEach(item => {
        const link = item.querySelector('a[href*="create-visual.html?project="]');
        const id = new URL(link?.href || '').searchParams.get('project');
        const status = visual.get(id);
        if (!status || item.querySelector('.visual-project-list-status')) return;
        const badge = document.createElement('small');
        badge.className = 'visual-project-list-status';
        badge.textContent = translate(status);
        item.querySelector('strong')?.after(badge);
      });
      list.dataset.visualStatusLoaded = '1';
    } catch {}
  };
  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
  decorate();
})();
