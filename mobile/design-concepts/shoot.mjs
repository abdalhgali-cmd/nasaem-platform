// Renders each concept screen at 360px and 390px → screens/*.png (design review only).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // resolved via NODE_PATH (global install)
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const concepts = ['a', 'b', 'c'];
const screens = ['welcome', 'home', 'services', 'returning'];
const sizes = [[360, 780], [390, 844]];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  for (const c of concepts) {
    for (const s of screens) {
      await page.goto(pathToFileURL(path.join(dir, `concept-${c}.html`)).href + '#' + s);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200); // let entrance animations settle
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family));
      await page.screenshot({ path: path.join(dir, 'screens', `${c.toUpperCase()}-${s}-${w}.png`) });
      console.log(`${c}-${s}-${w}`, overflow ? 'OVERFLOW' : 'ok', [...new Set(fonts)].join(','));
    }
  }
  await page.close();
}
await browser.close();
