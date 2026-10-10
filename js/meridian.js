import {analyzeRows} from './backtest.js';
import {proxyOrigin,parseSymbols,validateResponse} from './meridian-data.js';
const $=s=>document.querySelector(s), cache=new Map();let results=[],selected=null,busy=false,lastRequest=0;
const text=(s,v)=>$(s).textContent=v;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(n)?n.toFixed(2):'—';
function show(v){document.querySelectorAll('.view').forEach(e=>e.classList.toggle('on',e.id===v));document.querySelectorAll('nav button').forEach(e=>e.classList.toggle('on',e.dataset.v===v));}
try{$('#apiBase').value=new URLSearchParams(location.search).get('api')||localStorage.getItem('co-api-base')||'';}catch{}
function base(){return proxyOrigin($('#apiBase').value.trim());}
function lock(value){busy=value;for(const s of ['#run','#load','#connect','#apiBase'])$(s).disabled=value;}
async function json(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});let j;try{j=await r.json();}catch{throw Error('Proxy did not return JSON. Check its URL.');}if(!r.ok)throw Error(j.message||j.error||`Proxy HTTP ${r.status}`);return j;}
async function candles(symbol){
  const origin=base(),key=origin+'|'+symbol,cached=cache.get(key);if(cached&&Date.now()-cached.at<300000)return cached.value;
  const wait=Math.max(0,9000-(Date.now()-lastRequest));if(wait)await new Promise(r=>setTimeout(r,wait));lastRequest=Date.now();
  const payload=await json(`${origin}/api/candles?provider=twelvedata&interval=1D&limit=260&symbol=${encodeURIComponent(symbol)}`),rows=validateResponse(payload);
  const {result}=analyzeRows(rows,{ticker:symbol,timeframeLabel:'1D'});if(result.error)throw Error(result.reasonsText||'Analysis failed.');
  const last=rows.at(-1),prev=rows.at(-2),value={symbol,rows,result,price:last.close,change:prev.close?100*(last.close/prev.close-1):null};cache.set(key,{at:Date.now(),value});return value;
}
function table(){
  results.sort((a,b)=>b.result.conviction-a.result.conviction);
  text('#scanned',results.length);text('#qualified',results.filter(x=>x.result.decision!=='WAIT').length);text('#topScore',results.length?results[0].result.conviction:'—');$('#empty').hidden=!!results.length;
  $('#setups').innerHTML='<thead><tr><th>Symbol</th><th>Close</th><th>Change</th><th>Decision</th><th>Conviction</th><th>Bar date</th></tr></thead><tbody>'+results.map(x=>`<tr><td><button class="sym" data-symbol="${esc(x.symbol)}">${esc(x.symbol)}</button></td><td>${fmt(x.price)}</td><td>${fmt(x.change)}%</td><td>${esc(x.result.decision)}</td><td>${x.result.conviction}/100</td><td>${x.rows.at(-1).time.toISOString().slice(0,10)}</td></tr>`).join('')+'</tbody>';
}
function detail(item){
  selected=item;show('analyze');$('#analysis').hidden=false;$('#symbol').value=item.symbol;
  text('#name',item.symbol);text('#price',fmt(item.price));text('#change',fmt(item.change)+'%');
  const r=item.result,l=r.levels;
  text('#thesis',`${r.decision} · ${r.bias} bias · ${r.conviction}/100 technical conviction. ${r.noTrade?.reasons?.join(' ')||'Review the full trade plan before making a decision.'}`);
  const indicators=[['RSI (14, recent 60 bars)',r.indicators.rsi],['EMA 9',r.indicators.emaFast==null?null:-r.indicators.emaFast],['EMA 21',r.indicators.emaSlow==null?null:-r.indicators.emaSlow],['Support',l?.supportPrice],['Resistance',l?.resistancePrice]];
  $('#ind').innerHTML=indicators.map(([k,v])=>`<div class="kv"><span>${k}</span><span>${fmt(v)}</span></div>`).join('');
  text('#asOf',`Twelve Data · daily · last bar ${item.rows.at(-1).time.toISOString().slice(0,10)} (exchange trading date). Latest bar may still be forming. Price is in the instrument's quote currency.`);
  text('#analysisStatus','Loaded Twelve Data candles.');
  const rows=item.rows.slice(-60),hi=Math.max(...rows.map(c=>c.high)),lo=Math.min(...rows.map(c=>c.low)),y=p=>10+(hi-p)/(hi-lo||1)*260;
  $('#chart').innerHTML=rows.map((c,i)=>{const x=10+(i+.5)*740/rows.length,color=c.close>=c.open?'#059669':'#e11d48';return `<line x1="${x}" x2="${x}" y1="${y(c.high)}" y2="${y(c.low)}" stroke="${color}"/><rect x="${x-3}" width="6" y="${Math.min(y(c.open),y(c.close))}" height="${Math.max(1,Math.abs(y(c.open)-y(c.close)))}" fill="${color}"/>`;}).join('');
}
document.addEventListener('click',e=>{const nav=e.target.closest('[data-v],[data-go]');if(nav)show(nav.dataset.v||nav.dataset.go);const row=e.target.closest('[data-symbol]');if(row)detail(results.find(r=>r.symbol===row.dataset.symbol));});
$('#connect').onclick=async()=>{if(busy)return;lock(true);text('#connection','Checking proxy…');try{const origin=base(),health=await json(origin+'/api/health');if(!health.ok||!health.providers?.twelvedata)throw Error('Proxy needs TWELVEDATA_API_KEY configured on its server.');try{localStorage.setItem('co-api-base',origin);}catch{}text('#connection','Twelve Data is configured on the proxy. Ready to scan.');}catch(e){text('#connection',e.message);}finally{lock(false);}};
$('#run').onclick=async()=>{if(busy)return;let symbols;try{base();symbols=parseSymbols($('#symbols').value);}catch(e){text('#scanOut',e.message);return;}lock(true);results=[];table();const failures=[];try{for(const [i,symbol]of symbols.entries()){text('#scanOut',`Loading ${symbol} · ${i+1}/${symbols.length}…`);try{results.push(await candles(symbol));table();}catch(e){failures.push(`${symbol}: ${e.message}`);break;}}text('#scanOut',`Loaded ${results.length}/${symbols.length}. ${failures.join(' ')}${failures.length?' Scan stopped to avoid further failing requests.':''}`);}finally{lock(false);}};
$('#load').onclick=async()=>{if(busy)return;lock(true);$('#analysis').hidden=true;text('#analysisStatus','Loading Twelve Data…');try{const symbols=parseSymbols($('#symbol').value);if(symbols.length!==1)throw Error('Enter one symbol.');detail(await candles(symbols[0]));}catch(e){text('#analysisStatus',e.message);}finally{lock(false);}};
$('#handoff').onclick=()=>{if(!selected)return;try{sessionStorage.setItem('co-live-candles',JSON.stringify({symbol:selected.symbol,interval:'1D',provider:'Twelve Data',candles:selected.rows}));location.href='index.html';}catch{text('#analysisStatus','Unable to save the analysis handoff in this browser.');}};
table();
