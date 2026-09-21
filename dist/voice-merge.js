(()=>{
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition)return;
  const textLanguage=()=>document.documentElement.lang==='zh-CN'?'zh':'en';
  const insertTranscript=(input,transcript,language)=>{
    const spoken=String(transcript||'').trim();if(!spoken)return;
    const value=input.value||'',start=Number.isInteger(input.selectionStart)?input.selectionStart:value.length,end=Number.isInteger(input.selectionEnd)?input.selectionEnd:start,before=value.slice(0,start),after=value.slice(end);
    const useSpace=language==='en'&&before&&!/[\s(\[{“"']$/.test(before)&&!/^[,.;:!?)}\]”"']/.test(spoken),inserted=`${useSpace?' ':''}${spoken}`;
    input.value=`${before}${inserted}${after}`;const cursor=(before+inserted).length;input.focus({preventScroll:true});if(typeof input.setSelectionRange==='function')input.setSelectionRange(cursor,cursor);input.dispatchEvent(new Event('input',{bubbles:true}));
  };
  const finalText=event=>{const parts=[];for(let i=event.resultIndex;i<event.results.length;i++)if(event.results[i].isFinal)parts.push(event.results[i][0].transcript);return parts.join(' ').trim()};
  const replaceMic=(selector,inputSelector,statusSelector,languageFor)=>{const old=document.querySelector(selector),input=document.querySelector(inputSelector),status=document.querySelector(statusSelector);if(!old||!input)return;const mic=old.cloneNode(true);old.replaceWith(mic);const recognition=new Recognition();recognition.interimResults=false;recognition.maxAlternatives=1;const setState=active=>{mic.classList.toggle('listening',active);mic.setAttribute('aria-pressed',String(active));if(status){status.hidden=!active;status.textContent=active?(languageFor()==='zh'?'正在聆听…':'Listening…'):''}};recognition.onstart=()=>setState(true);recognition.onend=()=>setState(false);recognition.onerror=()=>setState(false);recognition.onresult=event=>insertTranscript(input,finalText(event),languageFor());mic.onclick=()=>{recognition.lang=languageFor()==='zh'?'zh-CN':'en-US';input.focus({preventScroll:true});recognition.start()}};
  replaceMic('#voiceButton','#toolSearch','#mainVoiceStatus',textLanguage);
  replaceMic('#followUpVoice','#followUpInput','#followVoiceStatus',()=>/[一-鿿]/.test(document.querySelector('#followUpLabel')?.textContent||'')?'zh':'en');
})();
