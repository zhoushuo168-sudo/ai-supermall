(()=>{
  const input=document.querySelector('#toolSearch');if(!input)return;
  const keepLatestVisible=()=>{
    requestAnimationFrame(()=>{input.scrollTop=input.scrollHeight;requestAnimationFrame(()=>{input.scrollTop=input.scrollHeight})});
    setTimeout(()=>{input.scrollTop=input.scrollHeight},80);
  };
  input.addEventListener('input',keepLatestVisible);
  input.addEventListener('focus',keepLatestVisible);
  input.addEventListener('scroll',()=>{if(input.scrollTop<0)input.scrollTop=0},{passive:true});
})();
