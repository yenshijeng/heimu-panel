/* 黑木村 v2 規則核心 core.js —— 一天一回合。瀏覽器掛 window.HMCore，Node 用 module.exports。
 * 所有數字只在這裡；介面與 AI 都不自己算。 */
(function (G) {
'use strict';
var VER = '2.0.0';
var CFG = {
  laborRate: 0.7, ap: 3, queue: 2, buildCrew: 2,
  jobs: {
    farm:   { n: '農田',   slots: 2, per: 7,  res: 'food'  },
    lumber: { n: '伐木場', slots: 2, per: 18, res: 'wood'  },
    quarry: { n: '採石場', slots: 2, per: 10, res: 'stone' },
    sheep:  { n: '羊圈',   slots: 1, per: 2,  res: 'food'  }
  },
  gate: { pop: 26, housing: 28, def: 30, mil: 6, surplusDays: 3, surplus: 5, mats: 4, lump: { wood: 100, stone: 60 } },
  immig: 0.5, slave: { food: 60, keep: 4 }, hideRate: 3,
  raidFirst: 7, raidEvery: 5, raidStr: [10, 18, 26, 36, 46], raidWarn: 2, brace: 8
};
/* cost: [木, 石, 鐵, 工期(滿編天數)]；multi=可蓋多座；up=升級(只有一次) */
var B = {
  house:    { n: '房屋',         cost: [40, 10, 0, 2], multi: 1, max: 8, eff: '住房 +4' },
  farm:     { n: '農田',         cost: [20, 0, 0, 1],  multi: 1, max: 4, eff: '工位 +2' },
  lumber:   { n: '伐木場',       cost: [30, 10, 0, 1], multi: 1, max: 3, eff: '工位 +2' },
  quarry:   { n: '採石場',       cost: [30, 0, 0, 1],  multi: 1, max: 3, eff: '工位 +2' },
  well2:    { n: '水井 Lv2',     cost: [40, 30, 0, 2], eff: '人口容量 24→60' },
  chief2:   { n: '村長屋 Lv2',   cost: [70, 40, 4, 3], eff: '流民來訪機率提高' },
  market:   { n: '市集',         cost: [70, 30, 5, 3], eff: '商隊每 3 天來、可買 2 人' },
  tower:    { n: '瞭望塔',       cost: [60, 30, 0, 3], eff: '防禦 +10、提前 3 天預警並看得到強度' },
  barracks: { n: '兵營',         cost: [60, 40, 5, 3], eff: '民兵上限 3→10' },
  fence2:   { n: '城防線 Lv2',   cost: [50, 10, 6, 2], eff: '防禦 10→18' },
  hut2:     { n: '獵人小屋 Lv2', cost: [40, 10, 5, 2], eff: '開放中層出獵、毛皮 +2' },
  herb:     { n: '草藥屋',       cost: [50, 20, 0, 2], eff: '受傷休養 −1 天' }
};
/* 領班：posts[0] 是預設崗位 */
var FOREMEN = [
  { id: 'hans',   n: '漢斯',     role: '村長',   posts: ['build', 'rest'] },
  { id: 'grete',  n: '格蕾特',   role: '大廚房', posts: ['kitchen'] },
  { id: 'baron',  n: '巴隆',     role: '鐵匠',   posts: ['smith', 'build'] },
  { id: 'alicia', n: '艾莉西亞', role: '獵人',   posts: ['hunt', 'guard'] },
  { id: 'anna',   n: '安娜',     role: '農家',   posts: ['farm', 'sheep'] }
];
var POSTS = {
  build:   { n: '工地領班', place: '村中心工地', eff: '每天一件工程多推進半天' },
  rest:    { n: '處理村務', place: '村長屋',     eff: '沒有加成' },
  kitchen: { n: '掌廚',     place: '村長屋',     eff: '糧食消耗 −5%' },
  smith:   { n: '打鐵修具', place: '鐵匠鋪',     eff: '木柴、石頭產出 +10%' },
  hunt:    { n: '帶隊出獵', place: '森林',       eff: '每天自動出獵（平均糧食 +7）', away: 1 },
  guard:   { n: '守東村口', place: '東村口',     eff: '防禦 +4' },
  farm:    { n: '農田領班', place: '南側田地',   eff: '一座農田產出 +25%' },
  sheep:   { n: '顧羊圈',   place: '南側田地',   eff: '羊圈產出加倍' }
};
var CLASSES = { warrior: { n: '戰士', d: '出獵糧食 +2' }, mage: { n: '法師', d: '出獵較容易得到魔獸素材' }, priest: { n: '牧師', d: '出獵不易受傷、村民休養 −1 天' } };
var TIER = ['村', '聚落'];

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return h >>> 0; }
function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function roll(S, tag) { return rng(hash(S.seed + '|' + S.day + '|' + tag + '|' + S.ap))(); }
function R(x) { return Math.round(x); }

function newGame(seed, lord) {
  var S = {
    v: 2, ver: VER, seed: String(seed || Date.now()), day: 1, ap: CFG.ap, tier: 0, pop: 18, mil: 3,
    lord: { name: (lord && lord.name) || '領主', cls: (lord && lord.cls) || 'warrior', hurt: 0 },
    res: { food: 60, wood: 60, stone: 20, iron: 0, hide: 0, mats: 0 },
    b: { house: 5, farm: 2, lumber: 2, quarry: 2 }, has: {}, q: [],
    assign: { farm: 0, lumber: 0, quarry: 0, sheep: 0, build: 0 },
    post: {}, hurt: {}, run: 0, trades: 0, net: 0, caravan: null, braced: false, overseen: {}, hunted: 0,
    stats: { raids: 0, lost: 0, bought: 0 }, log: [], pending: [], place: '領主木屋', ended: false, convId: ''
  };
  FOREMEN.forEach(function (f) { S.post[f.id] = f.posts[0]; });
  autoAssign(S);
  S.log.push('第 1 天：你接下黑木村。人口 18，其中可派工 ' + labor(S) + ' 人。');
  return S;
}

/* ---------- 衍生數值 ---------- */
function housing(S) { return S.b.house * 4; }
function wellCap(S) { return S.has.well2 ? 60 : 24; }
function popCap(S) { return Math.min(housing(S), wellCap(S)); }
function milCap(S) { return S.has.barracks ? 10 : 3; }
function labor(S) { return Math.max(0, Math.floor(S.pop * CFG.laborRate) - S.mil); }
function onPost(S, id, p) { return S.post[id] === p && !(S.hurt[id] > 0); }
function anyPost(S, p) { return FOREMEN.some(function (f) { return onPost(S, f.id, p); }); }
function defense(S, withBrace) {
  return (S.has.fence2 ? 18 : 10) + (S.has.tower ? 10 : 0) + S.mil * 3 + (anyPost(S, 'guard') ? 4 : 0) + (withBrace && S.braced ? CFG.brace : 0);
}
function slots(S, job) { return job === 'sheep' ? 1 : S.b[job] * CFG.jobs[job].slots; }
function used(S) { var a = S.assign; return a.farm + a.lumber + a.quarry + a.sheep + a.build; }
function idle(S) { return labor(S) - used(S); }
function buildNeed(S) { return S.q.length * CFG.buildCrew; }
function production(S) {
  var a = S.assign, J = CFG.jobs, tool = anyPost(S, 'smith') ? 1.1 : 1;
  var farm = a.farm / 2 * J.farm.per; if (anyPost(S, 'farm') && a.farm >= 2) farm += J.farm.per * 0.25; farm *= 1.1; /* 磨坊 Lv1 */
  var sheep = a.sheep ? J.sheep.per * (anyPost(S, 'sheep') ? 2 : 1) : 0;
  var eat = S.pop * (anyPost(S, 'kitchen') ? 0.95 : 1);
  return { food: farm + sheep, eat: eat, wood: a.lumber / 2 * J.lumber.per * tool, stone: a.quarry / 2 * J.quarry.per * tool,
    hide: (a.sheep ? 1 : 0) + (S.has.hut2 && anyPost(S, 'hunt') ? 2 : 0), huntAvg: anyPost(S, 'hunt') ? 7 : 0 };
}
function planNet(S) { var p = production(S); return p.food + p.huntAvg - p.eat; }
function raidIndex(day) { if (day < CFG.raidFirst || (day - CFG.raidFirst) % CFG.raidEvery) return -1; return (day - CFG.raidFirst) / CFG.raidEvery; }
function raidStrength(i) { var t = CFG.raidStr; return i < t.length ? t[i] : t[t.length - 1] + (i - t.length + 1) * 10; }
function nextRaid(S) { for (var d = S.day; d < S.day + 40; d++) { var i = raidIndex(d); if (i >= 0) return { day: d, str: raidStrength(i), in: d - S.day }; } return null; }
function raidForecast(S) {
  var r = nextRaid(S); if (!r) return null; var warn = S.has.tower ? 3 : CFG.raidWarn;
  if (r.in > warn) return { known: false };
  return { known: true, day: r.day, in: r.in, str: S.has.tower ? r.str : null, need: S.has.tower ? Math.ceil(r.str * 1.2) : null };
}
function caravanDay(S, day) { return S.has.market ? day % 3 === 0 : day % 5 === 3; }

/* ---------- 派工 ---------- */
function clampAssign(S) {
  var a = S.assign, order = ['build', 'quarry', 'lumber', 'sheep', 'farm'];
  ['farm', 'lumber', 'quarry', 'sheep'].forEach(function (j) { a[j] = Math.max(0, Math.min(a[j], slots(S, j))); });
  a.build = Math.max(0, Math.min(a.build, buildNeed(S)));
  var over = used(S) - labor(S), i = 0;
  while (over > 0 && i < order.length) { var t = Math.min(a[order[i]], over); a[order[i]] -= t; over -= t; i++; }
}
function setAssign(S, job, n) {
  if (!(job in S.assign)) return { err: '沒有這個崗位' };
  var cap = job === 'build' ? buildNeed(S) : slots(S, job), cur = S.assign[job];
  n = Math.max(0, Math.min(n, cap));
  if (n > cur && n - cur > idle(S)) n = cur + Math.max(0, idle(S));
  S.assign[job] = n; return { ok: true, n: n };
}
function autoAssign(S) {
  var a = S.assign, L = labor(S); a.farm = a.lumber = a.quarry = a.sheep = a.build = 0;
  while (a.farm < Math.min(slots(S, 'farm'), L) && planNet(S) < CFG.gate.surplus + 1) a.farm++;
  L -= a.farm;
  a.build = Math.min(buildNeed(S), L); L -= a.build;
  while (L > 0) {
    var lf = slots(S, 'lumber') - a.lumber, qf = slots(S, 'quarry') - a.quarry;
    if (lf <= 0 && qf <= 0) break;
    if ((S.res.wood / 18 <= S.res.stone / 10 && lf > 0) || qf <= 0) a.lumber++; else a.quarry++; L--;
  }
  if (L > 0 && !a.sheep) { a.sheep = 1; L--; }
}
function setPost(S, id, p) {
  var f = FOREMEN.filter(function (x) { return x.id === id; })[0];
  if (!f || f.posts.indexOf(p) < 0) return { err: '這個人不能派去那裡' };
  S.post[id] = p; return { ok: true };
}

/* ---------- 建造 ---------- */
function count(S, k) { return (S.b[k] || 0) + S.q.filter(function (x) { return x.k === k; }).length; }
function buildCheck(S, k) {
  var d = B[k]; if (!d) return { err: '沒有這種建築' };
  if (d.multi) { if (count(S, k) >= d.max) return { err: d.n + '已到上限（' + d.max + ' 座）' }; }
  else if (S.has[k] || S.q.some(function (x) { return x.k === k; })) return { err: d.n + (S.has[k] ? '已經有了' : '正在蓋') };
  if (S.q.length >= CFG.queue) return { err: '同時只能進行 ' + CFG.queue + ' 件工程' };
  var c = d.cost, r = S.res;
  if (r.wood < c[0] || r.stone < c[1] || r.iron < c[2]) return { err: '資源不足（需要 ' + costText(c) + '）' };
  return { ok: true };
}
function startBuild(S, k) {
  var c = buildCheck(S, k); if (!c.ok) return c; var d = B[k];
  S.res.wood -= d.cost[0]; S.res.stone -= d.cost[1]; S.res.iron -= d.cost[2];
  S.q.push({ k: k, left: d.cost[3], id: S.day + '-' + S.q.length + '-' + k });
  var free = Math.min(CFG.buildCrew, idle(S)), moved = [];
  while (free + moved.length < CFG.buildCrew) { /* 人手都排滿了：從伐木場、採石場人多的那邊調人到工地 */
    var from = S.assign.lumber >= S.assign.quarry ? 'lumber' : 'quarry'; if (S.assign[from] <= 0) break; S.assign[from]--; moved.push(CFG.jobs[from].n);
  }
  var crew = free + moved.length; S.assign.build += crew;
  note(S, '開工：' + d.n + (crew < CFG.buildCrew ? '（工地只有 ' + crew + ' 人）' : ''));
  return { ok: true, crew: crew, moved: moved };
}
function costText(c) { return '木' + c[0] + (c[1] ? ' 石' + c[1] : '') + (c[2] ? ' 鐵' + c[2] : ''); }
function buildList(S) {
  return Object.keys(B).map(function (k) { var c = buildCheck(S, k), d = B[k];
    return { k: k, n: d.n, cost: costText(d.cost), days: d.cost[3], eff: d.eff, ok: !!c.ok, err: c.err || '', have: d.multi ? S.b[k] || 0 : (S.has[k] ? 1 : 0), done: !d.multi && !!S.has[k] }; });
}

/* ---------- 在場 ---------- */
function placeOf(S, id) { if (S.hurt[id] > 0) return '養傷中'; return POSTS[S.post[id]].place; }
function presence(S, place) {
  var here = [], away = [];
  FOREMEN.forEach(function (f) { var p = placeOf(S, f.id); if (p === place && !(S.hurt[f.id] > 0)) here.push(f.n); else away.push(f.n + '（' + p + '）'); });
  return { here: here, away: away };
}

/* ---------- 領主行動 ---------- */
function note(S, t) { S.log.push('第 ' + S.day + ' 天：' + t); if (S.log.length > 80) S.log = S.log.slice(-80); S.pending.push(t); if (S.pending.length > 12) S.pending = S.pending.slice(-12); }
function spend(S, n) { if (S.ended) return '這一天已經結束'; if (S.ap < n) return '行動點不夠（需要 ' + n + '，剩 ' + S.ap + '）'; S.ap -= n; return ''; }
function act(S, a) {
  var e, f, r;
  if (a.k === 'talk') {
    f = FOREMEN.filter(function (x) { return x.id === a.who; })[0]; if (!f) return { err: '找不到這個人' };
    if (S.hurt[f.id] > 0) return { err: f.n + '在養傷，今天先讓他休息' };
    if (POSTS[S.post[f.id]].away) return { err: f.n + '帶隊出獵去了，傍晚才回來。想談就先把他調回村裡' };
    if ((e = spend(S, 1))) return { err: e };
    S.place = placeOf(S, f.id);
    return { ok: true, text: '【談話】我到' + S.place + '找' + f.n + '談' + (a.topic ? '：' + a.topic : '談今天的事') + '。', result: f.n + '今天的崗位：' + POSTS[S.post[f.id]].n };
  }
  if (a.k === 'oversee') {
    var x = S.q[a.i]; if (!x) return { err: '沒有這件工程' };
    if (S.overseen[x.id]) return { err: '這件工程今天已經監過工了' };
    if ((e = spend(S, 1))) return { err: e };
    S.overseen[x.id] = 1; x.left = Math.max(0, x.left - 1); S.place = '村中心工地';
    note(S, '領主親自監工：' + B[x.k].n + '（剩 ' + fmt(x.left) + ' 天）');
    return { ok: true, text: '【監工】我到工地盯' + B[x.k].n + '的進度，自己也下去搬料。', result: B[x.k].n + '工期 −1 天，還剩 ' + fmt(x.left) + ' 天' };
  }
  if (a.k === 'hunt') {
    var deep = a.zone === 'mid';
    if (deep && !S.has.hut2) return { err: '要先把獵人小屋升到 Lv2 才能進中層' };
    if (S.lord.hurt > 0) return { err: '你的傷還沒好，今天不能出獵' };
    if ((e = spend(S, deep ? 2 : 1))) return { err: e };
    r = roll(S, 'hunt' + S.hunted); S.hunted++; S.place = deep ? '森林中層' : '森林邊緣';
    var cls = S.lord.cls, hurtP = (deep ? 0.25 : 0.1) * (cls === 'priest' ? 0.5 : 1), o;
    if (r < 0.1) o = ['大成功', deep ? 26 : 12]; else if (r < 1 - 0.2 - hurtP) o = ['成功', deep ? 18 : 8]; else if (r < 1 - hurtP) o = ['空手', 0]; else o = ['輕傷', deep ? 9 : 4];
    var food = o[1] ? o[1] + (cls === 'warrior' ? 2 : 0) : 0, mats = 0;
    if (deep && o[0] !== '空手' && roll(S, 'mat' + S.hunted) < (cls === 'mage' ? 0.85 : 0.6)) mats = o[0] === '大成功' ? 2 : 1;
    S.res.food += food; S.res.mats += mats; if (o[0] === '輕傷') S.lord.hurt = 1;
    var res = '出獵結果：' + o[0] + '，糧食 +' + food + (mats ? '，魔獸素材 +' + mats : '') + (o[0] === '輕傷' ? '（受傷的是領主本人，明天少一個行動點）' : '');
    note(S, '領主親自到' + S.place + '出獵：' + o[0] + '，糧食 +' + food + (mats ? '、素材 +' + mats : ''));
    return { ok: true, text: '【出獵】我帶著武器進' + S.place + '打獵。', result: res };
  }
  if (a.k === 'caravan') {
    if (!S.caravan) return { err: '商隊今天不在村裡' };
    var n = Math.max(0, Math.min(a.n || 0, S.caravan.offer - S.caravan.bought));
    if (!S.caravan.met && (e = spend(S, 1))) return { err: e };
    S.caravan.met = true; S.place = '西村口';
    var got = 0;
    for (var i = 0; i < n; i++) { if (S.pop >= popCap(S) || S.res.food < CFG.slave.food + S.pop * CFG.slave.keep) break; S.res.food -= CFG.slave.food; S.pop++; got++; }
    S.caravan.bought += got; S.stats.bought += got;
    if (n && !got) return { ok: true, text: '【商隊】我到西村口接待商隊。', result: '想買人但買不成：' + (S.pop >= popCap(S) ? '住房或水井容量已滿' : '糧食不夠（每人 ' + CFG.slave.food + '，買完要留 ' + S.pop * CFG.slave.keep + '）') };
    if (got) note(S, '向商隊買下 ' + got + ' 人，成為村民');
    return { ok: true, text: '【商隊】我到西村口接待商隊' + (got ? '，談妥帶 ' + got + ' 個人留下' : '，看看他們帶了什麼') + '。', result: got ? '糧食 −' + got * CFG.slave.food + '，人口 +' + got + '；他們從今天起就是黑木村的村民' : '今天沒有買人' };
  }
  if (a.k === 'brace') {
    if (raidIndex(S.day) < 0) return { err: '今天沒有襲擊預警' };
    if (S.braced) return { err: '已經在備戰了' };
    if ((e = spend(S, 1))) return { err: e };
    S.braced = true; S.place = '東村口'; note(S, '領主到東村口備戰（今晚防禦 +' + CFG.brace + '）');
    return { ok: true, text: '【備戰】我到東村口，和民兵一起檢查柵欄、分配位置。', result: '今晚防禦 +' + CFG.brace + '，目前 ' + defense(S, true) };
  }
  if (a.k === 'promote') {
    var m = gateMiss(S); if (m.length) return { err: '條件未滿：' + m.join('、') };
    S.res.wood -= CFG.gate.lump.wood; S.res.stone -= CFG.gate.lump.stone; S.tier = 1; S.place = '村長屋';
    note(S, '黑木村升格為聚落');
    return { ok: true, text: '【升格】我召集全村，宣布黑木村從今天起是聚落。', result: '村子升格為聚落（第 ' + S.day + ' 天）。扣除木柴 ' + CFG.gate.lump.wood + '、石頭 ' + CFG.gate.lump.stone };
  }
  return { err: '未知行動' };
}
function fmt(x) { return x % 1 ? x.toFixed(1) : String(x); }

/* ---------- 升格 ---------- */
function gateMiss(S) {
  var g = CFG.gate, m = []; if (S.tier >= 1) return ['已經是聚落'];
  if (S.pop < g.pop) m.push('人口 ' + S.pop + '/' + g.pop);
  if (housing(S) < g.housing) m.push('住房 ' + housing(S) + '/' + g.housing);
  if (defense(S) < g.def) m.push('防禦 ' + defense(S) + '/' + g.def);
  if (S.mil < g.mil) m.push('民兵 ' + S.mil + '/' + g.mil);
  if (S.run < g.surplusDays) m.push('糧食盈餘連續 ' + S.run + '/' + g.surplusDays + ' 天');
  if (S.res.mats < g.mats) m.push('魔獸素材 ' + S.res.mats + '/' + g.mats);
  ['market', 'tower', 'barracks', 'chief2', 'well2'].forEach(function (k) { if (!S.has[k]) m.push(B[k].n); });
  if (S.trades < 1) m.push('市集交易 0/1');
  if (S.res.wood < g.lump.wood || S.res.stone < g.lump.stone) m.push('升格費用 木' + g.lump.wood + ' 石' + g.lump.stone);
  return m;
}

/* ---------- 結束一天 ---------- */
function endDay(S) {
  var rep = { day: S.day, lines: [], narrate: [] }, p = production(S), rnd = rng(hash(S.seed + '|night|' + S.day));
  function L(t, nar) { rep.lines.push(t); if (nar) rep.narrate.push(t); }
  /* 自動出獵 */
  var huntFood = 0;
  if (anyPost(S, 'hunt')) {
    var h = rnd();
    if (h < 0.1) huntFood = 12; else if (h < 0.7) huntFood = 8; else if (h < 0.9) huntFood = 0; else if (h < 0.99) { huntFood = 4; S.hurt.alicia = S.has.herb || S.lord.cls === 'priest' ? 1 : 2; L('艾莉西亞出獵受了輕傷，要休養 ' + S.hurt.alicia + ' 天', true); }
    else { huntFood = 0; S.hurt.alicia = S.has.herb || S.lord.cls === 'priest' ? 4 : 5; L('艾莉西亞出獵受了重傷，要休養 ' + S.hurt.alicia + ' 天', true); }
  }
  var net = p.food + huntFood - p.eat;
  S.res.food += net; S.res.wood += p.wood; S.res.stone += p.stone; S.res.hide += p.hide; S.net = net;
  S.run = planNet(S) >= CFG.gate.surplus ? S.run + 1 : 0;
  L('產出：糧食 ' + (net >= 0 ? '+' : '') + R(net) + '（收 ' + R(p.food + huntFood) + '、吃 ' + R(p.eat) + '）、木柴 +' + R(p.wood) + '、石頭 +' + R(p.stone));
  if (S.res.food < 0) { S.res.food = 0; S.pop = Math.max(10, S.pop - 1); L('糧倉見底，一名村民離開了村子（沒有人死亡）', true); }
  /* 工程 */
  var crew = S.assign.build, bonus = FOREMEN.filter(function (f) { return onPost(S, f.id, 'build'); }).length;
  S.q.forEach(function (x) { var pr = Math.min(1, crew / CFG.buildCrew); crew = Math.max(0, crew - CFG.buildCrew); if (pr > 0 && bonus > 0) { pr += 0.5; bonus--; } x.left = Math.max(0, x.left - pr); if (pr === 0) L(B[x.k].n + '工地沒有人，今天停工'); });
  S.q = S.q.filter(function (x) { if (x.left > 0) return true; if (B[x.k].multi) S.b[x.k] = (S.b[x.k] || 0) + 1; else S.has[x.k] = 1; L(B[x.k].n + '完工'); return false; });
  /* 民兵 */
  if (S.mil < Math.min(milCap(S), Math.floor(S.pop * 0.25))) { S.mil++; L('一名村民完成訓練，加入民兵（共 ' + S.mil + ' 人）'); }
  /* 襲擊 */
  var ri = raidIndex(S.day);
  if (ri >= 0) {
    var str = raidStrength(ri), d = defense(S, true), lost = d < str * 1.2; S.stats.raids++;
    if (lost) { S.stats.lost++; S.res.food *= 0.9; S.res.wood *= 0.9; S.res.stone *= 0.9; L('入夜後魔獸襲擊東村口：強度 ' + str + '，防禦 ' + d + '，失守。糧食、木柴、石頭各損失一成，沒有人死亡', true); }
    else { S.res.mats += 2; L('入夜後魔獸襲擊東村口：強度 ' + str + '，防禦 ' + d + '，守住了。從屍體上取得魔獸素材 2', true); }
  }
  /* 換日 */
  rep.lines.forEach(function (t) { S.log.push('第 ' + S.day + ' 天夜：' + t); });
  S.day++; S.ap = CFG.ap; S.braced = false; S.overseen = {}; S.hunted = 0; S.caravan = null; S.ended = false; S.place = '領主木屋';
  if (S.lord.hurt > 0) { S.ap = Math.max(1, S.ap - 1); S.lord.hurt--; }
  Object.keys(S.hurt).forEach(function (k) { if (S.hurt[k] > 0) S.hurt[k]--; });
  var morning = [];
  if (S.pop < popCap(S) && rnd() < CFG.immig * (S.has.chief2 ? 1.2 : 1) * (net < 0 ? 0.3 : 1)) { S.pop++; morning.push('一名流民在村裡落腳（人口 ' + S.pop + '）'); }
  if (caravanDay(S, S.day)) {
    var iron = 8, sw = Math.floor(S.res.hide / CFG.hideRate); S.res.iron += iron + sw; S.res.hide -= sw * CFG.hideRate;
    S.caravan = { offer: S.has.market ? 2 : 1, bought: 0, met: false }; if (S.has.market) S.trades++;
    var cv = '商隊抵達西村口，只停留今天：帶來鐵 ' + iron + (sw ? '，毛皮另換到鐵 ' + sw : '') + '；可以買 ' + S.caravan.offer + ' 人';
    morning.push(cv); rep.narrate.push(cv);
  }
  var fc = raidForecast(S);
  if (fc && fc.known) morning.push(fc.in === 0 ? '今晚魔獸會來襲' + (fc.str ? '（強度 ' + fc.str + '，防禦要 ' + fc.need + '）' : '') : '東邊林子有動靜：' + fc.in + ' 天後會有魔獸來襲' + (fc.str ? '（強度 ' + fc.str + '，防禦要 ' + fc.need + '）' : ''));
  clampAssign(S);
  if (idle(S) > 0) morning.push('有 ' + idle(S) + ' 人還沒派工');
  rep.morning = morning; morning.forEach(function (t) { S.log.push('第 ' + S.day + ' 天晨：' + t); });
  if (S.log.length > 80) S.log = S.log.slice(-80);
  S.pending = [];
  return rep;
}

/* ---------- 給 AI 的狀態區塊 ---------- */
function stateBlock(S, opt) {
  opt = opt || {}; var r = S.res, pr = presence(S, S.place), fc = raidForecast(S), out = [];
  out.push('[[HMS]]');
  out.push('【帳本】第' + S.day + '天｜' + TIER[S.tier] + '｜領主在' + S.place + '｜糧食' + R(r.food) + ' 木柴' + R(r.wood) + ' 石頭' + R(r.stone) + ' 鐵' + R(r.iron) + (r.mats ? ' 魔獸素材' + r.mats : ''));
  out.push('【村況】人口' + S.pop + '/' + popCap(S) + '｜民兵' + S.mil + '｜防禦' + defense(S, true) + (fc && fc.known ? '｜魔獸' + (fc.in === 0 ? '今晚' : fc.in + '天後') + '來襲' : ''));
  if (S.q.length) out.push('【工程】' + S.q.map(function (x) { return B[x.k].n + '剩' + fmt(x.left) + '天'; }).join('、'));
  if (S.caravan) out.push('【商隊】今天在西村口');
  out.push('【在場】' + (pr.here.length ? pr.here.join('、') + '（只有在場者能開口）' : '沒有領班在這裡（可以有無名村民，但不要讓不在場的人出現）'));
  if (pr.away.length) out.push('【不在場】' + pr.away.join('、') + '（只能被提起，不能出現在眼前）');
  if (opt.result) out.push('【結果】' + opt.result);
  if (opt.events && opt.events.length) out.push('【要演出】' + opt.events.join('；'));
  if (opt.digest && opt.digest.length) out.push('【這段期間】' + opt.digest.join('；'));
  out.push('【約定】數字與結果以上面為準，照著寫，不要增減物資、人口或另外安排戰鬥結果；結尾不要替領主做決定。');
  out.push('[[/HMS]]');
  return out.join('\n');
}
function dayEndMessage(S, rep) {
  var ev = rep.narrate.slice(), dg = rep.lines.filter(function (t) { return ev.indexOf(t) < 0; }).concat((rep.morning || []).filter(function (t) { return ev.indexOf(t) < 0; }));
  return '【日結】第 ' + rep.day + ' 天結束，我回到領主木屋過夜；現在是第 ' + S.day + ' 天清晨。\n' + stateBlock(S, { events: ev, digest: dg });
}
function actionMessage(S, res) { var dg = S.pending.slice(0, -1); return res.text + '\n' + stateBlock(S, { result: res.result, digest: [] }); }

var API = { VER: VER, CFG: CFG, B: B, FOREMEN: FOREMEN, POSTS: POSTS, CLASSES: CLASSES, TIER: TIER, clone: clone, newGame: newGame,
  housing: housing, wellCap: wellCap, popCap: popCap, milCap: milCap, labor: labor, defense: defense, slots: slots, used: used, idle: idle, buildNeed: buildNeed,
  production: production, planNet: planNet, nextRaid: nextRaid, raidForecast: raidForecast, raidIndex: raidIndex, raidStrength: raidStrength, caravanDay: caravanDay,
  setAssign: setAssign, autoAssign: autoAssign, clampAssign: clampAssign, setPost: setPost, buildCheck: buildCheck, startBuild: startBuild, buildList: buildList, costText: costText,
  presence: presence, placeOf: placeOf, act: act, gateMiss: gateMiss, endDay: endDay, stateBlock: stateBlock, dayEndMessage: dayEndMessage, actionMessage: actionMessage, fmt: fmt };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.HMCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
