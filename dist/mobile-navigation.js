(()=>{
  const labels={zh:{home:'首页',tools:'AI 工具',history:'历史',projects:'项目',account:'账户'},en:{home:'Home',tools:'AI Tools',history:'History',projects:'Projects',account:'Account'}};
  const language=()=>document.documentElement.lang==='zh-CN'?'zh':'en';
  const currentDestination=()=>{const params=new URLSearchParams(location.search);if(/account(?:\.html)?$/.test(location.pathname)){const view=params.get('view');return view==='chats'?'history':view==='projects'?'projects':'account'}if(params.has('project'))return 'projects';if(params.has('conversation'))return 'history';return location.hash==='#discover'?'tools':'home'};
  const setNavigation=()=>{const current=currentDestination();document.querySelectorAll('.mobile-app-nav').forEach(nav=>nav.querySelectorAll('[data-mobile-destination]').forEach(link=>{const destination=link.dataset.mobileDestination;link.textContent=labels[language()][destination];const active=destination===current;link.classList.toggle('active',active);link.toggleAttribute('aria-current',active)}))};
  setNavigation();window.addEventListener('hashchange',setNavigation);window.addEventListener('popstate',setNavigation);new MutationObserver(setNavigation).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})();
