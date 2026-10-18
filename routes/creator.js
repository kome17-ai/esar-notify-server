const express=require('express');
const router=express.Router();
const admin=require('firebase-admin');
const PLATFORM_UID='noOqePmdRKMf23QyJu14IUn8weq2';
const MIN_FOLLOWERS=5000,MIN_VIEWS=1000000,MIN_ENGAGEMENT=50,BASE=5000,MAX_PAYOUT=50000,DAILY_CAP=200000,COOLDOWN=30*24*3600*1000;
const AUTHOR_KEYS=['author_uid','authorUid','authorId','userId','user_id','uid','poster'];
const db=()=>admin.database();
const num=v=>{const n=typeof v==='number'?v:Number(v);return Number.isFinite(n)?n:0;};
const fail=(res,status,error)=>res.status(status).json({ok:false,error});
const dayKey=()=>new Date().toISOString().slice(0,10);
const cnt=(p,map,n)=>{if(p[n]!=null&&Number.isFinite(Number(p[n])))return Math.max(0,Number(p[n]));const m=p[map];if(m==null)return 0;if(typeof m==='object')return Object.keys(m).length;return Math.max(0,num(m));};

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
function rateLimit(req,res,next){
  const t=Date.now();
  const a=(hits.get(req.uid)||[]).filter(x=>t-x<60000);
  if(a.length>=3)return fail(res,429,'too_many_requests');
  a.push(t);hits.set(req.uid,a);next();
}
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
    w.transactions[key]={transactionId:key,amount:change,type:entry.type,status:'completed',orderId:entry.orderId,description:entry.description,createdAt:Date.now()};
    return w;
  });
  if(error)throw new Error(error);
  if(!result.committed)throw new Error('wallet_update_failed');
  return result.snapshot.val();
}

async function earnedAmount(uid){
  const [u,p]=await Promise.all([db().ref('/users/'+uid).once('value'),db().ref('/posts').once('value')]);
  if(!u.exists())return 0;
  const user=u.val()||{};
  const followers=user.followersCount!=null&&Number.isFinite(Number(user.followersCount))?Number(user.followersCount):Object.keys(user.followers||{}).length;
  let views=0,inter=0;
  p.forEach(c=>{
    const x=c.val()||{};
    if(!AUTHOR_KEYS.some(k=>x[k]&&String(x[k])===uid))return false;
    views+=cnt(x,'views','viewCount');
    inter+=cnt(x,'likes','likesCount')+cnt(x,'comments','commentsCount');
    return false;
  });
  const rate=views>0?inter/views*100:0;
  if(followers<MIN_FOLLOWERS||views<MIN_VIEWS||rate<MIN_ENGAGEMENT)return 0;
  const amt=BASE*Math.min(views/1000000,10)*Math.min(followers/5000,5)*Math.min(rate/50,2);
  return Math.max(0,Math.min(MAX_PAYOUT,Math.round(amt)));
}

router.post('/payout',requireAuth,rateLimit,async(req,res)=>{
  const uid=req.uid;
  if(uid===PLATFORM_UID)return fail(res,403,'not_allowed');
  const now=Date.now(),key='creator_'+uid+'_'+now;
  const lockRef=db().ref('/creatorPayouts/'+uid+'/lastPayoutAt');
  let prev=null,locked=false,reserved=null,debited=false,amount=0;
  const undo=async()=>{
    if(reserved)await reserved.transaction(v=>Math.max(0,num(v)-amount)).catch(()=>{});
    if(locked)await lockRef.set(prev||null).catch(()=>{});
  };
  try{
    amount=await earnedAmount(uid);
    if(amount<=0)return fail(res,400,'not_eligible');
    const lock=await lockRef.transaction(v=>{prev=v;if(v&&now-num(v)<COOLDOWN)return;return now;});
    if(!lock.committed)return fail(res,429,'already_paid_this_period');
    locked=true;
    const ref=db().ref('/payoutTotals/'+dayKey());
    const r=await ref.transaction(v=>{v=num(v);if(v+amount>DAILY_CAP)return;return v+amount;});
    if(!r.committed){await undo();return fail(res,503,'daily_limit_reached');}
    reserved=ref;
    await walletChange(PLATFORM_UID,key+'_debit',-amount,{orderId:uid,type:'creator_payout_out',description:'Creator payout'});
    debited=true;
    await walletChange(uid,key+'_credit',amount,{orderId:uid,type:'creator_earnings',description:'Creator earnings payout'});
    res.json({ok:true,message:'Payout completed',amount});
  }catch(e){
    console.error('Creator payout error:',uid,key,debited?'DEBITED':'',e.message);
    if(debited){
      try{
        const credited=(await db().ref('/users/'+uid+'/esarPay/marketplaceLedger/'+key+'_credit').once('value')).exists();
        if(credited){console.error('CHECK: credit exists, payout kept:',key);}
        else{
          await walletChange(PLATFORM_UID,key+'_refund',amount,{orderId:uid,type:'creator_payout_refund',description:'Creator payout refund'});
          await undo();
        }
      }catch(e2){console.error('CRITICAL manual fix needed:',uid,key,amount,e2.message);}
    }else{await undo();}
    fail(res,e.message==='insufficient_balance'?503:500,e.message==='insufficient_balance'?'payouts_unavailable':'payout_failed');
  }
});

module.exports=router;
