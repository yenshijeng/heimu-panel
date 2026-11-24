// node test/core_test.js —— 規則核心測試：不變量 + 機器人走到聚落
'use strict';
var C = require('../core.js'), pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('✗ ' + m); } }
function inv(S, tag) {
  ok(C.used(S) <= C.labor(S), tag + ' 派工超過人手 ' + C.used(S) + '>' + C.labor(S));
  ['food', 'wood', 'stone', 'iron', 'hide', 'mats'].forEach(function (k) { ok(S.res[k] >= 0, tag + ' ' + k + ' 變負'); });
  ok(S.pop <= Math.max(18, C.popCap(S)), tag + ' 人口超過容量');
  ok(S.ap >= 0 && S.ap <= 3, tag + ' 行動點異常');
  ok(S.q.length <= C.CFG.queue, tag + ' 佇列超過');
}
function huntBot(S, zone) {
  var r = C.act(S, { k: 'hunt', zone: zone }); if (r.err) return r;
  var guard = 0;
  while (S.hunt && !S.hunt.done && guard++ < 80) {
    var H = S.hunt, e = H.e, sk = C.SKILL[S.lord.cls], a = 'attack';
    if (H.hp <= 7 && e.atk) a = S.lord.cls === 'priest' && H.en >= 2 ? 'heal' : 'retreat';
    else if (e.intent === 'heavy') a = S.lord.cls === 'warrior' && H.en >= 1 ? 'parry' : S.lord.cls === 'priest' && H.en >= 2 && !H.shield ? 'ward' : S.lord.cls === 'mage' && H.en >= 2 ? 'ice' : 'defend';
    else if (S.lord.cls === 'mage' && e.atk >= 5 && H.en >= 2 && !e.stun && e.hp > 8 && H.turn === 1) a = 'ice';
    else if (S.lord.cls === 'mage' && zone === 'mid' && !H.scan && H.en >= 1 && e.mat) a = 'scan';
    else if (H.en >= 2) a = sk[0].id === 'heal' ? 'banish' : sk[0].id;
    var x = C.huntAct(S, a); if (x.err) { ok(false, '出獵動作失敗 ' + a + ' ' + x.err); break; }
  }
  ok(guard < 80, '出獵沒有卡死');
  return C.huntFinish(S);
}
// 0. 出獵校準
['warrior', 'mage', 'priest'].forEach(function (cls) { ['edge', 'mid'].forEach(function (z) {
  var food = 0, mats = 0, hurt = 0, down = 0, N = 400;
  for (var i = 0; i < N; i++) { var T = C.newGame('h' + cls + z + i, { cls: cls }); T.has.hut2 = 1; var f0 = T.res.food; var r = huntBot(T, z); food += T.res.food - f0; mats += T.res.mats; if (T.lord.hurt) hurt++; if (T.lord.hurt === 2) down++; inv(T, 'hunt'); ok(!T.hunt, '結束後清掉狩獵狀態'); }
  console.log(' 出獵 ' + cls + ' ' + z + '：糧食 ' + (food / N).toFixed(1) + '、素材 ' + (mats / N).toFixed(2) + '、受傷 ' + Math.round(hurt / N * 100) + '%（重傷 ' + Math.round(down / N * 100) + '%）');
}); });
// 1. 開局
var S = C.newGame('t1', { name: '測試', cls: 'warrior' });
ok(C.labor(S) === 9, '開局可派 9 人，實際 ' + C.labor(S));
ok(C.used(S) === 9, '開局自動派滿');
ok(C.defense(S) === 19, '開局防禦 19，實際 ' + C.defense(S));
ok(C.gateMiss(S).length > 5, '開局升格條件未滿');
inv(S, '開局');
// 2. 派工上限
C.autoAssign(S); var before = S.assign.farm; C.setAssign(S, 'farm', 99); ok(S.assign.farm <= C.slots(S, 'farm'), '農田不超過工位'); ok(C.used(S) <= C.labor(S), '加人不超過人手');
C.setAssign(S, 'farm', before);
// 3. 建造扣款與錯誤
var w0 = S.res.wood; var r = C.startBuild(S, 'house'); ok(r.ok && S.res.wood === w0 - 40, '房屋扣木 40'); ok(S.q.length === 1, '進佇列');
ok(C.buildCheck(S, 'market').err, '資源不足要擋');
ok(C.act(S, { k: 'promote' }).err, '條件未滿不能升格');
// 4. 行動點
ok(C.act(S, { k: 'talk', who: 'hans' }).ok && S.ap === 2, '談話花 1 點');
ok(C.act(S, { k: 'talk', who: 'alicia' }).err, '艾莉西亞出獵中不能談');
ok(C.act(S, { k: 'oversee', i: 0 }).ok && S.ap === 1, '監工花 1 點');
ok(C.act(S, { k: 'oversee', i: 0 }).err, '同一件一天只能監一次');
ok(C.act(S, { k: 'patrol' }).ok && S.ap === 0 && S.card, '巡視花 1 點並抽到事件');
ok(C.act(S, { k: 'talk', who: 'hans' }).err, '事件沒決定前不能做別的');
var cd = C.cardById(S.card), oi = C.cardOptionCheck(S, cd.o[0]) ? 1 : 0, pc = C.cardChoose(S, oi); ok(pc.ok && !S.card && pc.text.indexOf('【巡視】') === 0, '事件選擇後結算');
ok(C.act(S, { k: 'hunt' }).err, '沒有行動點');
ok(C.act(S, { k: 'brace' }).err, '非襲擊日不能備戰');
var msg = C.actionMessage(S, { text: 'x', result: 'y' }); ok(msg.indexOf('[[HMS]]') > 0 && msg.indexOf('【結果】y') > 0 && msg.indexOf('【不在場】') > 0, '狀態區塊格式');
// 5. 日結
var rep = C.endDay(S); ok(S.day === 2 && S.ap === 3, '換日'); ok(rep.lines.length > 0, '有日結'); inv(S, '第2天');
ok(C.dayEndMessage(S, rep).indexOf('【日結】') === 0, '日結訊息');
// 6. 確定性：同種子同操作結果相同
function play(seed, verbose) {
  var S = C.newGame(seed, { cls: 'warrior' }), done = 0;
  for (var d = 1; d <= 60 && !done; d++) {
    var want = [];
    if (!S.has.well2 && S.pop >= C.wellCap(S) - 4) want.push('well2');
    if (C.housing(S) < 28 && S.pop >= C.housing(S) - 2) want.push('house');
    ['market', 'barracks', 'tower', 'chief2', 'well2', 'hut2'].forEach(function (k) { want.push(k); });
    if (C.housing(S) < 28) want.push('house');
    if (C.planNet(S) < 6 && S.assign.farm >= C.slots(S, 'farm')) want.unshift('farm');
    want.forEach(function (k) { if (C.buildCheck(S, k).ok) C.startBuild(S, k); });
    C.autoAssign(S);
    if (C.raidIndex(S.day) >= 0) C.act(S, { k: 'brace' });
    if (S.caravan) C.act(S, { k: 'caravan', n: S.net >= 3 ? 2 : 0 });
    if (S.q.length && S.ap) C.act(S, { k: 'oversee', i: 0 });
    while (S.ap > 0) { var z = S.has.hut2 && S.ap >= 2 && S.res.mats < 4 ? 'mid' : 'edge'; if (huntBot(S, z).err) break; }
    inv(S, seed + ' d' + d);
    if (!C.gateMiss(S).length) { var pr = C.act(S, { k: 'promote' }); ok(pr.ok, '升格應成功'); done = d; break; }
    C.endDay(S);
    if (verbose && d % 5 === 0) console.log(' d' + d, 'pop', S.pop + '/' + C.popCap(S), 'res', JSON.stringify(S.res, function (k, v) { return typeof v === 'number' ? Math.round(v) : v; }), 'def', C.defense(S), 'miss', C.gateMiss(S).join(' '));
  }
  return { day: done, S: S };
}
var a = play('same'), b = play('same'); ok(a.day === b.day && JSON.stringify(a.S.res) === JSON.stringify(b.S.res), '同種子結果相同');
var days = [], lost = 0;
for (var i = 0; i < 100; i++) { var g = play('s' + i); days.push(g.day || 99); lost += g.S.stats.lost; }
days.sort(function (x, y) { return x - y; });
console.log('機器人升聚落：中位 ' + days[50] + '、最早 ' + days[0] + '、最晚 ' + days[99] + '、未達 ' + days.filter(function (d) { return d === 99; }).length + '；襲擊失守合計 ' + lost);
ok(days[50] >= 16 && days[50] <= 26, '中位數應在 16～26 天，實際 ' + days[50]);
ok(days[99] < 99, '全部都要能升格');
if (process.argv[2]) play(process.argv[2], true);
console.log(pass + ' 通過，' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
