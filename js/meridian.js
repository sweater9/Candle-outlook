import {analyzeRows} from './backtest.js';
import {computeEMA,computeRSI} from './engine/indicators.js';
import {proxyOrigin,parseSymbols,validateResponse,parseIndianQueries,validateIndian} from './meridian-data.js';
const $=s=>document.querySelector(s),cache=new Map();let results=[],selected=null,busy=false,lastRequest=0;
const text=(s,v)=>$(s).textContent=v;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(n)?n.toFixed(2):'—';
const market=()=>$('#market').value,india=()=>market()!=='US',provider=()=>india()?'Indian API':'Twelve Data';
const queries=raw=>india()?parseIndianQueries(raw):parseSymbols(raw);
function show(v){document.querySelectorAll('.view').forEach(e=>e.classList.toggle('on',e.id===v));document.querySelectorAll('nav button').forEach(e=>e.classList.toggle('on',e.dataset.v===v));}
try{$('#apiBase').value=new URLSearchParams(location.search).get('api')||localStorage.getItem('co-api-base')||'https://candle-outlook-proxy.onrender.com';}catch{$('#apiBase').value='https://candle-outlook-proxy.onrender.com';}
function base(){return proxyOrigin($('#apiBase').value.trim());}
function lock(value){busy=value;for(const s of ['#run','#load','#connect','#apiBase','#market'])$(s).disabled=value;}
async function json(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(60000)});let j;try{j=await r.json();}catch{throw Error('Proxy did not return JSON. Check its URL.');}if(!r.ok)throw Error(j.message||j.error||`Proxy HTTP ${r.status}`);return j;}
async function loadData(symbol,history=false){
  const origin=base(),key=origin+'|'+market()+'|'+symbol.toUpperCase()+'|'+history,cached=cache.get(key);if(cached&&Date.now()-cached.at<(india()?3600000:300000))return cached.value;
  let value;
  if(india()){
    const payload=validateIndian(await json(`${origin}/api/india/stock?name=${encodeURIComponent(symbol)}&exchange=${market()}&history=${history?1:0}`),market());
    value={symbol:payload.quote.symbol,query:symbol,price:payload.quote.price,change:payload.quote.change,payload,market:market()};
  }else{
    const wait=Math.max(0,9000-(Date.now()-lastRequest));if(wait)await new Promise(r=>setTimeout(r,wait));lastRequest=Date.now();
    const payload=await json(`${origin}/api/candles?provider=twelvedata&interval=1D&limit=260&symbol=${encodeURIComponent(symbol)}`),rows=validateResponse(payload);
    const {result}=analyzeRows(rows,{ticker:symbol,timeframeLabel:'1D'});if(result.error)throw Error(result.reasonsText||'Analysis failed.');
    const last=rows.at(-1),prev=rows.at(-2);value={symbol,query:symbol,rows,result,price:last.close,change:prev.close?100*(last.close/prev.close-1):null,market:'US'};
  }
  cache.set(key,{at:Date.now(),value});return value;
}
function table(){
  if(!india())results.sort((a,b)=>b.result.conviction-a.result.conviction);
  text('#scanned',results.length);text('#qualified',india()?results.length:results.filter(x=>x.result.decision!=='WAIT').length);text('#topScore',!india()&&results.length?results[0].result.conviction:'—');$('#empty').hidden=!!results.length;
  const headings=india()?['Company','Quote (₹)','Exchange','Source time','Retrieved (IST)']:['Symbol','Close','Change','Decision','Conviction','Bar date'];
  $('#setups').innerHTML='<thead><tr>'+headings.map(h=>`<th>${h}</th>`).join('')+'</tr></thead><tbody>'+results.map((x,i)=>india()?`<tr><td><button class="sym" data-row="${i}">${esc(x.payload.quote.company)}</button></td><td>₹${fmt(x.price)}</td><td>${x.market}</td><td>${esc(x.payload.quote.source_time||'Not supplied')}</td><td>${esc(ist(x.payload.fetched_at))}</td></tr>`:`<tr><td><button class="sym" data-symbol="${esc(x.symbol)}" data-row="${i}">${esc(x.symbol)}</button></td><td>${fmt(x.price)}</td><td>${fmt(x.change)}%</td><td>${esc(x.result.decision)}</td><td>${x.result.conviction}/100</td><td>${x.rows.at(-1).time.toISOString().slice(0,10)}</td></tr>`).join('')+'</tbody>';
}
function ist(date){return new Date(date).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});}
function indicatorRows(rows){$('#ind').innerHTML=rows.map(([k,v])=>`<div class="kv"><span>${esc(k)}</span><span>${fmt(v)}</span></div>`).join('');}
function detail(item){
  selected=item;show('analyze');$('#analysis').hidden=false;$('#symbol').value=item.query;
  text('#name',item.symbol);text('#price',(item.market==='US'?'':'₹')+fmt(item.price));text('#change',item.market==='US'?fmt(item.change)+'%':item.payload.quote.company);
  $('#handoff').disabled=item.market!=='US';text('#handoff',item.market==='US'?'Open full analysis':'Full OHLC required for trade plans');
  if(item.market!=='US'){detailIndia(item);return;}
  text('#analysisNote','Conviction comes from the shared Candle Outlook technical engine. Fundamentals and catalysts are not included.');
  const r=item.result,l=r.levels;
  text('#thesis',`${r.decision} · ${r.bias} bias · ${r.conviction}/100 technical conviction. ${r.noTrade?.reasons?.join(' ')||'Review the full trade plan before making a decision.'}`);
  indicatorRows([['RSI (14, recent 60 bars)',r.indicators.rsi],['EMA 9',r.indicators.emaFast==null?null:-r.indicators.emaFast],['EMA 21',r.indicators.emaSlow==null?null:-r.indicators.emaSlow],['Support',l?.supportPrice],['Resistance',l?.resistancePrice]]);
  text('#asOf',`Twelve Data · daily · last bar ${item.rows.at(-1).time.toISOString().slice(0,10)} (exchange trading date). Latest bar may still be forming. Price is in the instrument's quote currency.`);
  text('#analysisStatus','Loaded Twelve Data candles.');$('#chart').setAttribute('aria-label','Daily candlestick chart');
  const rows=item.rows.slice(-60),hi=Math.max(...rows.map(c=>c.high)),lo=Math.min(...rows.map(c=>c.low)),y=p=>10+(hi-p)/(hi-lo||1)*260;
  $('#chart').innerHTML=rows.map((c,i)=>{const x=10+(i+.5)*740/rows.length,color=c.close>=c.open?'#059669':'#e11d48';return `<line x1="${x}" x2="${x}" y1="${y(c.high)}" y2="${y(c.low)}" stroke="${color}"/><rect x="${x-3}" width="6" y="${Math.min(y(c.open),y(c.close))}" height="${Math.max(1,Math.abs(y(c.open)-y(c.close)))}" fill="${color}"/>`;}).join('');
}
function detailIndia(item){
  const p=item.payload,h=p.history;$('#chart').setAttribute('aria-label',`${item.market} historical price line chart`);
  text('#analysisNote','Indian API supplies price history rather than full OHLC. RSI and EMAs use historical price samples only. Candle patterns, ATR, trade plans and conviction scores require full OHLC and are unavailable here.');
  text('#asOf',`Indian API · ${item.market} · source time: ${p.quote.source_time||'not supplied'} · snapshot retrieved ${ist(p.fetched_at)} IST${p.cached?' (server cache)':''}. Delay unverified; retrieval time is not trade time.${h?` History ends ${h.points.at(-1).date}; ${h.is_weekly?'weekly':'provider price'} samples.`:''}`);
  if(!h){$('#chart').innerHTML='<text x="30" y="140" fill="#64748b">Price history unavailable; quote loaded.</text>';indicatorRows([]);text('#thesis',p.history_error||'Load analysis to request historical prices.');text('#analysisStatus','Loaded Indian API quote. '+(p.history_error||''));return;}
  const candles=h.points.map(r=>({close:r.price})),rsi=computeRSI(candles).at(-1),ema20=computeEMA(candles,20).at(-1),ema50=computeEMA(candles,50).at(-1);
  indicatorRows([['RSI (14 price samples)',rsi],['EMA 20 (₹)',ema20==null?null:-ema20],['EMA 50 (₹)',ema50==null?null:-ema50]]);
  text('#thesis',`Historical price momentum: ${ema20!=null&&ema50!=null?(-ema20>-ema50?'EMA 20 is above EMA 50.':'EMA 20 is at or below EMA 50.'):'Insufficient samples for both EMAs.'} This describes price history and is not a BUY/SELL trade plan.`);
  const rows=h.points.slice(-120),hi=Math.max(...rows.map(r=>r.price)),lo=Math.min(...rows.map(r=>r.price)),y=v=>20+(hi-v)/(hi-lo||1)*220;
  $('#chart').innerHTML=`<polyline fill="none" stroke="#0284c7" stroke-width="2" points="${rows.map((r,i)=>`${20+i*720/Math.max(1,rows.length-1)},${y(r.price)}`).join(' ')}"/><text x="20" y="270" fill="#64748b">${rows[0].date}</text><text x="630" y="270" fill="#64748b">${rows.at(-1).date}</text>`;
  text('#analysisStatus',`Loaded Indian API quote and ${h.points.length} historical prices.`);
}
async function analyze(symbol){if(busy)return;lock(true);$('#analysis').hidden=true;text('#analysisStatus',`Loading ${provider()}…`);try{const list=queries(symbol);if(list.length!==1)throw Error('Enter one stock.');detail(await loadData(list[0],india()));}catch(e){text('#analysisStatus',e.message);}finally{lock(false);}}
document.addEventListener('click',e=>{const nav=e.target.closest('[data-v],[data-go]');if(nav)show(nav.dataset.v||nav.dataset.go);const row=e.target.closest('[data-row]');if(row&&!busy){const item=results[Number(row.dataset.row)];if(item.market==='US')detail(item);else{show('analyze');analyze(item.query);}}});
$('#connect').onclick=async()=>{if(busy)return;lock(true);text('#connection','Checking proxy…');try{const origin=base(),health=await json(origin+'/api/health'),key=india()?'indianapi':'twelvedata';if(!health.ok||!health.providers?.[key])throw Error(`Proxy needs ${india()?'INDIANAPI_API_KEY':'TWELVEDATA_API_KEY'} configured on its server${india()?' and the latest deployment':''}.`);try{localStorage.setItem('co-api-base',origin);}catch{}text('#connection',`${provider()} is configured on the proxy. Ready to scan. Authentication is verified when a stock is loaded.`);}catch(e){text('#connection',e.message);}finally{lock(false);}};
$('#run').onclick=async()=>{if(busy)return;let symbols;try{base();symbols=queries($('#symbols').value);}catch(e){text('#scanOut',e.message);return;}lock(true);results=[];table();const failures=[];try{for(const[i,symbol]of symbols.entries()){text('#scanOut',`Loading ${symbol} · ${i+1}/${symbols.length}…`);try{results.push(await loadData(symbol));table();}catch(e){failures.push(`${symbol}: ${e.message}`);break;}}text('#scanOut',`Loaded ${results.length}/${symbols.length}. ${failures.join(' ')}${failures.length?' Scan stopped to avoid further failing requests.':''}`);}finally{lock(false);}};
$('#load').onclick=()=>analyze($('#symbol').value);
$('#handoff').onclick=()=>{if(!selected||selected.market!=='US')return;try{sessionStorage.setItem('co-live-candles',JSON.stringify({symbol:selected.symbol,interval:'1D',provider:'Twelve Data',candles:selected.rows}));location.href='index.html';}catch{text('#analysisStatus','Unable to save the analysis handoff in this browser.');}};
$('#market').onchange=()=>{
  results=[];selected=null;$('#analysis').hidden=true;$('#symbols').value=india()?'RELIANCE, TCS, INFY':'AAPL, MSFT, NVDA';$('#symbol').value=india()?'RELIANCE':'AAPL';
  text('#providerLabel',provider());text('#providerNote',india()?'Quote snapshots & price history':'Daily candles');text('#qualifiedLabel',india()?'Quotes loaded':'Directional Setups');text('#qualifiedNote',india()?'Selected exchange':'BUY or SELL engine decision');text('#scoreLabel',india()?'OHLC scoring':'Top Conviction');text('#scoreNote',india()?'Requires full candles':'Technical engine · /100');text('#symbolsLabel',india()?'Company names or symbols (up to 8)':'Symbols (up to 8)');text('#symbolLabel',india()?'Company name or symbol':'Symbol');
  text('#marketNote',india()?`India · ${market()} · ₹ INR. Look up provider-supported stocks by company name or symbol. Delay unverified; not a tick stream.`:'US: daily OHLC analysis.');
  text('#scanNote',india()?'Free plan: 500 requests/month. Each uncached scan stock costs 1 request; analysis adds 1 history request. Server caches quotes for 1 hour and history for 24 hours, and allows at most 12 upstream requests/day per running process. No background refresh.':'One request per US symbol, paced 9 seconds apart. Results use a 5-minute local cache.');
  text('#connection','Check connection for the selected market.');text('#scanOut','Ready to scan.');text('#analysisStatus','Select a scan result or enter a stock.');table();
};
table();
