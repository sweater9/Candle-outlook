/* Cache the local analysis tools after the first successful online visit. */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {
    const el=document.getElementById('localStatus')||document.getElementById('dataStatus');
    if(el)el.textContent+=' · Offline caching unavailable; keep this tab open or retry online.';
  }));
}
