# _tools：官網維護工具

這個資料夾不會出現在網站上，只放維護用的腳本。

## 多頁版（Astro）的路徑對照

這個分支已改成 Astro 專案，下面各節的指令是單頁版時期寫的，路徑要這樣換：

| 單頁版 | 多頁版 |
|---|---|
| `../index.html` | 先在 repo 根目錄跑 `npm run build`，再用 `../dist/index.html`（有幾個頁面就列幾個） |
| 字體、圖片輸出到 `..` | 輸出到 `../public` |
| `index.html` 的 `<style>` 開頭四行 `@font-face` | `src/styles/site.css` 開頭四行，路徑要寫成 `/fonts/…`（開頭有斜線） |
| 比對時的「修改後資料夾」 | `../dist` |

網站內容在 `src/`：`layouts/Base.astro` 是全站版型，`components/` 是導覽列、頁尾與浮動按鈕，`pages/` 一個檔案就是一個網址。

## 什麼時候要用

| 你改了什麼 | 要做什麼 |
|---|---|
| 頁面上的文字 | 重跑「字體子集」（沒重跑也不會跑版，只是新字會改從 Google Fonts 補，稍微慢一點） |
| 換了輪播照片、分隔照片、頁尾底圖或 logo | 重跑「圖片」 |
| 改了版面或樣式 | 跑「前後比對」確認沒有跑版 |

## 一次性準備

```bash
cd _tools
npm install                      # puppeteer-core，用本機的 Chrome
python -m venv .venv
.venv/Scripts/python -m pip install fonttools brotli pillow
```

字體原始檔（SIL OFL 授權）放在 `_tools/fontsrc/`，從 Google Fonts 的官方 repo 下載：

- https://github.com/google/fonts/tree/main/ofl/notosanstc → `NotoSansTC[wght].ttf`
- https://github.com/google/fonts/tree/main/ofl/notoseriftc → `NotoSerifTC[wght].ttf`
- https://github.com/google/fonts/tree/main/ofl/cormorantgaramond → `CormorantGaramond[wght].ttf`、`CormorantGaramond-Italic[wght].ttf`

`fontsrc/`、`node_modules/`、`.venv/` 都不進版控（見 `.gitignore`）。

## 字體子集

網站的字體檔只包含頁面實際用到的字，所以從約 2.7 MB 降到約 0.3 MB，字型本身沒有換。

```bash
node chars.js ../index.html > chars.json
.venv/Scripts/python -X utf8 build_fonts.py chars.json fontsrc ..
```

第二個指令會更新 `fonts/*.woff2`，並把新的 `@font-face` 規則寫到 `fonts/fonts.css.txt`。
把 `index.html` 的 `<style>` 開頭那四行 `@font-face` 換成這個檔的內容，再刪掉 `fonts/fonts.css.txt`。

平常網站不會連 Google Fonts。`index.html` 最後有一段備援程式：頁面出現子集沒有的中文字時，才會補載完整的 Google Fonts，所以忘了重跑也不會跑版，只是那次載入會變重。用 `node test_fallback.js ..` 可以測這條備援。

之後有多個頁面時，把每個頁面都列在 `chars.js` 後面即可。

## 圖片

`make_images.py` 從原圖產生 `images/opt/` 裡的 WebP：輪播 960／1280 兩種寬度，分隔照片與頁尾 1024／1600，logo 176／600。

輪播圖的 `sizes` 刻意寫成實際顯示寬度的 1.5 倍，瀏覽器會挑解析度高一級的檔案，照片才會跟原本一樣銳利。量測方法見 `quality_slots.py`。

```bash
.venv/Scripts/python make_images.py <原圖資料夾> ../images/opt
```

原圖檔名要跟 `images/` 裡的一樣（例如 `photo-5.jpg`）。`images/*.jpg` 與 `images/logo.png` 是給不支援 WebP 的舊瀏覽器用的備援，不要刪。

## 前後比對

```bash
node compare.js bytes  <修改前資料夾> <修改後資料夾>          # 傳輸量
node compare.js timing <修改前資料夾> <修改後資料夾>          # 慢速 4G 下的載入時間
node compare.js shots  <修改前資料夾> <修改後資料夾> <輸出>   # 三種裝置逐屏截圖
.venv/Scripts/python -X utf8 diff_shots.py <輸出> <輸出> <差異圖輸出>
```

`diff_shots.py` 的結果裡，差異應該只出現在照片區域。文字區出現差異代表版面位移，要查原因。
