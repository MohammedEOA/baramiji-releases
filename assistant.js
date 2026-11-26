let model=null,modelName='',draft=JSON.parse(localStorage.getItem('baramiji-draft')||'null'),noteAI='',aiBusy=false,draftRequest='',aiError='';
/* Recommended model: downloaded once inside the app and kept in its private storage (wllama's OPFS cache). */
const MODEL={url:'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',name:'Qwen2.5-1.5B-Instruct',size:'1.1 GB'};
const threads=()=>self.crossOriginIsolated?Math.max(1,Math.min(4,(navigator.hardwareConcurrency||4)-2)):1;
function engine(){return new LocalModel({'single-thread/wllama.wasm':'vendor/wllama.wasm','multi-thread/wllama.wasm':'vendor/wllama-mt.wasm'},{suppressNativeLog:true})}
async function loadBrain(file){
 if(model){await model.exit();model=null}
 let candidate=engine();
 try{await candidate.loadModel([file],{n_ctx:2048,n_threads:threads(),n_batch:128});model=candidate;modelName=file.name}
 catch(e){await candidate.exit().catch(()=>{});throw e}
}
async function loadRecommended(progress){
 if(model){await model.exit();model=null}
 let candidate=engine();
 try{await candidate.loadModelFromUrl(MODEL.url,{n_ctx:2048,n_threads:threads(),n_batch:128,progressCallback:({loaded,total})=>progress(total?Math.floor(100*loaded/total):0)});model=candidate;modelName=MODEL.name;try{localStorage.setItem('baramiji-model','1')}catch{}}
 catch(e){await candidate.exit().catch(()=>{});throw e}
}
/* The draft must match this grammar, so the model cannot return broken JSON. */
const DRAFT_GRAMMAR=String.raw`root ::= "{" ws "\"goal\":" ws str "," ws "\"programs\":" ws "[" ws prog ("," ws prog)? ("," ws prog)? ("," ws prog)? ws "]" ws "}"
prog ::= "{" ws "\"name\":" ws str "," ws "\"steps\":" ws "[" ws str ("," ws str)* ws "]" "," ws "\"repeat\":" ws rep "," ws "\"clock\":" ws clock "," ws "\"duration\":" ws dur "," ws "\"anchor\":" ws anc ws "}"
rep ::= "\"once\"" | "\"daily\"" | "\"weekly\"" | "\"monthly\"" | "\"quarter\"" | "\"half\"" | "\"yearly\""
clock ::= "\"" [01] [0-9] ":" [0-5] [0-9] "\"" | "\"2" [0-3] ":" [0-5] [0-9] "\""
dur ::= [1-9] | [1-9] [0-9] | [1-9] [0-9] [0-9]
anc ::= "\"\"" | "\"fajr\"" | "\"dhuhr\"" | "\"asr\"" | "\"maghrib\"" | "\"isha\""
str ::= "\"" ( [^"\\\n] | "\\" ["\\/nt] )* "\""
ws ::= [ \n]?`;
function validateDraft(raw){
 const a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<a)throw Error('schema');
 let d=JSON.parse(raw.slice(a,b+1));if(typeof d.goal!=='string'||!Array.isArray(d.programs)||!d.programs.length||d.programs.length>12)throw Error('schema');
 for(let p of d.programs){if(typeof p.name!=='string'||!p.name.trim()||!Array.isArray(p.steps)||!p.steps.every(t=>typeof t==='string')||!Object.hasOwn(freq,p.repeat)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.clock)||!Number.isInteger(p.duration)||p.duration<1||p.duration>1440||!Object.hasOwn({'':1,...prayers},p.anchor||''))throw Error('schema')}
 return d;
}

/* Gemini (free key from Google AI Studio) writes plan drafts only. It receives the typed goal and the current draft, never programs, logs or reports. The key stays on this device. */
/* Preferred names first; if Google retires them, the key's own model list picks a current Flash model. */
const GEMINI_MODELS=['gemini-flash-latest','gemini-2.5-flash','gemini-flash-lite-latest','gemini-2.5-flash-lite'];
const GAPI='https://generativelanguage.googleapis.com/v1beta/';
class GemErr extends Error{constructor(kind,detail){super(kind);this.detail=detail||''}}
/* Name 401/403/400 access errors by what Google says, so a sound key is not blamed for a disabled service or region. */
function gemKind(status,msg,why){const t=(why||'')+' '+(msg||'');
 if(status===429)return 'quota';
 if(/API_KEY_INVALID|API key not valid|API key expired|API_KEY_EXPIRED/i.test(t))return 'key';
 if(/SERVICE_DISABLED|has not been used|is disabled|not been enabled/i.test(t))return 'disabled';
 if(/location|region|country|territor/i.test(t))return 'region';
 if(status===401||status===403)return 'denied';
 return 'server'}
async function gemFetch(path,key,body){
 try{return await fetch(GAPI+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)})}
 catch{throw new GemErr('net')}
}
async function gemModels(key){
 /* Returns the usable Flash models, and the listing's own error when it fails, so that error is not hidden. */
 let r;try{r=await gemFetch('models?pageSize=200',key)}catch(e){return {list:[],err:e}}
 let j={};try{j=await r.json()}catch{}
 if(!r.ok){const msg=(j.error?.message||'').slice(0,160),why=j.error?.details?.map(d=>d.reason).filter(Boolean).join(',')||'';return {list:[],err:new GemErr(gemKind(r.status,msg,why),'list '+r.status+' '+msg)}}
 return {list:(j.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')&&/flash/.test(m.name)&&!/image|tts|audio|live|embed|thinking|exp/.test(m.name)).map(m=>m.name.replace(/^models\//,'')).sort((x,y)=>(/lite/.test(x)-/lite/.test(y))||(/preview/.test(x)-/preview/.test(y))||y.localeCompare(x,'en',{numeric:true}))};
}
function geminiKey(){try{return localStorage.getItem('baramiji-gemini')||''}catch{return ''}}
function setGeminiKey(k){try{k?localStorage.setItem('baramiji-gemini',k):localStorage.removeItem('baramiji-gemini')}catch{}}
const DRAFT_SCHEMA_BASE={type:'OBJECT',properties:{goal:{type:'STRING'},programs:{type:'ARRAY',items:{type:'OBJECT',properties:{name:{type:'STRING'},steps:{type:'ARRAY',items:{type:'STRING'}},repeat:{type:'STRING',enum:['once','daily','weekly','monthly','quarter','half','yearly']},clock:{type:'STRING',description:'HH:MM 24h'},duration:{type:'INTEGER',description:'minutes'},anchor:{type:'STRING',enum:['none','fajr','dhuhr','asr','maghrib','isha']}},required:['name','steps','repeat','clock','duration','anchor']}}},required:['goal','programs']};
async function geminiDraft(sys,user){
 const key=geminiKey();if(!key)throw new GemErr('nokey');
 let saved='';try{saved=localStorage.getItem('baramiji-gemini-model')||''}catch{}
 let list=[...new Set([saved,...GEMINI_MODELS].filter(Boolean))],listed=false,last=null,busy429=false,quotaWait='',quotaModels=[];
 const body={systemInstruction:{parts:[{text:sys}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig:{temperature:0.3,maxOutputTokens:16384,responseMimeType:'application/json',responseSchema:draftSchema()}};
 for(let i=0;i<list.length;i++){
  const m=list[i],r=await gemFetch('models/'+m+':generateContent',key,body);
  let j={};try{j=await r.json()}catch{}
  const msg=(j.error?.message||'').slice(0,160),why=j.error?.details?.map(d=>d.reason).filter(Boolean).join(',')||'';
  if(r.status===404||(r.status===400&&/is not found for API version|not supported for generateContent/i.test(msg))){last=new GemErr('server',r.status+' '+(msg||m));if(!listed&&i===list.length-1){listed=true;const g=await gemModels(key);if(g.err)last=new GemErr(g.err.message,g.err.detail);for(const x of g.list)if(!list.includes(x))list.push(x)}continue}
  /* Each model has its own free quota: on 429 try the next one (the Lite models allow many more requests). */
  if(r.status===429){busy429=true;const wait=j.error?.details?.find(d=>d.retryDelay)?.retryDelay;if(wait&&(!quotaWait||parseFloat(wait)<parseFloat(quotaWait)))quotaWait=wait;quotaModels.push(m);if(!listed&&i===list.length-1){listed=true;const g=await gemModels(key);for(const x of g.list)if(!list.includes(x))list.push(x)}continue}
  if(r.status===401||r.status===403||(r.status===400&&gemKind(400,msg,why)!=='server'))throw new GemErr(gemKind(r.status,msg,why),r.status+' '+msg);
  if(r.status>=500){last=new GemErr('server',r.status+' '+msg);continue}
  if(!r.ok)throw new GemErr('server',r.status+' '+msg);
  const c=j.candidates?.[0],text=(c?.content?.parts||[]).filter(x=>!x.thought).map(x=>x.text||'').join('').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g,'');
  if(!text)throw new GemErr('empty',c?.finishReason||j.promptFeedback?.blockReason||'');
  let d;try{d=JSON.parse(text)}catch{throw new GemErr('cut',c?.finishReason||'')}
  for(const p of d.programs||[])if(p.anchor==='none')p.anchor='';
  /* Remember the model only when it was not a stand-in for a busy one, so the better model is tried first next time. */if(!busy429)try{localStorage.setItem('baramiji-gemini-model',m)}catch{}
  return JSON.stringify(d);
 }
 /* Any 429 decides the message: keep the soonest retry time, and add why the other models could not be used. */
 if(busy429)throw new GemErr('quota',(quotaWait?'retry '+quotaWait:'')+(last?(quotaWait?' · ':'')+'البدائل: '+(last.detail||last.message):''));
 throw last||new GemErr('server');
}

/* Gemini gets the full program shape: domain, measurement kind and its target, weekdays, every-N-days, Hijri calendar, minimum step and a goal with numbers. */
function cloudKinds(){return Object.keys(kinds).filter(k=>k&&!kinds[k].hidden)}
function draftSchema(){
 const prog=JSON.parse(JSON.stringify(DRAFT_SCHEMA_BASE.properties.programs.items));
 prog.properties.repeat.enum=Object.keys(freq);
 Object.assign(prog.properties,{
  every:{type:'INTEGER',description:'days between sessions when repeat=every'},
  days:{type:'ARRAY',items:{type:'INTEGER'},description:'weekdays 0=Sunday..6=Saturday when repeat=weekly'},
  offset:{type:'INTEGER',description:'minutes relative to the prayer (adhan) when anchor is set: negative = before the adhan, positive = after'},
  domain:{type:'STRING',enum:domains(db).map(d=>d.name)},
  kind:{type:'STRING',enum:['none',...cloudKinds()]},
  target:{type:'NUMBER',description:'per-session target in the kind unit, 0 if none'},
  mini:{type:'NUMBER',description:'minimum step on a busy day, in the kind unit (minutes if kind=none), 0 if none'},
  calendar:{type:'STRING',enum:['g','h']}
 });
 return {type:'OBJECT',properties:{goal:{type:'STRING'},goalPlan:{type:'OBJECT',properties:{mode:{type:'STRING',enum:['none','sum','measure']},unit:{type:'STRING'},base:{type:'NUMBER'},target:{type:'NUMBER'},due:{type:'STRING',description:'YYYY-MM-DD'}},required:['mode']},programs:{type:'ARRAY',items:prog}},required:['goal','programs']};
}
function cloudSys(base){return base+' Today is '+today()+'. Fill every field that helps: domain, kind (measurement), target per session, weekdays, every, calendar (h for Hijri-month programs), mini, offset relative to the prayer (negative before the adhan, e.g. -30 for tahajjud before fajr; positive after). goalPlan: mode sum when sessions add up to the goal (unit/target total, base usually 0), measure for a body measurement the user records (base = current value if stated), none otherwise; due = deadline. Kinds: '+cloudKinds().map(k=>k+'='+kinds[k].label+(kinds[k].unit?' ('+kinds[k].unit+')':'')).join(', ')+'. Domains: '+domains(db).map(d=>d.name).join(', ')+'.'}
/* Turn a validated draft into real programs (and its goal). */
/* Same program = same name, time and the fields that fix its dates: the date of a one-off session, the interval and start of
   «every N days», the weekdays of a weekly program, and the calendar and start of monthly and longer repeats. */
function progKey(p){const a=p.anchor&&p.anchor!=='none'?p.anchor:'',start=p.origin||p.start||today(),r=p.repeat;
 const when=r==='once'?start:r==='every'?Math.max(2,Math.min(365,p.every|0||2))+'@'+start:r==='weekly'?[...new Set(Array.isArray(p.days)&&p.days.length?p.days:[date(start).getDay()])].sort().join(','):r==='daily'?'':(p.calendar==='h'?'h':'g')+start;
 return [String(p.name||'').trim(),r,a?a+(p.offset|0):p.clock,when].join('|')}
function draftPrograms(d){
 /* A plan approved again (or extended) joins its existing goal instead of creating a second one with the same name. */
 const same=db.goals.find(x=>x.name===d.goal);
 const gp=d.goalPlan,g=same||{id:uid(),name:d.goal,mode:'none',from:today(),unit:'',base:'',target:'',due:'',milestones:[],entries:{}};
 if(!same){if(gp&&gp.mode!=='none'&&Number.isFinite(gp.target)&&/^\d{4}-\d\d-\d\d$/.test(gp.due||'')&&gp.due>today()&&(gp.mode==='sum'||Number.isFinite(gp.base)))Object.assign(g,{mode:gp.mode,unit:String(gp.unit||''),base:Number.isFinite(gp.base)?gp.base:0,target:gp.target,due:gp.due});
 db.goals.push(g)}
 const ds=domains(db).map(x=>x.name);
 return d.programs.map(p=>{const kind=kinds[p.kind]&&!kinds[p.kind].hidden&&p.kind!=='none'?p.kind:'',days=Array.isArray(p.days)?[...new Set(p.days.filter(x=>Number.isInteger(x)&&x>=0&&x<7))]:[];
  const q=newProgram({name:p.name,goal:g.name,goalId:g.id,steps:p.steps,cat:ds.includes(p.domain)?p.domain:'خططي',repeat:p.repeat,clock:p.clock,anchor:p.anchor||'',offset:p.anchor&&p.anchor!=='none'?Math.max(-240,Math.min(240,p.offset|0)):0,duration:p.duration,calendar:p.calendar==='h'?'h':'g',grace:p.grace||'day',allow:p.allow||0,start:p.start||today(),end:p.end||'',kind,target:kind&&p.target>0?+p.target:0});
  if(p.repeat==='weekly'&&days.length)q.days=days;
  if(p.repeat==='every')q.every=Math.max(2,Math.min(365,p.every|0||2));
  if(p.mini>0)q.mini=+p.mini;
  q.lineage=q.id;return q});
}
const CLOUD_ERR={denied:'رفضت Google الوصول لهذا الطلب. المفتاح قد يكون سليمًا؛ راجع التفاصيل.',disabled:'خدمة Gemini غير مفعّلة لمشروع هذا المفتاح. أنشئ المفتاح من صفحة aistudio.google.com/apikey نفسها.',region:'Gemini غير متاح من منطقتك أو لحسابك. جرّب لاحقًا أو استخدم النموذج المحلي.',empty:'لم يُرجع Gemini أي خطة. أعد صياغة الطلب.',cut:'انقطع رد Gemini قبل اكتماله. اختصر الطلب وحاول مرة أخرى.',nokey:'أضف مفتاح Gemini أولًا',net:'لا يوجد اتصال بالإنترنت',key:'مفتاح Gemini غير صحيح أو موقوف. راجعه من الصفحة نفسها.',quota:'انتهى حد Gemini المجاني لكل النماذج المتاحة لمفتاحك الآن. يتجدد الحد خلال دقيقة إلى يوم بحسب النموذج؛ حاول لاحقًا أو استخدم النموذج المحلي.',server:'تعذر الوصول إلى Gemini الآن. حاول بعد قليل.'};

/* On the phone the local model runs natively (LocalLlm.java), many times faster than WebAssembly. */
const nativeLLM=()=>!!window.Phone?.llmStatus;
function llmSt(){try{return JSON.parse(Phone.llmStatus())}catch{return {}}}
let llmWait=null,llmPct=null;
window.onLlm=e=>{
 const say=t=>{if($('#aiStatus'))$('#aiStatus').textContent=t};
 if(e.type==='progress'){llmPct=e.p;say('جارٍ تنزيل النموذج السريع… '+e.p+'٪ (أبقِ التطبيق مفتوحًا على الواي فاي)');return}
 if(e.type==='downloaded'){llmPct=null;toast('النموذج السريع جاهز');if($('#dialog').open&&$('#askModel'))assistantPanel(!!$('#aiAnalysis'));return}
 if(e.type==='verifying'){say('جارٍ التحقق من سلامة الملف…');return}
 if(e.type==='cancelled'){llmPct=null;toast('أُوقف التنزيل. يكمل من حيث توقف عند الضغط مرة أخرى');if($('#dialog').open&&$('#askModel'))assistantPanel(!!$('#aiAnalysis'));return}
 if(e.type==='error'&&e.what==='download'){llmPct=null;toast('تعذر تنزيل النموذج. تحقق من الاتصال والمساحة (نحو 2 GB) ثم حاول مرة أخرى، ويكمل من حيث توقف');if($('#dialog').open&&$('#askModel'))assistantPanel(!!$('#aiAnalysis'));return}
 if(!llmWait||e.id!==llmWait.id)return;
 if(e.type==='loading')say('جارٍ تشغيل النموذج… (أول مرة تأخذ ثواني)');
 else if(e.type==='part')say('جارٍ التوليد على جهازك · '+e.chars+' حرفًا');
 else if(e.type==='done'){const w=llmWait;llmWait=null;clearTimeout(w.t);if(e.text)dropOldModel();w.res(e.text||'')}
 else if(e.type==='error'){const w=llmWait;llmWait=null;clearTimeout(w.t);w.rej(Error(e.what||'run'))}
};
function nativeRun(prompt){return new Promise((res,rej)=>{const id=uid();llmWait={id,res,rej,t:setTimeout(()=>{if(llmWait?.id===id){llmWait=null;try{Phone.llmReset()}catch{}rej(Error('timeout'))}},300000)};Phone.llmGenerate(id,prompt)})}
function localReady(){return nativeLLM()?!!llmSt().downloaded:!!model}
function nativeBox(){const st=llmSt();
 if(st.downloaded)return '<p>النموذج السريع على جهازك · '+esc(st.name||'')+'</p><details><summary>إدارة النموذج</summary><div class="actions"><button type="button" id="llmDel" class="ghost danger">حذف النموذج من الجهاز</button></div></details>';
 if(st.downloading||llmPct!==null)return '<div class="actions"><button type="button" id="llmStop">إيقاف التنزيل</button></div>';
 return '<div class="actions"><button type="button" id="llmGet" class="primary">'+(st.partial?'أكمل تنزيل النموذج السريع':'تنزيل النموذج السريع (1.6 GB مرة واحدة)')+'</button></div><p class="muted">يحتاج نحو 2 GB من المساحة. استخدم الواي فاي وأبقِ التطبيق مفتوحًا حتى ينتهي.</p>'}
function assistantPanel(analysis=false){
 const old=draft;
 const cloud=!analysis&&!!geminiKey();
 const localBox=nativeLLM()?nativeBox():(!model?'<div class="actions"><button id="getModel" class="primary">'+(hasModel()?'تشغيل النموذج المحفوظ':'تنزيل النموذج المقترح ('+MODEL.size+')')+'</button></div><details><summary>أو اختر ملف GGUF من جهازك</summary><label>ملف النموذج<input type="file" id="modelFile"></label></details>':'<p>النموذج · '+esc(modelName)+' · '+threads()+' '+(threads()>1?'أنوية':'نواة')+'</p>');
 const cloudBox=analysis?'':cloud?'<p class="muted">يكتب الخطة Gemini من Google في ثوانٍ. يُرسل إليه ما تكتبه هنا والمسودة الحالية، ومعهما أسماء مجالاتك وطرق القياس ووحداتها ليختار منها. لا يُرسل شيء من برامجك أو سجلاتك. بلا إنترنت يُستخدم النموذج المحلي إن كان جاهزًا.</p><details><summary>مفتاح Gemini</summary><div class="actions"><button type="button" id="gemDel" class="ghost danger">إزالة المفتاح</button></div></details>':'<article class="card"><b>رد في ثوانٍ مع Gemini المجاني</b><p class="muted">افتح الرابط وسجّل بحساب Google، ثم اضغط «Create API key» وانسخ المفتاح والصقه هنا. يُحفظ على جهازك فقط. يُرسل إلى Google ما تكتبه للمساعد والمسودة، ومعهما أسماء مجالاتك وطرق القياس ووحداتها. لا يُرسل شيء من برامجك أو سجلاتك، وقد تستخدمه Google لتحسين نماذجها في الخطة المجانية.</p><p><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a></p><label>مفتاح Gemini<input id="gemKey" type="password" autocomplete="off" dir="ltr"></label><div class="actions"><button type="button" id="gemSave" class="tonal">حفظ المفتاح</button></div></article>';
 modal(analysis?'تحليل التقرير محليًا':'مساعد الخطط',(analysis?'<p class="muted">يعمل التحليل على جهازك بلا إنترنت، ولا تخرج سجلاتك منه. قد يستغرق الرد دقيقة أو أكثر.</p>'+localBox:cloudBox+(cloud?'<details><summary>النموذج المحلي (بلا إنترنت)</summary>'+localBox+'</details>':'<h4 class="sgroup">أو على جهازك بلا إنترنت</h4><p class="muted">بعد تنزيل النموذج مرة واحدة. أبطأ، وقد يستغرق الرد دقائق.</p>'+localBox))+'<div id="aiStatus" role="status">'+(aiBusy?'جارٍ التنفيذ…':esc(aiError))+'</div>'+field('instruction',analysis?'ما الذي تريد تحليله؟':'هدفك أو التعديل المطلوب',analysis?'ما النقص المتكرر وما التحسين المقترح؟':draftRequest)+'<div class="actions"><button id="askModel" class="primary">'+(analysis?'حلّل التقرير المعروض':draft?'عدّل المسودة':'اقترح خطة')+'</button></div>'+(analysis?(noteAI?'<article class="card">'+esc(noteAI)+'</article>':''):old?'<h2>'+esc(old.goal)+'</h2>'+(old.goalPlan&&old.goalPlan.mode!=='none'&&old.goalPlan.target?'<p class="muted">الهدف: '+esc(String(old.goalPlan.target))+' '+esc(old.goalPlan.unit||'')+(old.goalPlan.due?' بحلول '+esc(old.goalPlan.due):'')+'</p>':'')+old.programs.map((p,i)=>'<article class="card"><b>'+esc(p.name)+'</b><p>'+freq[p.repeat]+' · '+(p.anchor?((p.offset|0)<0?n(Math.abs(p.offset))+' دقيقة قبل أذان ':(p.offset|0)>0?n(p.offset)+' دقيقة بعد أذان ':'مع أذان ')+prayers[p.anchor]:p.clock)+' · '+p.duration+' دقيقة · السماح '+({day:'حتى نهاية اليوم',week:'حتى نهاية الجمعة',custom:(p.allow||0)+' دقيقة'}[p.grace||'day'])+'</p>'+draftExtra(p)+'<small>'+p.steps.map(esc).join('، ')+'</small><div class="actions"><button data-draft-edit="'+i+'">تعديل التفاصيل</button></div></article>').join('')+'<p>تبدأ البرامج اليوم ما لم تغيّر تاريخ البدء. راجع التكرار والمدة والخطوات قبل الاعتماد.</p><div class="actions"><button id="approve" class="primary">اعتمد وأضف إلى برامجي</button><button id="discard">حذف المسودة</button></div>':''));
 if($('#getModel'))$('#getModel').onclick=async()=>{if(aiBusy)return;aiBusy=true;$('#getModel').disabled=true;const say=t=>{if($('#aiStatus'))$('#aiStatus').textContent=t};say(hasModel()?'جارٍ تشغيل النموذج…':'جارٍ التنزيل… 0٪ (استخدم الواي فاي)');
 try{await loadRecommended(p=>say(p<100?'جارٍ التنزيل… '+p+'٪':'جارٍ تشغيل النموذج…'));if($('#dialog').open)assistantPanel(analysis);toast('النموذج جاهز')}catch{toast('تعذر تنزيل النموذج أو تشغيله. تحقق من الاتصال والمساحة ثم حاول مرة أخرى.')}finally{aiBusy=false;say('');if($('#getModel'))$('#getModel').disabled=false}};
 if(analysis&&$('#aiStatus'))$('#aiStatus').insertAdjacentHTML('beforebegin','<i id="aiAnalysis" hidden></i>');
 if(llmPct!==null&&$('#aiStatus')&&!aiBusy)$('#aiStatus').textContent='جارٍ تنزيل النموذج السريع… '+llmPct+'٪';
 if($('#llmGet'))$('#llmGet').onclick=()=>{llmPct=0;Phone.llmDownload();assistantPanel(analysis)};
 if($('#llmStop'))$('#llmStop').onclick=()=>Phone.llmCancel();
 if($('#llmDel'))$('#llmDel').onclick=async()=>{if(!await ask('حذف النموذج السريع من جهازك؟','يمكنك تنزيله مرة أخرى لاحقًا.','حذف',true))return;Phone.llmDelete();toast('حُذف النموذج');assistantPanel(analysis)};
 if($('#gemSave'))$('#gemSave').onclick=()=>{const k=$('#gemKey').value.replace(/\s+/g,'');if(!/^[\x21-\x7e]{20,300}$/.test(k)){const m=k?'هذا لا يشبه مفتاح Gemini. انسخ المفتاح كاملًا من الصفحة ثم الصقه.':'الصق المفتاح في الخانة أولًا.';$('#aiStatus').textContent=m;toast(m);return}setGeminiKey(k);toast('حُفظ مفتاح Gemini');assistantPanel(analysis)};
 if($('#gemDel'))$('#gemDel').onclick=()=>{setGeminiKey('');toast('أُزيل المفتاح');assistantPanel(analysis)};
 const selectedFile=$('#modelFile');if(selectedFile)selectedFile.onchange=async()=>{let f=selectedFile.files[0];if(!f||aiBusy)return;aiBusy=true;$('#aiStatus').textContent='جارٍ تحميل النموذج…';try{await loadBrain(f);if($('#dialog').open)assistantPanel(analysis);toast('النموذج جاهز')}catch{toast('تعذر تحميل النموذج. جرّب ملف GGUF أصغر ومتوافقًا.')}finally{aiBusy=false;if($('#aiStatus'))$('#aiStatus').textContent=''}};
 $('#askModel').onclick=async()=>{
 if(aiBusy)return;const viaCloud=cloud&&navigator.onLine!==false;if(!viaCloud&&!localReady()){toast(analysis?'نزّل النموذج المحلي أولًا من هذه النافذة، فالتحليل يعمل على جهازك فقط':cloud?'لا يوجد اتصال، والنموذج المحلي غير جاهز':'أضف مفتاح Gemini أو شغّل النموذج المحلي أولًا');return}
 const request=$('[name=instruction]').value.trim();if(!request)return;
 aiBusy=true;aiError='';$('#aiStatus').textContent=viaCloud?'يكتب Gemini الخطة…':'جارٍ التوليد على جهازك…';
 try{
 const sys=analysis?'أنت مساعد عربي. حلل سجلات المستخدم المعروضة فقط. اذكر ملاحظة قابلة للقياس واقتراحا عمليا.':'Return ONLY valid JSON. Write values in Arabic. Schema {"goal":"هدف","programs":[{"name":"اسم","steps":["خطوة"],"repeat":"daily","clock":"07:00","duration":20,"anchor":""}]}. repeat once/daily/weekly/monthly/quarter/half/yearly. anchor empty or fajr/dhuhr/asr/maghrib/isha. Keep unmodified programs when revising. Max 4 programs. No markdown.';
 const ctx=analysis?reportBrief():draft?JSON.stringify(draft):'';
 const msgs=[{role:'system',content:sys},{role:'user',content:ctx+'\n'+request}],run=g=>nativeLLM()?nativeRun(sys+'\n\n'+(ctx?(analysis?'السجلات:\n':'المسودة الحالية:\n')+ctx+'\n\n':'')+(analysis?'السؤال: ':'الطلب: ')+request+(analysis?'':'\nأعد JSON فقط.')):model.createChatCompletion(msgs,{nPredict:analysis?700:1400,sampling:g?{temp:0.2,grammar:DRAFT_GRAMMAR}:{temp:analysis?0.3:0.2},onNewToken:(token,piece,text)=>{if($('#aiStatus'))$('#aiStatus').textContent='جارٍ التوليد · '+text.length+' حرفًا'}});
 let output;if(viaCloud){try{output=await geminiDraft(cloudSys(sys),ctx+'\n'+request)}catch(e){if(e.message!=='net'||!localReady()){aiError=(CLOUD_ERR[e.message]||CLOUD_ERR.server)+(e.detail?' (التفاصيل: '+e.detail+')':'');throw e}output=await run(true)}}else try{output=await run(!analysis)}catch(e){if(analysis||nativeLLM())throw e;output=await run(false)}
 if(analysis){noteAI=output.trim();if(!noteAI){aiError='لم يُرجع النموذج ردًا. أعد المحاولة بسؤال أقصر.';throw Error('empty')}}else{draft=validateDraft(output);localStorage.setItem('baramiji-draft',JSON.stringify(draft));draftRequest=''}
 if($('#dialog').open)assistantPanel(analysis)
 aiError=''}catch{aiError=aiError||(analysis?'تعذر إكمال التحليل. حاول مرة أخرى بطلب أقصر.':'لم يكتمل رد المساعد فلم تُحفظ مسودة. اختصر الطلب (هدف واحد في سطر) ثم حاول مرة أخرى.');toast(aiError)}finally{aiBusy=false;if($('#aiStatus'))$('#aiStatus').textContent=aiError}
 };
 document.querySelectorAll('[data-draft-edit]').forEach(b=>b.onclick=()=>editDraft(Number(b.dataset.draftEdit)));
 if($('#discard'))$('#discard').onclick=()=>{draft=null;localStorage.removeItem('baramiji-draft');assistantPanel()};
 if($('#approve'))$('#approve').onclick=async()=>{if(!draft||aiBusy)return;
  /* Programs already in the schedule with the same name and time are not added again. */
  const have=new Set(db.ps.filter(p=>!p.archived).map(progKey)),dup=[],fresh=[];
  /* Rows are checked in order, so two identical rows in the same draft are also added once. */
  for(const p of draft.programs){const k=progKey(p);if(have.has(k))dup.push(p);else{have.add(k);fresh.push(p)}}
  if(dup.length){const names=dup.map(p=>'«'+p.name+'»').join('، ');
   if(!fresh.length){toast('برامج هذه المسودة موجودة في جدولك بنفس الاسم والموعد، فلم يُضف شيء: '+names);return}
   if(!await ask('بعض البرامج موجودة مسبقًا','موجودة في جدولك بنفس الاسم والموعد: '+names+'. ستُضاف البرامج الجديدة فقط ('+fresh.length+').','أضف الجديد فقط'))return;
   if(!draft)return}
  /* Keep the draft until the plan is really saved; a failed save undoes this attempt's goal and programs. */
  const gIds=new Set(db.goals.map(g=>g.id)),ps=draftPrograms({...draft,programs:fresh}),pIds=new Set(ps.map(p=>p.id));db.ps.push(...ps);
  if(save()!==true){db.ps=db.ps.filter(p=>!pIds.has(p.id));db.goals=db.goals.filter(g=>gIds.has(g.id));render();toast('لم تُحفظ الخطة، فبقيت المسودة كما هي. حاول مرة أخرى.');return}
  draft=null;localStorage.removeItem('baramiji-draft');closeD();toast('اعتُمدت الخطة وأضيفت برامجها إلى الجدول')};
}

function editDraft(i){
 const p=draft.programs[i];
 modal('تفاصيل المسودة',form('editDraft',input('name','اسم البرنامج','text',p.name,'required')+stepsField('خطوات التنفيذ')+sel('repeat','التكرار',freq,p.repeat)+input('duration','مدة الجلسة بالدقائق','number',p.duration,'required min=1 max=1440')+input('start','تاريخ البدء','date',p.start||today(),'required')+input('end','نهاية البرنامج (اختياري)','date',p.end||'')+sel('anchor','التوقيت',{'':'ساعة محددة',...prayers},p.anchor)+input('clock','الساعة','time',p.clock,'required')+input('offset','الدقائق','number',Math.abs(p.offset||0),'required min=0 max=240')+sel('side','قبل الأذان أو بعده',{after:'بعد الأذان',before:'قبل الأذان'},(p.offset||0)<0?'before':'after')+sel('grace','السماح',{day:'حتى نهاية اليوم',week:'حتى نهاية الجمعة',custom:'دقائق إضافية'},p.grace||'day')+input('allow','الدقائق الإضافية','number',p.allow||0,'min=0 max=525600 required'),'حفظ المسودة'));
 const f=$('#editDraft');f.elements.steps.value=p.steps.join('\n');bindSteps(f);
 /* Show the clock for a fixed time, and the minutes and before/after only when the session follows a prayer. */
 const show=(el,on)=>{el.parentElement.hidden=!on;el.disabled=!on};/* hidden fields are disabled, so they neither block the form's validation nor reach FormData */
 const sync=()=>{const a=!!f.anchor.value;show(f.clock,!a);show(f.offset,a);show(f.side,a);show(f.allow,f.grace.value==='custom')};f.anchor.onchange=f.grace.onchange=sync;sync();
 f.onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(f));if(v.end&&v.end<v.start){toast('تحقق من تاريخ الانتهاء');return}Object.assign(p,v,{steps:v.steps.split('\n').map(t=>t.trim()).filter(Boolean),duration:+v.duration,offset:v.anchor?(v.side==='before'?-1:1)*Math.abs(+v.offset):0,allow:v.grace==='custom'?+v.allow:0});delete p.side;localStorage.setItem('baramiji-draft',JSON.stringify(draft));assistantPanel()};
}

function hasModel(){try{return localStorage.getItem('baramiji-model')==='1'}catch{return false}}

function draftExtra(p){const k=kinds[p.kind]&&p.kind!=='none'?kinds[p.kind]:null,bits=[p.domain,k&&(k.label+(p.target>0?' · '+p.target+' '+(k.unit||''):'')),p.repeat==='weekly'&&p.days?.length?p.days.map(d=>weekdays[d]).join('، '):'',p.repeat==='every'&&p.every?'كل '+p.every+' أيام':'',p.calendar==='h'?'هجري':'',p.mini>0?'الحد الأدنى '+p.mini:''].filter(Boolean);return bits.length?'<p class="muted">'+bits.map(x=>esc(String(x))).join(' · ')+'</p>':''}
/* On the phone the native model replaces the WebAssembly one: remove its old 1.1 GB copy, but only after the native model has produced a reply. */
async function dropOldModel(){if(!nativeLLM())return;try{const root=await navigator.storage.getDirectory();await root.removeEntry('cache',{recursive:true})}catch{}try{localStorage.removeItem('baramiji-model')}catch{}}

/* The local model holds about 1,280 tokens for the question and the answer together, and raw report rows (25 Arabic fields each)
   overflowed it, so the reply came back empty. Send a short per-program summary of the report shown instead. */
function reportBrief(){
 const by=new Map();
 for(const r of rows()){const k=r['البرنامج'];if(!by.has(k))by.set(k,{n:0,done:0,st:{},why:{},notes:[]});const b=by.get(k);b.n++;
  const st=r['الحالة'];if(/مكتمل|أُنجزت/.test(st))b.done++;else b.st[st]=(b.st[st]||0)+1;
  if(r['سبب النقص'])b.why[r['سبب النقص']]=(b.why[r['سبب النقص']]||0)+1;if(r['ملاحظة'])b.notes.push(r['ملاحظة'])}
 const list=o=>Object.entries(o).map(([k,v])=>k+' '+v).join('، ');
 let out=[...by].map(([k,b])=>'- '+k+': '+b.n+' جلسات، أُنجز '+b.done+(Object.keys(b.st).length?'، '+list(b.st):'')+(Object.keys(b.why).length?'. أسباب النقص: '+list(b.why):'')+(b.notes.length?'. ملاحظات: '+b.notes.slice(-2).join(' / '):'')).join('\n');
 if(out.length>900)out=out.slice(0,900)+'…';
 return out||'لا توجد جلسات في الفترة المعروضة.';
}
