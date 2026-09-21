(()=>{
  const labels={zh:{home:'首页',tools:'AI 工具',history:'历史',projects:'项目',account:'账户'},en:{home:'Home',tools:'AI Tools',history:'History',projects:'Projects',account:'Account'}};
  const language=()=>document.documentElement.lang==='zh-CN'?'zh':'en';
  const setNavigation=()=>{const onAccount=/account(?:\.html)?$/.test(location.pathname),view=new URLSearchParams(location.search).get('view')||'account',hash=location.hash;document.querySelectorAll('.mobile-app-nav').forEach(nav=>nav.querySelectorAll('[data-mobile-destination]').forEach(link=>{const destination=link.dataset.mobileDestination;link.textContent=labels[language()][destination];const active=onAccount?(destination===view||(destination==='account'&&view==='account')):(destination==='tools'?hash==='#discover':destination==='home'&&hash!=='#discover');link.classList.toggle('active',active);link.toggleAttribute('aria-current',active)}))};
  setNavigation();window.addEventListener('hashchange',setNavigation);new MutationObserver(setNavigation).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})();
