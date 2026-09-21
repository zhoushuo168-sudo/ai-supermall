(()=>{
  const maxLines=4;
  const resize=input=>{if(!input)return;const style=getComputedStyle(input),lineHeight=parseFloat(style.lineHeight)||22,maxHeight=lineHeight*maxLines+parseFloat(style.paddingTop||0)+parseFloat(style.paddingBottom||0);input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,maxHeight)}px`;input.style.overflowY=input.scrollHeight>maxHeight?'auto':'hidden';input.scrollTop=input.scrollHeight;};
  document.querySelectorAll('#toolSearch,#followUpInput').forEach(input=>{resize(input);input.addEventListener('input',()=>resize(input));input.addEventListener('focus',()=>requestAnimationFrame(()=>{resize(input);input.scrollTop=input.scrollHeight}));input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();input.closest('form')?.requestSubmit()}});input.closest('form')?.addEventListener('submit',()=>setTimeout(()=>resize(input),0))});
})();
