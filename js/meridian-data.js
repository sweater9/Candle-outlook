// Shared pure validation, also used by the browser's Twelve Data connection.
export function proxyOrigin(raw) {
  const url=new URL(raw);
  if(url.username||url.password||url.search||url.hash||!['http:','https:'].includes(url.protocol)||!['','/'].includes(url.pathname))throw Error('Enter a proxy origin without a path, credentials or query.');
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Use HTTPS for a hosted proxy.');
  return url.origin;
}
export function parseSymbols(raw) {
  const symbols=[...new Set(raw.toUpperCase().split(/[\s,]+/).filter(Boolean))];
  if(!symbols.length||symbols.length>8||symbols.some(s=>! /^[A-Z0-9][A-Z0-9./:-]{0,31}$/.test(s)))throw Error('Enter 1–8 valid symbols separated by commas.');
  return symbols;
}
export function validateResponse(payload) {
  if(payload.provider!=='twelvedata')throw Error('Expected Twelve Data candles; no fallback provider is accepted.');
  if(!Array.isArray(payload.candles))throw Error('Missing candle data.');
  const seen=new Set();
  const rows=payload.candles.map(c=>{
    const raw=String(c.time||''), time=new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw+'T00:00:00Z':/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)?raw.replace(' ','T')+'Z':raw);
    const numeric=k=>{if(c[k]==null||String(c[k]).trim()==='')throw Error('Missing OHLC value.');return Number(c[k]);};
    const r={time,open:numeric('open'),high:numeric('high'),low:numeric('low'),close:numeric('close'),volume:Number(c.volume??0)};
    if(!Number.isFinite(+time)||![r.open,r.high,r.low,r.close,r.volume].every(Number.isFinite)||r.volume<0||r.low>Math.min(r.open,r.close)||r.high<Math.max(r.open,r.close)||seen.has(+time))throw Error('Invalid or duplicate candle data.');
    seen.add(+time);return r;
  }).sort((a,b)=>a.time-b.time);
  if(rows.length<30)throw Error('At least 30 daily candles are needed for analysis.');
  return rows;
}
