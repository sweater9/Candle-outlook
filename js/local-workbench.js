import { analyzeRows, backtest } from './backtest.js';

export function bootLocalWorkbench({renderResult,live,updateAnalyzeEnabled,readInstrumentSettings}) {
  const $=id=>document.getElementById(id);let data=null,source=null,active=false,generation=0,usingScreenshots=false;
  const status=text=>$('localStatus').textContent=text;
  function shownRows(){const revealed=data.slice(0,Number($('replayPosition').value));return CandleLocal.resample(revealed,source,$('localTarget').value,{closedOnly:true});}
  function draw(rows,result){
    const recent=rows.slice(-60),hi=Math.max(...recent.map(r=>r.high)),lo=Math.min(...recent.map(r=>r.low)),y=p=>20+(hi-p)/(hi-lo||1)*260;
    const x=i=>15+(i+.5)*730/recent.length,w=Math.min(9,500/recent.length);
    let svg=recent.map((r,i)=>{const color=r.close>=r.open?'#36d9a8':'#ff7180';return `<line x1="${x(i)}" x2="${x(i)}" y1="${y(r.high)}" y2="${y(r.low)}" stroke="${color}"/><rect x="${x(i)-w/2}" y="${Math.min(y(r.open),y(r.close))}" width="${w}" height="${Math.max(1,Math.abs(y(r.open)-y(r.close)))}" fill="${color}"/>`;}).join('');
    if(result.levels?.calibrated){for(const [val,label,color] of [[result.levels.supportPrice,'Support','#36d9a8'],[result.levels.resistancePrice,'Resistance','#ff7180'],[result.levels.priceAt(result.plan.stopY),'Stop','#ff7180'],[result.levels.priceAt(result.plan.t1Y),'Target 1','#f5c65d']]){const yy=y(val);if(yy>=5&&yy<=290)svg+=`<line x1="10" x2="750" y1="${yy}" y2="${yy}" stroke="${color}" stroke-dasharray="4 4"/><text x="12" y="${yy-3}" fill="${color}" font-size="10">${label} ${val.toFixed(2)}</text>`;}}
    $('localChart').innerHTML=svg;
  }
  function analyze(){
    if(!active&&(!live.payload||usingScreenshots))return;
    if(!data&&live.payload){live.runLiveOhlcAnalysis(live.payload);return;}
    const rows=shownRows();generation++;$('backtestResult').textContent='';
    const meta={ticker:$('ticker').value.trim()||'CSV',timeframeLabel:$('localTarget').value,volumeContext:$('volumeContext').value,eventRisk:{flagged:$('eventRiskFlag').checked,text:$('eventRiskText').value},account:{size:Number($('accountSize').value),riskPct:Number($('riskPct').value),...readInstrumentSettings()}};
    const {result,geo,volumeContext}=analyzeRows(rows,meta);
    renderResult(result,{...meta,focusTf:meta.timeframeLabel,mtfEntries:[],otherResults:{},geoH:geo.h,volumeContext,provider:'CSV replay'});draw(rows,result);
    const last=rows.at(-1);status(`CSV replay · ${$('replayPosition').value}/${data.length} source candles revealed · ${rows.length} completed ${meta.timeframeLabel} candles · ${last?last.time.toISOString():'no completed candle yet'} · UTC buckets. Future candles are hidden.`);
    $('replayPrev').disabled=Number($('replayPosition').value)<=30;$('replayNext').disabled=Number($('replayPosition').value)>=data.length;$('replayAll').disabled=$('replayNext').disabled;
  }
  $('localCsv').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const next=CandleLocal.validateInterval(CandleLocal.parseCSV(await file.text()),$('localInterval').value);data=next;usingScreenshots=false;source=$('localInterval').value;active=true;$('ticker').value=file.name.replace(/\.csv$/i,'').toUpperCase();$('localTarget').replaceChildren(...Object.keys(CandleLocal.intervals).filter(tf=>CandleLocal.intervals[tf]>=CandleLocal.intervals[source]).map(tf=>{const opt=document.createElement('option');opt.value=tf;opt.textContent=tf;return opt;}));$('localTarget').value=source;$('replayControls').hidden=false;$('replayPosition').max=data.length;$('replayPosition').value=30;$('analyzeBtn').disabled=false;analyze();}catch(e){status(e.message);}finally{e.target.value='';}};
  $('replayPosition').oninput=analyze;$('localTarget').onchange=analyze;
  $('replayPrev').onclick=()=>{$('replayPosition').value=Number($('replayPosition').value)-1;analyze();};
  $('replayNext').onclick=()=>{$('replayPosition').value=Number($('replayPosition').value)+1;analyze();};
  $('replayAll').onclick=()=>{$('replayPosition').value=data.length;analyze();};
  $('useScreenshots').onclick=()=>{active=false;usingScreenshots=true;generation++;$('replayControls').hidden=true;document.querySelector('.liveBanner')?.remove();status('Screenshot mode selected.');updateAnalyzeEnabled();};
  $('backtestRun').onclick=async()=>{
    const id=++generation,btn=$('backtestRun');btn.disabled=true;
    try{const rows=shownRows();if(rows.length<31)throw Error('Reveal at least 31 completed candles before backtesting.');const result=await backtest(rows,{feeBps:Number($('backtestFee').value),slippageBps:Number($('backtestSlip').value),onProgress:(i,n)=>{if(id===generation)$('backtestResult').textContent=`Testing ${i}/${n} candles…`;}});if(id!==generation)return;
      $('backtestResult').textContent=`${result.trades.length} closed trades · ${result.winRate==null?'win rate n/a':(result.winRate*100).toFixed(1)+'% wins'} · ${result.netR.toFixed(2)}R net · expectancy ${result.expectancyR==null?'n/a':result.expectancyR.toFixed(2)+'R'} · max drawdown ${result.maxDrawdownR.toFixed(2)}R · ${result.openPosition?'1 open trade excluded':'no open trade'}. ${result.trades.length<30?'Small sample. ':''}Each R is that trade’s entry-to-stop price risk. Hypothetical results include configured costs; no compounding.`;
    }catch(e){if(id===generation)$('backtestResult').textContent=e.message;}finally{btn.disabled=false;}
  };
  if(live.payload)active=true;
  return {analyze,get active(){return !usingScreenshots&&(active||(!data&&!!live.payload))}};
}
