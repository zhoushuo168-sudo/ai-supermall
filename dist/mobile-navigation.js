(()=>{
  const labels={zh:{home:'首页',tools:'AI 工具',history:'历史',projects:'项目',account:'账户'},en:{home:'Home',tools:'AI Tools',history:'History',projects:'Projects',account:'Account'}};
  const language=()=>document.documentElement.lang==='zh-CN'?'zh':'en';
  const currentDestination=()=>{const params=new URLSearchParams(location.search);if(/create-(visual|writing|presentation|video)\.html$/.test(location.pathname))return 'tools';if(/account(?:\.html)?$/.test(location.pathname)){const view=params.get('view');return view==='chats'?'history':view==='projects'?'projects':'account'}if(params.has('project'))return 'projects';if(params.has('conversation'))return 'history';return location.hash==='#discover'?'tools':'home'};
  const setNavigation=()=>{const current=currentDestination();document.querySelectorAll('.mobile-app-nav').forEach(nav=>nav.querySelectorAll('[data-mobile-destination]').forEach(link=>{const destination=link.dataset.mobileDestination;link.textContent=labels[language()][destination];const active=destination===current;link.classList.toggle('active',active);link.toggleAttribute('aria-current',active)}))};
  // Non-visual workspaces share workspace.js. Load their small project-restoration
  // extension only when a specific saved project is being opened.
  if(document.body?.dataset.workspace&&document.body.dataset.workspace!=='visual'&&new URLSearchParams(location.search).has('project')){
    const css=document.createElement('link');css.rel='stylesheet';css.href='project-workspace.css?v=project-flow-2';document.head.append(css);
    const script=document.createElement('script');script.src='project-workspace.js?v=project-flow-2';document.body.append(script);
  }
  setNavigation();window.addEventListener('hashchange',setNavigation);window.addEventListener('popstate',setNavigation);new MutationObserver(setNavigation).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})();
