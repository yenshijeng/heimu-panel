/* 黑木村 領主帳本 介面 ui.js */
(function () {
'use strict';
var C = window.HMCore, UIVER = '2.2.0';
var KS = LTStore.create('heimu');
var EMB = window.parent !== window;
var DEBUG = /[?&]debug=1/.test(location.search);
var early = []; function earlyMsg(e) { early.push(e); } window.addEventListener('message', earlyMsg);

var S = null, story = [], tab = 'village', busy = false, toastT = 0, modal = null, storeErr = '', draft = '', scrollStory = true, lastRep = null, buyN = 1, talkWho = 'lilith', nameIn = '', clsIn = 'warrior';
var app = document.getElementById('app');
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function J(k) { var v = KS.get(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
function R(x) { return Math.round(x); }

/* ---------- 存檔 ---------- */
function save() { if (S) KS.set('save', JSON.stringify(S)); KS.set('story', JSON.stringify(story.slice(-12))); if (lastRep) KS.set('rep', JSON.stringify(lastRep)); }
function pushUndo() { var u = J('undo') || []; u.push(JSON.stringify(S)); KS.set('undo', JSON.stringify(u.slice(-5))); }
function undo() { var u = J('undo') || []; if (!u.length) { toast('沒有可以復原的步驟'); return; } S = JSON.parse(u.pop()); KS.set('undo', JSON.stringify(u)); save(); toast('已復原上一步（已送給 AI 的訊息不會收回，必要時請在聊天裡重說）'); render(); arm(); }
KS.onError = function (e) { storeErr = '存檔寫入失敗（' + e.msg + '），請到「紀錄」頁匯出備份'; render(); };

/* ---------- 與載入器溝通 ---------- */
function post(m) { if (!EMB) return; try { window.parent.postMessage(Object.assign({ hm: 1 }, m), '*'); } catch (e) {} }
function arm() { if (S) post({ t: 'arm', obj: '\n' + C.stateBlock(S, { digest: S.pending }), tail: '' }); else post({ t: 'arm', off: true }); post({ t: 'hint', s: S ? '第' + S.day + '天' : '開始' }); }
function sendToAI(text, shown) {
  storyPush({ k: 'me', t: shown || text.split('\n')[0] });
  if (EMB) { post({ t: 'fill', text: text, send: true, keep: true }); busy = true; }
  else storyPush({ k: 'sys', t: '（獨立開啟：這則訊息沒有送給 AI）' });
  if (window.innerWidth < 760) tab = 'story';
  save(); render();
}
function onHost(e) {
  var d = e.data; if (!d || d.hm !== 1) return;
  if (d.t === 'busy') { busy = !!d.on; render(); }
  else if (d.t === 'fillres') { if (d.s && d.s.indexOf('已送出') < 0) toast(d.s); }
  else if (d.t === 'consumed') { if (S) { S.pending = []; save(); } }
  else if (d.t === 'conv') onConv(d.id, d.u);
  else if (d.t === 'story') onStory(d);
  else if (DEBUG && d.t === 'tap') { var el = document.querySelectorAll(d.sel)[d.i || 0]; if (el) el.click(); post({ t: 'dbg', ok: !!el, sel: d.sel }); }
  else if (DEBUG && d.t === 'peek') post({ t: 'dbg', text: app.innerText.slice(0, d.n || 4000), state: S });
}
function onConv(id, u) {
  if (!S || !id) return;
  if (!S.convId) { S.convId = id; save(); return; }
  if (S.convId === id) return;
  if (u > 0) { S.convId = id; save(); return; }
  showModal('這是一段新的對話', '<p>帳本裡有第 ' + S.day + ' 天的進度。要帶著進度繼續，還是重新開始？</p>', [
    ['接續進度', function () { S.convId = id; save(); closeModal(); sendToAI('【接續進度】我翻開領主帳本，接著之前的日子繼續。\n' + C.stateBlock(S, { digest: S.log.slice(-6) }), '【接續進度】'); }],
    ['重新開始', function () { KS.set('bak.' + Date.now(), JSON.stringify(S)); S = null; story = []; KS.del('save'); KS.del('undo'); closeModal(); render(); arm(); }]
  ]);
}

/* ---------- 劇情 ---------- */
function storyPush(x) { story.push(x); if (story.length > 12) story = story.slice(-12); scrollStory = true; }
function blocksText(bl) { return bl.map(function (b) { return (b.k === 'btn' ? b.s : b.t || '') + '\u0001'; }).join(''); }
function onStory(d) {
  var bl = (d.blocks || []).filter(function (b) { var t = (b.t || '').trim(); if (b.k === 'btn') return true;
    return !(/^(正在回覆|思考中|思考過程)[.…]*/.test(t) || /^\d+\s*chars$/i.test(t) || t.indexOf('已附領主帳本') >= 0 || (t.length <= 2 && !/[\u4e00-\u9fffA-Za-z0-9]/.test(t)) || b.k === 'col'); });
  bl.forEach(function (b) { if (b.k === 'p' && /^【第\s*\d+\s*天[｜|]/.test(b.t)) b.k = 'st'; });
  if (!bl.length) return;
  var last = story[story.length - 1];
  /* 兩則 AI 回覆之間一定隔著玩家的行動；所以最後一筆已經是 AI 時，新的內容就是同一則（串流中或重新生成），原地更新 */
  if (last && last.k === 'ai') { if (blocksText(last.blocks) !== blocksText(bl)) { last.blocks = bl; scrollStory = true; save(); } if (!d.busy) busy = false; render(); return; }
  if (!story.some(function (x) { return x.k === 'me'; })) return; /* 還沒有任何行動：聊天頁上的是開場白或別局的舊回覆，不收 */
  var prev = story.filter(function (x) { return x.k === 'ai'; }).pop();
  if (prev && blocksText(prev.blocks) === blocksText(bl)) return; /* 重新整理時載入器重送的舊回覆 */
  storyPush({ k: 'ai', blocks: bl }); if (!d.busy) busy = false; save(); render();
}

/* ---------- 操作 ---------- */
function doAct(a) {
  if (busy) { toast('AI 還在回覆，等一下'); return false; }
  var snap = JSON.stringify(S), pre = S.pending.slice(), r = C.act(S, a);
  if (r.err) { toast(r.err); return false; }
  var u = J('undo') || []; u.push(snap); KS.set('undo', JSON.stringify(u.slice(-5)));
  if (r.silent) { tab = 'village'; save(); render(); arm(); return true; }
  S.pending = [];
  sendToAI(r.text + '\n' + C.stateBlock(S, { result: r.result, digest: pre }), r.text);
  storyPush({ k: 'res', t: r.result }); save(); render(); arm(); return true;
}
function finishWith(r) { /* 出獵回村、巡視決定：結果已入帳，交給 AI 演出 */
  if (r.err) { toast(r.err); return; }
  var pre = S.pending.slice(0, -1); S.pending = [];
  sendToAI(r.text + '\n' + C.stateBlock(S, { result: r.result, digest: pre }), r.text);
  storyPush({ k: 'res', t: r.result.split('過程：')[0] }); save(); render(); arm();
}
function bar(v, max, cls) { return '<span class="bar ' + cls + '"><i style="width:' + Math.max(0, Math.min(100, Math.round(v / max * 100))) + '%"></i></span>'; }
function pageHunt() {
  var H = S.hunt, e = H.e, h = '<div class="card hunt"><h3>' + (H.zone === 'mid' ? '森林中層' : '森林邊緣') + '・第 ' + Math.min(H.idx + 1, H.n) + '/' + H.n + ' 場</h3>';
  h += '<div class="hrow"><span class="jn">你</span>' + bar(H.hp, C.HUNT.hp, 'hp') + '<b>' + H.hp + '/' + C.HUNT.hp + '</b><span class="muted">氣力 ' + H.en + '/' + C.enMax(S) + (H.shield ? '｜護盾 ' + H.shield : '') + '</span></div>';
  if (e) h += '<div class="hrow"><span class="jn">' + esc(e.n) + '</span>' + bar(e.hp, e.max, 'ehp') + '<b>' + Math.max(0, e.hp) + '/' + e.max + '</b><span class="warn">' + C.intentText(e) + '</span></div>';
  h += '<div class="hlog">' + H.log.slice(-5).map(esc).join('<br>') + '</div>';
  if (H.done) h += '<p>這趟的收穫：糧食 ' + H.loot.food + '、毛皮 ' + H.loot.hide + '、魔獸素材 ' + H.loot.mats + (H.done.hurt === 2 ? '。<span class="warn">你受了重傷。</span>' : H.done.hurt === 1 ? '。<span class="warn">你受了輕傷。</span>' : '') + '</p><div class="row">' + btn('hback', '回村', busy, 'pri') + '</div>';
  else {
    h += '<div class="acts">' + btn('hact', '攻擊', false, '', ' data-k="attack"') + btn('hact', '防禦<small>受傷減半、氣力 +1</small>', false, '', ' data-k="defend"');
    C.SKILL[S.lord.cls].forEach(function (k) { h += btn('hact', k.n + '<small>氣力 ' + k.en + '｜' + k.d + '</small>', H.en < k.en, '', ' data-k="' + k.id + '"'); });
    h += btn('hact', '撤退<small>收穫減半</small>', false, 'warnb', ' data-k="retreat"') + '</div><p class="muted">目前收穫：糧食 ' + H.loot.food + '、毛皮 ' + H.loot.hide + '、素材 ' + H.loot.mats + '。狩獵過程不會送給 AI，回村後才演出。</p>';
  }
  return h + '</div>';
}
function pageCard() {
  var cd = C.cardById(S.card), h = '<div class="card"><h3>巡視・' + esc(cd.place) + '</h3><p>' + esc(cd.t) + '</p>';
  cd.o.forEach(function (o, i) { var e = C.cardOptionCheck(S, o); h += '<div class="bld"><div><b>' + esc(o.n) + '</b><br><span class="muted">' + esc(o.r) + '</span>' + (e ? '<br><span class="warn">' + e + '</span>' : '') + '</div>' + btn('card', '就這麼辦', !!e || busy, '', ' data-i="' + i + '"') + '</div>'; });
  return h + '</div>';
}
function endDay() {
  if (busy) { toast('AI 還在回覆，等一下'); return; }
  function go() { closeModal(); pushUndo(); var wasTut = S.tut >= 0; if (wasTut) S.tut = -1; var rep = C.endDay(S); if (wasTut) storyPush({ k: 'sys', t: '教學結束。魔獸第 7 天第一次來襲，晨報會提前預告；升格條件列在「村莊」頁。' }); lastRep = rep; sendToAI(C.dayEndMessage(S, rep), '【日結】第 ' + rep.day + ' 天結束'); storyPush({ k: 'res', t: rep.lines.concat(rep.morning).join('\n') }); tab = window.innerWidth < 760 ? 'story' : 'village'; save(); render(); arm(); }
  var warn = [];
  if (S.ap > 0) warn.push('還有 ' + S.ap + ' 個行動點沒用');
  if (C.idle(S) > 0) warn.push('有 ' + C.idle(S) + ' 人沒派工');
  if (S.q.length && S.assign.build < C.buildNeed(S)) warn.push('工地人手不足，工程會變慢或停工');
  if (C.raidIndex(S.day) >= 0 && !S.braced) warn.push('今晚有襲擊，你還沒備戰');
  if (warn.length) showModal('要結束這一天嗎？', '<ul><li>' + warn.map(esc).join('</li><li>') + '</li></ul>', [['結束這一天', go], ['再想想', closeModal]]); else go();
}
function free(fn) { pushUndo(); var r = fn(); if (r && r.err) { toast(r.err); var u = J('undo') || []; u.pop(); KS.set('undo', JSON.stringify(u)); } save(); render(); arm(); }

/* ---------- 畫面 ---------- */
function toast(t) { var el = document.getElementById('toast'); el.textContent = t; el.className = 'on'; clearTimeout(toastT); toastT = setTimeout(function () { el.className = ''; }, 3200); }
function showModal(title, body, buttons) { modal = { title: title, body: body, buttons: buttons }; render(); }
function closeModal() { modal = null; render(); }
function btn(a, label, dis, cls, extra) { return '<button data-a="' + a + '"' + (extra || '') + (dis ? ' disabled' : '') + ' class="' + (cls || '') + '">' + label + '</button>'; }

function viewNew() {
  return '<div class="card"><h2>黑木村・領主帳本</h2><p class="muted">你是新上任的領主。每天決定誰去做什麼，在魔獸潮之前把村子撐成聚落。</p>' +
    '<label>領主的名字<input id="nm" maxlength="12" value="' + esc(nameIn) + '" placeholder="領主"></label>' +
    '<div class="cls">' + Object.keys(C.CLASSES).map(function (k) { var c = C.CLASSES[k]; return '<button data-a="cls" data-k="' + k + '" class="' + (clsIn === k ? 'sel' : '') + '"><b>' + c.n + '</b><small>' + c.d + '</small></button>'; }).join('') + '</div>' +
    btn('start', '開始第一天', false, 'pri') + '</div>';
}
var TUT = ['【教學 1/5】先看「派工」頁：人手不夠分，這是每天最重要的決定。派工不花行動點。',
  '【教學 2/5】到「建造」頁開工蓋一座房屋。住房滿了就不會有新的人來。',
  '【教學 3/5】回「村莊」頁，選一位領班「找他談談」（花 1 行動點）。只有在場的人會開口。',
  '【教學 4/5】按「親自出獵・邊緣」。敵人會預告下一步：獵物會逃，要在回合內打倒；看到「蓄力」就防禦。',
  '【教學 5/5】剩下的行動點可以巡視村子或到「建造」頁監工。都做完就按「結束這一天」。'];
function tutBar() { return S.tut >= 0 && TUT[S.tut] ? '<div class="tut"><span>' + TUT[S.tut] + '</span><button data-a="tutskip">跳過教學</button></div>' : ''; }
function topBar() {
  var r = S.res, fc = C.raidForecast(S), ap = ''; for (var i = 0; i < C.CFG.ap; i++) ap += i < S.ap ? '●' : '○';
  return '<div class="top"><b>第 ' + S.day + ' 天</b><span class="ap" title="行動點">' + ap + '</span><span>糧 ' + R(r.food) + '</span><span>木 ' + R(r.wood) + '</span><span>石 ' + R(r.stone) + '</span><span>鐵 ' + R(r.iron) + '</span><span>素材 ' + r.mats + '</span><span>人口 ' + S.pop + '/' + C.popCap(S) + '</span><span>防禦 ' + C.defense(S, true) + '</span>' +
    (fc && fc.known ? '<span class="warn">魔獸' + (fc.in === 0 ? '今晚' : fc.in + ' 天後') + '來襲' + (fc.need ? '（要 ' + fc.need + '）' : '') + '</span>' : '') + '</div>';
}
function pageStory() {
  var h = '<div class="story" id="story">';
  if (!story.length) h += '<p class="muted">還沒有劇情。到「村莊」頁做一件事，或直接在下面打字。</p>';
  story.forEach(function (x) {
    if (x.k === 'me') h += '<div class="me">' + esc(x.t) + '</div>';
    else if (x.k === 'res') h += '<div class="res">' + esc(x.t).replace(/\n/g, '<br>') + '</div>';
    else if (x.k === 'sys') h += '<div class="muted">' + esc(x.t) + '</div>';
    else x.blocks.forEach(function (b) {
      if (b.k === 'st') h += '<div class="st">' + esc(b.t) + '</div>'; else if (b.k === 'd') h += '<p class="d">' + esc(b.t).replace(/\n/g, '<br>') + '</p>';
      else if (b.k === 'btn') h += '<button class="opt" data-a="opt" data-s="' + esc(b.s) + '"' + (busy ? ' disabled' : '') + '>' + esc(b.t) + '</button>';
      else if (b.k === 'hr') h += '<hr>'; else if (b.k === 'p') h += '<p>' + esc(b.t).replace(/\n/g, '<br>') + '</p>';
    });
  });
  if (busy) h += '<p class="muted">AI 回覆中…</p>';
  h += '</div><div class="say"><textarea id="say" rows="2" placeholder="想說的話或想做的描寫（數字與物資只認帳本）">' + esc(draft) + '</textarea>' + btn('say', '送出', busy, 'pri') + '</div>';
  return h;
}
function pageVillage() {
  var h = '', miss = C.gateMiss(S), fc = C.raidForecast(S), pn = C.planNet(S);
  if (lastRep && lastRep.day === S.day - 1) h += '<div class="card"><h3>晨報</h3><ul><li>' + lastRep.lines.concat(lastRep.morning).map(esc).join('</li><li>') + '</li></ul></div>';
  h += '<div class="card"><h3>今天要做什麼（行動點 ' + S.ap + '/' + C.CFG.ap + '）</h3><div class="acts">';
  h += '<span class="grp"><select id="who">' + C.FOREMEN.map(function (f) { var away = C.POSTS[S.post[f.id]].away || S.hurt[f.id] > 0; return '<option value="' + f.id + '"' + (away ? ' disabled' : '') + (f.id === talkWho ? ' selected' : '') + '>' + f.n + '（' + f.role + '｜' + C.placeOf(S, f.id) + '）</option>'; }).join('') + '</select>' + btn('talk', '找他談談<small>1 點</small>', busy || S.ap < 1) + '</span>';
  h += btn('hunt', '親自出獵・邊緣<small>1 點</small>', busy || S.ap < 1 || S.lord.hurt > 0, '', ' data-z="edge"');
  h += btn('hunt', '親自出獵・中層<small>2 點' + (S.has.hut2 ? '' : '｜要獵人小屋 Lv2') + '</small>', busy || S.ap < 2 || !S.has.hut2 || S.lord.hurt > 0, '', ' data-z="mid"');
  h += btn('patrol', '巡視村子<small>1 點｜會遇到要你決定的事</small>', busy || S.ap < 1);
  if (S.caravan) { var left = S.caravan.offer - S.caravan.bought; h += '<span class="grp">' + btn('caravan', '接待商隊' + (S.caravan.met ? '（已接待）' : '<small>1 點</small>'), busy || (!S.caravan.met && S.ap < 1)) + (left > 0 ? '<select id="buyn">' + [0, 1, 2].filter(function (n) { return n <= left; }).map(function (n) { return '<option value="' + n + '"' + (n === Math.min(buyN, left) ? ' selected' : '') + '>買 ' + n + ' 人（糧 ' + n * C.CFG.slave.food + '）</option>'; }).join('') + '</select>' : '') + '</span>'; }
  if (C.raidIndex(S.day) >= 0) h += btn('brace', S.braced ? '已在備戰' : '到東村口備戰<small>1 點｜防禦 +' + C.CFG.brace + '</small>', busy || S.braced || S.ap < 1, 'warnb');
  h += '</div><div class="row">' + btn('end', '結束這一天', busy, 'pri') + '</div></div>';
  h += '<div class="card"><h3>升格為聚落</h3>' + (S.tier >= 1 ? '<p>黑木村已經是聚落了。第一版的目標到這裡；你可以繼續經營。</p>' : (miss.length ? '<p class="muted">還缺：</p><ul class="miss"><li>' + miss.map(esc).join('</li><li>') + '</li></ul>' : '<p>條件都滿了。</p>') + btn('promote', '宣布升格', busy || miss.length > 0, 'pri')) + '</div>';
  h += '<div class="card"><h3>預估</h3><p>今晚糧食淨變化約 ' + (pn >= 0 ? '+' : '') + R(pn) + '（要連續 ' + C.CFG.gate.surplusDays + ' 天 ≥ +' + C.CFG.gate.surplus + '，目前 ' + S.run + ' 天）</p>' +
    '<p>' + (fc ? (fc.known ? '魔獸' + (fc.in === 0 ? '今晚' : fc.in + ' 天後') + '來襲' + (fc.str ? '，強度 ' + fc.str + '，防禦要 ' + fc.need + '（現在 ' + C.defense(S, true) + '）' : '，強度不明（蓋瞭望塔才看得到）') : '東邊林子目前安靜') : '') + '</p></div>';
  return h;
}
function pageWork() {
  var h = '<div class="card"><h3>派工（可派 ' + C.labor(S) + ' 人，閒置 ' + C.idle(S) + '）</h3><p class="muted">人口 ' + S.pop + ' 人中約六成五能下田上工，再扣掉民兵 ' + S.mil + ' 人。派工不花行動點。</p>', p = C.production(S);
  var rows = [['farm', '農田', '糧食（含採集、羊圈）+' + R(p.food) + '，全村每天吃 ' + R(p.eat)], ['lumber', '伐木場', '木柴 +' + R(p.wood)], ['quarry', '採石場', '石頭 +' + R(p.stone)], ['sheep', '羊圈', S.assign.sheep ? '糧食與毛皮' : '沒人顧'], ['build', '工地', S.q.length ? S.q.length + ' 件工程，要 ' + C.buildNeed(S) + ' 人' : '沒有工程']];
  rows.forEach(function (r) { var cap = r[0] === 'build' ? C.buildNeed(S) : C.slots(S, r[0]), n = S.assign[r[0]];
    h += '<div class="job"><span class="jn">' + r[1] + '</span>' + btn('dec', '−', n <= 0, 'step', ' data-j="' + r[0] + '"') + '<b>' + n + '/' + cap + '</b>' + btn('inc', '＋', n >= cap || C.idle(S) <= 0, 'step', ' data-j="' + r[0] + '"') + '<span class="muted">' + r[2] + '</span></div>'; });
  h += '<div class="row">' + btn('auto', '自動派工') + '</div></div><div class="card"><h3>領班</h3>';
  var fixed = [];
  C.FOREMEN.forEach(function (f) { var hurt = S.hurt[f.id] > 0;
    if (f.posts.length < 2 && !hurt) { fixed.push(f.n + '：' + C.POSTS[S.post[f.id]].n + '（' + C.POSTS[S.post[f.id]].eff + '）'); return; }
    h += '<div class="job"><span class="jn">' + f.n + '<small>' + f.role + '</small></span>' + (hurt ? '<span class="warn">休養中，還要 ' + S.hurt[f.id] + ' 天</span>' : '<select data-post="' + f.id + '">' + f.posts.map(function (p) { return '<option value="' + p + '"' + (S.post[f.id] === p ? ' selected' : '') + '>' + C.POSTS[p].n + '</option>'; }).join('') + '</select><span class="muted">' + C.POSTS[S.post[f.id]].eff + '</span>') + '</div>'; });
  h += '<p class="muted">固定崗位：' + fixed.join('；') + '</p>';
  return h + '</div>';
}
function pageBuild() {
  var h = '<div class="card"><h3>進行中的工程（最多 ' + C.CFG.queue + ' 件）</h3>';
  if (!S.q.length) h += '<p class="muted">沒有工程。</p>';
  S.q.forEach(function (x, i) { h += '<div class="job"><span class="jn">' + C.B[x.k].n + '</span><b>剩 ' + C.fmt(x.left) + ' 天</b>' + btn('oversee', S.overseen[x.id] ? '今天已監工' : '親自監工<small>1 點｜−1 天</small>', busy || S.overseen[x.id] || S.ap < 1, '', ' data-i="' + i + '"') + '</div>'; });
  h += '</div><div class="card"><h3>可以蓋的</h3>';
  C.buildList(S).forEach(function (b) { if (b.done) return; h += '<div class="bld"><div><b>' + b.n + '</b>' + (b.have ? '<small>已有 ' + b.have + ' 座</small>' : '') + '<br><span class="muted">' + b.cost + '｜' + b.days + ' 天｜' + b.eff + '</span>' + (b.ok ? '' : '<br><span class="warn">' + esc(b.err) + '</span>') + '</div>' + btn('build', '開工', !b.ok, '', ' data-k="' + b.k + '"') + '</div>'; });
  return h + '</div>';
}
function pageMore() {
  return '<div class="card"><h3>帳本紀錄</h3><div class="log">' + S.log.slice().reverse().map(esc).join('<br>') + '</div></div>' +
    '<div class="card"><h3>存檔</h3><div class="row">' + btn('undo', '復原上一步') + btn('export', '匯出存檔') + btn('import', '匯入存檔') + btn('newgame', '重新開始', false, 'warnb') + '</div><p class="muted">領主帳本 ' + UIVER + '・規則 ' + C.VER + '・存檔：' + KS.mode + '</p></div>';
}
function render() {
  var keep = document.activeElement && document.activeElement.id === 'say';
  if (keep) draft = document.activeElement.value;
  var h = storeErr ? '<div class="err">' + esc(storeErr) + '</div>' : '';
  if (!S) h += viewNew();
  else {
    var TABS = [['story', '劇情'], ['village', '村莊'], ['work', '派工'], ['build', '建造'], ['more', '紀錄']], wide = window.innerWidth >= 760;
    if (wide && tab === 'story') tab = 'village';
    if ((S.hunt || S.card) && tab !== 'story') tab = 'village';
    var pg = S.hunt && tab !== 'story' ? pageHunt() : S.card && tab !== 'story' ? pageCard() : { village: pageVillage, work: pageWork, build: pageBuild, more: pageMore, story: pageStory }[tab]();
    h += topBar() + tutBar() + '<div class="tabs">' + TABS.filter(function (t) { return !(wide && t[0] === 'story'); }).map(function (t) { return '<button data-a="tab" data-k="' + t[0] + '" class="' + (tab === t[0] ? 'sel' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>';
    h += wide ? '<div class="wide"><div class="col">' + pageStory() + '</div><div class="col pg">' + pg + '</div></div>' : '<div class="pg' + (tab === 'story' ? ' full' : '') + '">' + pg + '</div>';
  }
  if (modal) h += '<div class="mask"><div class="modal"><h3>' + esc(modal.title) + '</h3>' + modal.body + '<div class="row">' + modal.buttons.map(function (b, i) { return '<button data-a="modal" data-i="' + i + '" class="' + (i ? '' : 'pri') + '">' + esc(b[0]) + '</button>'; }).join('') + '</div></div></div>';
  var sc = document.querySelector('.pg'), top = sc ? sc.scrollTop : 0, so = document.getElementById('story'), sTop = so ? so.scrollTop : 0, atEnd = !so || so.scrollHeight - so.scrollTop - so.clientHeight < 40;
  app.innerHTML = h;
  var st = document.getElementById('story'); if (st) { if (scrollStory || atEnd) st.scrollTop = st.scrollHeight; else st.scrollTop = sTop; scrollStory = false; }
  var np = document.querySelector('.pg'); if (np) np.scrollTop = top;
  if (keep) { var s = document.getElementById('say'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
}
function say() { var el = document.getElementById('say'), t = (el ? el.value : draft).trim(); if (!t) return; if (busy) { toast('AI 還在回覆，等一下'); return; } draft = ''; var dg = S.pending.slice(); S.pending = []; sendToAI(t + '\n' + C.stateBlock(S, { digest: dg }), t); }

app.addEventListener('click', function (e) {
  var b = e.target.closest('[data-a]'); if (!b || b.disabled) return; var a = b.dataset.a;
  if (a === 'cls') { var nm = document.getElementById('nm'); nameIn = nm ? nm.value : nameIn; clsIn = b.dataset.k; render(); }
  else if (a === 'start') { var n2 = document.getElementById('nm'); S = C.newGame(String(Date.now()), { name: (n2 && n2.value.trim()) || '領主', cls: clsIn }); story = []; lastRep = null; KS.del('undo'); KS.del('rep'); save(); render(); arm();
    sendToAI('【開局】我是' + S.lord.name + '（' + C.CLASSES[S.lord.cls].n + '），今天起接下黑木村。\n' + C.stateBlock(S, { events: ['新領主上任的第一個清晨：領主高燒三天後在領主木屋二樓醒來，侍女莉莉絲守在床邊，把一本空白的領主帳本交給領主'] }), '【開局】' + S.lord.name + '（' + C.CLASSES[S.lord.cls].n + '）接下黑木村'); }
  else if (a === 'tutskip') { S.tut = -1; save(); render(); }
  else if (a === 'tab') { if (S.tut === 0 && b.dataset.k === 'work') { S.tut = 1; save(); } if ((S.hunt || S.card) && b.dataset.k !== 'story' && b.dataset.k !== 'village') { toast(S.hunt ? '你還在森林裡' : '先決定眼前這件事'); return; } tab = b.dataset.k; if (tab === 'story') scrollStory = true; render(); }
  else if (a === 'talk') { var ws = document.getElementById('who'); if (ws) talkWho = ws.value; if (doAct({ k: 'talk', who: talkWho }) && S.tut === 2) { S.tut = 3; save(); render(); } }
  else if (a === 'hunt') doAct({ k: 'hunt', zone: b.dataset.z });
  else if (a === 'caravan') { var sel = document.getElementById('buyn'); doAct({ k: 'caravan', n: sel ? Number(sel.value) : 0 }); }
  else if (a === 'brace') doAct({ k: 'brace' });
  else if (a === 'patrol') doAct({ k: 'patrol' });
  else if (a === 'hact') { var hr = C.huntAct(S, b.dataset.k); if (hr.err) toast(hr.err); save(); render(); }
  else if (a === 'hback') { if (busy) { toast('AI 還在回覆，等一下'); return; } if (S.tut === 3) S.tut = 4; finishWith(C.huntFinish(S)); }
  else if (a === 'card') { if (busy) { toast('AI 還在回覆，等一下'); return; } var snapC = JSON.stringify(S), cr = C.cardChoose(S, Number(b.dataset.i)); if (!cr.err) { var uu = J('undo') || []; uu.push(snapC); KS.set('undo', JSON.stringify(uu.slice(-5))); } finishWith(cr); }
  else if (a === 'promote') doAct({ k: 'promote' });
  else if (a === 'oversee') doAct({ k: 'oversee', i: Number(b.dataset.i) });
  else if (a === 'end') endDay();
  else if (a === 'inc' || a === 'dec') free(function () { return C.setAssign(S, b.dataset.j, S.assign[b.dataset.j] + (a === 'inc' ? 1 : -1)); });
  else if (a === 'auto') free(function () { C.autoAssign(S); });
  else if (a === 'build') free(function () { var r = C.startBuild(S, b.dataset.k); if (r.ok && S.tut === 1) S.tut = 2; if (r.ok) toast(r.moved.length ? '已開工，從' + r.moved.join('、') + '調 ' + r.moved.length + ' 人到工地（可到「派工」調整）' : r.crew < 2 ? '已開工，但工地人手不足' : '已開工'); return r; });
  else if (a === 'opt') { if (!busy) { var dg = S.pending.slice(); S.pending = []; sendToAI(b.dataset.s + '\n' + C.stateBlock(S, { digest: dg }), b.dataset.s); } }
  else if (a === 'say') say();
  else if (a === 'undo') undo();
  else if (a === 'export') showModal('匯出存檔', '<p class="muted">複製下面整段文字保存。</p><textarea readonly rows="8">' + esc(JSON.stringify({ hm: 2, save: S, story: story })) + '</textarea>', [['關閉', closeModal]]);
  else if (a === 'import') showModal('匯入存檔', '<p class="muted">貼上先前匯出的文字。目前的進度會被取代（會先自動備份）。</p><textarea id="imp" rows="8"></textarea>', [['匯入', function () { try { var o = JSON.parse(document.getElementById('imp').value); if (!o || o.hm !== 2 || !o.save || o.save.v !== 2) throw 0; if (S) KS.set('bak.' + Date.now(), JSON.stringify(S)); S = C.migrate(o.save); story = o.story || []; save(); closeModal(); toast('已匯入'); arm(); } catch (x) { toast('這段文字不是領主帳本的存檔'); } }], ['取消', closeModal]]);
  else if (a === 'newgame') showModal('重新開始？', '<p>目前第 ' + S.day + ' 天的進度會清掉（會先自動備份一份）。</p>', [['重新開始', function () { KS.set('bak.' + Date.now(), JSON.stringify(S)); S = null; story = []; lastRep = null; KS.del('save'); KS.del('undo'); KS.del('story'); closeModal(); arm(); }], ['取消', closeModal]]);
  else if (a === 'modal') modal.buttons[Number(b.dataset.i)][1]();
});
app.addEventListener('change', function (e) {
  var t = e.target; if (t.dataset.post) free(function () { return C.setPost(S, t.dataset.post, t.value); }); else if (t.id === 'buyn') buyN = Number(t.value); else if (t.id === 'who') talkWho = t.value;
});
app.addEventListener('input', function (e) { if (e.target.id === 'say') draft = e.target.value; else if (e.target.id === 'nm') nameIn = e.target.value; });
app.addEventListener('keydown', function (e) { if (e.target.id === 'say' && e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.isComposing) { e.preventDefault(); say(); } });
window.addEventListener('resize', function () { render(); });

KS.ready.then(function () {
  var sv = J('save'); if (sv && sv.v === 2) S = C.migrate(sv); story = J('story') || []; lastRep = J('rep');
  if (KS.mode === 'memory') storeErr = '這個瀏覽器無法存檔，關掉就會消失，請用「紀錄」頁匯出';
  window.removeEventListener('message', earlyMsg); window.addEventListener('message', onHost);
  render(); post({ t: 'hello', ver: UIVER }); arm(); early.forEach(onHost); early = [];
  window.__hm = { get S() { return S; }, C: C, KS: KS };
});
})();
