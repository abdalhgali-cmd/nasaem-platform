// Final proposal: screenshots at 360/390 + automated layout checks.
// Text zoom here is a SIMULATION (Chromium, root font-size ×1.3, all text in rem).
// It is not a test on an Android device or WebView (system font scale / WebView textZoom).
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright'); // resolved via NODE_PATH (global install)

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, 'screens', 'final');
fs.mkdirSync(path.join(out, 'checks'), { recursive: true });
// SCREENS=home limits the run; TAG=-c keeps earlier screenshots by writing F-home-c-*.png
const screens = (process.env.SCREENS || 'welcome,returning,home,services').split(',');
const TAG = process.env.TAG || '';
const sizes = [[360, 780], [390, 844]];
const MIN_TOUCH = 48;
const log = [];
const say = (s) => { console.log(s); log.push(s); };

// Runs in the page. Scrolls each scroll container through its full height so off-screen items are checked too.
function audit(minTouch) {
  const issues = [];
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.className).trim().replace(/\s+/g, ' ').slice(0, 28);
  if (document.documentElement.scrollWidth > innerWidth) issues.push('page scrolls sideways');

  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const clipsY = (el) => /hidden|clip/.test(getComputedStyle(el).overflowY);
  const clipsX = (el) => /hidden|clip/.test(getComputedStyle(el).overflowX);
  const scrolls = (el) => /auto|scroll/.test(getComputedStyle(el).overflowY);
  const app = document.getElementById('app');
  const scrollers = [...app.querySelectorAll('*')].filter(scrolls);
  const seen = new Set();
  let touchCount = 0, smallest = Infinity;

  const pass = () => {
    for (const el of app.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
      // own-box overflow (text larger than its box) — horizontal and vertical
      if (hasText(el)) {
        if (el.scrollWidth > el.clientWidth + 1 && !/auto|scroll/.test(cs.overflowX)) issues.push('clipped X: ' + label(el));
        if (el.scrollHeight > el.clientHeight + 1 && clipsY(el)) issues.push('clipped Y: ' + label(el));
        // cut off by an ancestor that hides overflow (scroll containers excluded: their content scrolls into view)
        const r = el.getBoundingClientRect();
        for (let a = el.parentElement; a && a !== app; a = a.parentElement) {
          if (scrolls(a)) break;
          const ar = a.getBoundingClientRect();
          if (clipsY(a) && (r.top < ar.top - 1 || r.bottom > ar.bottom + 1)) { issues.push('cut off vertically by parent: ' + label(el)); break; }
          if (clipsX(a) && (r.left < ar.left - 1 || r.right > ar.right + 1)) { issues.push('cut off horizontally by parent: ' + label(el)); break; }
        }
      }
      // touch targets
      if (el.matches('button, a[href], [data-go], [role="button"], input') && !seen.has(el)) {
        seen.add(el); touchCount++;
        const r = el.getBoundingClientRect();
        smallest = Math.min(smallest, Math.round(Math.min(r.width, r.height)));
        if (r.width < minTouch - 0.5 || r.height < minTouch - 0.5) issues.push(`touch target ${Math.round(r.width)}×${Math.round(r.height)}: ${label(el)}`);
      }
    }
  };
  pass();
  for (const sc of scrollers) {
    for (let y = 0; y < sc.scrollHeight; y += sc.clientHeight / 2) { sc.scrollTop = y; pass(); }
    sc.scrollTop = sc.scrollHeight; pass();
  }
  // last item must sit above the bottom nav when scrolled to the end
  const nav = document.querySelector('.nav'), body = document.querySelector('.body');
  if (nav && body) {
    body.scrollTop = body.scrollHeight;
    const gap = body.lastElementChild.getBoundingClientRect().bottom - nav.getBoundingClientRect().top;
    if (gap > 1) issues.push(`last item hidden behind nav by ${Math.round(gap)}px`);
  }
  for (const sc of scrollers) sc.scrollTop = 0;
  return { issues: [...new Set(issues)], touchCount, smallest };
}

const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
let problems = 0;
say(`NASAEM final design — automated checks (${new Date().toISOString()})`);
say('Zoom 130% = SIMULATED in desktop Chromium (root font-size x1.3). NOT an Android device/WebView test.');
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  for (const zoom of [1, 1.3]) {
    for (const s of screens) {
      await page.goto(pathToFileURL(path.join(dir, 'final.html')).href + (zoom > 1 ? `?zoom=${zoom}` : '') + '#' + s);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900); // entrance animations settle
      const tag = zoom > 1 ? '-zoom130sim' : '';
      await page.screenshot({ path: path.join(zoom > 1 ? path.join(out, 'checks') : out, `F-${s}${TAG}-${w}${tag}.png`) });
      const r = await page.evaluate(audit, MIN_TOUCH);
      if (s === 'home' || s === 'services') {
        await page.evaluate(() => { const b = document.querySelector('.body'); b.scrollTop = b.scrollHeight; });
        await page.screenshot({ path: path.join(out, 'checks', `F-${s}${TAG}-${w}${tag}-bottom.png`) });
      }
      if (s === 'returning') { // simulated tap state
        await page.click('[data-sim]');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(out, 'checks', `F-returning${TAG}-${w}${tag}-tapped.png`) });
        const r2 = await page.evaluate(audit, MIN_TOUCH);
        r.issues.push(...r2.issues.map((x) => 'after tap: ' + x));
        r.touchCount += 1; r.smallest = Math.min(r.smallest, r2.smallest);
      }
      problems += r.issues.length;
      say(`${(s + '-' + w + (zoom > 1 ? ' zoom130(sim)' : '')).padEnd(26)} ${r.issues.length ? 'FAIL ' + r.issues.join(' | ') : 'PASS'}  (touch targets: ${r.touchCount}, smallest side ${r.smallest}px)`);
    }
  }
  await page.close();
}
await browser.close();
say(problems ? `RESULT: ${problems} issue(s)` : 'RESULT: all checks passed');
fs.writeFileSync(path.join(out, 'checks', `run-results${process.env.SCREENS ? '-' + process.env.SCREENS.replace(/,/g, '_') + TAG : ''}.txt`), log.join('\n') + '\n');
process.exitCode = problems ? 1 : 0;
