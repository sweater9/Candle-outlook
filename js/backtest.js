import { ohlcToGeometry } from './engine/ohlc.js';
import { runAnalysis } from './engine/analyze.js';

export function analyzeRows(rows, meta={}) {
  const geo=ohlcToGeometry(rows);
  const recent=rows.slice(-5),prior=rows.slice(-20,-5);
  const avg=a=>a.reduce((n,r)=>n+(r.volume||0),0)/Math.max(1,a.length);
  const ratio=avg(prior)>0?avg(recent)/avg(prior):null;
  const volumeContext=meta.volumeContext&&meta.volumeContext!=='unknown'?meta.volumeContext:ratio==null?'unknown':ratio>1.25?'expanding':ratio<0.8?'contracting':'average';
  const result=runAnalysis({candles:geo.candles,quality:geo.quality,ticker:meta.ticker||'CSV',timeframeLabel:meta.timeframeLabel||'1D',calibration:{highPrice:geo.highPrice,lowPrice:geo.lowPrice,topY:40,bottomY:960},volumeContext,eventRisk:meta.eventRisk||{flagged:false},account:meta.account});
  return {result,geo,volumeContext};
}

// Pure execution rules are exposed for tests and explicit same-bar policy.
export function exitOnBar(position, bar) {
  const {sign,stop,target}=position;
  const stopped=sign>0?bar.low<=stop:bar.high>=stop;
  const targeted=sign>0?bar.high>=target:bar.low<=target;
  if(stopped){const gap=sign>0?bar.open<=stop:bar.open>=stop;return {price:gap?bar.open:stop,reason:targeted?'both touched · stop first':'stop'};}
  if(targeted)return {price:target,reason:'target'};
  return null;
}
export async function backtest(rows, {feeBps=5,slippageBps=5,onProgress=()=>{}}={}) {
  if(![feeBps,slippageBps].every(v=>Number.isFinite(v)&&v>=0&&v<10000))throw Error('Fees and slippage must be between 0 and 10,000 basis points.');
  if(rows.length>5000)throw Error('Backtests support up to 5,000 revealed candles; import a shorter date range.');
  let position=null,pending=null,equity=0,peak=0,maxDrawdown=0,signals=0;const trades=[];
  const fee=feeBps/10000,slip=slippageBps/10000;
  for(let i=30;i<rows.length;i++) {
    const bar=rows[i];
    if(pending&&!position){const entry=bar.open*(1+pending.sign*slip),risk=pending.sign*(entry-pending.stop),reward=pending.sign*(pending.target-entry);
      if(risk>0&&reward>0)position={...pending,entry,risk,entryTime:bar.time};pending=null;}
    if(position){const exit=exitOnBar(position,bar);if(exit){const price=exit.price*(1-position.sign*slip);const net=position.sign*(price-position.entry)-fee*(Math.abs(price)+Math.abs(position.entry));const r=net/position.risk;equity+=r;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);trades.push({entryTime:position.entryTime,exitTime:bar.time,entry:position.entry,exit:price,r,reason:exit.reason});position=null;}}
    if(!position&&i<rows.length-1){const {result}=analyzeRows(rows.slice(0,i+1));if(!result.error&&result.decision!=='WAIT'&&result.levels?.calibrated){signals++;pending={sign:result.sign,stop:result.levels.priceAt(result.plan.stopY),target:result.levels.priceAt(result.plan.t1Y)};}}
    if(i%100===0){onProgress(i,rows.length);await new Promise(resolve=>setTimeout(resolve,0));}
  }
  return {trades,signals,openPosition:position,netR:equity,maxDrawdownR:maxDrawdown,expectancyR:trades.length?equity/trades.length:null,winRate:trades.length?trades.filter(t=>t.r>0).length/trades.length:null};
}
