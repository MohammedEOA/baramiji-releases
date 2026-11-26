'use strict';
/* Keeping the habit alive: away periods, welcome back, weekly review, plan suggestions, milestones,
   first-run templates and sharing. Loaded before app.js; everything here runs on user actions. */

/* ---------- Away periods (travel, illness, leave) ---------- */
const awayLabels=['سفر','مرض','إجازة','ظرف عائلي','أخرى'];
function awayForm(pre={}){
 const active=[...new Map(db.ps.filter(p=>!p.archived).map(p=>[lineage(p),p.name]))];
 modal('سفر أو مرض أو إجازة',form('awayForm','<p class="muted">لا تُجدول البرامج في هذه الأيام ولا تُحسب في التقارير ولا تكسر السلاسل.</p>'+sel('label','السبب',Object.fromEntries(awayLabels.map(l=>[l,l])),pre.label||'سفر')+'<div class="grid">'+input('from','من','date',pre.from||today(),'required')+input('to','إلى','date',pre.to||shift(today(),6),'required')+'</div>'
  +(active.length?'<fieldset class="chipset"><legend>برامج تستمر رغم ذلك (اختياري)</legend>'+active.map(([L,name])=>check('k_'+L,name,(pre.keep||[]).includes(L))).join('')+'</fieldset>':''),'حفظ'));
 $('#awayForm').onsubmit=e=>{e.preventDefault();const f=e.target,d=Object.fromEntries(new FormData(f));if(d.to<d.from){toast('اختر نهاية بعد البداية');return}
  const keep=active.map(([L])=>L).filter(L=>f.elements['k_'+L]?.checked);
  db.cfg.away=[...(db.cfg.away||[]).filter(a=>a.id!==pre.id),{id:pre.id||uid(),label:d.label,from:d.from,to:d.to,keep}];
  /* Sessions in the period that were closed as unlogged become simply not scheduled. */
  closeD();save();toast(d.from<=today()&&d.to>=today()?'سلامتك. البرامج متوقفة حتى '+fmt(date(d.to),{day:'numeric',month:'long'}):'حُفظت فترة العذر')};
}
function awayList(){
 const l=(db.cfg.away||[]).slice().sort((a,b)=>a.from<b.from?1:-1);
 return '<p class="muted">أيام لا تُجدول فيها البرامج ولا تُحسب. تُضاف من «يومي» أو من هنا.</p>'+(l.map(a=>'<div class="status"><span>'+esc(a.label)+' · '+fmt(date(a.from),{day:'numeric',month:'short'})+' – '+fmt(date(a.to),{day:'numeric',month:'short',year:'numeric'})+((a.keep||[]).length?' · يستمر '+n(a.keep.length)+' برامج':'')+'</span>'+btn(ic('trash'),'awaydel',a.id,'ghost danger')+'</div>').join('')||'<p>لا توجد فترات.</p>')+'<div class="actions">'+btn(ic('plus')+'إضافة فترة','awaynew',' ','tonal')+'</div>';
}

/* ---------- Fair numbers ---------- */
const OPEN_STATES=['قادمة','ضمن السماح','متأخرة','منقولة','في الموعد البديل'];
/* Completion counts only sessions whose result is known; logging coverage is shown on its own. */
function fair(data){
 const known=data.filter(r=>!OPEN_STATES.includes(r['الحالة'])),done=known.filter(finished).length,unl=known.filter(r=>r['الحالة']==='لم تُسجَّل').length,res=known.length-unl;
 /* rate: done out of sessions with a recorded result (done, missed, partial); cover: recorded out of all past sessions. */
 return {known:known.length,res,done,open:data.length-known.length,rate:res?100*done/res:null,cover:known.length?100*res/known.length:null};
}
/* One sentence that says what the numbers mean. */
function insight(f,prev,data){
 if(f.known===0)return f.open?'الجلسات ما زالت مفتوحة. سجّل ما تنجزه وتظهر النتيجة هنا.':'لا توجد جلسات في هذه الفترة.';
 if(f.cover!=null&&f.cover<70)return 'لم تُسجَّل '+n(Math.round(100-f.cover))+'٪ من الجلسات. سجّل أولًا بأول، فقد تكون أنجزت أكثر مما يظهر.';
 if(f.rate==null)return 'لم تسجل نتيجة أي جلسة بعد في هذه الفترة.';
 const by=summary(data).filter(o=>o['الجلسات']>=2).sort((a,b)=>b['نسبة الإنجاز %']-a['نسبة الإنجاز %']);
 if(prev&&prev.rate!=null&&f.rate-prev.rate>=10)return 'أفضل من الفترة السابقة بـ '+n(Math.round(f.rate-prev.rate))+' نقطة'+(by[0]?'، وأقواها «'+by[0]['البرنامج']+'».':'.');
 if(f.rate>=85)return 'التزام ممتاز'+(by[0]?'، و«'+by[0]['البرنامج']+'» في القمة.':'.');
 const reasons={};for(const r of data)if(!finished(r)&&r['سبب النقص'])reasons[r['سبب النقص']]=(reasons[r['سبب النقص']]||0)+1;const top=Object.entries(reasons).sort((a,b)=>b[1]-a[1])[0];
 if(top&&top[1]>=2)return 'أكثر ما أعاقك: '+top[0]+' ('+n(top[1])+' مرات). جرّب الحد الأدنى أو موعدًا آخر.';
 const low=by.at(-1);if(low&&low['نسبة الإنجاز %']<50)return '«'+low['البرنامج']+'» يحتاج تعديلًا: '+n(low['نسبة الإنجاز %'])+'٪ فقط. انظر الاقتراحات بالأسفل.';
 return 'استمر. كل جلسة تسجلها تقربك من هدفك.';
}

/* ---------- Plan suggestions ---------- */
function recentOf(p,days=28){
 const L=lineage(p),vs=db.ps.filter(q=>lineage(q)===L),s=today();
 return items({...db,ps:vs},shift(s,-days),s).filter(x=>x.at<=Date.now()&&!isOpen(x)&&status(x)!=='لم تُسجَّل').slice(-8);
}
const roundTo=(v,step)=>Math.max(step,Math.round(v/step)*step);
function hhmm(t){const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function suggestions(){
 const out=[],now=today(),dis=db.cfg.dismissed||{};
 for(const p of db.ps.filter(p=>!p.archived)){
  const L=lineage(p),rec=recentOf(p);if(rec.length<4)continue;
  const done=rec.filter(isDone),rate=done.length/rec.length,unit=p.unit||kinds[p.kind||'']?.unit||'',miniUnit=['hifz','review','study'].includes(p.kind)||p.unit||kinds[p.kind]?.sum&&kinds[p.kind].sum!=='minutes'?unit:'دقيقة';
  const add=(key,text,why,change)=>{if(!dis[key+'|'+L]||between(dis[key+'|'+L],now)>28)out.push({key,L,p,text,why,change,score:1-rate})};
  if(rate<0.6){
   if(!p.mini&&(p.target>1||p.duration>=10)){const v=miniUnit==='دقيقة'?roundTo((p.duration||20)/3,5):Math.max(1,Math.floor((p.target||2)/2));add('mini','أضف حدًا أدنى لـ«'+p.name+'»: '+n(v)+' '+miniUnit,'أُنجزت '+n(done.length)+' من '+n(rec.length)+' جلسات. في الأيام المزدحمة يحفظ الحد الأدنى السلسلة.',{mini:v})}
   const late=done.filter(x=>x.rec.done-x.at>90*MIN&&iso(new Date(x.rec.done))===x.s);
   if(!p.anchor&&late.length>=2){const mins=late.map(x=>{const d=new Date(x.rec.done);return d.getHours()*60+d.getMinutes()}).sort((a,b)=>a-b),m=roundTo(mins[Math.floor(mins.length/2)],15)%1440,clock=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');if(clock!==p.clock)add('time','انقل «'+p.name+'» إلى '+clock2(clock),'تنجزه عادة متأخرًا عن موعده، قرب الساعة '+clock2(clock)+'.',{clock})}
   const moved=rec.filter(x=>x.rec.move);if(!p.anchor&&moved.length>=3){const m=roundTo(Math.round(moved.map(x=>{const d=new Date(x.rec.move);return d.getHours()*60+d.getMinutes()}).reduce((a,b)=>a+b,0)/moved.length),15)%1440,clock=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');if(clock!==p.clock)add('moved','اجعل موعد «'+p.name+'» '+clock2(clock),'نقلته '+n(moved.length)+' مرات إلى وقت قريب من هذا.',{clock})}
   if(p.mini&&p.target>1&&!['hifz','review'].includes(p.kind))add('less','خفّف مستهدف «'+p.name+'» إلى '+n(Math.max(1,Math.round(p.target*0.75)))+' '+unit,'المستهدف الحالي أكبر مما يسمح به وقتك الآن. الاستمرار أهم من الكمية.',{target:Math.max(1,Math.round(p.target*0.75))});
  }else if(rate>=0.9&&p.target>0&&rec.length>=6){
   const over=done.filter(x=>amount(x.p,x.rec)>=p.target*1.25||+x.rec.quantity>=p.target*1.25);
   if(over.length>=5){const avg=over.reduce((a,x)=>a+(amount(x.p,x.rec)||+x.rec.quantity||0),0)/over.length,v=Math.round(avg*4)/4;add('more','ارفع مستهدف «'+p.name+'» إلى '+n(v)+' '+unit,'تجاوزت المستهدف في '+n(over.length)+' من آخر '+n(rec.length)+' جلسات.',{target:v})}
  }
 }
 return out.sort((a,b)=>b.score-a.score);
}
const clock2=t=>clock(time(today(),t));
/* Apply a plan change. The minimum changes the program in place; a new time or target applies from
   tomorrow as a new version, so past sessions keep the plan they had. */
function revise(p,change){
 if(Object.keys(change).every(k=>k==='mini'||k==='skips')){Object.assign(p,change);return}
 const start=shift(today(),1),q={...p,...change,id:uid(),lineage:lineage(p),start,end:p.end&&p.end>start?p.end:'',archived:false};
 if(!['daily','once'].includes(p.repeat)&&!p.days)q.origin=p.origin||p.start;delete q.replacedBy;
 p.end=today();p.archived=true;p.replacedBy=q.id;db.ps.push(q);
}
function sugCard(sg,i){return '<article class="card sug">'+ic('bulb')+'<div><b>'+esc(sg.text)+'</b><p>'+esc(sg.why)+'</p><div class="actions">'+btn('طبّق','applysug',sg.key+'|'+sg.L,'tonal')+btn('لاحقًا','dismisssug',sg.key+'|'+sg.L,'ghost')+'</div></div></article>'}

/* ---------- Weekly review ---------- */
function reviewDue(){
 if(!db.ps.length)return false;const s=today(),d=Number.isInteger(db.cfg.reviewDay)?db.cfg.reviewDay:4,idx=x=>(x+1)%7,wd=date(s).getDay();
 if(db.cfg.reviewed===weekStart(s))return false;
 return idx(wd)>idx(d)||(wd===d&&new Date().getHours()>=17);
}
function reviewCard(){return reviewDue()?'<article class="card review">'+ic('reports')+'<div><b>مراجعة أسبوعك جاهزة</b><p>دقيقتان: ما نجح، وما تعثّر، وتعديل واحد للأسبوع القادم.</p><div class="actions">'+btn('ابدأ المراجعة','review',' ','primary')+'</div></div></article>':''}
function weekSummary(){
 const s=today(),from=weekStart(s),data=rows(from,s),f=fair(data),prev=fair(rows(shift(from,-7),shift(from,-1)));
 const by=summary(data).filter(o=>o['الجلسات']>=2).sort((a,b)=>b['نسبة الإنجاز %']-a['نسبة الإنجاز %']);
 const reasons={};for(const r of data)if(!finished(r)&&r['سبب النقص'])reasons[r['سبب النقص']]=(reasons[r['سبب النقص']]||0)+1;
 const top=Object.entries(reasons).sort((a,b)=>b[1]-a[1])[0],best=bestStreak();
 return {from,f,prev,by,top,best,goals:db.goals.map(g=>({g,st:goalStats(g)}))};
}
function summaryText(w){
 const lines=['برامجي · أسبوع '+fmt(date(w.from),{day:'numeric',month:'long'}),'الإنجاز: '+(w.f.rate==null?'—':Math.round(w.f.rate)+'%')+' ('+w.f.done+' من '+w.f.res+' جلسات)'];
 for(const o of w.by)lines.push('• '+o['البرنامج']+': '+o['المكتملة']+'/'+o['الجلسات']);
 if(w.best&&w.best.count>1)lines.push('أطول سلسلة: '+w.best.p.name+' · '+w.best.count+' متتالية');
 for(const {g,st} of w.goals)if(st.cur!=null&&g.target!=='')lines.push('🎯 '+g.name+': '+num1(st.cur)+' من '+num1(g.target)+' '+(g.unit||''));
 if(db.cfg.focus&&db.cfg.focusWeek===w.from)lines.push('تركيزي هذا الأسبوع: '+db.cfg.focus);
 return lines.join('\n');
}
function weeklyReview(){
 const w=weekSummary(),sg=suggestions()[0];
 modal('مراجعة الأسبوع','<div class="tiles"><div class="tile hero">'+ring(w.f.rate||0,w.f.rate==null?'—':n(Math.round(w.f.rate))+'٪',72)+'<div><b>'+n(w.f.done)+' من '+n(w.f.res)+'</b><small>جلسات مكتملة هذا الأسبوع'+(w.f.cover!=null?' · سجّلت '+n(Math.round(w.f.cover))+'٪':'')+'</small>'+(w.prev.rate!=null&&w.f.rate!=null?'<div class="delta '+(w.f.rate>=w.prev.rate?'up':'down')+'">'+(Math.round(w.f.rate-w.prev.rate)===0?'مثل الأسبوع الماضي':(w.f.rate>w.prev.rate?'▲ ':'▼ ')+n(Math.abs(Math.round(w.f.rate-w.prev.rate)))+' نقطة عن الأسبوع الماضي')+'</div>':'')+'</div></div></div>'
  +'<h4 class="sgroup">ما نجح</h4><p>'+(w.by[0]?'«'+esc(w.by[0]['البرنامج'])+'» '+n(w.by[0]['المكتملة'])+' من '+n(w.by[0]['الجلسات']):'لا يكفي ما سُجّل هذا الأسبوع للحكم.')+(w.best&&w.best.count>1?'<br>'+ic('flame')+' أطول سلسلة: «'+esc(w.best.p.name)+'» '+n(w.best.count)+' متتالية':'')+'</p>'
  +'<h4 class="sgroup">ما تعثّر</h4><p>'+(w.top?'السبب الأكثر: '+esc(w.top[0])+' ('+n(w.top[1])+' مرات)':w.by.length>1&&w.by.at(-1)['نسبة الإنجاز %']<60?'«'+esc(w.by.at(-1)['البرنامج'])+'» '+n(w.by.at(-1)['المكتملة'])+' من '+n(w.by.at(-1)['الجلسات']):'لا شيء يُذكر. أحسنت.')+'</p>'
  +'<h4 class="sgroup">تعديل واحد للأسبوع القادم</h4>'+(sg?sugCard(sg):'<p class="muted">خطتك مناسبة كما هي.</p>')
  +form('reviewForm',input('focus','ما الذي تركز عليه الأسبوع القادم؟ (اختياري)','text','','maxlength=80 placeholder="مثال: ورد الحفظ قبل العمل"'),'تمت المراجعة')
  +'<div class="actions">'+btn(ic('share')+'شارك الملخص','share','week','ghost')+'</div>');
 $('#reviewForm').onsubmit=e=>{e.preventDefault();const v=e.target.focus.value.trim();const next=shift(weekStart(today()),7);if(v){db.cfg.focus=v;db.cfg.focusWeek=next}db.cfg.reviewed=weekStart(today());closeD();save();toast('أحسنت. أسبوع جديد بخطة أوضح')};
}
function shareText(text){
 try{if(window.Phone?.share){Phone.share(text);return}}catch{}
 if(navigator.share){navigator.share({text}).catch(()=>{});return}
 navigator.clipboard?.writeText(text).then(()=>toast('نُسخ الملخص. الصقه حيث تريد'),()=>toast('تعذر النسخ'));
}

/* ---------- Milestones ---------- */
function goalStep(g){
 const span=(+g.target||0)-(+g.base||0);if(!span)return null;
 if(/صفح/.test(g.unit||''))return {size:20,abs:true,label:k=>'أتممت '+(k===1?'الجزء الأول':k===2?'جزأين':k<=10?n(k)+' أجزاء':n(k)+' جزءًا')+' في «'+g.name+'»'};
 if(g.mode==='measure'&&Math.abs(span)<=30)return {size:1,label:k=>'تقدمت '+n(k)+' '+(g.unit||'')+' في «'+g.name+'»'};
 const size=Math.abs(span)/10;return {size,label:k=>'بلغت '+n(k*10)+'٪ من «'+g.name+'»'};
}
/* Called before every save: records milestones reached, and returns the newest one to celebrate. */
function checkWins(){
 let news=null;
 for(const g of db.goals){if(g.mode==='none')continue;const st=goalStep(g);if(!st)continue;const a=goalActual(g,db),cur=a.at(-1)?.[1];if(cur==null)continue;
  const dir=Math.sign((+g.target||0)-(+g.base||0)),k=Math.floor(Math.max(0,st.abs?cur:(cur-(+g.base||0))*dir)/st.size+1e-9);
  if(!Number.isInteger(g.won)){g.won=k;continue}
  if(k>g.won){g.wins=[...(g.wins||[]),{date:today(),label:st.label(k)}].slice(-30);g.won=k;news=st.label(k)}
  else if(k<g.won)g.won=k;
 }
 return news;
}
function celebrate(text){
 setTimeout(()=>{if($('#dialog').open)return;modal('ما شاء الله','<div class="celebrate">'+ic('trophy')+'<h2>'+esc(text)+'</h2><p class="muted">كل محطة تقربك من هدفك. استمر.</p></div><div class="actions">'+btn(ic('share')+'شارك','share','win:'+text,'ghost')+'<button class="primary" onclick="closeD()">استمر</button></div>')},400);
}

/* ---------- First run and templates ---------- */
const TEMPLATES={
 hifz:{label:'حفظ القرآن',goal:{name:'حفظ القرآن كاملًا بإتقان',mode:'sum',unit:'صفحة',target:604,years:3},p:{name:'ورد الحفظ',cat:'القرآن الكريم',anchor:'fajr',offset:15,duration:30,kind:'hifz',target:1,mini:1}},
 review:{label:'مراجعة المحفوظ',p:{name:'مراجعة المحفوظ',cat:'القرآن الكريم',anchor:'asr',offset:10,duration:25,kind:'review',target:10,smart:true,mini:2}},
 weight:{label:'زيادة الوزن',goal:{name:'زيادة الوزن 9 كغ',mode:'measure',unit:'كغ',gain:9,years:3},p:{name:'وجبة إضافية غنية بالبروتين',cat:'التغذية',clock:'16:00',duration:0}},
 workout:{label:'تمرين القوة',p:{name:'تمرين قوة',cat:'الرياضة',repeat:'weekly',days:[0,2,4],clock:'17:30',duration:45,kind:'workout',mini:15}},
 pmp:{label:'شهادة PMP',goal:{name:'اجتياز شهادة PMP',mode:'sum',unit:'درس',target:60,years:1},p:{name:'درس PMP',cat:'التطوير المهني',clock:'21:00',duration:40,kind:'study',target:1}},
 english:{label:'الإنجليزية والمحادثة',p:{name:'محادثة إنجليزية',cat:'اللغات',clock:'20:00',duration:20,kind:'time',mini:10}}
};
function newProgram(o){return {id:uid(),name:'',cat:'',repeat:'daily',clock:'07:00',anchor:'',offset:0,duration:0,grace:'day',allow:60,target:0,unit:o.kind?kinds[o.kind]?.unit||'':'',quality:'',steps:[],start:today(),end:'',remind:true,split:false,kind:'',...o}}
function applyTemplate(key,opts={}){
 const t=TEMPLATES[key];let g=null;
 if(t.goal){const due=new Date();due.setFullYear(due.getFullYear()+t.goal.years);const base=t.goal.mode==='measure'?+opts.weight:(key==='hifz'?parseRanges(opts.known).size:0);
  if(t.goal.mode==='measure'&&!Number.isFinite(base))return false;
  g={id:uid(),name:t.goal.name,mode:t.goal.mode,unit:t.goal.unit,base,target:t.goal.gain?base+t.goal.gain:t.goal.target,from:today(),due:iso(due),milestones:[],entries:{}};db.goals.push(g)}
 const p=newProgram({...t.p,...(g?{goalId:g.id,goal:g.name}:{})});p.lineage=p.id;
 if(['hifz','review'].includes(p.kind)&&opts.known){if(p.kind==='review')p.known=opts.known;else{const known=[...parseRanges(opts.known)];if(known.length)p.page=Math.min(604,Math.max(...known)+1)}}
 db.ps.push(p);return true;
}
function onboard(){
 const cities=['جدة','مكة المكرمة','المدينة المنورة','الرياض','الدمام','الخرطوم'];
 modal('أهلًا بك في برامجي','<p class="muted">ثلاث خطوات وتبدأ. يمكنك تغيير كل شيء لاحقًا.</p>'+(typeof CLOUD!=='undefined'?'<div class="actions">'+btn(ic('cloud')+'لديّ حساب: سجّل الدخول','sync',' ','tonal')+'</div>':'')+form('onboardForm',
  '<h4 class="sgroup">1. مدينتك (لمواقيت الصلاة)</h4><div class="chips" id="obCities">'+cities.map(c=>'<button type="button" data-city="'+esc(c)+'" class="'+(db.cfg.city===c?'on':'')+'">'+esc(c)+'</button>').join('')+'<button type="button" id="obLocate">'+ic('pin')+'موقعي</button></div><input type="hidden" name="city" value="'+esc(db.cfg.city)+'">'
  +'<h4 class="sgroup">2. ما الذي تريد المحافظة عليه؟</h4><div class="obt">'+Object.entries(TEMPLATES).map(([k,t])=>check('t_'+k,t.label,false)).join('')+'</div>'
  +'<div id="obMore">'+input('known','ما تحفظه من قبل (صفحات، مثل 1-40، 582-604)','text','','dir=ltr placeholder="1-40"')+input('weight','وزنك الآن (كغ)','number','','step=0.1 min=20 max=300')+'</div>'
  +'<h4 class="sgroup">3. تذكيرك</h4><div class="grid">'+input('morning','ملخص الصباح','time',db.cfg.morning||'07:00')+sel('reviewDay','يوم مراجعة الأسبوع',{4:'الخميس',5:'الجمعة',6:'السبت',0:'الأحد'},String(db.cfg.reviewDay??4))+'</div>','ابدأ')+'<div class="actions">'+btn('تخطَّ، سأضيف بنفسي','obskip',' ','ghost')+'</div>');
 const f=$('#onboardForm'),more=()=>{f.known.parentElement.hidden=!(f.t_hifz.checked||f.t_review.checked);f.weight.parentElement.hidden=!f.t_weight.checked;f.weight.required=f.t_weight.checked};f.onchange=more;more();
 document.querySelectorAll('#obCities [data-city]').forEach(b=>b.onclick=()=>{f.city.value=b.dataset.city;document.querySelectorAll('#obCities button').forEach(x=>x.classList.toggle('on',x===b))});
 $('#obLocate').onclick=()=>{window.onboardLocate=true;toast('جارٍ تحديد الموقع…');if(window.Phone?.locate)Phone.locate();else navigator.geolocation?.getCurrentPosition(p=>window.onLocation(p.coords.latitude,p.coords.longitude),()=>window.onLocation(null,null,'تعذر تحديد الموقع'),{timeout:20000})};
 f.onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f)),C={'جدة':[21.49,39.19],'مكة المكرمة':[21.42,39.83],'المدينة المنورة':[24.47,39.61],'الرياض':[24.71,46.68],'الدمام':[26.42,50.09],'الخرطوم':[15.50,32.56]};
  if(C[d.city])Object.assign(db.cfg,{city:d.city,lat:C[d.city][0],lon:C[d.city][1]});else if(d.city)db.cfg.city=d.city;
  if(/^\d\d:\d\d$/.test(d.morning))db.cfg.morning=d.morning;db.cfg.reviewDay=+d.reviewDay;
  const picked=Object.keys(TEMPLATES).filter(k=>f['t_'+k].checked);let made=0;for(const k of picked)if(applyTemplate(k,{known:d.known,weight:d.weight}))made++;
  db.cfg.onboarded=true;closeD();save();toast(made?'أضيف '+n(made)+' برامج إلى جدولك. عدّلها كما تشاء':'ابدأ بإضافة برنامجك الأول بزر ＋')};
}
window.addEventListener('load',()=>{if(!loadError&&!db.ps.length&&!db.goals.length&&!db.cfg.onboarded)setTimeout(()=>{if(!$('#dialog').open)onboard()},300)});

/* ---------- Notification and widget buttons ---------- */
/* «تم» pressed in a notification or on the home-screen widget is queued natively and applied here. */
function takeNative(){
 if(!window.Phone?.peekDone)return;let q=[];try{q=JSON.parse(Phone.peekDone()||'[]')}catch{}
 if(!q.length)return;
 let c=0;for(const e of q){const x=ref(e.sid);if(!x||x.rec.done)continue;if(e.missed){db.logs[x.id]={...x.rec,missed:e.t||Date.now(),done:0};continue}recordDone(x,!!e.mini,e.t||Date.now());c++}
 /* Remove from the native queue only after an explicit successful save; a failed or blocked save (loadError)
    keeps the events for the next try (applying one again is harmless: a session already done is skipped). */
 if(save()!==true)return;
 try{Phone.ackDone(JSON.stringify(q.map(e=>e.qid)))}catch{}
 if(c)toast('سُجّلت '+n(c)+' جلسات من الإشعار');
}
let widgetCache='';
function widgetData(){
 if(!window.Phone?.widget)return;const s=today(),now=Date.now(),list=items(db,s,s),done=list.filter(isDone).length,open=list.filter(x=>isOpen(x)).sort((a,b)=>a.when-b.when).slice(0,3),best=bestStreak();
 const json=JSON.stringify({day:s,done,total:list.length,streak:best&&best.count>1?best.p.name+' · '+best.count+' متتالية':'',next:open.map(x=>({sid:x.id,name:x.p.name,time:clock(x.when),now:x.when<=now}))});
 if(json!==widgetCache){try{Phone.widget(json)}catch{}widgetCache=json}
}

document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const id=b.dataset.id;
 switch(b.dataset.act){
 case 'awaynew':awayForm();break;
 case 'awayend':{const a=(db.cfg.away||[]).find(a=>a.id===id);if(!a)break;const y=shift(today(),-1);db.cfg.away=a.from>y?db.cfg.away.filter(x=>x!==a):db.cfg.away.map(x=>x===a?{...a,to:y}:x);save();toast('أهلًا بعودتك. البرامج تعود من اليوم');break}
 case 'awaydel':ask('حذف فترة العذر؟','تعود جلسات هذه الأيام إلى الجدول والتقارير.','حذف',true).then(ok=>{if(!ok)return;db.cfg.away=(db.cfg.away||[]).filter(a=>a.id!==id);save();settings('away')});break;
 case 'welcome':welcome();break;
 case 'welcomeaway':awayForm({from:id,to:shift(today(),-1),label:'سفر'});break;
 case 'welcomeclose':{const list=backlog();for(const x of list)db.logs[x.id]={...x.rec,closed:Date.now()};save();toast('أهلًا بعودتك، نبدأ من اليوم');break}
 case 'review':weeklyReview();break;
 case 'applysug':{const [key,L]=id.split('|'),sg=suggestions().find(s=>s.key===key&&s.L===L);if(!sg)break;revise(sg.p,sg.change);save();toast('طُبّق التعديل'+(Object.keys(sg.change).some(k=>k!=='mini')?' من الغد':''));if($('#dialog').open&&$('#reviewForm'))weeklyReview();break}
 case 'dismisssug':{db.cfg.dismissed={...db.cfg.dismissed,[id]:today()};save();if($('#dialog').open&&$('#reviewForm'))weeklyReview();break}
 case 'share':shareText(id.startsWith('win:')?id.slice(4)+' · برامجي':summaryText(weekSummary()));break;
 case 'onboard':onboard();break;
 case 'obskip':db.cfg.onboarded=true;closeD();save();break;
 }
});
