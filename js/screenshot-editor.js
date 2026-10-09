import {extractCandles} from './engine/geometry.js';

export function attachEditor(slot, tile, cv) {
  slot.options={crop:{left:4,right:94,top:4,bottom:90}};
  slot.excluded=[];slot.anchors=[];slot.geo=null;
  const controls=document.createElement('details');controls.className='chartEditor';
  controls.innerHTML=`<summary>Adjust chart reading</summary>
    <p class="microNote">Crop to the candle panel to exclude volume bars, legends and indicators. Values are percentages of the image.</p>
    <div class="fields">${['left','right','top','bottom'].map(k=>`<div class="field"><label>Crop ${k}<input data-crop="${k}" type="number" min="0" max="100" value="${slot.options.crop[k]}"></label></div>`).join('')}</div>
    <label class="checkRow"><input type="checkbox" class="customColors"> Choose candle colors</label>
    <div class="fields"><label>Bullish <input class="upColor" type="color" value="#36d9a8"></label><label>Bearish <input class="downColor" type="color" value="#ff7180"></label></div>
    <div class="actions"><button class="btn tiny secondary detect" type="button">Preview detected candles</button><button class="btn tiny secondary anchors" type="button">Pick two price references</button><button class="btn tiny secondary restore" type="button">Reset adjustments</button><button class="btn tiny secondary replace" type="button">Replace image</button></div>
    <p class="microNote editorHint" role="status">Preview detection, then click a candle to remove a false detection. Price references: click the higher axis mark, then the lower mark; enter their prices below.</p>`;
  tile.append(controls);
  const hint=controls.querySelector('.editorHint');
  slot.extract=()=>{
    const crop={};controls.querySelectorAll('[data-crop]').forEach(el=>crop[el.dataset.crop]=Number(el.value));
    if(Object.values(crop).some(v=>!Number.isFinite(v)||v<0||v>100)||crop.left>=crop.right||crop.top>=crop.bottom)throw Error('Crop edges must be between 0 and 100, with left < right and top < bottom.');
    slot.options={crop,colors:controls.querySelector('.customColors').checked?{up:controls.querySelector('.upColor').value,down:controls.querySelector('.downColor').value}:null};
    const geo=extractCandles(slot.img,cv,slot.options);
    geo.candles=geo.candles.filter(c=>!slot.excluded.some(x=>Math.abs(x-c.x)<3));slot.geo=geo;return geo;
  };
  slot.preview=()=>{
    const geo=slot.geo;if(!geo)return;
    const rect=slot.img.getBoundingClientRect(),box=slot.drop.getBoundingClientRect();
    const sx=rect.width/geo.w,sy=rect.height/geo.h,left=rect.left-box.left,top=rect.top-box.top;
    slot.overlay.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
    slot.overlay.innerHTML=geo.candles.map(c=>`<rect x="${left+c.x1*sx}" y="${top+c.top*sy}" width="${Math.max(2,(c.x2-c.x1)*sx)}" height="${Math.max(2,c.range*sy)}" fill="none" stroke="#74b8ff" stroke-width="1"/>`).join('')+slot.anchors.map((v,i)=>`<line x1="${left}" x2="${left+rect.width}" y1="${top+v*rect.height/100}" y2="${top+v*rect.height/100}" stroke="#f5c65d"/><text x="${left+5}" y="${top+v*rect.height/100-3}" fill="#f5c65d" font-size="11">Reference ${i+1}</text>`).join('');
  };
  let mode='';
  const detect=()=>{try{if(!slot.img.naturalWidth)throw Error('Upload an image first.');slot.extract();slot.preview();mode='remove';hint.textContent=`${slot.geo.candles.length} candles detected. Click a false detection to remove it; reset to restore.`;}catch(e){hint.textContent=e.message;}};
  controls.querySelector('.detect').onclick=detect;
  controls.querySelector('.anchors').onclick=()=>{if(!slot.img.naturalWidth){hint.textContent='Upload an image first.';return}slot.anchors=[];mode='anchors';hint.textContent='Click the higher price-axis mark, then the lower mark.';};
  controls.querySelector('.restore').onclick=()=>{slot.excluded=[];slot.anchors=[];controls.querySelector('.customColors').checked=false;controls.querySelectorAll('[data-crop]').forEach(el=>el.value={left:4,right:94,top:4,bottom:90}[el.dataset.crop]);detect();};
  controls.querySelector('.replace').onclick=()=>slot.fileInput.click();
  controls.addEventListener('change',()=>{slot.excluded=[];slot.geo=null;slot.overlay.innerHTML='';});
  slot.drop.addEventListener('click',e=>{
    if(!mode||!slot.img.naturalWidth)return;
    const rect=slot.img.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)return;
    if(mode==='anchors'){
      const y=(e.clientY-rect.top)/rect.height*100;
      if(slot.anchors.length===1&&y<=slot.anchors[0]){hint.textContent='The lower reference must be below the higher one.';return;}
      slot.anchors.push(y);if(!slot.geo)slot.extract();slot.preview();
      if(slot.anchors.length===2){mode='';hint.textContent='References selected. Enter their prices in the two calibration fields below.';}
    }else if(slot.geo){const x=(e.clientX-rect.left)/rect.width*slot.geo.w;const c=slot.geo.candles.find(c=>x>=c.x1-2&&x<=c.x2+2);if(c){slot.excluded.push(c.x);detect();}}
  });
}
