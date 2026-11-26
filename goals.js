'use strict';
/* أهدافي: goals with a planned curve, the actual curve and a forecast of when the target is reached. */
const num1=v=>new Intl.NumberFormat('ar-SA-u-nu-latn',{maximumFractionDigits:1}).format(v);
const goalModes={none:'متابعة الالتزام فقط',sum:'يُحسب تلقائيًا من جلسات البرامج المرتبطة',measure:'قياس أسجله بنفسي (مثل الوزن)'};
const presets={
 quran:{name:'حفظ القرآن كاملًا بإتقان',mode:'sum',unit:'صفحة',base:0,target:604,years:3,hint:'اربط به برنامج «حفظ القرآن». إذا كنت تحفظ أجزاء من قبل فاكتب عدد صفحاتها في «قيمة البداية».'},
 weight:{name:'زيادة الوزن 9 كغ',mode:'measure',unit:'كغ',base:'',target:'',years:3,gain:9,hint:'اكتب وزنك الحالي في «قيمة البداية»، ويُحسب الهدف بإضافة 9 كغ.'},
 pmp:{name:'اجتياز شهادة PMP',mode:'sum',unit:'درس',base:0,target:'',years:1,hint:'اكتب عدد دروس الدورة في «الهدف»، واربط به برنامج دراسة PMP.'},
 english:{name:'الإنجليزية والمحادثة',mode:'sum',unit:'دقيقة',base:0,target:'',years:1,hint:'يمكن جمع دقائق التدريب من برامج اللغة. اكتب عدد الدقائق المستهدف خلال السنة.'}
};
function goalStats(g){
 const plan=goalPlan(g),actual=goalActual(g,db),cur=actual.at(-1)?.[1],s=today(),planned=planAt(plan,s),fc=forecast(g,actual);
 const linked=db.ps.filter(p=>p.goalId===g.id),recent=items({...db,ps:linked},shift(s,-29),s).filter(x=>x.at<=Date.now()),done=recent.filter(isDone).length;
 return {plan,actual,cur,planned,fc,linked,recent:recent.length,done};
}
function goalChart(g,plan,actual){
 if(!plan.length&&actual.length<2)return '';
 const W=340,H=160,P=26,s=today(),last=[g.due,s,actual.at(-1)?.[0]].filter(Boolean).sort().pop(),span=Math.max(1,between(g.from,last));
 const vals=[...plan,...actual].map(p=>p[1]);let lo=Math.min(...vals),hi=Math.max(...vals);if(hi===lo){hi+=1;lo-=1}const pad=(hi-lo)*0.08;lo-=pad;hi+=pad;
 const X=d=>P+between(g.from,d)/span*(W-2*P),Y=v=>H-P-(v-lo)/(hi-lo)*(H-2*P),path=pts=>pts.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ');
 const end=actual.at(-1);
 return '<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="منحنى المخطط مقابل الفعلي">'
 +'<line x1="'+P+'" y1="'+(H-P)+'" x2="'+(W-P)+'" y2="'+(H-P)+'" class="axis"/>'
 +(s>=g.from&&s<=last?'<line x1="'+X(s)+'" y1="'+P/2+'" x2="'+X(s)+'" y2="'+(H-P)+'" class="now"/>':'')
 +(plan.length?'<path d="'+path(plan)+'" class="plan"/>':'')
 +(actual.length?'<path d="'+path(actual)+'" class="real"/><circle cx="'+X(end[0])+'" cy="'+Y(end[1])+'" r="4" class="dot"/>':'')
 +'<text x="'+P+'" y="'+(H-6)+'" text-anchor="start">'+esc(fmt(date(g.from),{month:'short',year:'2-digit'}))+'</text><text x="'+(W-P)+'" y="'+(H-6)+'" text-anchor="end">'+esc(fmt(date(last),{month:'short',year:'2-digit'}))+'</text><text x="'+(P-4)+'" y="'+(Y(hi-pad)+4)+'" text-anchor="end">'+num1(hi-pad)+'</text><text x="'+(P-4)+'" y="'+(Y(lo+pad)+4)+'" text-anchor="end">'+num1(lo+pad)+'</text>'
 +'</svg><div class="legend"><span class="k plan"></span> المخطط <span class="k real"></span> الفعلي</div>';
}
function goalCard(g,printable=false){
 const st=goalStats(g),u=esc(g.unit||''),numeric=g.mode!=='none'&&Number.isFinite(g.target)&&g.target!=='';
 const base=+g.base||0,pct=numeric&&st.cur!=null?(g.target===base?100:Math.max(0,Math.min(100,100*(st.cur-base)/(g.target-base)))):st.recent?100*st.done/st.recent:0;
 let h='<article class="card goal"><div class="head">'+ring(pct,num1(Math.round(pct))+'٪',62,numeric?'':'gold')+'<div class="body"><h2>'+esc(g.name)+'</h2><small>'+(numeric&&st.cur!=null?'<b>'+num1(st.cur)+'</b> من '+num1(g.target)+' '+u:'الالتزام في آخر 30 يومًا')+(g.due?' · حتى '+fmt(date(g.due),{month:'long',year:'numeric'}):'')+'</small></div></div>';
 if(numeric&&st.cur!=null){
 if(st.planned!=null){const up=g.target>=base,diff=(st.cur-st.planned)*(up?1:-1);h+='<p>المخطط حتى اليوم '+num1(st.planned)+' '+u+' · '+(Math.abs(diff)<0.05?'على الخطة تمامًا':diff>0?'متقدم بـ '+num1(Math.abs(diff))+' '+u:'متأخر بـ '+num1(Math.abs(diff))+' '+u)+'</p>'}
 if(st.fc?.done)h+='<p><b>وصلت إلى هدفك. ما شاء الله.</b></p>';else if(!st.fc)h+='<p class="muted">يظهر توقع الوصول بعد أسبوع وثلاثة تسجيلات على الأقل في آخر 30 يومًا.</p>';
 if(st.fc&&!st.fc.done){h+='<p>معدلك في آخر 30 يومًا '+num1(st.fc.rate*7)+' '+u+' أسبوعيًا · '+(st.fc.eta?'تصل بهذا المعدل في '+fmt(date(st.fc.eta),{month:'long',year:'numeric'})+(g.due?(st.fc.eta<=g.due?' (قبل الموعد)':' (بعد الموعد)'):''):'بهذا المعدل لن تصل إلى الهدف')+'</p>'}
 h+=goalChart(g,st.plan,st.actual);
 }else if(numeric)h+=goalChart(g,st.plan,st.actual);
 if((g.wins||[]).length)h+='<div class="wins">'+g.wins.slice(-3).reverse().map(w=>'<span>'+ic('trophy')+esc(w.label.replace(' في «'+g.name+'»',''))+' · '+fmt(date(w.date),{day:'numeric',month:'short'})+'</span>').join('')+'</div>';
 h+='<p class="muted">'+(st.linked.length?'البرامج: '+st.linked.filter(p=>!p.archived).map(p=>esc(p.name)).join('، ')+' · أُنجز '+n(st.done)+' من '+n(st.recent)+' جلسة في آخر 30 يومًا':'لا توجد برامج مرتبطة. اربط برنامجًا من «تعديل البرنامج».')+'</p>';
 if(!printable)h+='<div class="actions">'+(g.mode==='measure'?btn(ic('plus')+'سجّل قياسًا','goalmeasure',g.id,'primary'):'')+(linkedActive(g).length>1?btn(ic('edit')+'تعديل البرامج معًا','goalmove',g.id,'ghost'):'')+btn(ic('edit')+'تعديل','goaledit',g.id,'ghost')+btn(ic('trash')+'حذف','goaldel',g.id,'ghost danger')+'</div>';
 return h+'</article>';
}
function goalsPage(){
 return hero('أهدافي',db.goals.length?'خطتك مقابل ما أنجزته فعلًا':'')+(db.goals.map(g=>goalCard(g)).join('')||empty('أضف هدفك الكبير بزر ＋، مثل حفظ القرآن أو زيادة الوزن، ثم اربط به برامجك.','goals'));
}
function goalForm(old=null){
 const g=old||{name:'',mode:'sum',unit:'',base:0,target:'',from:today(),due:'',milestones:[]};
 modal(old?'تعديل الهدف':'هدف جديد',(old?'':'<p class="muted">ابدأ من قالب أو اكتب هدفك:</p><div class="actions">'+Object.entries({quran:'حفظ القرآن',weight:'زيادة الوزن',pmp:'شهادة PMP',english:'الإنجليزية'}).map(([k,l])=>'<button type="button" data-preset="'+k+'">'+l+'</button>').join('')+'</div><p id="presetHint" class="muted"></p>')
 +form('goalForm',input('name','اسم الهدف','text',g.name,'required maxlength=120')+sel('mode','طريقة حساب التقدم',goalModes,g.mode)+'<div class="grid">'+input('unit','الوحدة (صفحة، كغ، درس…)','text',g.unit)+input('base','قيمة البداية','number',g.base,'step=any')+input('target','الهدف','number',g.target,'step=any')+input('from','تاريخ البداية','date',g.from,'required')+input('due','الموعد المستهدف','date',g.due)+'</div>'+field('milestones','مراحل وسيطة (اختياري): سطر لكل مرحلة بصيغة 2027-06-01 = 100',(g.milestones||[]).map(m=>m.date+' = '+m.value).join('\n'))));
 const f=$('#goalForm');
 const sync=()=>{for(const n of ['unit','base','target','due','milestones'])f[n].parentElement.hidden=f.mode.value==='none'};f.mode.onchange=sync;sync();
 document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const p=presets[b.dataset.preset],d=new Date();d.setFullYear(d.getFullYear()+p.years);f.name.value=p.name;f.mode.value=p.mode;f.unit.value=p.unit;f.base.value=p.base;f.target.value=p.target;f.due.value=iso(d);f.dataset.gain=p.gain||'';$('#presetHint').textContent=p.hint;sync()});
 f.base.oninput=()=>{if(f.dataset.gain&&f.base.value)f.target.value=+f.base.value+ +f.dataset.gain};
 f.onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f)),numOr=v=>v===''?'':+v;
 const ms=[];for(const line of d.milestones.split('\n').map(t=>t.trim()).filter(Boolean)){const m=line.match(/^(\d{4}-\d\d-\d\d)\s*[=:]\s*(-?[\d.]+)$/);if(!m||iso(date(m[1]))!==m[1]){toast('اكتب كل مرحلة بصيغة 2027-06-01 = 100');return}ms.push({date:m[1],value:+m[2]})}
 const v={name:d.name.trim(),mode:d.mode,unit:d.unit.trim(),base:numOr(d.base),target:numOr(d.target),from:d.from,due:d.due,milestones:ms};
 if(!v.name){toast('اكتب اسم الهدف');return}
 if(v.mode!=='none'&&(v.target===''||!v.due||v.due<=v.from)){toast('حدد الهدف وموعدًا بعد تاريخ البداية حتى يُرسم المنحنى');return}
 if(v.mode==='measure'&&v.base===''){toast('اكتب قيمة البداية، مثل وزنك الحالي');return}
 if(old){Object.assign(old,v);for(const p of db.ps)if(p.goalId===old.id)p.goal=old.name}else db.goals.push({id:uid(),...v,entries:{}});
 closeD();save();toast('حُفظ الهدف')};
}
function measureForm(g){
 const last=Object.values(g.entries||{}).sort((a,b)=>a.date<b.date?-1:1);
 modal('قياس · '+g.name,form('measure',input('date','التاريخ','date',today(),'required')+input('value','القيمة ('+esc(g.unit)+')','number','','required step=any')+input('note','ملاحظة (اختياري)','text'))+(last.length?'<h2>آخر القياسات</h2>'+last.slice(-8).reverse().map(e=>'<div class="card row-line"><span>'+fmt(e.date+'T12:00',{weekday:'short',day:'numeric',month:'short'})+(e.note?' · '+esc(e.note):'')+'</span><b>'+num1(e.value)+' '+esc(g.unit)+'</b></div>').join(''):''));
 $('#measure').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(d.date<g.from){toast('التاريخ قبل بداية الهدف');return}g.entries=g.entries||{};
 for(const [k,x] of Object.entries(g.entries))if(x.date===d.date)delete g.entries[k];
 g.entries[uid()]={date:d.date,value:+d.value,...(d.note.trim()?{note:d.note.trim()}:{})};closeD();save();toast('سُجّل القياس')};
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const id=b.dataset.id,g=db.goals.find(g=>g.id===id);
 switch(b.dataset.act){
 case 'goalnew':goalForm();break;
 case 'goaledit':if(g)goalForm(g);break;
 case 'goalmove':if(g)groupForm(g);break;
 case 'goalpause':if(g)pauseGoal(g);break;
 case 'goalmeasure':if(g)measureForm(g);break;
 case 'goaldel':if(g)ask('حذف هدف «'+g.name+'»؟','تبقى البرامج وسجلها، وتُفصل عن الهدف فقط.','حذف',true).then(ok=>{if(!ok)return;db.goals=db.goals.filter(x=>x!==g);for(const p of db.ps)if(p.goalId===g.id){delete p.goalId;delete p.goal}save()});break;
 }
});

/* ---------- Edit a goal's programs together ---------- */
function linkedActive(g){return db.ps.filter(p=>!p.archived&&p.goalId===g.id)}
const toMin=t=>{const [h,m]=t.split(':').map(Number);return h*60+m},fromMin=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
function pdays(p){return p.repeat==='weekly'?(p.days?.length?p.days:[date(p.origin||p.start).getDay()]):null}
/* Every field starts at «بلا تغيير»; only what the person changes is applied. Fixed-time programs move as one block: the first one
   to the chosen day and time, the others keep their order and gaps. Programs tied to a prayer follow the adhan and keep their time. */
function groupForm(g){
 const all=linkedActive(g),ps=all.filter(p=>!p.anchor&&p.repeat!=='once').sort((a,b)=>toMin(a.clock)-toMin(b.clock)),first=ps[0];
 const wk=ps.find(p=>pdays(p)),day0=wk?pdays(wk)[0]:null,K={'':'بلا تغيير'};
 modal('تعديل برامج «'+g.name+'» معًا',form('groupForm','<p class="muted">'+all.map(p=>esc(p.name)+' '+esc(p.anchor?'مع أذان '+prayers[p.anchor]:p.clock)).join(' · ')+'</p>'
  +'<div class="grid">'+(wk?sel('day','اليوم',{...K,...Object.fromEntries([6,0,1,2,3,4,5].map(d=>[d,weekdays[d]]))},''):'')
  +(first?input('clock','تبدأ أول جلسة الساعة (اختياري)','time',''):'')
  +sel('grace','يبقى مفتوحًا للتسجيل',{...K,day:'حتى نهاية اليوم',week:'حتى نهاية الجمعة',custom:'دقائق بعد الجلسة'},'')+input('allow','دقائق السماح','number',60,'min=0 max=525600')
  +sel('remind','التذكير بإشعار',{...K,on:'مفعّل',off:'متوقف'},'')+sel('cat','المجال',{...K,...Object.fromEntries(domains(db).map(d=>[d.name,d.name]))},'')
  +input('end','تنتهي البرامج في (اختياري)','date','')+'</div>'
  +'<p class="muted hint">تبقى البرامج بترتيبها والفواصل بينها عند تغيير اليوم أو الساعة'+(all.some(p=>p.anchor)?'، والمرتبطة بالأذان تبقى مع الأذان':'')+'. وتبقى جلساتك السابقة كما هي.</p>','احفظ للبرامج كلها')
  +'<div class="actions">'+btn(ic('pause')+'إيقاف البرامج كلها','goalpause',g.id,'ghost danger')+'</div>');
 const f=$('#groupForm'),sync=()=>{f.allow.parentElement.hidden=f.grace.value!=='custom'};f.grace.onchange=sync;sync();
 f.onsubmit=e=>{e.preventDefault();try{applyGroup()}catch(err){toast('تعذر حفظ التعديل: '+(err?.message||err))}};
 const applyGroup=()=>{
  const dm=first&&f.clock.value?toMin(f.clock.value)-toMin(first.clock):0,dd=wk&&f.day.value!==''?(+f.day.value-day0+7)%7:0;
  if(dm&&ps.some(p=>toMin(p.clock)+dm<0||toMin(p.clock)+dm>=1440)){toast('بعض الجلسات ستتجاوز منتصف الليل. اختر ساعة أبكر.');return}
  if(f.end.value&&f.end.value<today()){toast('اختر تاريخ انتهاء من اليوم فصاعدًا');return}
  const timing=f.grace.value?{grace:f.grace.value,allow:f.grace.value==='custom'?Math.max(0,+f.allow.value||0):0}:{};
  let c=0;for(const p of all){let change={...timing};
   if(ps.includes(p)){if(dm)change.clock=fromMin(toMin(p.clock)+dm);const days=pdays(p);if(days&&dd)change.days=[...new Set(days.map(d=>(d+dd)%7))].sort((a,b)=>a-b)}
   const q=Object.keys(change).length?reviseFrom(p,change):p;
   if(f.remind.value)q.remind=f.remind.value==='on';if(f.cat.value)q.cat=f.cat.value;if(f.end.value)q.end=f.end.value<q.start?q.start:f.end.value;
   c++}
  closeD();save();toast('حُفظ التعديل لـ '+n(c)+' برامج')};
}
/* Same rule as editing a program: in place until a session is recorded; otherwise past sessions keep their plan and
   a new version starts today when today's session has no record, or tomorrow. Returns the program that now carries the change. */
function reviseFrom(p,change){
 const logged=Object.keys(db.logs).some(k=>k.startsWith(p.id+'@'));
 if(!logged||p.start>today()){Object.assign(p,change);if(change.days)delete p.origin;return p}
 const start=p.start<today()&&!db.logs[p.id+'@'+today()]?today():shift(today(),1);
 const q={...p,...change,id:uid(),lineage:lineage(p),start,end:p.end&&p.end>=start?p.end:'',archived:false};delete q.replacedBy;if(change.days)delete q.origin;
 p.end=shift(start,-1);p.archived=true;p.replacedBy=q.id;db.ps.push(q);return q
}
function pauseGoal(g){const all=linkedActive(g);ask('إيقاف برامج «'+g.name+'»؟','تتوقف '+n(all.length)+' برامج بعد اليوم ويبقى سجلها، وتستأنف كل برنامج متى شئت من «البرامج الموقوفة».','إيقاف').then(ok=>{if(!ok)return;for(const p of all){p.end=p.end&&p.end<today()?p.end:today();p.archived=true}closeD();save();toast('أُوقفت '+n(all.length)+' برامج')})}
