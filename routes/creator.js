const express=require('express');
const router=express.Router();
const admin=require('firebase-admin');
const PLATFORM_UID='noOqePmdRKMf23QyJu14IUn8weq2';
const db=()=>admin.database();
const num=v=>typeof v==='number'?v:Number(v);
const fail=(res,status,error)=>res.status(status).json({ok:false,error});

async function requireAuth(req,res,next){
  try{
    const h=req.headers.authorization||'';
    if(!h.startsWith('Bearer '))return fail(res,401,'authentication_required');
    const d=await admin.auth().verifyIdToken(h.substring(7));
    req.uid=d.uid;
    next();
  }catch(e){return fail(res,401,'invalid_token');}
}

async function walletChange(uid,key,change,entry){
  const ref=db().ref('/users/'+uid+'/esarPay');
  let error=null;
  const result=await ref.transaction(w=>{
    w=w&&typeof w==='object'?w:{};
    w.balance=num(w.balance||0);
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

router.post('/payout',requireAuth,async(req,res)=>{
  if(req.uid!==PLATFORM_UID)return fail(res,403,'admin_only');
  const to=String(req.body.creatorUid||'');
  const amount=Number(req.body.amountFCFA);
  const reason=req.body.reason||'Creator earnings';
  if(!to||!Number.isFinite(amount)||amount<=0||amount>50000)return fail(res,400,'invalid_request');
  const key='creator_'+to+'_'+Date.now();
  try{
    await walletChange(PLATFORM_UID,key+'_debit',-amount,{orderId:to,type:'creator_payout_out',description:reason});
    await walletChange(to,key+'_credit',amount,{orderId:to,type:'creator_earnings',description:reason});
    res.json({ok:true,message:'Payout completed',amount});
  }catch(e){
    console.error('Creator payout error:',key,e.message);
    res.status(500).json({ok:false,error:e.message||'payout_failed'});
  }
});

module.exports=router;
