# heimu-panel　黑木村・領主帳本

LunaTalk 卡《邊境的奇蹟》的全面板。一天一回合：清晨派工、白天 3 個行動點、夜裡結算。數字只在這裡算，AI 只照結果敘事。

- `index.html`　面板入口（GitHub Pages 直接提供）
- `core.js`　規則核心（所有數值；Node 也能載入）
- `ui.js`　介面與載入器溝通
- `store.js`　存檔（IndexedDB，退回 localStorage）
- `loader/host_v1.0.js`　貼進卡片版面規則的載入器
- `test/core_test.js`　`node test/core_test.js`
- `test/e2e.py`　`python test/e2e.py`（要 Playwright 與 Chrome）

版本：面板 2.1.0／規則 2.1.0／載入器 1.0
