import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://wistien.com',
  // 不壓縮空白：輸出的 HTML 要跟原本單頁版逐字相同，版面才不會有細微差異。
  compressHTML: false,
  devToolbar: { enabled: false },
});
