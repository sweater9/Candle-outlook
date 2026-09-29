/* Compatibility stub: loads split terminal parts in order. */
(function(){
  var parts=['terminal-part1.js','terminal-part2a.js','terminal-part2b.js'];
  function next(i){
    if(i>=parts.length)return;
    var s=document.createElement('script');
    s.src=parts[i];
    s.onload=function(){next(i+1)};
    document.head.appendChild(s);
  }
  next(0);
})();
