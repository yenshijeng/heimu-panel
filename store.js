/* 存檔模組（精簡版，介面與 lt-store v1.0 相同，共用同一個資料庫 yenshijeng-lt-store）
 * 開機 await S.ready 之後，get/set/del 都是同步的；寫入在背景送進 IndexedDB。
 * IndexedDB 打不開退回 localStorage，再不行只存在記憶體。 */
(function (G) {
  if (G.LTStore) return;
  var DBN = 'yenshijeng-lt-store', ST = 'kv', SEP = '\u0001', dbP = null;
  function openDB() {
    return new Promise(function (res, rej) {
      var done = false, r; function fail(e) { if (!done) { done = true; rej(e); } }
      setTimeout(function () { fail(new Error('IndexedDB 開啟逾時')); }, 4000);
      try { r = indexedDB.open(DBN, 1); } catch (e) { fail(e); return; }
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST); };
      r.onsuccess = function () { if (done) { try { r.result.close(); } catch (e) {} return; } done = true; res(r.result); };
      r.onerror = function () { fail(r.error || new Error('IndexedDB 開啟失敗')); };
      r.onblocked = function () { fail(new Error('IndexedDB 被其他分頁鎖住')); };
    });
  }
  function getDB() { if (!dbP) dbP = openDB().catch(function (e) { dbP = null; throw e; }); return dbP; }
  function lsOK() { try { localStorage.setItem('__lt_probe', '1'); localStorage.removeItem('__lt_probe'); return true; } catch (e) { return false; } }
  function create(ns) {
    var P = ns + SEP, cache = new Map(), dirty = new Map(), timer = 0, chain = Promise.resolve();
    var S = { ns: ns, mode: 'loading', lastError: null, onError: null };
    function report(e, where) { S.lastError = { at: Date.now(), where: where, msg: String((e && (e.message || e.name)) || e) }; try { if (S.onError) S.onError(S.lastError); } catch (x) {} }
    S.get = function (k) { var v = cache.get(k); return v === undefined ? null : v; };
    S.keys = function (pre) { var o = []; cache.forEach(function (v, k) { if (!pre || k.indexOf(pre) === 0) o.push(k); }); return o; };
    S.set = function (k, v) { v = String(v); cache.set(k, v); dirty.set(k, v); schedule(); };
    S.del = function (k) { cache.delete(k); dirty.set(k, null); schedule(); };
    function schedule() { if (S.mode === 'loading' || timer) return; timer = setTimeout(function () { timer = 0; S.flush(); }, 30); }
    function write(batch) {
      if (S.mode === 'idb') return getDB().then(function (db) { return new Promise(function (res, rej) {
        var tx = db.transaction(ST, 'readwrite'), st = tx.objectStore(ST);
        batch.forEach(function (v, k) { if (v === null) st.delete(P + k); else st.put(v, P + k); });
        tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error || new Error('寫入失敗')); }; tx.onabort = function () { rej(tx.error || new Error('寫入中止')); };
      }); });
      if (S.mode === 'local') { batch.forEach(function (v, k) { if (v === null) localStorage.removeItem(P + k); else localStorage.setItem(P + k, v); }); }
      return Promise.resolve();
    }
    S.flush = function () {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (S.mode === 'loading' || !dirty.size) return chain;
      var batch = dirty; dirty = new Map();
      chain = chain.then(function () { return write(batch); }).then(null, function (e) { batch.forEach(function (v, k) { if (!dirty.has(k)) dirty.set(k, v); }); report(e, 'write'); });
      return chain;
    };
    function readAll(db) { return new Promise(function (res, rej) {
      var out = [], rq = db.transaction(ST, 'readonly').objectStore(ST).openCursor(IDBKeyRange.bound(P, P + '￿'));
      rq.onsuccess = function () { var c = rq.result; if (c) { out.push([String(c.key).slice(P.length), c.value]); c.continue(); } else res(out); };
      rq.onerror = function () { rej(rq.error); };
    }); }
    S.ready = (function () {
      var has = false; try { has = !!G.indexedDB; } catch (e) {}
      return (has ? getDB().then(readAll) : Promise.reject(new Error('沒有 IndexedDB'))).then(function (rows) {
        rows.forEach(function (r) { if (!dirty.has(r[0])) cache.set(r[0], r[1]); }); S.mode = 'idb';
      }, function (e) {
        report(e, 'open');
        if (lsOK()) { S.mode = 'local'; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(P) === 0) cache.set(k.slice(P.length), localStorage.getItem(k)); } } else S.mode = 'memory';
      }).then(function () { S.flush(); return S; });
    })();
    function now() { try { S.flush(); } catch (e) {} }
    G.addEventListener('pagehide', now);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') now(); });
    return S;
  }
  G.LTStore = { version: '1.0-lite', create: create };
})(window);
