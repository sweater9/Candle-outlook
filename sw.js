const CACHE='candle-outlook-offline-v6-india';
const ASSETS=['./','manifest.webmanifest','icon.svg','index.html','terminal.html','meridian.html','js/meridian.js','js/meridian-data.js','css/app.css','css/live.css','terminal.css','terminal-live.css','js/app.js','js/journal.js','js/local-data.js','js/local-workbench.js','js/backtest.js','js/screenshot-editor.js','js/live-handoff.js','js/offline.js','js/engine/geometry.js','js/engine/ohlc.js','js/engine/analyze.js','js/engine/structure.js','js/engine/patterns.js','js/engine/indicators.js','js/engine/scoring.js','js/engine/scenario.js','js/engine/mtf.js','terminal-part1.js','terminal-part2a.js','terminal-part2a2.js','terminal-part2b.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('candle-outlook-offline-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url),scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin)return;
  const relative=url.pathname.slice(scope.pathname.length);
  if(!ASSETS.includes(relative)&&relative!=='')return;
  const key=new Request(new URL(relative||'index.html',scope));
  e.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(key);if(cached)return cached;
    return fetch(e.request);
  }));
});
