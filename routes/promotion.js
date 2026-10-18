const express=require('express');
const router=express.Router();
const admin=require('firebase-admin');
const PLATFORM_UID='noOqePmdRKMf23QyJu14IUn8weq2';
const PRICE_USD_PER_1000=2,MIN_REACH=500,MAX_REACH=100000;
const {getRates}=require('./currency');
const DAYS=[1,3,5,7,14,30];
const GOALS=['More profile visits','More post engagement','More followers','More website visits','More video views'];
const AUDIENCES=['Automatic audience','People interested in my content','People near me','My followers','Everyone'];
const AUTHOR_KEYS=['author_uid','authorUid','authorId','userId','user_id','uid','poster'];
const ID_RE=/^[A-Za-z0-9_-]{1,100}$/;
const db=()=>admin.database();
const num=v=>{const n=typeof v==='number'?v:Number(v);return Number.isFinite(n)?n:0;};
const fail=(res,status,error)=>res.status(status).json({ok:false,error});
const isAuthor=(p,uid)=>AUTHOR_KEYS.some(k=>p[k]&&String(p[k])===uid);

async function requireAuth(req,res,next){
  try{
    const h=req.headers.authorization||'';
    if(!h.startsWith('Bearer '))return fail(res,401,'authentication_required');
    const d=await admin.auth().verifyIdToken(h.substring(7),true);
    req.uid=d.uid;
    next();
  }catch(e){return fail(res,401,'invalid_token');}
}

const hits=new Map();
const limit=(name,max)=>(req,res,next)=>{
  const k=name+req.uid,t=Date.now();
  const a=(hits.get(k)||[]).filter(x=>t-x<60000);
  if(a.length>=max)return fail(res,429,'too_many_requests');
  a.push(t);hits.set(k,a);next();
};
setInterval(()=>{const t=Date.now();for(const [k,a] of hits){if(!a.some(x=>t-x<60000))hits.delete(k);}},60000).unref();

async function walletChange(uid,key,change,entry){
  const ref=db().ref('/users/'+uid+'/esarPay');
  let error=null;
  const result=await ref.transaction(w=>{
    w=w&&typeof w==='object'?w:{};
    w.balance=num(w.balance);
    w.transactions=w.transactions&&typeof w.transactions==='object'?w.transactions:{};
    w.marketplaceLedger=w.marketplaceLedger&&typeof w.marketplaceLedger==='object'?w.marketplaceLedger:{};
    if(w.marketplaceLedger[key])return w;
    if(change<0&&w.balance+change<0){error='insufficient_balance';return;}
    w.balance=Math.round((w.balance+change)*100)/100;
    w.marketplaceLedger[key]={amount:change,createdAt:Date.now(),orderId:entry.orderId,type:entry.type};
    w.transactions[key]={transactionId:key,amount:change,type:entry.type,status:'completed',orderId:entry.orderId,description:entry.description,meta:entry.meta||null,createdAt:Date.now()};
    return w;
  });
  if(error)throw new Error(error);
  if(!result.committed)throw new Error('wallet_update_failed');
  return result.snapshot.val();
}

router.post('/create',requireAuth,limit('create',5),async(req,res)=>{
  const uid=req.uid;
  const postId=String(req.body.postId||'');
  const reach=Math.floor(num(req.body.reach));
  const days=Math.floor(num(req.body.days));
  const goal=GOALS.includes(req.body.goal)?req.body.goal:GOALS[0];
  const audience=AUDIENCES.includes(req.body.audience)?req.body.audience:AUDIENCES[0];
  if(uid===PLATFORM_UID)return fail(res,403,'not_allowed');
  if(!ID_RE.test(postId)||reach<MIN_REACH||reach>MAX_REACH||!DAYS.includes(days))return fail(res,400,'invalid_request');
  const lockRef=db().ref('/promotionByPost/'+postId);
  let locked=false,debited=false,credited=false,id=null,cost=0;
  try{
    if((await db().ref('/promotionConfig/enabled').once('value')).val()!==true)return fail(res,503,'promotions_paused');
    let rates;
    try{rates=await getRates();}catch(e){return fail(res,503,'rates_unavailable');}
    const asked=String(req.body.currency||'').toUpperCase();
    const cur=rates[asked]?asked:'XAF';
    const ps=await db().ref('/posts/'+postId).once('value');
    if(!ps.exists()||!isAuthor(ps.val()||{},uid))return fail(res,403,'not_your_post');
    const lk=await lockRef.transaction(v=>v?undefined:'creating');
    if(!lk.committed)return fail(res,409,'post_already_promoted');
    locked=true;
    cost=Math.ceil(reach/1000*PRICE_USD_PER_1000*rates.XAF);
    const displayCost=Math.round(cost/rates.XAF*rates[cur]*100)/100;
    id=db().ref('/promotions').push().key;
    const meta={uid,postId,promotionId:id,reach};
    await walletChange(uid,'promo_'+id+'_pay',-cost,{orderId:id,type:'promotion_payment',description:'Promotion: '+reach+' reach on post '+postId,meta});
    debited=true;
    await walletChange(PLATFORM_UID,'promo_'+id+'_in',cost,{orderId:id,type:'promotion_income',description:'Promotion from '+uid+' on post '+postId+', reach '+reach,meta});
    credited=true;
    const t=Date.now();
    await db().ref('/promotions/'+id).set({promotionId:id,uid,postId,goal,audience,targetReach:reach,deliveredReach:0,cost,currency:'XAF',displayCurrency:cur,displayCost,priceUsdPer1000:PRICE_USD_PER_1000,paymentMethod:'EsarPay',status:'active',days,createdAt:t,startsAt:t,endsAt:t+days*86400000});
    await lockRef.set(id);
    res.json({ok:true,promotionId:id,cost,reach,days,currency:cur,displayCost});
  }catch(e){
    console.error('Promotion create error:',uid,postId,id,e.message);
    try{
      if(debited){
        const meta={uid,postId,promotionId:id,reach};
        await db().ref('/promotions/'+id).remove().catch(()=>{});
        if(credited)await walletChange(PLATFORM_UID,'promo_'+id+'_undo_out',-cost,{orderId:id,type:'promotion_undo_out',description:'Promotion creation failed, returning '+cost+' to '+uid,meta});
        await walletChange(uid,'promo_'+id+'_undo_in',cost,{orderId:id,type:'promotion_undo',description:'Promotion creation failed, refund',meta});
      }
    }catch(e2){console.error('CRITICAL manual fix needed:',uid,id,cost,e2.message);}
    if(locked)await lockRef.remove().catch(()=>{});
    const ins=e.message==='insufficient_balance';
    fail(res,ins?402:500,ins?'insufficient_balance':'promotion_failed');
  }
});

router.get('/pricing',requireAuth,async(req,res)=>{
  try{
    const r=await getRates();
    res.json({ok:true,pricePer1000Usd:PRICE_USD_PER_1000,minReach:MIN_REACH,maxReach:MAX_REACH,perUsd:r});
  }catch(e){fail(res,503,'rates_unavailable');}
});

router.get('/feed',requireAuth,limit('feed',30),async(req,res)=>{
  try{
    const s=await db().ref('/promotions').orderByChild('status').equalTo('active').limitToFirst(100).once('value');
    const now=Date.now(),items=[];
    s.forEach(c=>{const p=c.val();if(p&&p.uid!==req.uid&&num(p.endsAt)>now&&num(p.deliveredReach)<num(p.targetReach))items.push(p);return false;});
    items.sort((a,b)=>num(a.deliveredReach)/num(a.targetReach)-num(b.deliveredReach)/num(b.targetReach));
    const out=[];
    for(const p of items){
      if(out.length>=5)break;
      const v=await db().ref('/promotionViewers/'+p.promotionId+'/'+req.uid).once('value');
      if(!v.exists())out.push({promotionId:p.promotionId,postId:p.postId});
    }
    res.json({ok:true,promotions:out});
  }catch(e){fail(res,500,'feed_failed');}
});

router.post('/impression',requireAuth,limit('imp',60),async(req,res)=>{
  const id=String(req.body.promotionId||'');
  if(!ID_RE.test(id))return fail(res,400,'invalid_request');
  const vRef=db().ref('/promotionViewers/'+id+'/'+req.uid);
  const pRef=db().ref('/promotions/'+id);
  let marked=false,counted=false;
  try{
    const p=(await pRef.once('value')).val();
    if(!p||p.status!=='active'||p.uid===req.uid)return fail(res,400,'not_countable');
    const m=await vRef.transaction(v=>v?undefined:Date.now());
    if(!m.committed)return res.json({ok:true,counted:false});
    marked=true;
    let done=false;
    const r=await pRef.transaction(x=>{
      done=false;
      if(!x||x.status!=='active'||Date.now()>num(x.endsAt)||num(x.deliveredReach)>=num(x.targetReach))return;
      x.deliveredReach=num(x.deliveredReach)+1;
      if(x.deliveredReach>=num(x.targetReach)){x.status='completed';x.completedAt=Date.now();done=true;}
      return x;
    });
    if(!r.committed){await vRef.remove();return res.json({ok:true,counted:false});}
    counted=true;
    if(done)await db().ref('/promotionByPost/'+p.postId).remove();
    res.json({ok:true,counted:true});
  }catch(e){
    if(marked&&!counted)await vRef.remove().catch(()=>{});
    fail(res,500,'impression_failed');
  }
});

router.get('/mine',requireAuth,async(req,res)=>{
  try{
    const s=await db().ref('/promotions').orderByChild('uid').equalTo(req.uid).limitToLast(50).once('value');
    const out=[];s.forEach(c=>{out.push(c.val());return false;});
    out.reverse();
    res.json({ok:true,promotions:out});
  }catch(e){fail(res,500,'fetch_failed');}
});

async function settle(id){
  const ref=db().ref('/promotions/'+id);
  let p=null;
  const r=await ref.transaction(x=>{
    if(!x)return;
    if(!((x.status==='active'&&Date.now()>num(x.endsAt))||x.status==='refund_pending'))return;
    p=Object.assign({},x);
    x.status='settling';
    return x;
  });
  if(!r.committed||!p)return;
  const left=Math.max(0,num(p.targetReach)-num(p.deliveredReach));
  const refund=Math.floor(num(p.cost)*left/num(p.targetReach));
  try{
    if(refund>0){
      const meta={uid:p.uid,postId:p.postId,promotionId:id,reach:left};
      await walletChange(PLATFORM_UID,'promo_'+id+'_refund_out',-refund,{orderId:id,type:'promotion_refund_out',description:'Refund for undelivered reach '+left+' to '+p.uid,meta});
      await walletChange(p.uid,'promo_'+id+'_refund_in',refund,{orderId:id,type:'promotion_refund',description:'Refund for undelivered reach '+left+' on post '+p.postId,meta});
    }
    await ref.update({status:'ended',refundedAmount:refund,endedAt:Date.now()});
    await db().ref('/promotionByPost/'+p.postId).remove();
  }catch(e){
    console.error('Promotion settle error:',id,e.message);
    await ref.update({status:'refund_pending'}).catch(()=>{});
  }
}

async function sweep(){
  try{
    for(const st of ['active','refund_pending']){
      const s=await db().ref('/promotions').orderByChild('status').equalTo(st).once('value');
      const ids=[];
      s.forEach(c=>{const p=c.val();if(p&&(st==='refund_pending'||Date.now()>num(p.endsAt)))ids.push(c.key);return false;});
      for(const id of ids)await settle(id);
    }
  }catch(e){console.error('Promotion sweep error:',e.message);}
}
setInterval(sweep,600000).unref();
setTimeout(sweep,30000).unref();

module.exports=router;
