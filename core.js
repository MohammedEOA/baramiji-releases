'use strict';
const DAY=86400000, MIN=60000;
const freq={once:'مرة واحدة',daily:'يومي',weekly:'أسبوعي',every:'كل عدة أيام',monthly:'شهري',quarter:'كل 3 أشهر',half:'كل 6 أشهر',yearly:'سنوي'};
const cats=['القرآن الكريم','العلوم الشرعية','التغذية','الرياضة','الصحة','التواصل الاجتماعي','التربية','اللغات','التطوير المهني'];
const prayers={fajr:'الفجر',dhuhr:'الظهر',asr:'العصر',maghrib:'المغرب',isha:'العشاء'};
const methods={UmmAlQura:'أم القرى (السعودية)',MuslimWorldLeague:'رابطة العالم الإسلامي',Egyptian:'الهيئة المصرية',Karachi:'جامعة كراتشي',Dubai:'دبي',Qatar:'قطر',Kuwait:'الكويت',Turkey:'تركيا',Singapore:'سنغافورة',NorthAmerica:'أمريكا الشمالية',MoonsightingCommittee:'لجنة رؤية الهلال'};
const weekdays=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
/* Measurement templates: each adds its own fields to the session log (rec.m) and says how much a session adds to a goal. */
const kinds={
 '':{label:'عام: تم أو لم يتم',fields:[]},
 time:{label:'الوقت (دقائق)',unit:'دقيقة',fields:[],amount:(m,r)=>r.minutes||0},
 hifz:{label:'حفظ القرآن',unit:'صفحة',fields:[['from','من صفحة','page'],['to','إلى صفحة','page'],['errors','عدد الأخطاء','count'],['tajweed','إتقان التجويد (1-5)','rate']],amount:m=>m.from&&m.to?Math.abs(m.to-m.from)+1:0},
 review:{label:'مراجعة القرآن',unit:'صفحة',noGoal:true,fields:[['from','من صفحة','page'],['to','إلى صفحة','page'],['errors','عدد الأخطاء','count'],['tajweed','إتقان التجويد (1-5)','rate']],amount:m=>m.from&&m.to?Math.abs(m.to-m.from)+1:0},
 workout:{label:'تمرين رياضي',unit:'دقيقة',fields:[['type','نوع التمرين','text'],['sets','عدد المجموعات','count'],['effort','الشدة (1-5)','rate']],amount:(m,r)=>r.minutes||0},
 study:{label:'دراسة',unit:'درس',fields:[['lessons','الدروس أو الصفحات','count'],['questions','أسئلة محلولة','count'],['score','نسبة الإجابات الصحيحة %','pct'],['understanding','الفهم (1-5)','rate']],amount:m=>+m.lessons||0}
};
/* User settings on top of the built-in kinds: rename or hide a built-in one, or add a custom one.
   cfg.kinds = {id:{label,hidden}} for built-ins, {id:{label,unit,fields:[{key,label,type}],sum,hidden}} for custom ids (k_…). */
const BUILTIN_KINDS=Object.keys(kinds),BASE_LABELS=Object.fromEntries(BUILTIN_KINDS.map(k=>[k,kinds[k].label]));
const fieldTypes={count:'رقم يُجمع',rate:'تقييم من 1 إلى 5',pct:'نسبة %',text:'نص'};
function applyKinds(cfg){
 for(const k of Object.keys(kinds))if(!BUILTIN_KINDS.includes(k))delete kinds[k];
 for(const k of BUILTIN_KINDS){kinds[k].label=BASE_LABELS[k];delete kinds[k].hidden}
 for(const [id,o] of Object.entries(cfg?.kinds||{})){
  if(!id)continue;
  if(BUILTIN_KINDS.includes(id)){if(o.label)kinds[id].label=o.label;if(o.hidden)kinds[id].hidden=true;continue}
  kinds[id]={label:o.label,unit:o.unit||'',custom:true,hidden:!!o.hidden,noGoal:!o.sum,sum:o.sum||'',fields:(o.fields||[]).map(f=>[f.key,f.label,f.type]),amount:(m,r)=>o.sum==='minutes'?(r.minutes||0):o.sum?(+m[o.sum]||0):0};
 }
}
/* Domains (المجالات): ordered, each with the measurement kinds that suit it. */
const domainKinds=c=>/قرآن/.test(c)?['hifz','review']:/رياض|لياق/.test(c)?['workout']:/شرع|لغ|مهني|تطوير|دراس|علم/.test(c)?['study']:[];
function domains(db){
 if(Array.isArray(db.cfg.domains))return db.cfg.domains;
 return [...new Set([...cats,...db.ps.map(p=>p.cat).filter(Boolean)])].map(name=>({name,kinds:domainKinds(name)}));
}
function kindsFor(db,cat,keep){const d=domains(db).find(d=>d.name===cat);const list=d?d.kinds:Object.keys(kinds).filter(k=>k&&k!=='time');return ['',...(kinds.time.hidden?[]:['time']),...list.filter(k=>kinds[k]&&!kinds[k].hidden),...(keep&&keep!==''&&!list.includes(keep)&&kinds[keep]?[keep]:[])]}
function amount(p,r){const k=kinds[p.kind||'']||kinds[''];return k.amount?k.amount(r.m||{},r):(+r.quantity||0)}
const hij=new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{year:'numeric',month:'numeric',day:'numeric'});
function parts(d){const p=Object.fromEntries(hij.formatToParts(d).map(x=>[x.type,+x.value]));return [p.year,p.month,p.day]}
function iso(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function date(s){return new Date(s+'T12:00:00')}
function shift(s,n){let d=date(s);d.setDate(d.getDate()+n);return iso(d)}
function time(s,t){return +new Date(s+'T'+t)}
function between(a,b){return Math.round((date(b)-date(a))/DAY)}
function occurs(p,s){
 if(s<p.start || (p.end && s>p.end))return false;
 const ref=p.origin||p.start;
 const diff=between(ref,s);
 if(p.repeat==='once')return !diff;
 if(p.repeat==='daily')return true;
 if(p.repeat==='weekly')return p.days?.length?p.days.includes(date(s).getDay()):diff%7===0;
 if(p.repeat==='every'){const n=p.every||2;return (diff%n+n)%n===0}
 const step={monthly:1,quarter:3,half:6,yearly:12}[p.repeat];
 const fields=x=>p.calendar==='h'?parts(date(x)):[date(x).getFullYear(),date(x).getMonth()+1,date(x).getDate()];
 const [y,m,d]=fields(s),[sy,sm,sd]=fields(ref);
 return ((y-sy)*12+m-sm)%step===0 && (d===sd || (d<sd && fields(shift(s,1))[2]===1));
}
function prayerAt(s,key,cfg){const m=Object.hasOwn(methods,cfg.method)?cfg.method:'UmmAlQura';let params=adhan.CalculationMethod[m]();let d=date(s);if(m==='UmmAlQura'&&parts(d)[1]===9)params.adjustments.isha=30;return +new adhan.PrayerTimes(new adhan.Coordinates(cfg.lat,cfg.lon),d,params)[key]}
function item(p,s,db){
 const at=p.anchor?prayerAt(s,p.anchor,db.cfg)+p.offset*MIN:time(s,p.clock);
 let last=p.grace==='day'?time(shift(iso(new Date(at)),1),'00:00')-1:at+(p.duration+p.allow)*MIN;
 if(p.grace==='week'){const day=iso(new Date(at)); last=time(shift(day,7-((date(day).getDay()+1)%7)),'00:00')-1}
 const id=p.id+'@'+s, rec=db.logs[id]||{};
 return {p,s,id,at,last,rec,when:rec.move??at};
}
/* Away periods (travel, illness, leave): sessions inside them are not scheduled, except programs the user kept. */
function away(db,p,s){return (db.cfg?.away||[]).some(a=>s>=a.from&&s<=a.to&&!(a.keep||[]).includes(p.lineage||p.id))}
function items(db,from,to){
 let out=[];
 for(const p of db.ps){for(let s=from>p.start?from:p.start;s<=to;s=shift(s,1))if(occurs(p,s)&&!away(db,p,s))out.push(item(p,s,db))}
 return out.sort((a,b)=>a.when-b.when)
}
const STALE=7*DAY, CLOSED=['لم تُسجَّل','جزئية لم تكتمل','فاتتني'];
function progress(r){return !!(r.minutes>0||r.steps?.length||(r.quantity!==''&&r.quantity!=null)||r.parts?.length)}
function altLast(x){const r=x.rec,last=r.parts?.length?r.parts.at(-1).at:r.move;return time(shift(iso(new Date(last)),1),'00:00')-1}
function deadline(x){return x.rec.move?altLast(x):x.last}
function status(x,now=Date.now()){
 const r=x.rec;
 if(r.done){if(r.move)return 'أُنجزت في الموعد البديل';return r.done>x.last?'مكتمل بعد السماح':'مكتمل'}
 if(r.missed)return 'فاتتني';
 if(r.closed)return 'لم تُسجَّل';
 const end=deadline(x);
 if(now>end+STALE)return progress(r)?'جزئية لم تكتمل':'لم تُسجَّل';
 if(now>end)return 'متأخرة';
 if(r.move)return now>=r.move?'في الموعد البديل':'منقولة';
 if(now>=x.at)return 'ضمن السماح';return 'قادمة'}
function isDone(x){return !!x.rec.done}
function isOpen(x,now=Date.now()){return !x.rec.done&&!CLOSED.includes(status(x,now))}
function blocked(block,s,cat){return (block.date?block.date===s:s>=block.day && block.week.includes(date(s).getDay())) && (!block.allow || block.allow!==cat)}
/* A program may have no set duration (0): it still takes a short slot when finding free time. */
const span=p=>p.duration||15;
function alternatives(x,db,now=Date.now(),minutes=null){
 const first=iso(new Date(now)),last=shift(first,14), spans=[];
 for(const y of items(db,shift(first,-1),last)){if(y.id!==x.id && !y.rec.done && !y.rec.move)spans.push([y.at,y.at+span(y.p)*MIN])}
 for(const [id,r] of Object.entries(db.logs)){if(id!==x.id&&r.move&&!r.done){const p=db.ps.find(p=>id.startsWith(p.id+'@'));if(p){if(r.parts?.length)spans.push(...r.parts.map(a=>[a.at,a.at+a.len*MIN]));else spans.push([r.move,r.move+Math.max(1,span(p)-(r.minutes||0))*MIN])}}}
 const length=minutes??Math.max(1,span(x.p)-(x.rec.minutes||0)), out=[];
 for(let s=first;s<=last&&out.length<3;s=shift(s,1)){
 const busy=spans.concat(db.blocks.filter(b=>blocked(b,s,x.p.cat)).map(b=>[time(s,b.from),time(s,b.to)]));
 const start=Math.ceil(Math.max(now,time(s,db.cfg.open))/(5*MIN))*5*MIN;
 for(let a=start;a+length*MIN<=time(s,db.cfg.close);a+=5*MIN){
 if(!busy.some(([b,e])=>b<a+length*MIN && e>a)){out.push(a);break}
 }}
 return out;
}

function splitOffer(x,db,now=Date.now()){
 const remaining=x.p.duration-(x.rec.minutes||0);
 if(!x.p.split||remaining<10)return null;
 const first=Math.floor(remaining/2),second=remaining-first,a=alternatives(x,db,now,first)[0];
 if(!a)return null;
 const b=alternatives(x,db,a+(first+5)*MIN,second)[0];
 return b?[{at:a,len:first},{at:b,len:second}]:null;
}
function onDay(x,s){return iso(new Date(x.when))===s||x.rec.parts?.some(p=>iso(new Date(p.at))===s)}
function validateState(v){
 const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
 const day=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&iso(date(s))===s;
 const hour=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
 const num=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
 if(!plain(v)||v.v!==1||!Array.isArray(v.ps)||!Array.isArray(v.blocks)||!plain(v.cfg)||!plain(v.logs))throw Error('format');
 for(const p of v.ps){
 if(!plain(p)||typeof p.id!=='string'||!/^[-\w]+$/.test(p.id)||typeof p.name!=='string'||typeof p.cat!=='string'||!Array.isArray(p.steps)||!p.steps.every(s=>typeof s==='string')||!day(p.start)||p.end&&!day(p.end)||!Object.hasOwn(freq,p.repeat)||!hour(p.clock)||!num(p.duration,0,1440)||!num(p.allow,0,525600)||!num(p.offset,-240,240)||!num(p.target,0,Number.MAX_VALUE)||p.anchor&&!Object.hasOwn(prayers,p.anchor)||p.origin&&!day(p.origin)||p.lineage!=null&&(typeof p.lineage!=='string'||!/^[-\w]+$/.test(p.lineage))||p.replacedBy!=null&&typeof p.replacedBy!=='string'||p.days!=null&&(!Array.isArray(p.days)||!p.days.every(d=>Number.isInteger(d)&&d>=0&&d<=6))||p.every!=null&&!(Number.isInteger(p.every)&&p.every>=2&&p.every<=365)||p.kind&&!Object.hasOwn(kinds,p.kind)&&!Object.hasOwn(v.cfg.kinds||{},p.kind)||p.goalId!=null&&typeof p.goalId!=='string'||p.page!=null&&!(Number.isInteger(p.page)&&p.page>=1&&p.page<=604)||p.dir!=null&&!['up','down'].includes(p.dir)||p.mini!=null&&!num(p.mini,0,100000)||p.skips!=null&&!(Number.isInteger(p.skips)&&p.skips>=0&&p.skips<=10)||p.smart!=null&&typeof p.smart!=='boolean'||p.known!=null&&typeof p.known!=='string')throw Error('program');
 }
 for(const r of Object.values(v.logs)){
 if(!plain(r)||r.minutes!=null&&!num(r.minutes,0,1440)||r.done!=null&&!num(r.done,0,8640000000000000)||r.move!=null&&!num(r.move,1,8640000000000000)||r.missed!=null&&!num(r.missed,0,8640000000000000)||r.steps!=null&&(!Array.isArray(r.steps)||!r.steps.every(i=>Number.isInteger(i)&&i>=0))||r.parts!=null&&(!Array.isArray(r.parts)||!r.parts.every(p=>num(p.at,1,8640000000000000)&&num(p.len,1,1440)))||r.closed!=null&&!num(r.closed,0,8640000000000000)||r.mini!=null&&typeof r.mini!=='boolean'||r.m!=null&&(!plain(r.m)||!Object.values(r.m).every(x=>typeof x==='string'||Number.isFinite(x))))throw Error('record');
 }
 if(v.cfg.method!=null&&!Object.hasOwn(methods,v.cfg.method))throw Error('settings');
 if(v.cfg.digits!=null&&!['latn','arab'].includes(v.cfg.digits))throw Error('settings');
 if(v.cfg.domains!=null&&(!Array.isArray(v.cfg.domains)||!v.cfg.domains.every(d=>plain(d)&&typeof d.name==='string'&&d.name.trim()&&Array.isArray(d.kinds)&&d.kinds.every(k=>typeof k==='string'))))throw Error('settings');
 if(v.cfg.kinds!=null){if(!plain(v.cfg.kinds))throw Error('settings');for(const [id,o] of Object.entries(v.cfg.kinds)){if(!/^[-\w]+$/.test(id)||!plain(o)||o.label!=null&&typeof o.label!=='string')throw Error('settings');if(!BUILTIN_KINDS.includes(id)&&(typeof o.label!=='string'||!Array.isArray(o.fields)||!o.fields.every(f=>plain(f)&&/^[-\w]+$/.test(f.key)&&typeof f.label==='string'&&Object.hasOwn(fieldTypes,f.type))||o.sum!=null&&o.sum!==''&&o.sum!=='minutes'&&!o.fields.some(f=>f.key===o.sum&&f.type!=='text')))throw Error('settings')}}
 if(v.goals!=null){if(!Array.isArray(v.goals))throw Error('goal');for(const g of v.goals)validateGoal(g,plain,day,num)}
 if(v.cfg.away!=null&&(!Array.isArray(v.cfg.away)||!v.cfg.away.every(a=>plain(a)&&day(a.from)&&day(a.to)&&(a.keep==null||Array.isArray(a.keep)))))throw Error('settings');
 if(v.cfg.reviewDay!=null&&!(Number.isInteger(v.cfg.reviewDay)&&v.cfg.reviewDay>=0&&v.cfg.reviewDay<=6))throw Error('settings');
 if(v.cfg.reasons!=null&&(!Array.isArray(v.cfg.reasons)||!v.cfg.reasons.every(x=>typeof x==='string')))throw Error('settings');
 if(!hour(v.cfg.open)||!hour(v.cfg.close)||!hour(v.cfg.morning)||!num(v.cfg.lat,-65,65)||!num(v.cfg.lon,-180,180))throw Error('settings');
 for(const b of v.blocks)if(!hour(b.from)||!hour(b.to)||!Array.isArray(b.week)||b.date&&!day(b.date)||!day(b.day))throw Error('block');
 return v;
}

function validateGoal(g,plain,day,num){
 const n=x=>x===''||x==null||Number.isFinite(x);
 if(!plain(g)||typeof g.id!=='string'||!/^[-\w]+$/.test(g.id)||typeof g.name!=='string'||!['none','measure','sum'].includes(g.mode)||!day(g.from)||g.due&&!day(g.due)||!n(g.base)||!n(g.target)||typeof (g.unit??'')!=='string'||g.milestones!=null&&(!Array.isArray(g.milestones)||!g.milestones.every(m=>plain(m)&&day(m.date)&&Number.isFinite(m.value)))||g.entries!=null&&(!plain(g.entries)||!Object.values(g.entries).every(e=>plain(e)&&day(e.date)&&Number.isFinite(e.value))))throw Error('goal');
}
/* Goal curves. plan: straight segments from (from, base) through milestones to (due, target).
   actual: measurements (mode measure) or base + running total of linked sessions (mode sum). */
function goalPlan(g){
 if(g.mode==='none'||!g.due||!Number.isFinite(g.target))return [];
 return [[g.from,+g.base||0],...(g.milestones||[]).filter(m=>m.date>g.from&&m.date<g.due).sort((a,b)=>a.date<b.date?-1:1).map(m=>[m.date,m.value]),[g.due,g.target]];
}
function planAt(plan,s){
 if(!plan.length)return null;if(s<=plan[0][0])return plan[0][1];
 for(let i=1;i<plan.length;i++)if(s<=plan[i][0]){const [a,va]=plan[i-1],[b,vb]=plan[i],t=between(a,s)/Math.max(1,between(a,b));return va+(vb-va)*t}
 return plan.at(-1)[1];
}
function goalActual(g,db,upto=iso(new Date())){
 const base=+g.base||0;
 if(g.mode==='measure'){const e=Object.values(g.entries||{}).filter(e=>e.date<=upto).sort((a,b)=>a.date<b.date?-1:1);return [[g.from,base],...e.map(e=>[e.date,e.value])]}
 if(g.mode!=='sum')return [];
 const ids=new Map(db.ps.filter(p=>p.goalId===g.id).map(p=>[p.id,p])),byDay={};
 for(const [k,r] of Object.entries(db.logs)){const [pid,s]=k.split('@'),p=ids.get(pid);if(!p)continue;const day=r.move?iso(new Date(r.done||r.move)):s;if(day<g.from||day>upto)continue;if(kinds[p.kind]?.noGoal)continue;const a=amount(p,r);if(a>0)byDay[day]=(byDay[day]||0)+a}
 let total=base;const out=[[g.from,base]];for(const s of Object.keys(byDay).sort()){total+=byDay[s];out.push([s,total])}
 return out;
}
/* Rate over the last 30 days up to today (a break lowers it), from enough data only. */
function valueAt(actual,s,step){let v=actual[0][1];for(let i=0;i<actual.length;i++){const [d,x]=actual[i];if(d<=s){v=x;continue}if(!step&&i){const [d0,x0]=actual[i-1];v=x0+(x-x0)*between(d0,s)/Math.max(1,between(d0,d))}break}return v}
function forecast(g,actual,now=iso(new Date())){
 if(actual.length<2||!Number.isFinite(g.target)||g.target==='')return null;
 if(g.mode==='measure'&&actual.length<3)return null;
 const start=g.from>shift(now,-30)?g.from:shift(now,-30),days=between(start,now);
 if(days<7)return null;
 /* At least three recorded points inside the window, or the rate says nothing yet. */
 if(actual.filter(([d])=>d>start&&d<=now).length<3)return null;
 const step=g.mode==='sum',v0=valueAt(actual,start,step),v1=actual.at(-1)[1],rate=(v1-v0)/days,left=g.target-v1;
 if(!left||Math.sign(left)!==Math.sign(g.target-(+g.base||0)))return {rate,eta:now,done:true};
 if(!rate||Math.sign(rate)!==Math.sign(left))return {rate,eta:null};
 return {rate,eta:shift(now,Math.ceil(left/rate))};
}
/* Streak of one program (all its versions): consecutive sessions done in full or at the minimum, newest first.
   Away days are not scheduled; sessions still open are skipped; a missed or unlogged session uses one of
   the program's excused sessions for that month (p.skips, default 2), otherwise the streak ends there. */
const DONE_LIKE=r=>!!r.done;
function streak(db,p,now=Date.now()){
 const L=p.lineage||p.id,vs=db.ps.filter(q=>(q.lineage||q.id)===L),first=vs.map(q=>q.start).sort()[0],end=iso(new Date(now));
 const allowed=Number.isInteger(p.skips)?p.skips:2,used={};let count=0,best=0,run=0,from=shift(end,-400)>first?shift(end,-400):first,list=[];
 for(const q of vs)for(let s=from>q.start?from:q.start;s<=end&&(!q.end||s<=q.end);s=shift(s,1))if(occurs(q,s)&&!away(db,q,s))list.push(item(q,s,db));
 list.sort((a,b)=>b.at-a.at);let alive=true;
 for(const x of list){
  if(x.at>now)continue;
  if(DONE_LIKE(x.rec)){if(alive)count++;run++;best=Math.max(best,run);continue}
  if(isOpen(x,now))continue;
  const m=x.s.slice(0,7);if((used[m]||0)<allowed){used[m]=(used[m]||0)+1;continue}
  alive=false;run=0;
 }
 const month=end.slice(0,7);return {count,best:Math.max(best,count),left:Math.max(0,allowed-(used[month]||0))};
}
/* Quran review from what is memorized: pages known before the app (p.known like "1-100, 582-604")
   plus every page recorded in memorization sessions. */
function parseRanges(t){const out=new Set();for(const part of String(t||'').split(/[،,\s]+/)){const m=part.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);if(!m)continue;let a=+m[1],b=+(m[2]||m[1]);if(a>b)[a,b]=[b,a];for(let i=Math.max(1,a);i<=Math.min(604,b);i++)out.add(i)}return out}
function memorized(db,known){
 const pages=parseRanges(known);
 for(const [k,r] of Object.entries(db.logs)){const p=db.ps.find(q=>q.id===k.split('@')[0]);if(p?.kind!=='hifz'||!r.done||!r.m?.from||!r.m?.to)continue;const a=Math.min(r.m.from,r.m.to),b=Math.max(r.m.from,r.m.to);for(let i=a;i<=b&&i<=604;i++)pages.add(i)}
 return [...pages].sort((a,b)=>a-b);
}
/* Pages whose latest session (memorization or review) had at least `limit` mistakes. */
function weakPages(db,limit=3){
 const last={};
 for(const [k,r] of Object.entries(db.logs).sort((a,b)=>a[0].split('@')[1]<b[0].split('@')[1]?-1:1)){const p=db.ps.find(q=>q.id===k.split('@')[0]);if(!['hifz','review'].includes(p?.kind)||!r.done||!r.m?.from||!r.m?.to)continue;const a=Math.min(r.m.from,r.m.to),b=Math.max(r.m.from,r.m.to);for(let i=a;i<=b&&i<=604;i++)last[i]=+r.m.errors||0}
 return Object.keys(last).filter(i=>last[i]>=limit).map(Number).sort((a,b)=>a-b);
}
/* Next review portion: continue after the last reviewed page through the memorized pages only,
   stopping at a gap so the portion is one continuous stretch. */
function reviewPortion(db,p,lastTo){
 const pool=memorized(db,p.known);if(!pool.length)return null;
 const per=Math.max(1,Math.round(p.target||20));let i=lastTo?pool.findIndex(x=>x>lastTo):0;if(i<0)i=0;
 let from=pool[i],to=from;for(let j=i+1;j<pool.length&&pool[j]===to+1&&to-from+1<per;j++)to=pool[j];
 return {from,to,pool:pool.length,cycle:Math.ceil(pool.length/per)};
}
