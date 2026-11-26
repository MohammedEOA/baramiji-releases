'use strict';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>iso(new Date()),uid=()=>crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
const fmt=(a,o)=>new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',o).format(new Date(a)),clock=a=>fmt(a,{hour:'numeric',minute:'2-digit'}),full=a=>fmt(a,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const initial=()=>({v:1,ps:[],logs:{},blocks:[],goals:[],cfg:{method:'UmmAlQura',city:'جدة',lat:21.49,lon:39.19,open:'00:00',close:'23:59',theme:'system',morning:'07:00',notify:true,summary:true,reasons:[]}});
let saveFailed=false,loadError=false,update=null;
function loadDb(){
 let raw='';
 if(window.Phone){try{raw=Phone.loadData()||''}catch{raw='\u0000read-error'}}
 if(raw==='\u0000read-error'){loadError=true;return initial()}
 if(!raw){try{raw=localStorage.getItem('baramiji-v1')||''}catch{}}
 if(!raw)return initial();
 try{return migrate(JSON.parse(raw))}catch{loadError=true;return initial()}
}
/* Older data: give every distinct «الهدف الأكبر» text a goal record and link its programs to it. */
function migrate(v){
 v.cfg={...initial().cfg,...v.cfg};v.goals=Array.isArray(v.goals)?v.goals:[];
 for(const p of v.ps||[])if(p.goal&&!p.goalId){let g=v.goals.find(g=>g.name===p.goal);if(!g){g={id:uid(),name:p.goal,mode:'none',from:p.start,unit:'',base:'',target:'',due:'',milestones:[],entries:{}};v.goals.push(g)}p.goalId=g.id}
 return v
}
function persist(v){
 const json=JSON.stringify(v);
 try{
 if(window.Phone){if(!Phone.saveData(json))throw Error('native');try{localStorage.removeItem('baramiji-v1')}catch{}}
 else localStorage.setItem('baramiji-v1',json);
 saveFailed=false;return true
 }catch{saveFailed=true;return false}
}
let db=loadDb(),page='يومي',selected=today(),range='week',rOff=0,month=false,filter='',alarmCache='';
function save(){
 if(loadError){toast('لم تُقرأ بياناتك عند الفتح، لذلك أوقفت الحفظ حتى لا تُستبدل. استعد نسخة احتياطية من الإعدادات.');render();return false}
 const win=checkWins(),ok=persist(db);render();alarms();if(ok)window.queueSync?.();if(win)celebrate(win);return !!ok
}
const builtinReasons={time:'ضيق الوقت',busy:'التزام طارئ',practice:'أحتاج مراجعة',other:'سبب آخر'};
function reasonsMap(){return {'':'—',...builtinReasons,...Object.fromEntries((db.cfg.reasons||[]).map(r=>[r,r]))}}
function reasonLabel(k){return builtinReasons[k]||k||''}
const lineage=p=>p.lineage||p.id;
function localStamp(t){const d=new Date(t);return iso(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function banners(){
 let h='';
 if(loadError)h+='<article class="card alert notice">'+ic('alert')+'<div><b>تعذر قراءة بياناتك المحفوظة.</b><p>أوقفت الحفظ حتى لا تُستبدل. افتح الإعدادات واستعد آخر نسخة احتياطية.</p></div></article>';
 if(saveFailed)h+='<article class="card alert notice">'+ic('alert')+'<div><b>لم يُحفظ آخر تعديل.</b><p>صدّر نسخة احتياطية الآن، ثم أعد فتح التطبيق.</p><div class="actions">'+btn('تصدير نسخة','backup')+'</div></div></article>';
 if(update)h+='<article class="card notice">'+ic('download')+'<div><b>تحديث جديد متاح · '+esc(update.versionName)+'</b><div class="actions">'+btn('تحديث الآن','updatenow',' ','primary')+'</div></div></article>';
 const cloud=typeof auth!=='undefined';
 if(cloud&&!auth&&db.ps.length)h+='<article class="card notice">'+ic('cloud')+'<div><b>احمِ بياناتك من فقد الجوال</b><p>أنشئ حسابًا بإيميلك لتُحفظ بياناتك في السحابة وتعود إليك على أي جوال.</p><div class="actions">'+btn('إنشاء حساب','sync',' ','tonal')+'</div></div></article>';
 else if(cloud&&auth&&syncMessage.startsWith(OTHER))h+='<article class="card alert notice">'+ic('users')+'<div><b>هذا حساب مختلف</b><p>بيانات هذا الجهاز تخص حسابًا آخر، فأوقفت المزامنة حتى تختار ما تريد.</p><div class="actions">'+btn('اختيار','sync',' ','tonal')+'</div></div></article>';
 else if(cloud&&auth&&syncMessage.startsWith('تعارض'))h+='<article class="card alert notice">'+ic('alert')+'<div><b>تعارض في المزامنة</b><p>عُدّل نفس الحقل على جهازين. اختر القيمة التي تبقى.</p><div class="actions">'+btn('فتح المزامنة','sync')+'</div></div></article>';
 if(window.Phone&&db.ps.length&&!(cloud&&!auth)){let b={};try{b=JSON.parse(Phone.backupInfo())}catch{}
 if(!b.folder)h+='<article class="card notice">'+ic('shield')+'<div><b>احمِ سجلك</b><p>اختر مجلدًا يحفظ فيه التطبيق نسخة احتياطية يومية تلقائيًا.</p><div class="actions">'+btn('اختيار مجلد','backupfolder',' ','tonal')+'</div></div></article>';
 else if(b.error)h+='<article class="card alert notice">'+ic('alert')+'<div><b>تعذر حفظ النسخة الاحتياطية اليومية</b><p>'+esc(b.error)+'</p><div class="actions">'+btn('اختيار مجلد آخر','backupfolder')+'</div></div></article>'}
 return h
}
let toastTimer;
function toast(t,undo){const n=$('#notice');/* An open modal dialog sits in the top layer above the page, so the notice moves into it to stay visible. */const host=[...document.querySelectorAll('dialog[open]')].pop()||document.body;if(n.parentElement!==host)host.appendChild(n);clearTimeout(toastTimer);n.textContent=t;localDigits(n);if(undo){const b=document.createElement('button');b.textContent='تراجع';b.className='undo';b.onclick=()=>{undo();n.textContent=''};n.append(' ',b)}toastTimer=setTimeout(()=>{n.textContent=''},undo?6000:3200)}
let dlgParent=null;
function modal(title,html){dlgDirty=false;if(!$('#dialog').open)dlgParent=null;else if($('#body .settings'))dlgParent=setView;$('#dtitle').textContent=title;$('#body').innerHTML=html;localDigits($('#dialog'));if(!$('#dialog').open){$('#dialog').showModal();document.activeElement?.blur?.();$('#body').scrollTop=0}}
function closeD(){dlgParent=null;dlgDirty=false;$('#dialog').close()}
/* Unsaved changes: typing in a form inside the dialog marks it changed; closing or going back first asks to discard. */
let dlgDirty=false;
function guardDirty(go){if(!dlgDirty||!$('#dialog').open){go();return}ask('تجاهل التعديلات؟','لم تحفظ ما غيّرته في هذه النافذة.','تجاهل',true).then(ok=>{if(ok){dlgDirty=false;go()}})}
function requestClose(){guardDirty(closeD)}
document.addEventListener('DOMContentLoaded',()=>{const d=$('#dialog');
 d.querySelector('.dialoghead').addEventListener('submit',e=>{e.preventDefault();requestClose()});
 d.addEventListener('cancel',e=>{e.preventDefault();requestClose()});
 const mark=e=>{if(e.target.closest('#body form'))dlgDirty=true};$('#body').addEventListener('input',mark);$('#body').addEventListener('change',mark)});
/* Android back: sub-setting → settings list → the tab underneath → «يومي» → leave the app. */
function goBack(){
 if($('#dialog').open){guardDirty(()=>{const b=$('#body .sback');if(b){b.click();return}if(dlgParent!==null){const v=dlgParent;dlgParent=null;settings(v);return}closeD()});return true}
 if(page!=='يومي'){page='يومي';render();scrollTo(0,0);return true}
 return false}
/* In-app confirmation, styled like the app (the WebView's own dialog shows the page address). */
function ask(title,text,ok='تأكيد',danger=false){return new Promise(res=>{const d=$('#ask');d.querySelector('h3').textContent=title;d.querySelector('p').textContent=text||'';const y=d.querySelector('.yes');y.textContent=ok;y.className='yes '+(danger?'danger-fill':'primary');localDigits(d);d.returnValue='';d.onclose=()=>res(d.returnValue==='yes');d.showModal()})}
function btn(label,act,id='',cl=''){return '<button class="'+cl+'" data-act="'+act+'" data-id="'+esc(id)+'">'+label+'</button>'}
function opts(values,val){return Object.entries(values).map(([k,v])=>'<option value="'+esc(k)+'" '+(String(val)===k?'selected':'')+'>'+esc(v)+'</option>').join('')}
function input(n,l,t='text',v='',attrs=''){return '<label>'+l+'<input name="'+n+'" type="'+t+'" value="'+esc(v)+'" '+attrs+'></label>'}
function sel(n,l,values,val){return '<label>'+l+'<select name="'+n+'">'+opts(values,val)+'</select></label>'}
function field(n,l,v=''){return '<label>'+l+'<textarea name="'+n+'">'+esc(v)+'</textarea></label>'}
/* Steps as one box per step with «إضافة خطوة». The boxes write into a hidden textarea named steps (one step per line),
   so the forms keep reading steps the same way. Call bindSteps(form) after the textarea holds its starting value. */
function stepsField(l){return '<div class="stepsed"><span class="slabel">'+l+'</span><ol class="steprows"></ol><button type="button" class="addstep ghost">'+ic('plus')+'إضافة خطوة</button><textarea name="steps" hidden></textarea></div>'}
function bindSteps(f){
 const box=f.querySelector('.stepsed'),list=box.querySelector('.steprows'),ta=f.elements.steps;
 const sync=()=>{ta.value=[...list.querySelectorAll('textarea')].map(i=>i.value.trim()).filter(Boolean).join('\n')};
 const row=(v='',focus=false)=>{const li=document.createElement('li');li.innerHTML='<span class="grip" aria-label="اسحب لترتيب الخطوة" title="اسحب لترتيب الخطوة"><svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g></svg></span><textarea rows="1" maxlength="300" placeholder="اكتب الخطوة" aria-label="خطوة"></textarea><button type="button" class="iconbtn" aria-label="حذف الخطوة">'+ic('trash')+'</button>';
  const inp=li.querySelector('textarea');drag(li.firstChild,li);const fit=()=>{inp.style.height='auto';inp.style.height=inp.scrollHeight+2+'px'};inp.value=v;inp.oninput=()=>{if(/\n/.test(inp.value)){inp.value=inp.value.replace(/\n+/g,' ')}fit();sync()};
  inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(inp.value.trim())row('',true)}};
  li.lastChild.onclick=()=>{li.remove();if(!list.children.length)row();sync()};
  list.append(li);requestAnimationFrame(fit);if(focus)inp.focus();localDigits(li);return inp};
 /* Drag a step by its grip (finger or mouse): the row follows the pointer and the others make room. */
 const drag=(grip,li)=>{grip.onpointerdown=e=>{e.preventDefault();li.classList.add('dragging');document.body.classList.add('nosel');getSelection()?.removeAllRanges();
  /* Listen on the document: moving the row in the list would drop a pointer capture on the grip. */
  const move=m=>{const rows=[...list.children].filter(r=>r!==li),after=rows.find(r=>{const b=r.getBoundingClientRect();return m.clientY<b.top+b.height/2});
   if(after){if(li.nextElementSibling!==after)list.insertBefore(li,after)}else if(list.lastElementChild!==li)list.append(li)};
  const end=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',end);li.classList.remove('dragging');document.body.classList.remove('nosel');sync()};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end)}};
 list.innerHTML='';const vals=ta.value.split('\n').map(t=>t.trim()).filter(Boolean);for(const v of vals)row(v);if(!vals.length)row();
 box.querySelector('.addstep').onclick=()=>{const last=list.lastElementChild?.querySelector('textarea');if(last&&!last.value.trim()){last.focus();return}row('',true)};
 sync();
}
function check(n,l,b){return '<label><input type="checkbox" name="'+n+'" '+(b?'checked':'')+'> '+esc(l)+'</label>'}
function form(id,html,label='حفظ'){return '<form id="'+id+'">'+html+'<div class="actions"><button class="primary" type="submit">'+label+'</button></div></form>'}
function ref(id){let [pid,s]=id.split('@');let p=db.ps.find(q=>q.id===pid);return p?item(p,s,db):null}
function hero(title,sub,action=''){return '<div class="pagehead"><div><h1>'+esc(title)+'</h1>'+(sub?'<p>'+esc(sub)+'</p>':'')+'</div>'+(action?'<div class="actions">'+action+'</div>':'')+'</div>'}
const empty=(t,icon='spark')=>'<div class="empty">'+ic(icon)+t+'</div>';
const TABS=[['يومي','today'],['التقويم','calendar'],['برامجي','programs'],['أهدافي','goals'],['التقارير','reports']];
function stateClass(st){return ['مكتمل','مكتمل بعد السماح','أُنجزت في الموعد البديل'].includes(st)?'done':CLOSED.includes(st)?'closed':st==='متأخرة'?'late':st==='ضمن السماح'||st==='في الموعد البديل'?'now':st==='منقولة'?'moved':''}
const pillClass={done:'ok',closed:'bad',late:'late',now:'now',moved:'info'};
function schedText(p){
 const when=p.anchor?(p.offset<0?'قبل أذان ':'بعد أذان ')+prayers[p.anchor]+(p.offset?' بـ'+n(Math.abs(p.offset))+' د':''):clock(time(today(),p.clock));
 const rep=p.repeat==='weekly'&&p.days?.length?(p.days.length===7?'يوميًا':p.days.map(d=>weekdays[d]).join('، ')):p.repeat==='every'?'كل '+n(p.every||2)+' أيام':freq[p.repeat];
 return rep+' · '+when+(p.duration?' · '+n(p.duration)+' د':'');
}
function card(x){
 const r=x.rec,p=x.p,st=status(x),cls=stateClass(st),open=!r.done&&!r.missed;
 return '<article class="card session s-'+cls+'" data-sid="'+esc(x.id)+'"><div class="when"><b>'+clock(x.when).replace(/\s?[صم]$/,'')+'</b><small>'+(new Date(x.when).getHours()<12?'ص':'م')+(p.duration?' · '+n(p.duration)+' د':'')+'</small></div><div class="body"><div class="title"><b>'+esc(p.name)+'</b><span class="pill '+(pillClass[cls]||'')+'">'+st+'</span></div>'
 +'<div class="meta"><span>'+catDot(p.cat)+esc(p.cat)+'</span>'+(iso(new Date(x.when))!==today()?'<span>'+ic('calendar')+fmt(x.when,{weekday:'short',day:'numeric',month:'short'})+'</span>':'')+(r.minutes&&!r.done?'<span>'+ic('clock')+n(r.minutes)+' د منجزة</span>':'')+(r.parts?'<span>'+ic('swap')+'مقسّمة: '+r.parts.map(a=>clock(a.at)).join(' + ')+'</span>':'')+(r.focus&&open?'<span>'+ic('star')+esc(r.focus)+'</span>':'')+(r.mini?'<span>'+ic('check')+'الحد الأدنى</span>':'')+streakChip(p)+'</div>'
 +(open&&p.steps.length>1?checklist(x):'')+'<div class="actions">'+(open?btn(ic('check')+'تم','quickdone',x.id,'primary')+(p.mini?btn('الحد الأدنى','minidone',x.id,'tonal'):'')+btn('تفاصيل','log',x.id)+btn(ic('swap'),'move',x.id,'ghost icononly" aria-label="موعد آخر'):btn(r.done?'عرض السجل':'تعديل','log',x.id,'ghost'))+'</div></div></article>';
}
/* Tick the steps of an open session one by one; the session counts as done when the last step is ticked. */
const openLists=new Set();
function checklist(x){const r=x.rec,p=x.p,on=new Set(r.steps||[]),k=p.steps.filter((_,i)=>on.has(i)).length,show=openLists.has(x.id)||(k>0)||x.s===today()&&Math.abs(Date.now()-x.when)<3*3600e3;
 return '<details class="checklist" data-list="'+esc(x.id)+'"'+(show?' open':'')+'><summary>'+ic('check')+'الخطوات <b>'+n(k)+' من '+n(p.steps.length)+'</b><i class="clbar"><i style="width:'+Math.round(100*k/p.steps.length)+'%"></i></i></summary><div class="clsteps">'+p.steps.map((t,i)=>'<label class="clstep'+(on.has(i)?' on':'')+'"><input type="checkbox" data-act="step" data-id="'+esc(x.id)+'|'+i+'"'+(on.has(i)?' checked':'')+'><span>'+esc(t)+'</span></label>').join('')+'</div></details>'}
let streaks=new Map();
function stk(p){const L=lineage(p);if(!streaks.has(L))streaks.set(L,streak(db,p));return streaks.get(L)}
function streakChip(p){const st=stk(p);return st.count>1?'<span class="streak" title="جلسات متتالية">'+ic('flame')+n(st.count)+'</span>':''}
function greeting(){const h=new Date().getHours();return h<12?'صباح الخير':h<18?'مساء الخير':'مساء النور'}
function todayPage(){
 const s=today(),now=Date.now();let all=items(db,shift(s,-9),s);const seen=new Set(all.map(x=>x.id));
 for(const [id,r] of Object.entries(db.logs))if(r.move&&!seen.has(id)){const x=ref(id);if(x)all.push(x)}
 const list=all.filter(x=>onDay(x,s)).sort((a,b)=>a.when-b.when),pending=all.filter(x=>isOpen(x)&&!onDay(x,s)&&iso(new Date(x.rec.parts?.at(-1)?.at||x.when))<s).sort((a,b)=>a.when-b.when);
 const done=list.filter(isDone),openNow=list.filter(x=>isOpen(x)&&x.when<=now),later=list.filter(x=>isOpen(x)&&x.when>now),rest=list.filter(x=>!isOpen(x)&&!isDone(x)),left=openNow.length+later.length;
 const next=later[0],pct=list.length?100*done.length/list.length:0,best=bestStreak();
 let h='<section class="today">'+ring(pct,n(done.length)+'/'+n(list.length),78)+'<div><p>'+greeting()+'</p><h1>'+(list.length?(!left?(done.length===list.length?'أنجزت جلسات اليوم كلها':'لا جلسات مفتوحة اليوم'):'بقي لك '+n(left)+' من '+n(list.length)+' جلسات'):'يومك خالٍ من الجلسات')+'</h1>'+(next?'<span class="next">'+ic('clock')+'التالية: '+esc(next.p.name)+' · '+clock(next.when)+'</span>':'')+(best&&best.count>1?'<span class="next">'+ic('flame')+esc(best.p.name)+' · '+n(best.count)+' مرة متتالية</span>':'')+(db.cfg.focus&&db.cfg.focusWeek===weekStart(s)?'<span class="next">'+ic('star')+'تركيز الأسبوع: '+esc(db.cfg.focus)+'</span>':'')+'</div></section>'+banners();
 if(!db.ps.length)return h+empty('ابدأ بإضافة برنامجك الأول. اضغط زر ＋ واختر الاسم والموعد فقط، والباقي اختياري.','programs')+'<div class="actions center">'+btn(ic('spark')+'ابدأ بقوالب جاهزة','onboard',' ','primary')+'</div>';
 const away=currentAway();
 if(away)h+='<article class="card notice">'+ic('plane')+'<div><b>'+esc(away.label||'وضع العذر')+' حتى '+fmt(date(away.to),{weekday:'long',day:'numeric',month:'long'})+'</b><p>البرامج متوقفة ولا تُحسب'+((away.keep||[]).length?'، إلا '+n(away.keep.length)+' برامج اخترت أن تستمر':'')+'.</p><div class="actions">'+btn('إنهاء الآن','awayend',away.id,'tonal')+'</div></div></article>';
 if(pending.length>=3)h+='<article class="card welcome">'+ic('wave')+'<div><b>مرحبًا بعودتك</b><p>لم تُسجَّل '+sessionsWord(pending.length)+' منذ '+fmt(date(pending[0].s),{weekday:'long',day:'numeric',month:'short'})+'. لا بأس، المهم أن تكمل من اليوم.</p><div class="actions">'+btn(ic('check')+'سجّل ما أنجزته','welcome',' ','primary')+btn(ic('plane')+'كانت أيام عذر','welcomeaway',pending[0].s,'tonal')+btn('ابدأ من اليوم','welcomeclose',' ','ghost')+'</div></div></article>';
 h+=reviewCard();
 if(openNow.length)h+='<h2>الآن</h2>'+openNow.map(card).join('');
 if(later.length)h+='<h2>القادمة اليوم</h2>'+later.map(card).join('');
 if(!list.length)h+=empty(away?'أنت في وضع العذر. استرح، وسنكون هنا حين تعود.':'لا جلسات مجدولة اليوم. استمتع بيومك.','today');
 if(pending.length&&pending.length<3)h+='<details'+(openNow.length+later.length?'':' open')+'><summary>من أيام سابقة ولم تُسجَّل ('+n(pending.length)+')</summary>'+pending.map(card).join('')+'</details>';
 if(done.length||rest.length)h+='<details><summary>المنجزة والمغلقة اليوم ('+n(done.length+rest.length)+')</summary>'+[...done,...rest].map(card).join('')+'</details>';
 return h+'<div class="actions">'+btn(ic('clock')+'أضف وقت انشغال','block',' ','ghost')+(away?'':btn(ic('plane')+'سفر أو مرض','awaynew',' ','ghost'))+'</div>';
}
const sessionsWord=k=>k===1?'جلسة واحدة':k===2?'جلستان':k<=10?n(k)+' جلسات':n(k)+' جلسة';
function bestStreak(){let b=null;for(const p of db.ps.filter(p=>!p.archived)){const st=stk(p);if(!b||st.count>b.count)b={p,count:st.count}}return b}
function currentAway(s=today()){return (db.cfg.away||[]).find(a=>s>=a.from&&s<=a.to)}
const weekStart=s=>shift(s,-((date(s).getDay()+1)%7));
/* Sessions of the last days that were never logged and are still open: what the welcome-back sheet covers. */
function backlog(){const s=today(),seen=new Set();let all=items(db,shift(s,-9),shift(s,-1));for(const [id,r] of Object.entries(db.logs))if(r.move){const x=ref(id);if(x&&!all.some(y=>y.id===id))all.push(x)}return all.filter(x=>isOpen(x)&&!onDay(x,s)&&iso(new Date(x.rec.parts?.at(-1)?.at||x.when))<s&&!seen.has(x.id)&&seen.add(x.id)).sort((a,b)=>a.when-b.when)}
function welcome(){
 const list=backlog();if(!list.length)return;
 modal('ماذا أنجزت؟','<p class="muted">علّم ما أنجزته فقط، ويُسجَّل بقيم خطتك. الباقي يُغلق بلا لوم.</p>'+form('welcomeForm',list.map(x=>check('w_'+x.id,x.p.name+' · '+fmt(x.when,{weekday:'short',day:'numeric',month:'short'}),false)).join(''),'حفظ وابدأ من اليوم'));
 $('#welcomeForm').onsubmit=e=>{e.preventDefault();const f=e.target;let c=0;for(const x of list){if(f.elements['w_'+x.id]?.checked){recordDone(x,false,x.when);c++}else db.logs[x.id]={...x.rec,closed:Date.now()}}closeD();save();toast(c?'سُجّلت '+n(c)+' جلسات. أهلًا بعودتك':'أهلًا بعودتك، نبدأ من اليوم')};
}
function programsPage(){
 const active=db.ps.filter(p=>!p.archived),stopped=db.ps.filter(p=>p.archived&&!p.replacedBy);
 const groups=new Map();for(const p of active){const k=p.goal||'';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p)}
 let h=hero('برامجي',active.length?n(active.length)+' برامج نشطة':'البرامج الدورية التي تبني أهدافك',btn(ic('brain')+'المساعد','assistant',' ','tonal'));
 if(!active.length)h+=empty('أضف برنامجًا مثل «ورد الحفظ بعد الفجر» أو «تمرين 3 أيام في الأسبوع».','programs');
 for(const [goal,ps] of [...groups].sort((a,b)=>!a[0]-!b[0])){
 if(groups.size>1||goal)h+='<h2>'+(goal?ic('goals')+' '+esc(goal):'بلا هدف')+'</h2>';
 h+=ps.map(p=>'<article class="card prog"><div class="badge" style="--h:'+hue(p.cat)+'">'+ic(catIcon(p.cat))+'</div><div class="body"><b>'+esc(p.name)+'</b><div class="meta"><span>'+esc(p.cat)+'</span><span>'+ic('clock')+esc(schedText(p))+'</span>'+(p.kind?'<span>'+esc(kinds[p.kind].label)+'</span>':'')+(p.steps.length?'<span>'+n(p.steps.length)+' خطوات</span>':'')+'</div><div class="actions">'+btn(ic('edit')+'تعديل','edit',p.id,'ghost')+btn(ic('pause')+'إيقاف','archive',p.id,'ghost')+'</div></div></article>').join('');
 }
 if(stopped.length)h+='<details><summary>البرامج الموقوفة ('+n(stopped.length)+')</summary>'+stopped.map(p=>'<article class="card prog"><div class="badge" style="--h:'+hue(p.cat)+'">'+ic(catIcon(p.cat))+'</div><div class="body"><b>'+esc(p.name)+'</b><div class="meta"><span>أُوقف في '+esc(p.end||'')+'</span></div><div class="actions">'+btn(ic('play')+'استئناف من الغد','resume',p.id,'tonal')+btn(ic('trash')+'حذف نهائي','purge',p.id,'ghost danger')+'</div></div></article>').join('')+'</details>';
 return h;
}
function calendarPage(){
 const base=date(selected),first=new Date(base.getFullYear(),base.getMonth(),1);
 const start=month?iso(first):shift(selected,-((base.getDay()+1)%7)),len=month?new Date(base.getFullYear(),base.getMonth()+1,0).getDate():7,lead=month?(first.getDay()+1)%7:0;
 const scheduled=items(db,start,shift(start,len-1)).filter(x=>!x.rec.move);for(const [id,r] of Object.entries(db.logs))if(r.move){const x=ref(id);if(x)scheduled.push(x)}
 let h='<div class="calnav"><button class="iconbtn" data-act="calstep" data-id="-1" aria-label="السابق">'+ic('back')+'</button><div style="text-align:center"><b>'+fmt(base,{month:'long',year:'numeric'})+'</b><br><small>'+hmonths(start,shift(start,len-1))+'</small></div><button class="iconbtn" data-act="calstep" data-id="1" aria-label="التالي">'+ic('next')+'</button></div>'
 +'<div class="row" style="justify-content:center"><div class="seg">'+btn('أسبوع','calmode','week',month?'':'on')+btn('شهر','calmode','month',month?'on':'')+'</div>'+(selected!==today()?btn('اليوم','day',today(),'ghost'):'')+'</div><div class="days">';
 if(month){for(const d of [6,0,1,2,3,4,5])h+='<small style="text-align:center">'+weekdays[d].slice(0,3)+'</small>';for(let i=0;i<lead;i++)h+='<span></span>'}
 for(let i=0;i<len;i++){const day=shift(start,i),count=scheduled.filter(x=>onDay(x,day)).length;h+=btn((month?'':'<small>'+fmt(date(day),{weekday:'short'})+'</small>')+'<b>'+n(date(day).getDate())+'</b><small>'+hday(day)+'</small>'+(count?'<i></i>':''),'day',day,(day===selected?'sel ':'')+(day===today()?'today':''))}
 h+='</div><h2>'+fmt(base,{weekday:'long',day:'numeric',month:'long'})+' · '+hdate(selected)+'</h2>';
 return h+(scheduled.filter(x=>onDay(x,selected)).sort((a,b)=>a.when-b.when).map(card).join('')||empty('لا جلسات في هذا اليوم.','calendar'));
}
function render(){
 applyKinds(db.cfg);streaks=new Map();
 let sysDark=matchMedia('(prefers-color-scheme:dark)').matches;try{if(window.Phone)sysDark=Phone.night()}catch{}
 const dark=db.cfg.theme==='dark'||(db.cfg.theme==='system'&&sysDark);document.documentElement.dataset.dark=dark;document.querySelector('meta[name=theme-color]')?.setAttribute('content',dark?'#0d1412':'#f5f3ee');
 $('nav').innerHTML=TABS.map(([n,i])=>'<button data-act="page" data-id="'+n+'" class="'+(page===n?'active':'')+'"'+(page===n?' aria-current="page"':'')+'>'+ic(i)+n+'</button>').join('');
 $('#gear').innerHTML=ic('settings');$('#psub').textContent=fmt(date(today()),{weekday:'long',day:'numeric',month:'long'})+' · '+hdate(today());
 const fab={'يومي':['new','إضافة برنامج'],'برامجي':['new','إضافة برنامج'],'التقويم':['new','إضافة برنامج'],'أهدافي':['goalnew','إضافة هدف']}[page];
 $('#fab').hidden=!fab;if(fab){$('#fab').dataset.act=fab[0];$('#fab').setAttribute('aria-label',fab[1]);$('#fab').innerHTML=ic('plus')}
 const h=page==='يومي'?todayPage():page==='برامجي'?programsPage():page==='أهدافي'?goalsPage():page==='التقويم'?calendarPage():reports();
 const keep=[...document.querySelectorAll('#content details')].map(d=>d.open);
 $('#content').innerHTML=h;
 document.querySelectorAll('#content details').forEach((d,i)=>{if(keep[i]!==undefined&&keep.length===document.querySelectorAll('#content details').length)d.open=keep[i]});
 localDigits($('#content'));localDigits($('.appbar'));
}
const hijri=new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn',{day:'numeric',month:'long',year:'numeric'}),hdayFmt=new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn',{day:'numeric'}),hmonFmt=new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn',{month:'long',year:'numeric'});
const hdate=s=>hijri.format(date(s)),hday=s=>hdayFmt.format(date(s)),hmonths=(a,b)=>[...new Set([hmonFmt.format(date(a)),hmonFmt.format(date(b))])].join(' – ');
function program(old=null){
 const goalOpts={'':'بلا هدف',...Object.fromEntries(db.goals.map(g=>[g.id,g.name]))},startDay=date(old?.start||today()).getDay();
 const catList=domains(db).map(d=>d.name);
 modal(old?'تعديل البرنامج':'برنامج جديد',(old?'':'<p class="muted">ابدأ من قالب أو اكتب برنامجك:</p><div class="chips" id="tplChips">'+Object.entries(TEMPLATES).map(([k,t])=>'<button type="button" data-tpl="'+k+'">'+esc(t.p.name)+'</button>').join('')+'</div>')+form('program',input('name','ما البرنامج؟','text','','required maxlength=100 placeholder="مثال: ورد الحفظ بعد الفجر"')+input('cat','المجال','text','','required list="cats"')+'<div class="chips" id="catChips">'+catList.map(c=>'<button type="button" data-cat="'+esc(c)+'">'+esc(c)+'</button>').join('')+'</div><datalist id="cats">'+catList.map(c=>'<option value="'+esc(c)+'">').join('')+'</datalist>'
 +'<div class="grid">'+sel('repeat','كم مرة؟',freq,'daily')+input('every','كل كم يوم','number',2,'min=2 max=365')+sel('calendar','حسب التقويم',{g:'الميلادي',h:'الهجري (أم القرى)'},'g')+input('start','يبدأ من','date',today(),'required')+input('end','ينتهي في (اختياري)','date')+'</div><fieldset id="daysBox"><legend>في أي أيام؟</legend>'+[6,0,1,2,3,4,5].map(d=>check('d'+d,weekdays[d],d===startDay)).join('')+'</fieldset>'
 +'<div class="grid">'+sel('anchor','متى؟',{'':'في ساعة محددة',...Object.fromEntries(Object.entries(prayers).map(([k,v])=>[k,'مرتبط بأذان '+v]))},'')+input('clock','الساعة','time','07:00','required')+sel('side','قبل الأذان أو بعده',{after:'بعد الأذان',before:'قبل الأذان'},'after')+input('offset','بكم دقيقة من الأذان','number',0,'min=0 max=240 required')+input('duration','المدة بالدقائق (اختياري)','number','','min=0 max=1440 placeholder="بلا مدة محددة"')+sel('kind','طريقة القياس',{'':kinds[''].label},'')+input('target','المستهدف لكل جلسة','number','','min=0.01 step=any')+input('page','يبدأ من صفحة','number','','min=1 max=604 step=1')+sel('dir','اتجاه الصفحات',{up:'تصاعدي (من 1 إلى 604)',down:'تنازلي (من 604 إلى 1)'},'up')+sel('goalId','يخدم هدف',goalOpts,'')+'</div>'
 +'<div id="smartBox">'+check('smart','مراجعة ذكية: تدور على محفوظي فقط، صفحة بعد صفحة',false)+input('known','ما أحفظه من قبل التطبيق (مثل 1-40، 582-604)','text','','dir=ltr placeholder="1-40, 582-604"')+'<p class="muted hint" id="smartHint"></p></div>'
 +'<details open><summary>الاستمرارية</summary><div class="grid">'+input('mini','الحد الأدنى في اليوم المزدحم (اختياري)','number','','min=0 step=any placeholder="مثل نصف المستهدف"')+sel('skips','أعذار في الشهر لا تكسر السلسلة',{0:'بلا أعذار',1:'عذر واحد',2:'عذران',3:'3 أعذار',4:'4 أعذار'},'2')+'</div><p class="muted hint">«الحد الأدنى» زر يسجل خطوة صغيرة تحفظ السلسلة في يوم صعب.</p></details>'
 +'<details id="moreOpts"><summary>الخطوات وخيارات إضافية: الكمية، السماح، التذكير</summary>'+'<p class="muted hint">طرق القياس المعروضة هي المناسبة للمجال، وتضيفها أو تعدّلها من الإعدادات ← طرق القياس.</p>'+'<div class="grid">'+input('unit','وحدة الكمية (مثل صفحات)')+input('quality','اسم مقياس الجودة (مثل عدد الأخطاء)')+'</div>'+stepsField('خطوات التنفيذ')+'<div class="grid">'+sel('grace','يبقى مفتوحًا للتسجيل',{day:'حتى نهاية اليوم',week:'حتى نهاية الجمعة',custom:'دقائق بعد الجلسة'},'day')+input('allow','دقائق السماح','number',60,'min=0 max=525600 required')+'</div>'+check('split','يمكن تقسيم الجلسة إذا فاتتني',false)+check('remind','ذكّرني بإشعار',true)+'</details>',old?'حفظ':'أضف البرنامج'));
 document.querySelectorAll('#catChips button').forEach(b=>b.onclick=()=>{$('#program').cat.value=b.dataset.cat;$('#program').onchange()});
 const f=$('#program');
 /* Edit in place while the program has no record yet (it has not really started); after that, keep past sessions and
    start a new version. The new version may start today when today's session has no record. */
 const logged=old&&Object.keys(db.logs).some(k=>k.startsWith(old.id+'@')),freeToday=old&&old.start<today()&&!db.logs[old.id+'@'+today()];
 const inPlace=!old||old.start>today()||old.repeat==='once'||!logged;
 if(old){for(const [k,v] of Object.entries(old)){const node=f.elements[k];if(!node||k==='origin'||k==='days')continue;if(k==='steps')node.value=v.join('\n');else if(k==='remind'||k==='split'||k==='smart')node.checked=!!v;else node.value=k==='target'&&!v?'':v}
 f.offset.value=Math.abs(old.offset||0);f.side.value=(old.offset||0)<0?'before':'after';if(!old.goalId)f.goalId.value='';
 if(old.days?.length)for(let d=0;d<7;d++)f['d'+d].checked=old.days.includes(d);
 if(old.steps?.length)$('#moreOpts').open=true;/* a program with steps shows them without an extra tap */
 f.querySelector('[type=submit]').textContent=inPlace?'حفظ التعديل':'حفظ التعديل للجلسات القادمة';
 if(!inPlace){f.start.value=freeToday?today():shift(today(),1);f.start.min=f.start.value;f.start.parentElement.firstChild.textContent='يسري التعديل من';
 f.start.parentElement.insertAdjacentHTML('afterend',input('origin','اليوم المرجعي للتكرار (يحدد يوم الأسبوع أو الشهر)','date',old.origin||old.start));
 f.insertAdjacentHTML('afterbegin','<p>تبقى جلساتك السابقة كما هي، ويبقى يوم التكرار كما هو ما لم تغيّر «اليوم المرجعي».</p>')}}
 bindSteps(f);
 let lastCat=null;function fields(){if(f.cat.value.trim()!==lastCat){const cur=lastCat===null&&old?old.kind||'':f.kind.value;lastCat=f.cat.value.trim();const list=kindsFor(db,lastCat,old?.kind);f.kind.innerHTML=opts(Object.fromEntries(list.map(k=>[k,kinds[k].label])),list.includes(cur)?cur:'')}document.querySelectorAll('#catChips button').forEach(x=>x.classList.toggle('on',x.dataset.cat===f.cat.value.trim()));const k=f.kind.value,weekly=f.repeat.value==='weekly';f.clock.parentElement.hidden=!!f.anchor.value;f.offset.parentElement.hidden=f.side.parentElement.hidden=!f.anchor.value;f.allow.parentElement.hidden=f.grace.value!=='custom';f.every.parentElement.hidden=f.repeat.value!=='every';f.calendar.parentElement.hidden=!['monthly','quarter','half','yearly'].includes(f.repeat.value);$('#daysBox').hidden=!weekly;f.unit.parentElement.hidden=f.quality.parentElement.hidden=!!k;f.page.parentElement.hidden=f.dir.parentElement.hidden=!['hifz','review'].includes(k);f.target.parentElement.hidden=k==='time'||!k&&!f.unit.value.trim();f.duration.required=k==='time'||k==='workout';f.duration.parentElement.firstChild.textContent=f.duration.required?'المدة بالدقائق':'المدة بالدقائق (اختياري)';f.target.parentElement.firstChild.textContent='المستهدف لكل جلسة'+(k?' ('+kinds[k].unit+')':'');$('#smartBox').hidden=k!=='review';f.known.parentElement.hidden=!f.smart.checked;if(k==='review'){const pool=memorized(db,f.known.value);$('#smartHint').textContent=f.smart.checked?(pool.length?'محفوظك الآن '+n(pool.length)+' صفحة. بمستهدف '+n(Math.max(1,Math.round(+f.target.value||20)))+' صفحة تكتمل الدورة في '+n(Math.ceil(pool.length/Math.max(1,Math.round(+f.target.value||20))))+' جلسة.':'اكتب ما تحفظه، ويُضاف تلقائيًا كل ما تسجله في برنامج الحفظ.'):''}f.page.parentElement.hidden=f.page.parentElement.hidden||(k==='review'&&f.smart.checked);const mu=['hifz','review','study'].includes(k)?kinds[k].unit:k&&kinds[k]?.sum&&kinds[k].sum!=='minutes'?kinds[k].unit:!k&&f.unit.value.trim()?f.unit.value.trim():'دقيقة';f.mini.parentElement.firstChild.textContent='الحد الأدنى في اليوم المزدحم ('+mu+'، اختياري)';if(f.origin)f.origin.parentElement.hidden=['daily','once'].includes(f.repeat.value)||weekly&&[...Array(7).keys()].some(d=>f['d'+d].checked)}f.onchange=fields;f.oninput=e=>{if(e.target.name==='known'||e.target.name==='target')fields()};fields();
 document.querySelectorAll('#tplChips [data-tpl]').forEach(b=>b.onclick=()=>{const t=TEMPLATES[b.dataset.tpl].p;for(const k of ['name','cat','anchor','repeat'])f[k].value=t[k]||(k==='repeat'?'daily':'');f.clock.value=t.clock||'07:00';f.offset.value=Math.abs(t.offset||0);f.side.value='after';f.duration.value=t.duration||'';lastCat=null;fields();f.kind.value=t.kind||'';f.target.value=t.target||'';f.mini.value=t.mini||'';f.smart.checked=!!t.smart;if(t.days)for(let d=0;d<7;d++)f['d'+d].checked=t.days.includes(d);document.querySelectorAll('#tplChips button').forEach(x=>x.classList.toggle('on',x===b));fields()});
 f.onsubmit=e=>{e.preventDefault();let p=Object.fromEntries(new FormData(f));p.name=p.name.trim();p.cat=p.cat.trim();
 const days=[...Array(7).keys()].filter(d=>f['d'+d].checked);for(let d=0;d<7;d++)delete p['d'+d];
 if(p.kind){p.unit=kinds[p.kind].unit;p.quality=''}
 if(!p.name||!p.cat||p.end&&p.end<p.start||!p.kind&&!!p.unit!==!!p.target||p.repeat==='weekly'&&!days.length){toast('راجع الاسم والمجال والتواريخ وأيام الأسبوع ووحدة الكمية ومستهدفها');return}
 p.mini=+p.mini>0?+p.mini:0;if(!p.mini)delete p.mini;p.skips=Math.max(0,Math.min(10,Math.round(+p.skips||0)));p.smart=p.kind==='review'&&f.smart.checked;if(!p.smart){delete p.smart;delete p.known}else p.known=(p.known||'').trim();
 Object.assign(p,{steps:p.steps.split('\n').map(t=>t.trim()).filter(Boolean),duration:+p.duration,offset:(p.side==='before'?-1:1)*Math.abs(+p.offset),allow:+p.allow,split:f.split.checked,remind:f.remind.checked,target:+p.target||0,every:+p.every});delete p.side;if(['hifz','review'].includes(p.kind)&&+p.page>=1){p.page=Math.min(604,Math.round(+p.page))}else delete p.page;if(!['hifz','review'].includes(p.kind)||p.dir!=='down')delete p.dir;
 if(p.repeat==='weekly')p.days=days;else delete p.days;
 if(p.repeat!=='every')delete p.every;
 const g=db.goals.find(g=>g.id===p.goalId);if(g)p.goal=g.name;else{delete p.goalId;delete p.goal}
 if(!p.origin||['daily','once'].includes(p.repeat)||p.days)delete p.origin;
 if(old&&inPlace){const keep={id:old.id,lineage:lineage(old)};if(p.start===old.start&&old.origin&&!p.days)keep.origin=old.origin;for(const k of Object.keys(old))delete old[k];Object.assign(old,p,keep)}
 else{p.id=uid();p.lineage=old?lineage(old):p.id;if(old){old.end=old.end&&old.end<shift(p.start,-1)?old.end:shift(p.start,-1);old.archived=true;old.replacedBy=p.id}db.ps.push(p)}
 closeD();save();toast(old?'حُفظ التعديل':'أضيف البرنامج إلى جدولك')};
}
/* What a session most likely contained, from the plan: the next pages after the last recorded ones, the planned amount, the full duration. */
function guess(x,mini=false){
 const p=x.p,k=kinds[p.kind||'']||kinds[''],out={minutes:p.duration||0,quantity:'',m:null,text:''};
 const L=lineage(p),ids=new Set(db.ps.filter(q=>lineage(q)===L).map(q=>q.id));
 const before=Object.entries(db.logs).filter(([key,r])=>ids.has(key.split('@')[0])&&key.split('@')[1]<x.s&&r.done).sort((a,b)=>a[0].split('@')[1]<b[0].split('@')[1]?-1:1).map(e=>e[1]);
 const prevM=before.filter(r=>r.m&&Object.keys(r.m).length).pop()?.m;
 /* Only what describes the plan repeats (exercise type, number of sets, custom text). Results such as
    mistakes, ratings and scores are never copied from an earlier session. */
 if(p.kind&&prevM)out.m=Object.fromEntries(k.fields.filter(([f,,type])=>prevM[f]!=null&&(type==='text'||f==='sets')).map(([f])=>[f,prevM[f]]));
 const target=mini&&p.mini?p.mini:p.target;
 if(p.kind==='hifz'||p.kind==='review'){
  const last=before.filter(r=>r.m?.to).pop();
  const down=p.dir==='down',per=Math.max(1,Math.round(target||1));
  const smart=p.kind==='review'&&p.smart?reviewPortion(db,{...p,target:per},last?.m?.to):null;
  let from,to;
  if(smart){from=smart.from;to=smart.to}
  else{from=last?last.m.to+(down?-1:1):(p.page||(down?604:1));if(from>604||from<1)from=down?604:1;to=down?Math.max(1,from-per+1):Math.min(604,from+per-1)}
  out.m={...out.m,from,to};out.text=from===to?'صفحة '+n(from):'من صفحة '+n(from)+' إلى '+n(to);
 }else if(p.kind==='study'){out.m={...out.m,lessons:target||1};out.text=n(target||1)+' '+(p.unit||'درس')}
 else if(k.custom){if(k.sum&&k.sum!=='minutes'&&target){out.m={...out.m,[k.sum]:target};out.text=n(target)+' '+(k.unit||'')}else if(k.sum==='minutes'&&mini&&p.mini)out.minutes=p.mini}
 else if(!p.kind&&p.unit&&target){out.quantity=String(target);out.text=n(target)+' '+p.unit}
 if(mini&&p.mini&&(p.kind==='time'||p.kind==='workout'||!p.unit&&!p.kind)){out.minutes=p.mini;out.text=n(p.mini)+' دقيقة'}
 if(p.kind==='workout'&&out.m?.type)out.text=out.m.type;
 if(p.kind&&!out.m)out.m={};
 return out;
}
/* Record a session as done with the values the plan gives (or the program's minimum). Shared by the
   «تم» button, the notification and home-screen widget buttons, and the welcome-back sheet. */
function recordDone(x,mini=false,at=Date.now()){
 const g=guess(x,mini),r=x.rec;
 db.logs[x.id]={...r,done:r.done||at,missed:0,closed:0,minutes:r.minutes||g.minutes,...(r.m||!g.m?{}:{m:g.m}),quantity:r.quantity||g.quantity||(x.p.kind?String(amount(x.p,{m:g.m||{},minutes:g.minutes})||''):''),steps:mini?(r.steps||[]):x.p.steps.map((_,i)=>i),...(mini?{mini:true}:{})};
 return g;
}
function log(x){
 const {p,rec:r}=x,prev=Object.entries(db.logs).filter(([k,v])=>k.startsWith(p.id+'@')&&k<x.id&&v.note).sort().pop();
 const fresh=!r.done&&!r.missed,g=guess(x),shown={...r,minutes:r.minutes??(fresh?g.minutes:''),m:r.m||(fresh?g.m:null)||{},quantity:r.quantity||(fresh?g.quantity:'')};
 modal(p.name,form('entry','<p class="muted">'+full(x.when)+(fresh?' · القيم معبأة من خطتك، عدّل ما تريد':'')+'</p>'+(r.focus?'<p><b>تحسين هذه الجلسة</b> · '+esc(r.focus)+'</p>':'')+(prev?'<p>من الجلسة السابقة · '+esc(prev[1].note)+'</p>':'')
  +(p.kind?kindFields(p,shown):(p.unit?input('quantity','الكمية المنجزة ('+esc(p.unit)+')'+(p.target?' من '+n(p.target):''),'number',shown.quantity??'','step=any min=0'):''))+'<div class="grid">'+(p.duration||['time','workout'].includes(p.kind)||r.minutes?input('minutes','الدقائق','number',shown.minutes,'min=0 max=1440'):'')+(p.quality?input('quality',esc(p.quality),'number',r.quality??'','step=any min=0'):'')+'</div>'
  +check('done','أكملت الجلسة',fresh||!!r.done)
  +'<details'+(r.note||r.reason||r.missed?' open':'')+'><summary>المزيد: '+(p.steps.length?'الخطوات، ':'')+'فاتتني، سبب النقص، ملاحظة</summary>'+p.steps.map((s,i)=>check('s'+i,s,fresh||(r.steps||[]).includes(i))).join('')+sel('reason','سبب النقص (اختياري)',reasonsMap(),r.reason)+field('note','ملاحظة للمرة القادمة',r.note)+check('missed','فاتتني (لم أنفذها)',!!r.missed)+'</details>','حفظ'));
 const f=$('#entry');f.missed.onchange=()=>{if(f.missed.checked)f.done.checked=false};f.done.onchange=()=>{if(f.done.checked)f.missed.checked=false};
 f.onsubmit=e=>{e.preventDefault();let data=Object.fromEntries(new FormData(f));const m=p.kind?readKind(p,data):undefined;db.logs[x.id]={...r,minutes:+data.minutes||0,quantity:p.kind?String(amount(p,{m,minutes:+data.minutes||0})||''):data.quantity??'',quality:data.quality??'',...(m?{m}:{}),reason:data.reason,note:data.note,steps:p.steps.map((_,i)=>i).filter(i=>f.elements['s'+i].checked),done:f.done.checked?(r.done||Date.now()):0,missed:!f.done.checked&&f.missed.checked?(r.missed||Date.now()):0};closeD();save();toast('حُفظ سجل الجلسة')};
}
function kindFields(p,r){
 const m=r.m||{};return '<div class="grid">'+kinds[p.kind].fields.map(([k,label,type])=>type==='text'?input('m_'+k,label,'text',m[k]??''):input('m_'+k,label,'number',m[k]??'',type==='rate'?'min=1 max=5 step=1':type==='pct'?'min=0 max=100 step=any':type==='page'?'min=1 max=604 step=1':'min=0 step=any')).join('')+'</div>'+'';
}
function readKind(p,data){
 const m={};for(const [k,,type] of kinds[p.kind].fields){const v=(data['m_'+k]??'').trim();if(v==='')continue;if(type==='text')m[k]=v.slice(0,100);else if(Number.isFinite(+v))m[k]=+v}return m;
}
function block(){
 modal('فترة انشغال',form('blockForm',input('label','اسم الفترة','text','','required')+sel('kind','التكرار',{once:'تاريخ واحد',weekly:'أسبوعيًا'},'once')+input('day','التاريخ أو أول يوم للتكرار','date',today(),'required')+'<div class="grid">'+input('from','من','time','08:00','required')+input('to','إلى','time','16:00','required')+'</div>'+sel('allow','يسمح أثناء الفترة ببرامج المجال',Object.fromEntries([['','مشغول بالكامل'],...[...new Set([...cats,...db.ps.map(p=>p.cat)])].map(c=>[c,c])]),'')));
 const f=$('#blockForm');f.onsubmit=e=>{e.preventDefault();let b=Object.fromEntries(new FormData(f));if(b.to<=b.from){toast('اختر نهاية بعد البداية');return}db.blocks.push({...b,id:uid(),date:b.kind==='once'?b.day:'',week:[date(b.day).getDay()]});save();toast('حُفظت الفترة للاقتراحات القادمة');settings('busy')};
}
let setView='';
const SETTINGS=[
 ['الحساب',[['account','cloud','الحساب والمزامنة']]],
 ['البرامج',[['domains','programs','المجالات'],['kinds','reports','طرق القياس']]],
 ['التطبيق',[['look','moon','المظهر'],['prayer','pin','مواقيت الصلاة'],['alerts','bell','التنبيهات']]],
 ['الجدولة',[['alt','swap','المواعيد البديلة وأسباب النقص'],['busy','clock','أوقات الانشغال'],['away','plane','السفر والمرض والإجازات']]],
 ['البيانات والجهاز',[['backup','shield','النسخ الاحتياطي'],['web','share','نسخة الويب'],['about','download','التحديثات وعن التطبيق']]]];
/* The same app, published for the browser from the releases repository's gh-pages branch (GitHub Pages). */
const WEB_URL='https://mohammedeoa.github.io/baramiji-releases/';
function settingHint(k){
 const c=db.cfg;let st={},b={},v='';if(window.Phone){try{st=JSON.parse(Phone.notifyStatus())}catch{}try{b=JSON.parse(Phone.backupInfo())}catch{}try{v=Phone.versionName()}catch{}}
 const signed=typeof auth!=='undefined'&&auth;
 return {account:signed?auth.email:'غير متصل، بياناتك على هذا الجوال فقط',domains:domains(db).map(d=>d.name).slice(0,3).join('، ')+(domains(db).length>3?' و'+n(domains(db).length-3)+' غيرها':''),kinds:Object.keys(kinds).filter(k=>k&&!kinds[k].hidden).map(k=>kinds[k].label).slice(0,3).join('، '),look:({system:'حسب الجهاز',light:'فاتح',dark:'داكن'}[c.theme]||'حسب الجهاز')+' · الأرقام '+(c.digits==='arab'?'١ ٢ ٣':'1 2 3'),prayer:(c.city||'')+' · '+(methods[c.method||'UmmAlQura']||''),
  alerts:(c.notify?'إشعار لكل جلسة':'الإشعارات متوقفة')+' · المراجعة '+weekdays[Number.isInteger(c.reviewDay)?c.reviewDay:4]+(window.Phone&&(!st.notif||!st.exact)?' · يحتاج إصلاحًا':''),alt:'من '+clock(time(today(),c.open))+' إلى '+clock(time(today(),c.close)),busy:db.blocks.length?n(db.blocks.length)+' فترات':'لا توجد فترات',away:currentAway()?'الآن: '+currentAway().label:(db.cfg.away||[]).length?n(db.cfg.away.length)+' فترات':'لا توجد فترات',
  backup:b.folder?'آخر نسخة: '+lastBackup(b.last):'لم يُختر مجلد بعد',web:'افتح برامجي من الكمبيوتر بنفس حسابك',about:v?'الإصدار '+v:''}[k]||'';
}
function settingsAlert(k){if(!window.Phone)return false;let st={},b={};try{st=JSON.parse(Phone.notifyStatus())}catch{}try{b=JSON.parse(Phone.backupInfo())}catch{}return k==='alerts'?!(st.notif&&st.exact):k==='backup'?!b.folder||!!b.error:k==='account'?!(typeof auth!=='undefined'&&auth):false}
function settings(view=''){
 setView=view;
 if(view==='account'){setView='';syncPanel();return}
 if(!view){modal('الإعدادات','<div class="settings">'+SETTINGS.map(([g,rows])=>'<h4 class="sgroup">'+g+'</h4><div class="slist">'+rows.map(([k,i,t])=>'<button type="button" class="srow" data-act="setview" data-id="'+k+'"><span class="sic">'+ic(i)+'</span><span class="stext"><b>'+t+'</b><small>'+esc(settingHint(k))+'</small></span>'+(settingsAlert(k)?'<i class="sdot" aria-label="يحتاج انتباهك"></i>':'')+ic('next','go')+'</button>').join('')+'</div>').join('')+'</div>');dlgParent=null;return}
 if(/^(domain|kind):/.test(view))return programSetting(view);
 const c=db.cfg,title=SETTINGS.flatMap(g=>g[1]).find(r=>r[0]===view)?.[2]||'الإعدادات';
 const back='<button type="button" class="sback" data-act="setview" data-id="">'+ic('back')+'الإعدادات</button>';
 const saveForm=(html)=>form('cfg',html,'حفظ');
 let body='';
 if(view==='domains'){const ds=domains(db);body='<p class="muted">ترتيبها هنا هو ترتيبها عند إضافة برنامج. ولكل مجال طرق القياس التي تناسبه.</p><div class="slist">'+ds.map((d,i)=>'<div class="drow"><span class="badge" style="--h:'+hue(d.name)+'">'+ic(catIcon(d.name))+'</span><span class="stext"><b>'+esc(d.name)+'</b><small>'+esc(d.kinds.filter(k=>kinds[k]&&!kinds[k].hidden).map(k=>kinds[k].label).join('، ')||'الطرق العامة فقط')+' · '+n(db.ps.filter(p=>!p.archived&&p.cat===d.name).length)+' برامج</small></span><span class="dbtns"><button type="button" class="iconbtn" data-act="domup" data-id="'+i+'" aria-label="أعلى" '+(i?'':'disabled')+'>'+ic('up')+'</button><button type="button" class="iconbtn" data-act="domdown" data-id="'+i+'" aria-label="أسفل" '+(i<ds.length-1?'':'disabled')+'>'+ic('down')+'</button><button type="button" class="iconbtn" data-act="setview" data-id="domain:'+i+'" aria-label="تعديل">'+ic('edit')+'</button></span></div>').join('')+'</div><div class="actions">'+btn(ic('plus')+'إضافة مجال','setview','domain:new','tonal')+'</div>'}
 if(view==='kinds')body='<p class="muted">طريقة القياس تحدد ما تسجّله بعد كل جلسة، وما يُحسب في تقدم الهدف.</p><div class="slist">'+Object.keys(kinds).filter(k=>k).map(k=>'<button type="button" class="srow" data-act="setview" data-id="kind:'+k+'"><span class="sic">'+ic(kinds[k].hidden?'pause':'reports')+'</span><span class="stext"><b>'+esc(kinds[k].label)+'</b><small>'+(kinds[k].hidden?'مخفية · ':'')+(kinds[k].custom?'من إضافتك':'أساسية')+' · '+esc(kinds[k].fields.map(f=>f[1]).join('، ')||'تحسب الدقائق المنجزة')+'</small></span>'+ic('next','go')+'</button>').join('')+'</div><div class="actions">'+btn(ic('plus')+'طريقة قياس جديدة','setview','kind:new','tonal')+'</div>';
 if(view==='look')body=saveForm(sel('theme','السمة',{system:'حسب الجهاز',light:'فاتح',dark:'داكن'},c.theme)+sel('digits','شكل الأرقام',{latn:'1 2 3',arab:'١ ٢ ٣'},c.digits||'latn'));
 if(view==='prayer')body=saveForm(input('city','المدينة','text',c.city,'required')+'<div class="actions"><button type="button" id="locate">'+ic('pin')+'تحديد موقعي</button></div>'+sel('method','طريقة الحساب',methods,c.method||'UmmAlQura')+'<details><summary>الإحداثيات</summary><div class="grid">'+input('lat','خط العرض','number',c.lat,'required min=-65 max=65 step=any')+input('lon','خط الطول','number',c.lon,'required min=-180 max=180 step=any')+'</div></details>');
 if(view==='alerts')body=saveForm(check('notify','إشعار عند موعد كل جلسة، وفيه زر «تم»',c.notify)+check('followup','تذكير واحد بعد ساعة إذا لم تُسجَّل الجلسة',c.followup!==false)+check('summary','ملخص صباحي بجلسات اليوم',c.summary)+'<div class="grid">'+input('morning','موعد الملخص','time',c.morning,'required')+sel('reviewDay','يوم مراجعة الأسبوع',{4:'الخميس',5:'الجمعة',6:'السبت',0:'الأحد',1:'الاثنين',2:'الثلاثاء',3:'الأربعاء'},String(Number.isInteger(c.reviewDay)?c.reviewDay:4))+'</div>')+phoneAlerts();
 if(view==='away')body=awayList();
 if(view==='alt')body=saveForm('<p class="muted">عندما تفوتك جلسة يقترح التطبيق موعدًا بديلًا بين هاتين الساعتين.</p><div class="grid">'+input('open','من الساعة','time',c.open,'required')+input('close','حتى الساعة','time',c.close,'required')+'</div>'+field('reasons','أسبابك الخاصة لعدم إكمال الجلسة (سبب في كل سطر)',(c.reasons||[]).join('\n')));
 if(view==='busy')body='<p class="muted">لا يقترح التطبيق مواعيد بديلة فيها.</p>'+db.blocks.map(b=>'<div class="status"><span>'+esc(b.label)+' · '+esc(b.from)+'–'+esc(b.to)+' · '+(b.date?esc(b.date):'كل '+fmt(date(b.day),{weekday:'long'}))+'</span>'+btn(ic('trash'),'delblock',b.id,'ghost danger')+'</div>').join('')+'<div class="actions">'+btn(ic('plus')+'إضافة وقت','block',' ','tonal')+'</div>';
 if(view==='backup')body=phoneBackup()+'<h4 class="sgroup">نسخة يدوية</h4><p class="muted">ملف تحفظه بنفسك أو ترسله لنفسك، وتستعيده متى شئت.</p><div class="actions">'+btn(ic('download')+'تصدير نسخة','backup',' ','tonal')+btn('استعادة نسخة','restore',' ','ghost')+'</div>';
 if(view==='web')body='<p>افتح هذا الرابط من متصفح الكمبيوتر، ثم سجّل الدخول من «الحساب والمزامنة» بنفس الإيميل وكلمة المرور، فتظهر برامجك وسجلاتك.</p><p dir="ltr" class="weburl"><b>'+WEB_URL+'</b></p><div class="actions">'+btn(ic('share')+'مشاركة الرابط','webshare',' ','primary')+btn('نسخ الرابط','webcopy',' ','ghost')+'</div><p class="muted hint">الإشعارات وزر «تم» في الإشعار والودجت تعمل على الجوال فقط. وفي المتصفح يعمل مساعد الخطط بمفتاح Gemini تضيفه هناك.</p>';
 if(view==='about'){let v='';try{v=Phone.versionName()}catch{}body='<p>برامجي'+(v?' · الإصدار '+esc(v):'')+'</p>'+(window.Phone?'<div class="actions">'+btn('البحث عن تحديث','checkupdate',' ','tonal')+'</div>':'')}
 modal(title,'<div class="settings sub">'+back+body+'</div>');
 const f=$('#cfg');if(!f)return;
 if(f.city){const cities={'جدة':[21.49,39.19],'مكة المكرمة':[21.42,39.83],'المدينة المنورة':[24.47,39.61],'الرياض':[24.71,46.68],'الدمام':[26.42,50.09],'الخرطوم':[15.50,32.56]};
  f.city.setAttribute('list','cityList');f.insertAdjacentHTML('beforeend','<datalist id="cityList">'+Object.keys(cities).map(c=>'<option value="'+esc(c)+'">').join('')+'</datalist>');f.city.onchange=()=>{const loc=cities[f.city.value.trim()];if(loc){f.lat.value=loc[0];f.lon.value=loc[1]}};
  $('#locate').onclick=()=>{toast('جارٍ تحديد الموقع…');if(window.Phone?.locate)Phone.locate();else navigator.geolocation?.getCurrentPosition(p=>window.onLocation(p.coords.latitude,p.coords.longitude),()=>window.onLocation(null,null,'تعذر تحديد الموقع'),{timeout:20000,maximumAge:3600000})}}
 f.onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));
  if(f.open&&d.open>=d.close){toast('نهاية فترة الاقتراح يجب أن تكون بعد بدايتها');return}
  if(f.lat){d.lat=+d.lat;d.lon=+d.lon}
  if(f.notify){d.notify=f.notify.checked;d.summary=f.summary.checked;d.followup=f.followup.checked;d.reviewDay=+d.reviewDay}
  if(f.reasons)d.reasons=[...new Set(d.reasons.split('\n').map(t=>t.trim()).filter(Boolean))];
  Object.assign(c,d);save();toast('حُفظت الإعدادات');settings()};
}
function period(off){
 const s=today();
 if(range==='week'){const start=shift(shift(s,-((date(s).getDay()+1)%7)),7*off);return [start,shift(start,6)]}
 const d=date(s),a=new Date(d.getFullYear(),d.getMonth()+off,1),b=new Date(d.getFullYear(),d.getMonth()+off+1,0);return [iso(a),iso(b)];
}
function rows(from,to){
 if(!from)[from,to]=period(rOff);
 return items(db,from,to).filter(x=>(!filter||lineage(x.p)===filter)&&x.at<=Date.now()).map(x=>{
 const r=x.rec,p=x.p,k=kinds[p.kind||''];return {'معرف الجلسة':x.id,'التاريخ':x.s,'التاريخ الهجري':hdate(x.s),'البرنامج':p.name,'الهدف':p.goal||'','الحالة':status(x),'الموعد الأصلي':full(x.at),'الموعد الحالي':full(x.when),'نُقلت':r.move?'نعم':'','دقائق مستهدفة':p.duration,'دقائق منجزة':r.minutes||0,'خطوات منجزة':(r.steps||[]).length,'إجمالي الخطوات':p.steps.length,'خطوات متبقية':p.steps.filter((_,i)=>!(r.steps||[]).includes(i)).join('، '),'كمية منجزة':p.kind?amount(p,r)||'':r.quantity??'','كمية مستهدفة':p.target||'','وحدة':p.unit||'','مقياس الجودة':p.quality||'','قيمة الجودة':r.quality??'','قياسات':k.fields.filter(([f])=>r.m?.[f]!=null).map(([f,l])=>l+': '+r.m[f]).join('، '),'سبب النقص':reasonLabel(r.reason),'ملاحظة':r.note||''};
 })
}
const finished=r=>r['الحالة'].startsWith('مكتمل')||r['الحالة'].startsWith('أُنجزت');
function tally(data){return {total:data.length,done:data.filter(finished).length,moved:data.filter(r=>r['نُقلت']).length,alt:data.filter(r=>r['الحالة']==='أُنجزت في الموعد البديل').length,missed:data.filter(r=>r['الحالة']==='فاتتني').length,unl:data.filter(r=>r['الحالة']==='لم تُسجَّل').length,minutes:data.reduce((a,r)=>a+(+r['دقائق منجزة']||0),0)}}
function summary(data){
 const by=new Map();for(const r of data){const x=ref(r['معرف الجلسة']);if(!x)continue;const L=lineage(x.p);if(!by.has(L))by.set(L,{name:x.p.name,unit:x.p.unit||'',kind:x.p.kind||'',rows:[],recs:[]});const e=by.get(L);e.name=x.p.name;e.rows.push(r);e.recs.push(x.rec)}
 return [...by.values()].map(e=>{const t=tally(e.rows),k=kinds[e.kind]||kinds[''],kn=fair(e.rows).res,out={'البرنامج':e.name,'الجلسات':kn,'المكتملة':t.done,'نسبة الإنجاز %':kn?Math.round(100*t.done/kn):'','الدقائق':t.minutes,'الكمية':e.rows.reduce((a,r)=>a+(+r['كمية منجزة']||0),0),'الوحدة':e.unit};
 for(const [f,l,type] of k.fields){if(type==='text'||type==='page')continue;const v=e.recs.map(r=>r.m?.[f]).filter(Number.isFinite);if(!v.length)continue;const total=v.reduce((a,b)=>a+b,0);out[l]=type==='count'?total:(Math.round(10*total/v.length)/10)+' (متوسط)'}
 return out})
}
function dayChart(from,to,data){
 const days=[];for(let s=from;s<=to;s=shift(s,1))days.push(s);
 const W=340,H=130,P=18,bw=(W-2*P)/days.length,max=Math.max(1,...days.map(s=>data.filter(r=>r['التاريخ']===s).length));
 let h='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="الجلسات المجدولة والمكتملة لكل يوم">';
 days.forEach((s,i)=>{const all=data.filter(r=>r['التاريخ']===s),ok=all.filter(finished).length,x=P+i*bw+bw*0.15,w=bw*0.7,y=n=>H-P-(H-2*P)*n/max;
 h+='<rect x="'+x.toFixed(1)+'" y="'+y(all.length).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+(H-P-y(all.length)).toFixed(1)+'" class="sched"/><rect x="'+x.toFixed(1)+'" y="'+y(ok).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+(H-P-y(ok)).toFixed(1)+'" class="donebar"/>';
 if(days.length<=7||i%5===0)h+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(H-4)+'" text-anchor="middle">'+(days.length<=7?fmt(date(s),{weekday:'short'}):n(date(s).getDate()))+'</text>'});
 return h+'</svg><div class="legend"><span class="k donebar"></span> مكتملة <span class="k sched"></span> مجدولة</div>';
}
function reports(){
 const [from,to]=period(rOff),[pf,pt]=period(rOff-1),data=rows(from,to),t=tally(data),fr=fair(data),fp=fair(rows(pf,pt)),rate=fr.rate||0,prevRate=fp.rate,sugs=filter?[]:suggestions();
 const label=fmt(date(from),{day:'numeric',month:'long'})+' – '+fmt(date(to),{day:'numeric',month:'long',year:'numeric'}),hlabel=hdate(from)+' – '+hdate(to);
 const reasons={};for(const r of data)if(!finished(r)&&r['سبب النقص'])reasons[r['سبب النقص']]=(reasons[r['سبب النقص']]||0)+1;
 const sum=summary(data),goals=db.goals.filter(g=>!filter||db.ps.some(p=>p.goalId===g.id&&lineage(p)===filter));
 return '<div class="printhead"><b>برامجي · تقرير '+(range==='week'?'أسبوعي':'شهري')+'</b><br>'+esc(label)+'<br>'+esc(hlabel)+'</div>'+hero('التقارير','')
 +'<div class="controls noprint"><div class="seg">'+btn('أسبوع','rangeset','week',range==='week'?'on':'')+btn('شهر','rangeset','month',range==='month'?'on':'')+'</div><div class="period"><button class="iconbtn" data-act="rstep" data-id="-1" aria-label="السابق">'+ic('back')+'</button><small style="text-align:center;min-width:120px">'+esc(label)+'</small><button class="iconbtn" data-act="rstep" data-id="1" aria-label="التالي" '+(rOff<0?'':'disabled')+'>'+ic('next')+'</button></div></div>'
 +'<div class="noprint"><select aria-label="اختيار البرنامج" id="filter">'+opts(Object.fromEntries([['','كل البرامج'],...new Map(db.ps.map(p=>[lineage(p),p.name]))]),filter)+'</select></div>'
 +'<div class="tiles"><div class="tile hero">'+ring(rate,fr.rate==null?'—':n(Math.round(rate))+'٪',72)+'<div><b>'+(fr.rate==null?'لا توجد نتيجة مسجلة':n(t.done)+' من '+n(fr.res))+'</b><small>جلسات مكتملة · '+esc(hlabel)+(fr.open?'<br>لا تُحسب '+n(fr.open)+' جلسات ما زالت مفتوحة':'')+'</small>'+(prevRate!=null&&fr.rate!=null?'<div class="delta '+(rate>=prevRate?'up':'down')+'">'+(Math.round(rate-prevRate)===0?'مثل الفترة السابقة':(rate>prevRate?'▲ ':'▼ ')+n(Math.abs(Math.round(rate-prevRate)))+' نقطة عن الفترة السابقة')+'</div>':'')+'</div></div>'
 +'<div class="tile"><b>'+n(t.minutes)+'</b><small>دقيقة منجزة</small></div><div class="tile"><b>'+n(t.alt)+' / '+n(t.moved)+'</b><small>أُنجزت بعد النقل</small></div><div class="tile"><b>'+n(t.missed)+'</b><small>فاتتني</small></div><div class="tile"><b>'+(fr.cover==null?'—':n(Math.round(fr.cover))+'٪')+'</b><small>نسبة التسجيل · لم تُسجَّل '+n(t.unl)+'</small></div></div>'
 +'<article class="card insight">'+ic('bulb')+'<p>'+esc(insight(fr,fp,data))+'</p></article>'
+(t.total?'<article class="card">'+dayChart(from,to,data)+'</article>':'')
 +(sum.length?'<h2>حسب البرنامج</h2><div class="tablewrap"><table><tr>'+['البرنامج','المكتملة','النسبة','الدقائق','الكمية','قياسات'].map(c=>'<th>'+c+'</th>').join('')+'</tr>'+sum.filter(o=>o['الجلسات']).map(o=>'<tr><td>'+esc(o['البرنامج'])+'</td><td>'+n(o['المكتملة'])+'/'+n(o['الجلسات'])+'</td><td>'+(o['الجلسات']?n(o['نسبة الإنجاز %'])+'٪':'—')+'</td><td>'+n(o['الدقائق'])+'</td><td>'+(o['الكمية']?num1(o['الكمية'])+' '+esc(o['الوحدة']):'—')+'</td><td>'+esc(Object.entries(o).slice(7).map(([k,v])=>k+': '+v).join('، ')||'—')+'</td></tr>').join('')+'</table></div>':'')
 +(Object.keys(reasons).length?'<h2>أسباب عدم الإكمال</h2><article class="card">'+Object.entries(reasons).sort((a,b)=>b[1]-a[1]).map(([k,n])=>esc(k)+' · '+n).join('<br>')+'</article>':'')
 +(sugs.length&&rOff===0?'<h2 class="noprint">اقتراحات لتحسين الخطة</h2><div class="noprint">'+sugs.slice(0,3).map(sugCard).join('')+'</div>':'')
 +(goals.length?'<h2>الأهداف</h2>'+goals.map(g=>goalCard(g,true)).join(''):'')
 +'<div class="actions noprint">'+btn(ic('print')+'PDF / طباعة','print',' ','tonal')+btn(ic('download')+'Excel','excel',' ','tonal')+btn(ic('brain')+'تحليل بالمساعد','analysis',' ','ghost')+'</div>'+improvements(data)
 +'<details class="noprint"><summary>تفاصيل الجلسات ('+n(data.length)+')</summary>'+data.slice().reverse().map(r=>'<article class="card"><b>'+esc(r['البرنامج'])+'</b> · '+esc(r['الحالة'])+'<p>'+esc(r['التاريخ'])+' · '+r['دقائق منجزة']+' / '+r['دقائق مستهدفة']+' دقيقة</p>'+(r['إجمالي الخطوات']?'<p>الخطوات '+r['خطوات منجزة']+' / '+r['إجمالي الخطوات']+' · المتبقي '+esc(r['خطوات متبقية']||'—')+'</p>':'')+(r['وحدة']?'<p>'+esc(r['كمية منجزة']||'0')+(r['كمية مستهدفة']?' / '+esc(r['كمية مستهدفة']):'')+' '+esc(r['وحدة'])+'</p>':'')+(r['قياسات']?'<p>'+esc(r['قياسات'])+'</p>':'')+(r['مقياس الجودة']?'<p>'+esc(r['مقياس الجودة'])+' · '+esc(r['قيمة الجودة']||'—')+'</p>':'')+'<small>'+esc([r['سبب النقص'],r['ملاحظة']].filter(Boolean).join(' · '))+'</small></article>').join('')+'</details>';
}
function writeFile(name,mime,b64){
 if(window.Phone){Phone.writeFile(name,mime,b64);return}
 const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)),u=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)
}
function base64(str){const b=new TextEncoder().encode(str);let out='';for(let i=0;i<b.length;i+=16384)out+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(out)}
function importText(raw){
 try{const v=validateState(JSON.parse(raw));
 ask('استعادة نسخة','ستُستبدل بياناتك الحالية بالنسخة التي فيها '+n(v.ps.length)+' برنامج. تُحفظ لقطة من بياناتك الحالية قبل الاستبدال.','استعادة').then(ok=>{if(!ok)return;
  if(window.Phone&&!loadError){let snap=false;try{snap=Phone.snapshot('before-restore')===true}catch{}if(!snap){toast('تعذر حفظ لقطة من بياناتك الحالية، فلم تُستبدل. حرّر مساحة في الجوال وحاول مرة أخرى.');return}}
  const next=migrate(v);if(!persist(next)){toast('تعذر حفظ النسخة المستعادة، وبقيت بياناتك الحالية كما هي.');return}
  loadError=false;saveFailed=false;db=next;closeD();render();alarms();window.queueSync?.();toast('استُعيدت النسخة')})}catch{toast('تعذر قراءة النسخة')}
}
function alarms(){
 if(!window.Phone)return;
 const events=[],first=today(),last=shift(first,35),all=items(db,first,last).filter(x=>!x.rec.move);
 for(const [id,r] of Object.entries(db.logs))if(r.move){const x=ref(id);if(x)all.push(x)}
 const now=Date.now(),follow=db.cfg.followup!==false;
 if(db.cfg.notify)for(const x of all)if(x.p.remind&&!x.rec.done&&!x.rec.missed&&!x.rec.closed){
  const g=guess(x),what=g.text?' · '+g.text:'';
  for(const seg of x.rec.parts||[{at:x.when,len:x.p.duration}])if(seg.at>now)events.push({id:x.id+'@'+seg.at,sid:x.id,mini:!!x.p.mini,t:seg.at,l:localStamp(seg.at),title:x.p.name,msg:(seg.len?'موعد الجلسة · '+seg.len+' دقيقة':'موعد الجلسة')+what});
  /* One gentle follow-up an hour after the session ends, while it can still be logged. */
  const after=x.when+(x.p.duration||0)*MIN+60*MIN;if(follow&&after>now&&after<deadline(x))events.push({id:x.id+'@follow',sid:x.id,mini:!!x.p.mini,t:after,l:localStamp(after),title:'هل أنجزت «'+x.p.name+'»؟',msg:'سجّلها بضغطة من هنا'+what});
 }
 if(db.cfg.summary&&db.ps.length)for(let s=first;s<=last;s=shift(s,1)){const t=time(s,db.cfg.morning),day=all.filter(x=>iso(new Date(x.when))===s&&!x.rec.done&&!x.rec.missed).sort((a,b)=>a.when-b.when);if(t>now&&day.length)events.push({id:'morning@'+s,t,l:s+'T'+db.cfg.morning,title:'برامجي اليوم · '+day.length+' جلسات',msg:day.slice(0,3).map(x=>x.p.name+' '+clock(x.when)).join('، ')+(day.length>3?' وغيرها':'')})}
 if(db.ps.length){const d=Number.isInteger(db.cfg.reviewDay)?db.cfg.reviewDay:4;for(let s=first;s<=shift(first,7);s=shift(s,1))if(date(s).getDay()===d&&db.cfg.reviewed!==weekStart(s)){const t=time(s,'20:00');if(t>now)events.push({id:'review@'+s,t,l:s+'T20:00',title:'مراجعة أسبوعك جاهزة',msg:'دقيقتان: ما نجح، وما تعثّر، وتعديل واحد للأسبوع القادم'});break}}
 const json=JSON.stringify(events);if(json!==alarmCache){Phone.alarms(json);alarmCache=json}
 widgetData();
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;let id=b.dataset.id,x;
 switch(b.dataset.act){
 case 'improve':{let [pid,step]=id.split('|');let p=db.ps.find(p=>p.id===pid);if(!p)break;let next=items({...db,ps:[p]},today(),shift(today(),370)).find(x=>x.when>Date.now()&&!x.rec.done);if(!next){toast('لا توجد جلسة قادمة');break}db.logs[next.id]={...next.rec,focus:'ابدأ بخطوة «'+p.steps[+step]+'»'};save();toast('أضيف التحسين لجلسة '+full(next.when));break}
 case 'analysis':assistantPanel(true);break;
 case 'assistant':assistantPanel();break;
 case 'miss':miss(ref(id));break;
 case 'resume':{const old=db.ps.find(p=>p.id===id);if(!old)break;const p={...old,id:uid(),start:shift(today(),1),end:'',archived:false,lineage:lineage(old),origin:old.origin||old.start};delete p.replacedBy;if(['daily','once'].includes(p.repeat))delete p.origin;old.replacedBy=p.id;db.ps.push(p);save();toast('يُستأنف البرنامج من الغد');break}
 case 'purge':{const old=db.ps.find(p=>p.id===id);if(!old)break;ask('حذف «'+old.name+'» نهائيًا؟','يُحذف البرنامج وكل سجله، ولا يمكن التراجع إلا من نسخة احتياطية.','حذف نهائي',true).then(ok=>{if(!ok)return;const L=lineage(old),ids=new Set(db.ps.filter(p=>lineage(p)===L).map(p=>p.id));db.ps=db.ps.filter(p=>lineage(p)!==L);for(const k of Object.keys(db.logs))if(ids.has(k.split('@')[0]))delete db.logs[k];save();toast('حُذف البرنامج')});break}
 case 'fix':try{Phone.fixNotify(id)}catch{}break;
 case 'testnotify':try{Phone.testNotify();toast('سيصلك إشعار تجريبي بعد دقيقة. أقفل الشاشة وانتظر.')}catch{}break;
 case 'backupfolder':try{Phone.pickBackupFolder()}catch{}break;
 case 'webshare':shareText(WEB_URL);break;
 case 'webcopy':navigator.clipboard?.writeText(WEB_URL).then(()=>toast('نُسخ الرابط'),()=>toast('تعذر النسخ'));break;
 case 'checkupdate':try{Phone.checkUpdate(false);toast('جارٍ البحث عن تحديث…')}catch{}break;
 case 'updatenow':updateDialog();break;
 case 'page':page=id;render();break;
 case 'new':program();break;
 case 'edit':program(db.ps.find(p=>p.id===id));break;
 case 'archive':{let p=db.ps.find(p=>p.id===id);if(!p)break;ask('إيقاف «'+p.name+'»؟','يتوقف بعد اليوم ويبقى سجله، وتستأنفه متى شئت من «البرامج الموقوفة».','إيقاف').then(ok=>{if(!ok)return;p.end=p.end&&p.end<today()?p.end:today();p.archived=true;save();toast('أُوقف البرنامج')});break}
 case 'sync':syncPanel();break;
 case 'settings':settings();break;
 case 'block':block();break;
 case 'delblock':db.blocks=db.blocks.filter(b=>b.id!==id);save();settings('busy');break;
 case 'setview':settings(id);break;
 case 'domup':case 'domdown':{const l=ownDomains(),i=+id,j=b.dataset.act==='domup'?i-1:i+1;if(l[j]){[l[i],l[j]]=[l[j],l[i]];save();settings('domains')}break}
 case 'domdel':{const l=ownDomains(),d=l[+id];if(!d)break;const used=db.ps.filter(p=>!p.archived&&p.cat===d.name).length;ask('حذف مجال «'+d.name+'»؟',used?'فيه '+n(used)+' برامج، تبقى كما هي بسجلها، ويختفي المجال من القائمة فقط.':'يختفي من قائمة المجالات.','حذف',true).then(ok=>{if(!ok)return;l.splice(+id,1);save();settings('domains')});break}
 case 'kinddel':{const used=db.ps.filter(p=>p.kind===id).length;if(used){ask('لا يمكن حذفها','تستخدمها '+n(used)+' برامج، وسجلها يعتمد عليها. يمكنك إخفاؤها من القوائم بدل حذفها.','إخفاؤها').then(ok=>{if(!ok)return;db.cfg.kinds={...db.cfg.kinds,[id]:{...db.cfg.kinds[id],hidden:true}};save();settings('kinds')});break}
  ask('حذف «'+(kinds[id]?.label||'')+'»؟','لا تستخدمها أي برامج.','حذف',true).then(ok=>{if(!ok)return;const c={...db.cfg.kinds};delete c[id];db.cfg.kinds=c;if(Array.isArray(db.cfg.domains))for(const d of db.cfg.domains)d.kinds=d.kinds.filter(k=>k!==id);save();settings('kinds')});break}
 case 'log':log(ref(id));break;
 case 'step':{const cut=id.lastIndexOf('|'),sid=id.slice(0,cut),i=+id.slice(cut+1);x=ref(sid);if(!x||x.rec.done)break;openLists.add(sid);
  const on=new Set(x.rec.steps||[]);b.checked?on.add(i):on.delete(i);const steps=[...on].filter(k=>k<x.p.steps.length).sort((a,c)=>a-c),before=db.logs[sid];
  db.logs[sid]={...x.rec,steps};const all=steps.length===x.p.steps.length;if(all)recordDone(ref(sid));
  /* Confirm only after a real save; a failed save restores the previous record and redraws the card. */
  if(save()!==true){if(before)db.logs[sid]=before;else delete db.logs[sid];render();toast('لم يُحفظ تعليم الخطوة. حاول مرة أخرى.');break}
  if(all)toast('اكتملت كل الخطوات! «'+x.p.name+'» منجزة',()=>{if(before)db.logs[sid]=before;else delete db.logs[sid];save()});
  break}
 case 'quickdone':case 'minidone':{x=ref(id);if(!x)break;const mini=b.dataset.act==='minidone',before=db.logs[id],g=recordDone(x,mini);save();const st=streak(db,x.p);toast((mini?'خطوة صغيرة محسوبة! «':'أحسنت! «')+x.p.name+'»'+(g.text&&!x.rec.m?' · '+g.text:'')+(st.count>1?' · '+n(st.count)+' متتالية':''),()=>{if(before)db.logs[id]=before;else delete db.logs[id];save()});break}
 case 'move':x=ref(id);let slots=alternatives(x,db),split=splitOffer(x,db);modal('اقتراح موعد بديل','<p>'+esc(x.p.name)+(x.p.duration?' · المتبقي '+n(Math.max(1,x.p.duration-(x.rec.minutes||0)))+' دقيقة':'')+'</p><p class="muted">اختر موعدًا، وتُنقل هذه الجلسة وحدها.</p><div class="slots">'+slots.map(t=>btn(ic('clock')+'<span>'+full(t)+'</span>'+ic('next','go'),'accept',id+'|'+t,'slot')).join('')+'</div>'+(split?'<div class="card"><b>أو قسّم المتبقي على فترتين</b><p>'+split.map(a=>full(a.at)+' · '+n(a.len)+' دقيقة').join('<br>')+'</p>'+btn(ic('swap')+'اعتماد التقسيم','split',id+'|'+split[0].at+'|'+split[1].at,'tonal')+'</div>':'')+(slots.length||split?'':empty('لا توجد فترة كافية خلال الأسبوعين القادمين.')));break;
 case 'split':{const [k,a,b]=id.split('|');x=ref(k);const parts=splitOffer(x,db);if(!parts||parts[0].at!==+a||parts[1].at!==+b){toast('أعد طلب المواعيد المتاحة');break}db.logs[k]={...x.rec,parts,move:parts[0].at,missed:0};closeD();save();toast('اعتُمد تقسيم الجلسة');break}
 case 'accept':{let [key,t]=id.split('|');x=ref(key);if(!alternatives(x,db).includes(+t)){toast('تغير الوقت المتاح. اطلب اقتراحًا جديدًا');break}db.logs[key]={...x.rec,parts:null,move:+t,missed:0};closeD();save();toast('اعتُمد الموعد البديل');break}
 case 'day':selected=id;render();break;
 case 'calmode':month=id==='month'?true:id==='week'?false:!month;render();break;
 case 'calstep':{let d=date(selected);selected=month?iso(new Date(d.getFullYear(),d.getMonth()+Number(id),1)):shift(selected,7*Number(id));render();break}
 case 'range':range=range==='week'?'month':'week';rOff=0;render();break;
 case 'rstep':rOff=Math.min(0,rOff+Number(id));render();break;
 case 'rangeset':range=id;rOff=0;render();break;
 case 'excel':{const data=rows(),wb=XLSX.utils.book_new(),[a,z]=period(rOff);XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary(data)),'ملخص البرامج');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),'سجل الجلسات');writeFile('Baramiji-'+a+'_'+z+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',XLSX.write(wb,{type:'base64',bookType:'xlsx'}));break}
 case 'print':window.Phone?Phone.printPage():window.print();break;
 case 'backup':writeFile('Baramiji-'+today()+'.json','application/json',base64(JSON.stringify(db)));break;
 case 'restore':if(window.Phone)Phone.restore();else{let f=document.createElement('input');f.type='file';f.accept='.json';f.onchange=async()=>{if(f.files[0])importText(await f.files[0].text())};f.click()}break;
 }
});
document.addEventListener('change',e=>{if(e.target.id==='filter'){filter=e.target.value;render()}});
matchMedia('(prefers-color-scheme:dark)').addEventListener('change',render);
takeNative();render();openFromNotice();alarms();if(window.Phone)try{Phone.checkUpdate(true)}catch{}
document.addEventListener('visibilitychange',()=>{if(!document.hidden){takeNative();render();openFromNotice();alarms();window.queueSync?.();if($('#dialog').open&&$('#body .settings'))settings(setView)}});setInterval(()=>{if(!document.hidden&&!$('#dialog').open)render()},60000);

function improvements(data){
 const counts=new Map();for(const row of data){const x=ref(row['معرف الجلسة']);if(!x||!db.logs[x.id])continue;x.p.steps.forEach((step,i)=>{if(!x.rec.steps?.includes(i)){const k=x.p.id+'|'+i;counts.set(k,(counts.get(k)||0)+1)}})}
 return [...counts].filter(([k,n])=>n>=2).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,n])=>{let [id,i]=k.split('|'),p=db.ps.find(p=>p.id===id);return '<div class="card"><b>'+esc(p.name)+'</b><p>بقيت خطوة «'+esc(p.steps[i])+'» في '+n+' جلسات مسجلة.</p>'+btn('ذكّرني بالبدء بها في الجلسة القادمة','improve',k)+'</div>'}).join('')
}

function miss(x){
 if(!x)return;
 modal('فاتتني · '+x.p.name,form('missForm','<p>'+full(x.when)+'</p>'+sel('reason','السبب',reasonsMap(),x.rec.reason||'')+field('note','ملاحظة للمرة القادمة',x.rec.note||''),'سجّلها فائتة'));
 $('#missForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));db.logs[x.id]={...x.rec,missed:Date.now(),done:0,reason:d.reason,note:d.note};closeD();save();toast('سُجّلت الجلسة فائتة')};
}
function ownDomains(){if(!Array.isArray(db.cfg.domains))db.cfg.domains=domains(db).map(d=>({name:d.name,kinds:[...d.kinds]}));return db.cfg.domains}
function domainChecks(kid){const ds=domains(db);return '<fieldset class="chipset"><legend>تظهر في المجالات</legend>'+ds.map((d,i)=>check('dm'+i,d.name,d.kinds.includes(kid))).join('')+'</fieldset>'}
function saveKindDomains(f,kid){const l=ownDomains();l.forEach((d,i)=>{const on=f['dm'+i]?.checked;if(on&&!d.kinds.includes(kid))d.kinds.push(kid);if(!on)d.kinds=d.kinds.filter(k=>k!==kid)})}
function programSetting(view){
 const [what,id]=view.split(':'),back=t=>'<button type="button" class="sback" data-act="setview" data-id="'+t+'">'+ic('back')+(t==='domains'?'المجالات':'طرق القياس')+'</button>';
 const kindChoices=Object.keys(kinds).filter(k=>k&&(!kinds[k].hidden));
 if(what==='domain'){
  const ds=domains(db),d=id==='new'?{name:'',kinds:[]}:ds[+id];if(!d){settings('domains');return}
  modal(id==='new'?'مجال جديد':'تعديل المجال','<div class="settings sub">'+back('domains')+form('domForm',input('name','اسم المجال','text',d.name,'required maxlength=40')+'<fieldset class="chipset"><legend>طرق القياس المناسبة له</legend>'+(kindChoices.map(k=>check('k_'+k,kinds[k].label,d.kinds.includes(k))).join('')||'<p class="muted">لا توجد طرق قياس بعد.</p>')+'</fieldset><p class="muted">القياس العام (كمية وجودة) متاح دائمًا.</p>','حفظ')+(id==='new'?'':'<div class="actions">'+btn(ic('trash')+'حذف المجال','domdel',id,'ghost danger')+'</div>')+'</div>');
  $('#domForm').onsubmit=e=>{e.preventDefault();const f=e.target,name=f.name.value.trim(),list=ownDomains();if(!name)return;
   if(list.some((x,i)=>x.name===name&&String(i)!==id)){toast('هذا المجال موجود');return}
   const ks=kindChoices.filter(k=>f['k_'+k].checked).concat(id==='new'?[]:list[+id].kinds.filter(k=>!kindChoices.includes(k)));
   if(id==='new')list.push({name,kinds:ks});else{const old=list[+id].name;list[+id]={name,kinds:ks};if(old!==name)for(const p of db.ps)if(p.cat===old)p.cat=name}
   save();toast('حُفظ المجال');settings('domains')};
  return}
 const k=id==='new'?null:kinds[id];if(id!=='new'&&!k){settings('kinds');return}
 if(k&&!k.custom){
  modal('طريقة قياس أساسية','<div class="settings sub">'+back('kinds')+form('kindForm',input('label','الاسم','text',k.label,'required maxlength=40')+'<p class="muted">الحقول: '+esc(k.fields.map(f=>f[1]).join('، '))+'. حقول الطرق الأساسية ثابتة لأن التطبيق يحسب منها تقدم الأهداف.</p>'+check('hidden','إخفاؤها من القوائم',!!k.hidden)+domainChecks(id),'حفظ')+'</div>');
  $('#kindForm').onsubmit=e=>{e.preventDefault();const f=e.target;db.cfg.kinds={...db.cfg.kinds};const o={};if(f.label.value.trim()&&f.label.value.trim()!==BASE_LABELS[id])o.label=f.label.value.trim();if(f.hidden.checked)o.hidden=true;if(Object.keys(o).length)db.cfg.kinds[id]=o;else delete db.cfg.kinds[id];saveKindDomains(f,id);save();toast('حُفظت');settings('kinds')};
  return}
 const o=id==='new'?{label:'',unit:'',fields:[],sum:''}:db.cfg.kinds[id],rows=[...o.fields,...Array(Math.max(2,3-o.fields.length)).fill(null)].slice(0,8);
 modal(id==='new'?'طريقة قياس جديدة':'تعديل طريقة القياس','<div class="settings sub">'+back('kinds')+form('kindForm',input('label','الاسم','text',o.label,'required maxlength=40 placeholder="مثال: قراءة كتاب"')+input('unit','وحدة التقدم (اختياري)','text',o.unit,'maxlength=20 placeholder="مثال: صفحة"')
  +'<fieldset class="frows"><legend>ما الذي تسجله بعد كل جلسة؟</legend>'+rows.map((x,i)=>'<div class="frow"><input name="fl'+i+'" placeholder="'+(i?'حقل آخر (اختياري)':'مثل: عدد الصفحات')+'" value="'+esc(x?.label||'')+'" maxlength="40"><input type="hidden" name="fk'+i+'" value="'+esc(x?.key||'')+'"><select name="ft'+i+'">'+opts(fieldTypes,x?.type||'count')+'</select></div>').join('')+'</fieldset>'
  +'<label>ما يُحسب في تقدم الهدف<select name="sum"><option value="">لا شيء</option><option value="minutes" '+(o.sum==='minutes'?'selected':'')+'>الدقائق المنجزة</option>'+o.fields.map((x,i)=>x.type==='text'?'':'<option value="#'+i+'" '+(o.sum===x.key?'selected':'')+'>'+esc(x.label)+'</option>').join('')+'</select></label>'+domainChecks(id)
  +(id==='new'?'':check('hidden','إخفاؤها من القوائم',!!o.hidden)),'حفظ')+(id==='new'?'':'<div class="actions">'+btn(ic('trash')+'حذف','kinddel',id,'ghost danger')+'</div>')+'</div>');
 $('#kindForm').onsubmit=e=>{e.preventDefault();const f=e.target,label=f.label.value.trim();if(!label)return;
  const fields=[];rows.forEach((_,i)=>{const l=f['fl'+i].value.trim();if(l)fields.push({key:f['fk'+i].value||'f'+uid().slice(0,6),label:l,type:f['ft'+i].value})});
  if(!fields.length){toast('أضف حقلًا واحدًا على الأقل');return}
  const kid=id==='new'?'k_'+uid().slice(0,8):id;let sum=f.sum.value;if(sum.startsWith('#')){const l=f['fl'+sum.slice(1)].value.trim();sum=fields.find(x=>x.label===l&&x.type!=='text')?.key||''}if(sum&&sum!=='minutes'&&!fields.some(x=>x.key===sum&&x.type!=='text'))sum='';
  db.cfg.kinds={...db.cfg.kinds,[kid]:{label,unit:f.unit.value.trim(),fields,sum,...(f.hidden?.checked?{hidden:true}:{})}};
  saveKindDomains(f,kid);save();toast('حُفظت طريقة القياس');settings('kinds')};
 $('#kindForm').oninput=e=>{if(!/^f[lt]/.test(e.target.name||''))return;const f=e.currentTarget,cur=f.sum.value;f.sum.innerHTML='<option value="">لا شيء</option><option value="minutes">الدقائق المنجزة</option>'+rows.map((_,i)=>[f['fl'+i].value.trim(),f['ft'+i].value,i]).filter(([l,t])=>l&&t!=='text').map(([l,,i])=>'<option value="#'+i+'">'+esc(l)+'</option>').join('');f.sum.value=[...f.sum.options].some(o=>o.value===cur)?cur:''};
}
function phoneAlerts(){
 if(!window.Phone)return '';
 let st={};try{st=JSON.parse(Phone.notifyStatus())}catch{}
 const row=(ok,label,kind)=>'<div class="status"><span>'+(ok?'<b class="ok">✓</b> ':'<b class="no">✗</b> ')+esc(label)+'</span>'+(ok?'':btn('إصلاح','fix',kind,'tonal'))+'</div>';
 return '<h4 class="sgroup">حالة الجوال</h4>'+row(st.notif,'السماح بالإشعارات','notif')+row(st.exact,'المنبه الدقيق','exact')+row(st.battery,'الاستثناء من توفير البطارية','battery')
 +'<details><summary>نصيحة لجوالات سامسونج</summary><p class="muted">أضف برامجي إلى: الإعدادات ← البطارية ← حدود الاستخدام في الخلفية ← التطبيقات غير النائمة أبدًا.</p></details><div class="actions">'+btn('إشعار تجريبي بعد دقيقة','testnotify',' ','ghost')+'</div>';
}
const lastBackup=t=>/^\d{4}-\d\d-\d\d/.test(t||'')?fmt(t.slice(0,10)+'T12:00',{weekday:'long',day:'numeric',month:'long'}):(t||'لم تُحفظ بعد');
function phoneBackup(){
 if(!window.Phone)return '';
 let b={};try{b=JSON.parse(Phone.backupInfo())}catch{}
 return '<h4 class="sgroup">نسخة يومية تلقائية</h4><p>'+(b.folder?'المجلد: '+esc(b.folder)+'<br>آخر نسخة: '+esc(lastBackup(b.last))+(b.error?'<br><b class="no">'+esc(b.error)+'</b>':''):'اختر مجلدًا في الجوال ليحفظ التطبيق فيه نسخة يومية ويبقي آخر 30 نسخة.')+'</p><div class="actions">'+btn(b.folder?'تغيير المجلد':'اختيار مجلد','backupfolder',' ','tonal')+'</div>';
}
window.updateInfo=function(json,silent){
 let u=null;try{u=JSON.parse(json)}catch{}
 if(!u||u.error){if(!silent)toast(u?.error||'تعذر التحقق من التحديثات');return}
 if(!u.available){update=null;if(!silent)toast('لديك أحدث إصدار');render();return}
 update=u;render();if(!silent)updateDialog();
};
function updateDialog(){
 if(!update)return;
 modal('تحديث متاح','<p>الإصدار '+esc(update.versionName)+'</p><p>'+esc(update.notes||'')+'</p><p class="muted">يُنزَّل التحديث هنا، ثم تظهر شاشة «تحديث» من أندرويد. بياناتك تبقى كما هي.</p><p id="updStatus" role="status"></p><div class="actions"><button class="primary" id="doUpdate">تحديث الآن</button></div>');
 $('#doUpdate').onclick=()=>{$('#doUpdate').disabled=true;try{Phone.installUpdate()}catch{$('#doUpdate').disabled=false}};
}
window.updateProgress=function(t,failed){if($('#updStatus'))$('#updStatus').textContent=t;else toast(t);if(failed&&$('#doUpdate'))$('#doUpdate').disabled=false};
window.onPhoneConfig=function(){render()};
window.onBackupFolder=function(){render();if($('#dialog').open&&$('#body .settings'))settings(setView)};

window.onLocation=function(lat,lon,error){
 const f=$('#cfg');if(error||lat==null){toast(error||'تعذر تحديد الموقع. تأكد من تشغيل الموقع في الجوال.');return}
 if(window.onboardLocate&&$('#onboardForm')){window.onboardLocate=false;db.cfg.lat=+(+lat).toFixed(4);db.cfg.lon=+(+lon).toFixed(4);$('#onboardForm').city.value='موقعي الحالي';document.querySelectorAll('#obCities button').forEach(x=>x.classList.toggle('on',x.id==='obLocate'));toast('حُدّد موقعك');return}
 if(!f){toast('افتح الإعدادات ثم حدّد موقعك');return}
 f.lat.value=(+lat).toFixed(4);f.lon.value=(+lon).toFixed(4);if(!f.city.value.includes('موقعي'))f.city.value='موقعي الحالي';toast('حُدّد الموقع. اضغط «حفظ» لاعتماده.');
};

/* A tapped session notification opens «يومي» and points at that session. */
function openFromNotice(){let sid=null;try{sid=window.Phone?.takeOpen?.()}catch{}if(!sid)return;
 if($('#dialog').open)closeD();page='يومي';render();
 const el=[...document.querySelectorAll('#content [data-sid]')].find(e=>e.dataset.sid===sid);
 if(el){el.scrollIntoView({block:'center'});el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),2200)}else scrollTo(0,0)}
