(function(){
if(window.HMV2)return;
/* 黑木村・領主帳本 載入器 v1.0（以末日求生者載入器 v1.3 為底：對話偵測、手機選擇器、fill 送出保險、思考中判斷、劇情頁掃描皆沿用；拿掉事件區塊掃描，因為這款由帳本先判定、AI 只敘事） */
var URL_='https://yenshijeng.github.io/heimu-panel/',UIK='hm2.embed.ui.v1',OPN='[['+'HMS]]';
function lg(k){try{return localStorage.getItem(k)}catch(e){return null}}
function ls(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function djb(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return h}
var waiting=false,wStart=0,gseen=0,ROLE=new window.URL(location.href).searchParams.get('roleId'),L0=window.luna,timer=null,gone=false,open=lg(UIK)!=='min',frame=null,root=null,stat='待命',hint='',ready=false,armed=null,storySig='';
var CSS='#hm2-root{position:fixed;z-index:9999;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;background:#14110d;overflow:hidden;font:14px/1.5 sans-serif}'+
'#hm2-root:not(.hm2-min):not(.hm2-fit){padding-bottom:env(safe-area-inset-bottom,0px)}#hm2-root:not(.hm2-fit) .hm2-hd{padding-top:calc(4px + env(safe-area-inset-top,0px));padding-left:calc(10px + env(safe-area-inset-left,0px));padding-right:calc(10px + env(safe-area-inset-right,0px))}'+
'#hm2-root *{box-sizing:border-box}#hm2-root.hm2-min{width:auto;height:auto;left:auto;right:10px;background:none;border:0;top:auto;bottom:120px;overflow:visible}'+
'.hm2-hd{display:flex;align-items:center;gap:8px;padding:4px 10px;background:#1a1610;color:#d9b25c;border-bottom:1px solid #3a3222}.hm2-hd b{white-space:nowrap}.hm2-hd span{flex:1;font-size:12px;color:#9a9080;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}'+
'.hm2-x{background:#2a241a;border:1px solid #3a3222;color:#e6dfd0;border-radius:6px;min-width:40px;height:32px;padding:0 10px;font-size:14px;cursor:pointer}'+
'#hm2-root iframe{flex:1;width:100%;border:0;background:#14110d}'+
'.hm2-fab{min-width:58px;height:58px;padding:0 6px;border-radius:29px;background:#1a1610;border:2px solid #d9b25c;color:#d9b25c;font-size:22px;cursor:pointer;line-height:1;position:relative}.hm2-fab small{display:block;font-size:10px;color:#e6dfd0}'+
'.hm2-fab.hm2-spin{animation:hm2p 1.1s ease-in-out infinite}@keyframes hm2p{0%,100%{box-shadow:0 0 0 0 rgba(217,178,92,.7)}50%{box-shadow:0 0 0 10px rgba(217,178,92,0)}}.hm2-hd span.hm2-w{color:#ffd479}'+
'#hm2-root.hm2-fit{border-radius:16px;box-shadow:0 0 0 1px #3a3222}'+
'@media (max-width:700px){#hm2-root.hm2-min{right:10px;bottom:calc(90px + env(safe-area-inset-bottom,0px))}}';
function inputEl(){var a=[].slice.call(document.querySelectorAll('textarea.uni-textarea-textarea,#lunatalk-input textarea'));return a.filter(function(el){return el.offsetParent!==null||el.getClientRects().length>0})[0]||a[0]||null}
function fit(){if(!root)return;var r=null;if(open&&innerWidth>=900){try{var ta=inputEl(),m=document.querySelector('[data-lt="message"],.message-item');if(ta&&m){var a=ta;while(a&&!a.contains(m))a=a.parentElement;if(a&&a!==document.body&&a!==document.documentElement){var q=a.getBoundingClientRect();if(q.width>=480&&q.height>=300&&(q.left>=40||q.width<=innerWidth*0.92))r=q}}}catch(e){}}
var s=root.style;if(r){if(root.className.indexOf('hm2-fit')<0)root.className+=' hm2-fit';s.left=Math.round(r.left)+'px';s.top=Math.round(r.top)+'px';s.width=Math.round(r.width)+'px';s.height=Math.round(r.height)+'px'}else{s.left=s.top=s.width=s.height=''}}
function ui(){if(!root)return;root.className=open?'':'hm2-min';
var hd=root.querySelector('.hm2-hd'),fab=root.querySelector('.hm2-fab');
if(hd)hd.style.display=open?'flex':'none';
if(frame)frame.style.display=open?'block':'none';
try{fit()}catch(e){}
var sec=waiting?Math.floor((Date.now()-wStart)/1000):0;
if(fab){fab.style.display=open?'none':'block';fab.className='hm2-fab'+(waiting?' hm2-spin':'');fab.innerHTML=waiting?'⏳<small>'+sec+'s</small>':'📒<small>'+(hint||'帳本')+'</small>'}
var s=root.querySelector('.hm2-st');if(s){s.textContent=waiting?'⏳ '+(sec<20?'AI 回覆中… ':sec<60?'回應較慢，仍在等待… ':'等待很久了，可能卡住（可重新整理確認）… ')+sec+' 秒':stat;s.className='hm2-st'+(waiting?' hm2-w':'')}}
function wOn(){if(waiting)return;waiting=true;wStart=Date.now();ui();send({t:'busy',on:true})}
function wOff(){if(!waiting)return;waiting=false;ui();send({t:'busy',on:false})}
function setOpen(v){open=v;ls(UIK,v?'open':'min');ui()}
function send(m){try{frame.contentWindow.postMessage(Object.assign({hm:1},m),'*')}catch(e){}}
function fill(text,go,keep){var ta=inputEl();
if(!ta){try{navigator.clipboard.writeText(text)}catch(e){}return '找不到聊天輸入框，已改為複製到剪貼簿，請自行貼上'}
Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(ta,text);
ta.dispatchEvent(new Event('input',{bubbles:true}));
if(go){var clk=function(){var b=document.querySelector('[data-lt="send"]');if(b)b.click()};setTimeout(function(){clk();setTimeout(function(){try{if(ta.isConnected&&ta.value===text){clk();setTimeout(function(){try{if(ta.isConnected&&ta.value===text)send({t:'fillres',s:'沒有自動送出，內容已在聊天輸入框，請按送出'})}catch(e){}},1200)}}catch(e){}},1200)},150);wOn();if(!keep)setOpen(false);return keep?'已送出':'已送出，回到聊天'}
if(!keep)setOpen(false);return '已填入輸入框，請按送出'}
function blkTxt(el){var c=el.cloneNode(true);[].forEach.call(c.querySelectorAll('br'),function(b){b.replaceWith('\n')});return (c.textContent||'').replace(/\n{3,}/g,'\n\n').trim()}
function isDlg(t){return /^[「『][^」』]*[」』](?![\s\S])/.test(t)||/^[^\s：:「」]{1,10}[：:]\s*[「『]/.test(t)||/^【[^】\n]{1,8}】\s*[「『]/.test(t)}
function parseMsg(item){var rt=item.querySelector('.message-bubble')||item,out=[];
var els=rt.querySelectorAll('p,hc-btn,hc-collapse,.hc-hr,li');
[].forEach.call(els,function(el){var tg=el.tagName;
if(el.closest('pre,hc-form,.action-buttons,.message-actions,.thinking-panel,#hm2-root'))return;
if(tg!=='HC-COLLAPSE'&&el.closest('hc-collapse'))return;
if(tg!=='HC-BTN'&&el.closest('hc-btn'))return;
if(tg==='HC-BTN'){var t=blkTxt(el);if(t)out.push({k:'btn',s:(el.getAttribute('send')||t),t:t});return}
if(tg==='HC-COLLAPSE'){out.push({k:'col',h:el.getAttribute('title')||'',t:blkTxt(el)});return}
if(el.classList.contains('hc-hr')){out.push({k:'hr'});return}
if(el.classList.contains('hc-h1'))return;
var t2=blkTxt(el);if(!t2)return;
var c=el.classList,k=c.contains('hc-st')?'st':c.contains('hc-d')?'d':c.contains('hc-p')?'p':isDlg(t2)?'d':'p';out.push({k:k,t:t2})});
if(!out.length){var tx=(rt.innerText||'').trim();if(tx)tx.split(/\n+/).forEach(function(l){l=l.trim();if(l)out.push({k:isDlg(l)?'d':'p',t:l})})}
return out}
function storyScan(){if(!ready)return;
var items=[].slice.call(document.querySelectorAll('.message-item.is-ai.ai-message,[data-lt="message"][data-lt-role="ai"]')).filter(function(m){return !m.classList.contains('is-system-only')&&!m.classList.contains('summary-message')&&!root.contains(m)});
var m=items[items.length-1];if(!m)return;
var bl=parseMsg(m);if(!bl.length)return;
var sig=djb(JSON.stringify(bl))+':'+bl.length+':'+items.length;
if(sig!==storySig){storySig=sig;send({t:'story',id:sig,blocks:bl,busy:waiting})}}
function cvWalkV(vn,d,o){if(!vn||d>400||typeof vn!=='object')return;if(vn.component){cvWalkI(vn.component,d+1,o);return}if(vn.suspense&&vn.suspense.activeBranch)cvWalkV(vn.suspense.activeBranch,d+1,o);if(Array.isArray(vn.children))for(var i=0;i<vn.children.length;i++)cvWalkV(vn.children[i],d+1,o)}
function cvWalkI(ins,d,o){if(!ins||d>400)return;var n=ins.type&&(ins.type.name||ins.type.__name);if(n==='rw-chatDetail'&&ins.props&&ins.props.conversationId)o.push(ins);cvWalkV(ins.subTree,d+1,o)}
function convVue(){try{var a=document.querySelector('#app'),r=a&&a.__vue_app__&&a.__vue_app__._instance;if(!r)return '';var o=[];cvWalkI(r,0,o);if(!o.length)return '';var v=o.filter(function(x){var el=x.subTree&&x.subTree.el;return el&&el.isConnected&&(!el.getClientRects||el.nodeType!==1||el.getClientRects().length>0)});return String((v[v.length-1]||o[o.length-1]).props.conversationId)}catch(e){return ''}}
var cvLast=null,cvPrev='',cvN=0;function convWatch(force){if(!ready)return;var ai=document.querySelectorAll('.message-item.is-ai,[data-lt="message"][data-lt-role="ai"]').length;if(!ai)return;var id=convVue();if(!id)return;var u=document.querySelectorAll('.message-item.is-user,[data-lt="message"][data-lt-role="user"]').length,k=id+'|'+(u>0?1:0);if(k!==cvPrev){cvPrev=k;cvN=0}cvN++;if(cvN<2)return;if(!force&&k===cvLast)return;cvLast=k;send({t:'conv',id:id,u:u})}
function onMsg(e){var d=e.data;if(!d||d.hm!==1||!frame||e.source!==frame.contentWindow)return;
if(d.t==='hello'){ready=true;send({t:'stat',s:stat});cvLast=null;storySig='';setTimeout(storyScan,300);setTimeout(function(){convWatch(true)},1200)}
else if(d.t==='min')setOpen(false);
else if(d.t==='hint'){hint=d.s||'';ui()}
else if(d.t==='fill')send({t:'fillres',s:fill(d.text,d.send,d.keep)});
else if(d.t==='arm'){armed=d.off?null:{obj:d.obj,tail:d.tail||''}}}
window.addEventListener('message',onMsg);window.addEventListener('resize',function(){try{fit()}catch(e){}});
function dispose(){if(gone)return;gone=true;clearInterval(timer);window.removeEventListener('message',onMsg);armed=null;try{if(L0&&L0.beforeSend)L0.beforeSend(null)}catch(e){}try{root&&root.remove()}catch(e){}if(window.HMV2&&window.HMV2.dispose===dispose)delete window.HMV2}
var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
root=document.createElement('div');root.id='hm2-root';
root.innerHTML='<div class="hm2-hd"><b>📒 領主帳本</b><span class="hm2-st"></span><button class="hm2-x" data-a="min">回聊天</button></div><button class="hm2-fab" data-a="open"></button>';
frame=document.createElement('iframe');frame.setAttribute('title','heimu-panel');frame.src=URL_+(URL_.indexOf('?')<0?'?':'&')+'_='+Date.now();
root.insertBefore(frame,root.querySelector('.hm2-fab'));
root.addEventListener('click',function(e){var a=e.target.closest('[data-a]');if(!a)return;setOpen(a.dataset.a==='open')});
document.body.appendChild(root);ui();
window.HMV2={ver:'1.0',dispose:dispose};
try{if(window.luna){
if(typeof luna.beforeSend==='function')luna.beforeSend(function(t){try{
if(typeof t!=='string'||!t.trim()||t.indexOf(OPN)>=0)return t;
if(!armed)return t;
var out=t+armed.obj+armed.tail;send({t:'consumed'});wOn();return out}catch(e){return t}});
if(typeof luna.on==='function')luna.on('dispose',dispose);
if(typeof luna.on==='function')try{luna.on('conversation:switch',function(){cvLast=null;setTimeout(function(){convWatch(true)},600)})}catch(e){}
if(typeof luna.on==='function')luna.on('message:done',function(){wOff();setTimeout(function(){try{storyScan()}catch(e){}},300)})}}catch(e){}
function thinking(){try{var L=document.querySelectorAll('uni-text span');for(var i=L.length-1;i>=0;i--){if((L[i].textContent||'').trim()==='思考'+'中')return true}}catch(e){}return false}
timer=setInterval(function(){try{fit();if(!root.isConnected){dispose();return}var r=new window.URL(location.href).searchParams.get('roleId');if(r&&ROLE&&r!==ROLE){dispose();return}var g=document.body.innerText.indexOf('正在'+'回覆')>=0||thinking();if(g){gseen=Date.now();wOn()}else if(waiting&&Date.now()-gseen>2500&&Date.now()-wStart>3000)wOff();if(waiting)ui();if(!document.hidden){storyScan();convWatch()}}catch(e){}},1000);
})();
