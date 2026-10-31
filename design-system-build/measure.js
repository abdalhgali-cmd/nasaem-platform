const fs=require('fs');const {chromium}=require('playwright');
(async()=>{const src=fs.readFileSync('harness.js','utf8');
const b=await chromium.launch();for(const theme of ['light','dark']){const p=await b.newPage({viewport:{width:1440,height:900}});
// reuse harness html builder by eval trick
const m=src.match(/function css[\s\S]*?return s\+'\}'\}/)[0];eval(m.replace('function css','global.css=function'));
const t=JSON.parse(fs.readFileSync('nh-ds/project/tokens.json'));
const P='nh-ds/project/';const html=`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${css(theme)}body{margin:0}</style><style>${fs.readFileSync(P+'components/bundle.css','utf8')}</style><script>${fs.readFileSync(P+'components/bundle.js','utf8')}</script></head><body>${fs.readFileSync(P+'components/OperationsCenter/preview.html','utf8')}</body></html>`;
await p.setContent(html,{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);
console.log(theme,await p.evaluate(()=>{const s=document.querySelector('.nh-table-fit');const t=document.querySelector('.nh-table');return [s.clientWidth,t.scrollWidth,document.documentElement.scrollWidth,[...document.querySelectorAll('.nh-table th')].map(x=>Math.round(x.getBoundingClientRect().width)).join(',')]}));}
await b.close()})();
