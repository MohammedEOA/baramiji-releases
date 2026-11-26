'use strict';
/* Cloud sync: a Supabase account (email + password, reset by an emailed code) holds one copy of the data.
   Each device keeps the last synced copy as the merge base, so edits made on two devices are merged field by field. */
const BACK='?redirect_to='+encodeURIComponent('baramiji://auth');
const CLOUD={url:'https://drlftdvqppeywmwjfvvg.supabase.co',key:'sb_publishable_Mfm4eaGM8BgmHV4vXkl5Ug_yo_8M9IN'};
const ls={get:k=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}},del:k=>{try{localStorage.removeItem(k)}catch{}}};
let auth=JSON.parse(ls.get('baramiji-auth')||'null'),syncBusy=false,syncTimer,syncMessage=ls.get('baramiji-synced')?'آخر مزامنة '+full(+ls.get('baramiji-synced')):'',conflictChoice='',ownerChoice='',pendingEmail='',pendingKind='';
/* The cloud stores data as Postgres jsonb, which reorders object keys. Compare by content, not key order, or an
   unchanged list of objects (away periods, session parts, milestones) looks edited and raises a false conflict. */
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const same=(a,b)=>JSON.stringify(canon(a))===JSON.stringify(canon(b));
function mergeValue(base,local,remote){
 if(same(local,remote)||same(base,remote))return local;
 if(same(local,base))return remote;
 if([local,remote].every(x=>x&&typeof x==='object'&&!Array.isArray(x))&&(base===undefined||base&&typeof base==='object')){
 const obj={};for(const k of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])){
 const v=mergeValue(base?.[k],local[k],remote[k]);if(v!==undefined)obj[k]=v
 }return obj}
 if(conflictChoice)return conflictChoice==='local'?local:remote;
 throw Error('conflict')
}
const byId=a=>Object.fromEntries((a||[]).map(x=>[x.id,x]));
function mapped(v){return {...v,ps:byId(v.ps),blocks:byId(v.blocks),goals:byId(v.goals)}}
function unmapped(v){return {...v,ps:Object.values(v.ps),blocks:Object.values(v.blocks),goals:Object.values(v.goals||{})}}
function merge(base,local,remote){return unmapped(mergeValue(mapped(base),mapped(local),mapped(remote)))}

class CloudError extends Error{constructor(code,status){super(code);this.status=status}}
async function call(path,{method='GET',body,token,prefer}={}){
 const headers={apikey:CLOUD.key,'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;if(prefer)headers.Prefer=prefer;
 let res;try{res=await fetch(CLOUD.url+path,{method,headers,body:body&&JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)})}catch{throw new CloudError('network',0)}
 const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
 if(!res.ok)throw new CloudError(data?.error_code||data?.code||data?.error||'http',res.status);
 return data;
}
function keep(session,email){auth={email:session.user?.email||email,uid:session.user?.id,access:session.access_token,refresh:session.refresh_token,exp:Date.now()+(session.expires_in||3600)*1000};ls.set('baramiji-auth',JSON.stringify(auth))}
async function token(){
 if(!auth)throw new CloudError('signedout');
 if(Date.now()<auth.exp-60000)return auth.access;
 try{keep(await call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:auth.refresh}}),auth.email)}
 catch(e){if(e.status>=400&&e.status<500){signOut('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.')}throw e}
 return auth.access;
}
function signOut(msg='خرجت من حسابك على هذا الجهاز. بياناتك باقية على الجهاز وفي السحابة.'){auth=null;ls.del('baramiji-auth');ls.del('baramiji-synced');syncMessage=msg}
function cloudText(e){return {network:'تعذر الاتصال. بياناتك محفوظة على الجهاز.',invalid_credentials:'الإيميل أو كلمة المرور غير صحيحة.',invalid_grant:'الإيميل أو كلمة المرور غير صحيحة.',email_not_confirmed:'لم يُؤكَّد الإيميل بعد. أدخل الرمز المرسل إليك.',user_already_exists:'هذا الإيميل مسجل من قبل. استخدم «دخول».',email_exists:'هذا الإيميل مسجل من قبل. استخدم «دخول».',weak_password:'كلمة المرور قصيرة. استخدم 8 أحرف على الأقل.',over_email_send_rate_limit:'أُرسلت رسائل كثيرة. انتظر ساعة ثم حاول.',over_request_rate_limit:'محاولات كثيرة. انتظر قليلًا ثم حاول.',otp_expired:'الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزًا جديدًا.',same_password:'اختر كلمة مرور مختلفة عن السابقة.',signedout:'سجّل الدخول أولًا.',localsave:'تعذر حفظ البيانات على الجهاز، فلم تكتمل المزامنة. حرّر مساحة وحاول مرة أخرى.',snapshot:'تعذر حفظ لقطة من بيانات الجهاز، فلم يتغير شيء. حرّر مساحة وحاول مرة أخرى.',conflict:'تعارض يحتاج اختيارك'}[e.message]||'حدث خطأ ('+e.message+'). حاول مرة أخرى.'}

/* Which account the data on this device belongs to. Set on the first successful sync; older installs infer it from the
   per-account merge base. Data that belongs to another account is never sent to this one without the person choosing. */
const OTHER='بيانات هذا الجهاز تخص حسابًا آخر';
function owner(who){
 let o=ls.get('baramiji-owner');if(o)return o;
 if(ls.get('baramiji-base:'+who))return who;
 try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith('baramiji-base:'))return k.slice(14)}}catch{}
 return '';
}
async function synchronize(){
 if(syncBusy||!auth||loadError||(!conflictChoice&&syncMessage.startsWith('تعارض'))||(!ownerChoice&&syncMessage.startsWith(OTHER)))return;
 syncBusy=true;const who=auth.uid;
 try{
 const mine=owner(who),fresh=ownerChoice==='fresh';
 if(mine&&mine!==who&&!ownerChoice){syncMessage=OTHER;if($('#dialog').open&&$('#syncStatus'))syncPanel();render();return}
 if(fresh&&window.Phone){let ok=false;try{ok=Phone.snapshot('before-account-switch')===true}catch{}if(!ok)throw new CloudError('snapshot')}
 for(let attempt=0;attempt<3;attempt++){
 const t=await token(),rows=await call('/rest/v1/sync_state?select=rev,data',{token:t});if(auth?.uid!==who)return;
 const remote=rows?.[0];let theirs=null;if(remote){theirs=migrate(validateState(remote.data))}
 const local=fresh?{...initial(),cfg:db.cfg}:db;
 const original=JSON.stringify(local),base=JSON.parse(ls.get('baramiji-base:'+who)||'null')||initial();
 /* The cloud copy is still the one this device last synced (same revision): nothing changed elsewhere, so this device's data wins without a merge. */
 const untouched=!fresh&&remote&&String(remote.rev)===ls.get('baramiji-rev:'+who);
 const result=fresh&&theirs?theirs:untouched?JSON.parse(original):theirs?merge(base,local,theirs):JSON.parse(original);
 let newRev=remote?remote.rev:null;
 if(!theirs){try{await call('/rest/v1/sync_state',{method:'POST',token:t,body:{data:result},prefer:'return=minimal'})}catch(e){if(e.status===409)continue;throw e}}
 else if(!same(result,theirs)){const ok=await call('/rest/v1/sync_state?user_id=eq.'+who+'&rev=eq.'+remote.rev,{method:'PATCH',token:t,body:{rev:remote.rev+1,data:result,updated_at:new Date().toISOString()},prefer:'return=representation'});if(!ok?.length)continue;newRev=ok[0].rev}
 if(auth?.uid!==who)return;
 const changed=!fresh&&JSON.stringify(db)!==original,next=changed?merge(JSON.parse(original),db,result):result;
 if(!persist(next))throw new CloudError('localsave');
 adoptSynced(next);ls.set('baramiji-base:'+who,JSON.stringify(result));if(newRev!=null)ls.set('baramiji-rev:'+who,String(newRev));else ls.del('baramiji-rev:'+who);ls.set('baramiji-owner',who);if(changed)queueSync();
 render();alarms();conflictChoice='';ownerChoice='';ls.set('baramiji-synced',String(Date.now()));syncMessage='آخر مزامنة '+full(Date.now());return
 }throw new CloudError('busy')
 }catch(e){if(e.message==='snapshot')ownerChoice='';if(auth)syncMessage=e.message==='conflict'?'تعارض يحتاج اختيارك في «المزامنة»':cloudText(e)}
 finally{syncBusy=false;if($('#syncStatus'))$('#syncStatus').textContent=syncMessage}
}
function queueSync(){if(auth){clearTimeout(syncTimer);syncTimer=setTimeout(synchronize,800)}}

function syncPanel(view){
 const status='<p id="syncStatus" role="status">'+esc(syncMessage)+'</p>';
 if(auth){
 modal('المزامنة السحابية','<p>حسابك: <b dir="ltr">'+esc(auth.email)+'</b></p><p class="muted">تُرفع بياناتك تلقائيًا عند كل تعديل وعند فتح التطبيق. على جوال جديد ثبّت برامجي وادخل بنفس الإيميل وكلمة المرور.</p>'+status
 +(syncMessage.startsWith(OTHER)?'<p>دخلت بحساب غير الحساب الذي زامنت معه بيانات هذا الجهاز من قبل. لن يُرسل شيء حتى تختار:</p><div class="actions"><button id="ownFresh" class="primary">استخدم بيانات هذا الحساب</button><button id="ownMove">انقل بيانات الجهاز إليه</button></div><p class="muted">الخيار الأول يحفظ لقطة من بيانات الجهاز ثم يعرض بيانات هذا الحساب. والثاني يدمج بيانات الجهاز في هذا الحساب.</p>':'')
 +(syncMessage.startsWith('تعارض')?'<p>عُدّل نفس الحقل على جهازين. اختر أي القيمتين تبقى للحقول المتعارضة فقط:</p><div class="actions"><button id="keepLocal">قيم هذا الجهاز</button><button id="keepRemote">قيم السحابة</button></div>':'')
 +'<div class="actions"><button id="syncNow" class="primary">مزامنة الآن</button><button id="changePw">تغيير كلمة المرور</button><button id="signOut">خروج من هذا الجهاز</button></div>');
 $('#syncNow').onclick=()=>{syncMessage='جارٍ المزامنة…';$('#syncStatus').textContent=syncMessage;synchronize()};
 $('#signOut').onclick=()=>ask('الخروج من الحساب؟','تبقى بياناتك على هذا الجهاز وفي السحابة.','خروج').then(ok=>{if(ok){signOut();syncPanel()}});
 $('#changePw').onclick=()=>passwordForm();
 for(const [id,v] of [['#ownFresh','fresh'],['#ownMove','move']])if($(id))$(id).onclick=()=>{ownerChoice=v;syncMessage='جارٍ المزامنة…';$('#syncStatus').textContent=syncMessage;synchronize().then(()=>syncPanel())};
 for(const [id,v] of [['#keepLocal','local'],['#keepRemote','remote']])if($(id))$(id).onclick=()=>{conflictChoice=v;syncMessage='جارٍ المزامنة…';synchronize()};
 return}
 if(view==='code'){
 modal(pendingKind==='recovery'?'استعادة كلمة المرور':'تأكيد الإيميل','<p>أرسلنا رسالة إلى <b dir="ltr">'+esc(pendingEmail)+'</b>. افتحها على هذا الجوال واضغط الرابط الذي فيها، فيفتح برامجي '+(pendingKind==='recovery'?'لتكتب كلمة مرور جديدة':'ويدخلك إلى حسابك')+'. إن لم تجدها فابحث في الرسائل غير المرغوبة.</p><details><summary>وصلك رمز أرقام بدل الرابط؟</summary>'+form('codeForm',input('code','الرمز','text','','required inputmode=numeric autocomplete=one-time-code pattern="[0-9]{6,10}"')+(pendingKind==='recovery'?input('password','كلمة المرور الجديدة','password','','required minlength=8 autocomplete=new-password'):''),'تأكيد')+'</details>'+status+'<div class="actions"><button id="resend">أرسل الرمز مرة أخرى</button><button id="back">رجوع</button></div>');
 $('#back').onclick=()=>syncPanel();
 $('#resend').onclick=async()=>{try{await call((pendingKind==='recovery'?'/auth/v1/recover':'/auth/v1/resend')+BACK,{method:'POST',body:pendingKind==='recovery'?{email:pendingEmail}:{type:'signup',email:pendingEmail}});say('أُرسل رمز جديد.')}catch(e){say(cloudText(e))}};
 $('#codeForm').onsubmit=async e=>{e.preventDefault();const f=e.target,code=f.code.value.trim();say('جارٍ التحقق…');
 try{let s;for(const type of pendingKind==='recovery'?['recovery']:['email','signup']){try{s=await call('/auth/v1/verify',{method:'POST',body:{type,email:pendingEmail,token:code}});break}catch(err){if(type==='signup'||pendingKind==='recovery')throw err}}
 keep(s,pendingEmail);if(pendingKind==='recovery')await call('/auth/v1/user',{method:'PUT',token:auth.access,body:{password:f.password.value}});
 syncMessage='جارٍ المزامنة الأولى…';syncPanel();toast(pendingKind==='recovery'?'تغيّرت كلمة المرور ودخلت إلى حسابك':'تأكد الإيميل ودخلت إلى حسابك');synchronize()}
 catch(err){say(cloudText(err))}};
 return}
 if(view==='forgot'){
 modal('نسيت كلمة المرور','<p>اكتب إيميلك، وسيصلك رمز لتعيين كلمة مرور جديدة. بياناتك تبقى كما هي.</p>'+form('forgotForm',input('email','الإيميل','email',pendingEmail,'required dir=ltr autocomplete=email'),'أرسل الرمز')+status+'<div class="actions"><button id="back">رجوع</button></div>');
 $('#back').onclick=()=>syncPanel();
 $('#forgotForm').onsubmit=async e=>{e.preventDefault();pendingEmail=e.target.email.value.trim().toLowerCase();say('جارٍ الإرسال…');try{await call('/auth/v1/recover'+BACK,{method:'POST',body:{email:pendingEmail}});pendingKind='recovery';syncPanel('code')}catch(err){say(cloudText(err))}};
 return}
 const signup=view==='signup';
 modal('المزامنة السحابية','<p>'+(signup?'أنشئ حسابًا بإيميلك وكلمة مرور تختارها. تُحفظ بياناتك في السحابة وتعود إليك على أي جوال، ويمكنك استعادة كلمة المرور بالإيميل.':'ادخل بحسابك لتُحفظ بياناتك في السحابة وتتزامن بين أجهزتك.')+'</p>'
 +form('authForm',input('email','الإيميل','email',pendingEmail,'required dir=ltr autocomplete=email')+input('password','كلمة المرور','password','','required minlength=8 autocomplete='+(signup?'new-password':'current-password'))+(signup?input('again','أعد كتابة كلمة المرور','password','','required minlength=8 autocomplete=new-password'):''),signup?'إنشاء الحساب':'دخول')+status
 +'<div class="actions">'+(signup?'<button id="toLogin">لدي حساب: دخول</button>':'<button id="toSignup">حساب جديد</button><button id="toForgot">نسيت كلمة المرور</button>')+'</div>');
 if($('#toLogin'))$('#toLogin').onclick=()=>syncPanel();
 if($('#toSignup'))$('#toSignup').onclick=()=>syncPanel('signup');
 if($('#toForgot'))$('#toForgot').onclick=()=>{pendingEmail=$('#authForm').email.value.trim();syncPanel('forgot')};
 $('#authForm').onsubmit=async e=>{e.preventDefault();const f=e.target,email=f.email.value.trim().toLowerCase(),password=f.password.value;pendingEmail=email;
 if(signup&&password!==f.again.value){say('كلمتا المرور غير متطابقتين.');return}
 say(signup?'جارٍ إنشاء الحساب…':'جارٍ الدخول…');
 try{
 if(signup){const s=await call('/auth/v1/signup'+BACK,{method:'POST',body:{email,password}});if(s?.access_token){keep(s,email)}else{pendingKind='signup';syncPanel('code');return}}
 else keep(await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}),email);
 syncMessage='جارٍ المزامنة الأولى…';syncPanel();toast('دخلت إلى حسابك');synchronize()
 }catch(err){if(err.message==='email_not_confirmed'){pendingKind='signup';try{await call('/auth/v1/resend'+BACK,{method:'POST',body:{type:'signup',email}})}catch{}syncPanel('code');return}say(cloudText(err))}};
}
function say(t){syncMessage=t;if($('#syncStatus'))$('#syncStatus').textContent=t}
function passwordForm(fresh=false){
 modal(fresh?'اكتب كلمة مرور جديدة':'تغيير كلمة المرور',form('pwForm',input('password','كلمة المرور الجديدة','password','','required minlength=8 autocomplete=new-password')+input('again','أعد كتابتها','password','','required minlength=8 autocomplete=new-password'),'حفظ')+'<p id="syncStatus" role="status"></p>');
 $('#pwForm').onsubmit=async e=>{e.preventDefault();const f=e.target;if(f.password.value!==f.again.value){say('كلمتا المرور غير متطابقتين.');return}
 try{await call('/auth/v1/user',{method:'PUT',token:await token(),body:{password:f.password.value}});closeD();toast('تغيّرت كلمة المرور')}catch(err){say(cloudText(err))}};
}
/* The emailed link (sign-up confirmation or password reset) lands on baramiji://auth#access_token=…&type=… */
async function onAuthLink(link){
 const at=link.indexOf('#'),p=new URLSearchParams(at>=0?link.slice(at+1):link.split('?')[1]||'');
 if(p.get('error_description')||p.get('error')){syncMessage=p.get('error_code')==='otp_expired'?'انتهت صلاحية الرابط. اطلب رسالة جديدة.':'تعذر استخدام الرابط: '+(p.get('error_description')||p.get('error'));syncPanel();return}
 const access=p.get('access_token');if(!access)return;
 try{const user=await call('/auth/v1/user',{token:access});keep({access_token:access,refresh_token:p.get('refresh_token'),expires_in:+p.get('expires_in')||3600,user},user?.email)}
 catch(e){syncMessage=cloudText(e);syncPanel();return}
 if(p.get('type')==='recovery'){passwordForm(true);toast('دخلت إلى حسابك. اكتب كلمة المرور الجديدة.')}
 else{syncMessage='جارٍ المزامنة الأولى…';syncPanel();toast('تأكد حسابك ودخلت إليه')}
 synchronize();
}
window.onAuthLink=onAuthLink;
render();try{const l=window.Phone?.takeAuthLink?.();if(l)onAuthLink(l)}catch{}
addEventListener("online",queueSync);setInterval(()=>{if(!document.hidden)queueSync()},60000);queueSync();

/* Take the synced data into the live db without replacing its objects. A form that is open during a sync holds the program,
   goal or settings object it was opened on; replacing db with new objects made that form save into a detached copy, so the
   edit was confirmed but lost. Existing objects (matched by id) are refilled in place instead. */
function adoptSynced(next){
 const refill=(o,v)=>{if(o===v)return o;for(const k of Object.keys(o))delete o[k];return Object.assign(o,v)};/* merge can hand back the live object itself */
 const byIdKeep=(old,arr)=>{const m=new Map((old||[]).map(x=>[x.id,x]));return (arr||[]).map(x=>m.has(x.id)?refill(m.get(x.id),x):x)};
 next.ps=byIdKeep(db.ps,next.ps);next.goals=byIdKeep(db.goals,next.goals);next.blocks=byIdKeep(db.blocks,next.blocks);
 if(db.cfg&&next.cfg)next.cfg=refill(db.cfg,next.cfg);
 if(db.logs&&next.logs)next.logs=refill(db.logs,next.logs);
 refill(db,next);
}
