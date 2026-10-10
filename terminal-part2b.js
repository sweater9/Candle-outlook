function saveWatch(){try{localStorage.setItem('co-watch',JSON.stringify(state.watch));renderWatch()}catch(e){status('Watchlist could not be saved.','err')}}
function renderWatch(){const el=$('#watchlist');el.innerHTML=state.watch.map(s=>`<div class="watchItem ${s===state.ticker?'active':''}" data-sym="${s}"><b>${s}</b><span>load</span></div>`).join('');el.querySelectorAll('.watchItem').forEach(x=>x.onclick=()=>loadSymbol(x.dataset.sym))}
function setActiveTf(){$$('.tf').forEach(b=>{b.classList.toggle('active',b.dataset.tf===state.tf);b.disabled=!!state.imported&&CandleLocal.intervals[b.dataset.tf]<CandleLocal.intervals[state.sourceTf]})}
function renderMTF(){const frames=Object.keys(CandleLocal.intervals);$('#mtf').innerHTML=frames.map(tf=>{const signal=state.mtf[tf]||'—',cls=signal==='BUY'?'buy':signal==='SELL'?'sell':signal==='WAIT'?'wait':'';return `<span class="${cls}">${tf} ${signal}</span>`}).join('')}
function localFrames(){state.mtf={};for(const tf of Object.keys(CandleLocal.intervals)){try{state.mtf[tf]=analyze(CandleLocal.resample(state.imported,state.sourceTf,tf,{closedOnly:true})).signal||'—'}catch{state.mtf[tf]='—'}}renderMTF()}
async function loadSymbol(sym=state.ticker,{quiet=false,mtf=true}={}){
  if(state.offline){status('Offline mode: import CSV or use Demo.','err');return;}
  sym=(sym||'').trim().toUpperCase();if(!sym)return;
  if(!/^[A-Z0-9.^=-]{1,30}$/.test(sym)){status('Use a valid ticker.','err');return;}
  const id=++state.request;state.imported=null;setActiveTf();state.ticker=sym;$('#ticker').value=sym;
  if(!quiet)status(`Loading ${sym} ${state.tf}…`);
  try{
    const result=await fetchMarket(sym,state.tf);if(id!==state.request)return;
    state.data=result.data;state.source=result.provider;state.offset=0;state.view=Math.min(110,state.data.length);
    if(!quiet){setProviderChip(result.provider);status(`${result.provider} · ${state.data.length} candles`,'ok');renderAnalysis();draw();renderWatch();if(mtf)updateMTF(sym,id);}
  }catch(e){if(id!==state.request)return;if(!quiet){useDemo('Demo fallback');status(`Provider unavailable: ${e.message}. Daily demo shown; import CSV for real prices.`,'err');}}
}
async function updateMTF(sym,id=state.request){state.mtf={};renderMTF();for(const tf of Object.keys(CandleLocal.intervals)){if(id!==state.request||state.offline)return;try{const result=tf===state.tf?{data:state.data}:await fetchMarket(sym,tf);if(id!==state.request)return;state.mtf[tf]=analyze(result.data).signal||'—'}catch{state.mtf[tf]='—'}renderMTF();await sleep(90)}}
async function scanWatch(){
  if(state.offline)return;const btn=$('#scanBtn');btn.disabled=true;$('#scanner').textContent='Scanning…';const out=[];
  try{for(let i=0;i<state.watch.length;i+=3){if(state.offline)break;const rows=await Promise.all(state.watch.slice(i,i+3).map(async s=>{try{const r=await fetchMarket(s,state.tf),a=analyze(r.data);return {s,signal:a.signal||'—',conv:a.conv||0}}catch{return {s,signal:'—',conv:0}}}));out.push(...rows);renderScanner(out);await sleep(120)}out.sort((a,b)=>b.conv-a.conv);renderScanner(out)}finally{btn.disabled=state.offline;}
}
function renderScanner(rows){$('#scanner').innerHTML=rows.map(x=>`<div class="scanRow" data-sym="${x.s}"><b>${x.s}</b><b class="${x.signal==='BUY'?'sigBuy':x.signal==='SELL'?'sigSell':'sigWait'}">${x.signal}</b><span>${x.conv?x.conv+'%':'—'}</span></div>`).join('');$('#scanner').querySelectorAll('.scanRow').forEach(x=>x.onclick=()=>loadSymbol(x.dataset.sym))}
function parseCSV(text){return CandleLocal.parseCSV(text)}
$('#csv').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{const rows=CandleLocal.validateInterval(parseCSV(await file.text()),$('#csvInterval').value);state.request++;state.imported=rows;state.sourceTf=$('#csvInterval').value;state.tf=state.sourceTf;state.data=rows;state.ticker=file.name.replace(/\.csv$/i,'').toUpperCase();state.source='CSV';state.offset=0;state.view=Math.min(110,rows.length);$('#ticker').value=state.ticker;setProviderChip('CSV');setActiveTf();localFrames();status(`CSV · ${rows.length} candles`,'ok');renderAnalysis();draw();renderWatch()}catch(error){status(error.message,'err')}finally{e.target.value='';}
};
function useDemo(source='Demo'){state.request++;state.imported=null;state.data=seedData();state.ticker='DEMO';state.tf='1D';state.source=source;state.offset=0;state.view=90;$('#ticker').value='DEMO';setProviderChip(source);setActiveTf();status('Daily demo data · synthetic prices','ok');renderAnalysis();draw();renderWatch();state.mtf={};renderMTF()}
$('#loadTicker').onclick=()=>loadSymbol($('#ticker').value);
$('#ticker').addEventListener('keydown',e=>{if(e.key==='Enter')loadSymbol(e.target.value)});
$('#demo').onclick=()=>useDemo();$('#uploadBtn').onclick=()=>$('#csv').click();$('#scanBtn').onclick=scanWatch;
$('#addWatch').onclick=()=>{let s=prompt('Add ticker to watchlist (e.g. QQQ, GLD, BTC-USD)');if(!s)return;s=s.trim().toUpperCase();if(!/^[A-Z0-9.^=-]{1,30}$/.test(s)){status('Use a valid ticker.','err');return;}if(!state.watch.includes(s)){state.watch.push(s);saveWatch()}};
$$('.tf').forEach(b=>b.onclick=async()=>{
  if(b.disabled)return;const next=b.dataset.tf;
  if(state.imported){const rows=CandleLocal.resample(state.imported,state.sourceTf,next,{closedOnly:true});if(rows.length<30){status('Not enough completed candles for this timeframe (need 30).','err');return;}state.data=rows;state.tf=next;state.offset=0;state.view=Math.min(110,rows.length);setActiveTf();renderAnalysis();draw();status(`CSV · ${rows.length} completed ${next} candles · UTC buckets`,'ok');return;}
  if(state.source.toLowerCase().includes('demo')){status('Demo is daily data. Import CSV for other timeframes.','err');return;}
  state.tf=next;setActiveTf();await loadSymbol(state.ticker);
});
$$('[data-ind]').forEach(b=>b.onclick=()=>{const k=b.dataset.ind;state[k]=!state[k];b.classList.toggle('primary',state[k]);draw()});
canvas.addEventListener("wheel",e=>{e.preventDefault();state.view=Math.max(25,Math.min(state.data.length,state.view+(e.deltaY>0?10:-10)));draw()},{passive:false});canvas.addEventListener("mousedown",e=>{state.drag=true;state.lastX=e.clientX});window.addEventListener("mouseup",()=>state.drag=false);window.addEventListener("mousemove",e=>{let r=canvas.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)state.cross={x:e.clientX-r.left,y:e.clientY-r.top};else state.cross=null;if(state.drag){let dx=e.clientX-state.lastX;if(Math.abs(dx)>8){state.offset=Math.max(0,Math.min(Math.max(0,state.data.length-state.view),state.offset+(dx>0?2:-2)));state.lastX=e.clientX}}draw()});canvas.addEventListener("mouseleave",()=>{if(!state.drag){state.cross=null;draw()}});window.addEventListener("resize",resize);
function sendToAnalysis(){if(!state.data||state.data.length<7){status("Need at least 7 candles to send","err");return}const payload={symbol:state.ticker,interval:state.tf,provider:state.source,candles:state.data.map(d=>({time:d.time instanceof Date?d.time.toISOString():String(d.time),open:d.open,high:d.high,low:d.low,close:d.close,volume:d.volume||0})),savedAt:new Date().toISOString()};try{sessionStorage.setItem(LIVE_CANDLES_KEY,JSON.stringify(payload));localStorage.setItem(LIVE_CANDLES_KEY,JSON.stringify(payload))}catch(e){status("Could not store candles for analysis","err");return}status(`Sent ${payload.candles.length} candles → analysis`,"ok");location.href="index.html?live=1"}
(function initApiBase(){const el=$("#apiBase");if(!el)return;el.value=resolveApiBase();el.addEventListener("change",()=>{const v=el.value.trim().replace(/\/$/,"");if(v){localStorage.setItem("co-api-base",v);status(`API base → ${v}`,"ok")}});const send=$("#sendAnalysis");if(send)send.onclick=sendToAnalysis})();
function applyOffline(){state.offline=$('#offlineMode').checked;state.request++;$('#loadTicker').disabled=state.offline;$('#scanBtn').disabled=state.offline;status(state.offline?'Offline mode · no provider requests · import CSV or Demo':'Online providers enabled. Load a ticker to fetch data.','ok')}
$('#offlineMode').onchange=applyOffline;
renderWatch();useDemo();requestAnimationFrame(resize);applyOffline();
