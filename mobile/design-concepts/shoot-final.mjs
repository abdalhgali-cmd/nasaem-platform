// Final proposal: screenshots at 360/390, plus text-zoom 130% and scrolled-to-bottom checks.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright'); // resolved via NODE_PATH (global install)

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, 'screens', 'final');
fs.mkdirSync(path.join(out, 'checks'), { recursive: true });
const screens = ['welcome', 'returning', 'home', 'services'];
const sizes = [[360, 780], [390, 844]];

const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
let problems = 0;
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  for (const zoom of [1, 1.3]) {
    for (const s of screens) {
      await page.goto(pathToFileURL(path.join(dir, 'final.html')).href + (zoom > 1 ? `?zoom=${zoom}` : '') + '#' + s);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => {
        const issues = [];
        if (document.documentElement.scrollWidth > innerWidth) issues.push('page scrolls sideways');
        for (const el of document.querySelectorAll('#app *')) {
          if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto') issues.push('clipped text: ' + el.textContent.trim().slice(0, 30));
        }
        const sc = document.querySelector('.body,.w,.r'), nav = document.querySelector('.nav');
        if (sc) sc.scrollTop = sc.scrollHeight;
        if (sc && nav) {
          const last = sc.lastElementChild.getBoundingClientRect().bottom, top = nav.getBoundingClientRect().top;
          if (last > top + 1) issues.push(`last item hidden behind nav by ${Math.round(last - top)}px`);
        }
        return issues;
      });
      const tag = zoom > 1 ? `-zoom130` : '';
      // resting screenshot (top), then bottom-scrolled check shot
      await page.evaluate(() => { const sc = document.querySelector('.body,.w,.r'); if (sc) sc.scrollTop = 0; });
      await page.screenshot({ path: path.join(zoom > 1 ? path.join(out, 'checks') : out, `F-${s}-${w}${tag}.png`) });
      if (s === 'home' || s === 'services') {
        await page.evaluate(() => { const sc = document.querySelector('.body'); sc.scrollTop = sc.scrollHeight; });
        await page.screenshot({ path: path.join(out, 'checks', `F-${s}-${w}${tag}-bottom.png`) });
      }
      problems += r.length;
      console.log(`${s}-${w}${tag}`, r.length ? r.join(' | ') : 'ok');
    }
  }
  await page.close();
}
await browser.close();
process.exitCode = problems ? 1 : 0;
