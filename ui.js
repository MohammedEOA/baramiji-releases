'use strict';
/* Shared visual pieces: line icons (24px grid, stroke = currentColor) and progress rings. */
const ICONS={
 today:'<path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
 calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="8.5" cy="14.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none"/>',
 programs:'<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8.5h8M8 12.5h8M8 16.5h5"/>',
 goals:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
 reports:'<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
 swap:'<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
 x:'<path d="M6 6l12 12M18 6 6 18"/>',
 back:'<path d="m9 6 6 6-6 6"/>',
 next:'<path d="m15 6-6 6 6 6"/>',
 up:'<path d="m6 15 6-6 6 6"/>',
 down:'<path d="m6 9 6 6 6-6"/>',
 bell:'<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
 cloud:'<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.6A3.8 3.8 0 0 1 17.5 18.5z"/>',
 shield:'<path d="M12 3.5 19 6v6c0 4.2-3 7.4-7 8.5-4-1.1-7-4.3-7-8.5V6z"/><path d="m9 12 2 2 4-4"/>',
 spark:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
 edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
 pause:'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
 play:'<path d="M7 5v14l12-7z"/>',
 trash:'<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
 alert:'<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
 download:'<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
 print:'<path d="M7 9V4h10v5M7 17H4.5V10a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v7H17M7 14h10v6H7z"/>',
 star:'<path d="M12 2.8 14.6 9.2 21.2 9.8 16.2 14.3 17.7 20.8 12 17.4 6.3 20.8 7.8 14.3 2.8 9.8 9.4 9.2z"/>',
 pin:'<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 1 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
 flame:'<path d="M12 21c-3.6 0-6-2.5-6-5.8 0-3.4 2.6-5.3 3.6-8.7 2.4 1.5 3 3.6 3 5.3 1-.7 1.7-2 1.8-3.3 2 1.6 3.6 4.1 3.6 6.7 0 3.3-2.4 5.8-6 5.8z"/>',
 plane:'<path d="M10.5 13.5 3 11l1.5-1.5 8 .5 4.5-4.5a1.8 1.8 0 0 1 2.5 2.5L15 12.5l.5 8L14 22l-2.5-7.5L8 18v2.5L6.5 22 5 19l-3-1.5L3.5 16H6z"/>',
 share:'<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>',
 trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M10 17h4v3.5h-4z"/>',
 wave:'<path d="M3 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 3 2M3 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 3 2M12 3v6M9 6l3 3 3-3"/>',
 bulb:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
 moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
 book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
 leaf:'<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-4 6-6 9-7"/>',
 heart:'<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
 chat:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
 case:'<rect x="3.5" y="7" width="17" height="12.5" rx="2.5"/><path d="M9 7V5h6v2M3.5 12.5h17"/>',
 users:'<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><path d="M16 5.6a3 3 0 0 1 0 5.8M18 14.8c1.6.7 2.6 2.4 3 4.7"/>',
 cap:'<path d="M2.5 9 12 5l9.5 4-9.5 4z"/><path d="M6.5 11v4.5c1.5 1.5 3.4 2.3 5.5 2.3s4-.8 5.5-2.3V11M21.5 9v5"/>',
 dumbbell:'<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
 brain:'<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 2.5 2.5 2.5 0 0 0 3-2.5v-11A2.5 2.5 0 0 0 9 4.5zM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 2.5 2.5 2.5 0 0 1-3-2.5"/>'
};
function ic(name,cls=''){return '<svg class="ic '+cls+'" viewBox="0 0 24 24" aria-hidden="true">'+(ICONS[name]||'')+'</svg>'}
/* Circular progress: pct 0..100, label in the middle. */
function ring(pct,label='',size=64,cls=''){
 const r=(size-8)/2,c=2*Math.PI*r,p=Math.max(0,Math.min(100,pct||0));
 return '<div class="ring '+cls+'" style="width:'+size+'px;height:'+size+'px"><svg viewBox="0 0 '+size+' '+size+'" aria-hidden="true"><circle cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" class="track"/><circle cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" class="fill" stroke-dasharray="'+(c*p/100).toFixed(1)+' '+c.toFixed(1)+'" transform="rotate(-90 '+size/2+' '+size/2+')"/></svg><b>'+label+'</b></div>';
}
/* A stable soft colour per category, so programs of one field look alike. */
function hue(text){let h=0;for(const ch of String(text||''))h=(h*31+ch.codePointAt(0))%360;return h}
function catDot(cat){return '<i class="cat" style="--h:'+hue(cat)+'"></i>'}
function catIcon(cat){const c=String(cat||'');return /قرآن|القرآن|حفظ|تلاوة/.test(c)?'book':/شرع|علوم|فقه|حديث/.test(c)?'star':/رياض|تمرين|لياق/.test(c)?'dumbbell':/تغذي|أكل|وجب/.test(c)?'leaf':/صح/.test(c)?'heart':/تواصل|اجتماع|أسر|صلة/.test(c)?'users':/ترب|أبناء|أولاد/.test(c)?'cap':/لغ|إنجليز/.test(c)?'chat':/مهني|عمل|تطوير|PMP/i.test(c)?'case':'spark'}
const nf=new Intl.NumberFormat('ar-SA-u-nu-latn');const n=v=>nf.format(v);
/* Numbers are Western (1 2 3) everywhere by default; «١ ٢ ٣» is a setting, applied to the shown text only. */
function localDigits(root){if(typeof db==='undefined'||db.cfg?.digits!=='arab'||!root)return;const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);for(let t=w.nextNode();t;t=w.nextNode()){if(/[0-9]/.test(t.data)&&!t.parentElement?.closest('input,textarea,[dir=ltr],.ltr'))t.data=t.data.replace(/[0-9]/g,d=>String.fromCharCode(0x660+ +d))}}
