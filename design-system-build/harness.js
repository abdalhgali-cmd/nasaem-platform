const fs=require('fs');const {chromium}=require('playwright');
const P='nh-ds/project/';const t=JSON.parse(fs.readFileSync(P+'tokens.json'));
function css(theme){let s=`[data-theme="${theme}"]{`;for(const k of t.color.tokens){let v=typeof k.value==='string'?k.value:(k.value[theme]??k.value.light);v=v.replace(/^\{(.+)\}$/,'var(--$1)');s+=`--${k.name}:${v};`}
for(const k of t.shadow.tokens){s+=`--${k.name}:${typeof k.value==='string'?k.value:k.value[theme]};`}
for(const f of ['spacing','radius','zIndex'])for(const k of t[f].tokens)s+=`--${k.name}:${k.value};`;
for(const [k,v] of Object.entries(t.type.families))s+=`--font-${k}:${v};`;return s+'}'}
(async()=>{const b=await chromium.launch();const [,,name,theme='light',w='1200']=process.argv;
const p=await b.newPage({viewport:{width:+w,height:800}});
const html=`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${css(theme)}body{margin:0}</style><style>${fs.readFileSync(P+'components/bundle.css','utf8')}</style><script>${fs.readFileSync(P+'components/bundle.js','utf8')}</script></head><body>${fs.readFileSync(P+'components/'+name+'/preview.html','utf8')}</body></html>`;
p.on('console',m=>console.log('console',m.text()));p.on('pageerror',e=>console.log('ERR',e.message));
await p.setContent(html,{waitUntil:'networkidle'}).catch(()=>{});await p.waitForTimeout(500);
await p.screenshot({path:`shot-${name}-${theme}.png`,fullPage:true});await b.close();})();
