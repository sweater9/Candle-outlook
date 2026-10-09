/* Shared, dependency-free local OHLC import/resampling helpers. */
(function (root) {
  'use strict';
  const intervals = {'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1D':86400000,'1W':604800000};
  function csvRecords(text) {
    const records = []; let row = [], value = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i=0;i<text.length;i++) {
      const c=text[i];
      if(c==='"') { if(quoted && text[i+1]==='"'){value+='"';i++;} else quoted=!quoted; }
      else if(c===',' && !quoted){row.push(value.trim());value='';}
      else if((c==='\n'||c==='\r') && !quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value.trim());if(row.some(Boolean))records.push(row);row=[];value='';}
      else value+=c;
    }
    if(quoted)throw Error('Unclosed quoted CSV field.');
    row.push(value.trim());if(row.some(Boolean))records.push(row);return records;
  }
  function parseCSV(text) {
    const records=csvRecords(text), head=(records.shift()||[]).map(x=>x.toLowerCase()), column=n=>head.indexOf(n);
    const ti=['time','date','timestamp','datetime'].map(column).find(i=>i>=0);
    if(ti===undefined || ['open','high','low','close'].some(n=>column(n)<0))throw Error('CSV needs time/date, open, high, low and close columns.');
    const seen=new Set();
    const data=records.map((cells,i)=>{
      const raw=cells[ti]; let time;
      if(/^\d{10,13}$/.test(raw||'')){const n=Number(raw);time=new Date(raw.length<=10?n*1000:n);}
      else {const iso=/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(raw||'') ? raw.replace(' ','T')+(raw.length>10?'Z':'T00:00:00Z') : raw;time=new Date(iso);}
      const number=n=>{const v=cells[column(n)];if(v==null||v.trim()==='')throw Error(`Row ${i+2}: missing ${n}.`);return Number(v);};
      const r={time,open:number('open'),high:number('high'),low:number('low'),close:number('close'),volume:column('volume')>=0?number('volume'):0};
      if(!Number.isFinite(+time)||![r.open,r.high,r.low,r.close,r.volume].every(Number.isFinite)||r.volume<0||r.low>Math.min(r.open,r.close)||r.high<Math.max(r.open,r.close)||r.low>r.high)throw Error(`Row ${i+2}: invalid timestamp or OHLC/volume values.`);
      if(seen.has(+time))throw Error(`Row ${i+2}: duplicate timestamp.`);seen.add(+time);return r;
    }).sort((a,b)=>a.time-b.time);
    if(data.length<30)throw Error('Please provide at least 30 valid candles.');return data;
  }
  function validateInterval(data, source) {
    const duration=intervals[source];
    if(!duration)throw Error('Choose a supported source interval.');
    const tolerance=duration>=86400000?0.9:1;
    if(data.some((r,i)=>i>0&&+r.time-+data[i-1].time<duration*tolerance))throw Error('CSV timestamps are closer together than the selected source interval. Choose the original CSV interval.');
    return data;
  }
  function resample(data, source, target, {closedOnly=false}={}) {
    const src=intervals[source], dst=intervals[target];
    if(!src||!dst||dst<src||dst%src!==0)throw Error('Cannot create a lower timeframe from these candles.');
    if(src===dst)return data.slice();
    const offset=target==='1W'?4*86400000:0; // Monday 00:00 UTC
    const out=[];
    for(const r of data){const start=Math.floor((+r.time-offset)/dst)*dst+offset;let g=out.at(-1);
      if(!g||+g.time!==start){g={time:new Date(start),open:r.open,high:r.high,low:r.low,close:r.close,volume:r.volume||0};out.push(g);}
      else {g.high=Math.max(g.high,r.high);g.low=Math.min(g.low,r.low);g.close=r.close;g.volume+=r.volume||0;}
    }
    if(closedOnly&&data.length){const first=+data[0].time,lastEnd=+data.at(-1).time+src;return out.filter(r=>+r.time>=first&&+r.time+dst<=lastEnd);}
    return out;
  }
  root.CandleLocal={parseCSV,resample,validateInterval,intervals};
})(globalThis);
