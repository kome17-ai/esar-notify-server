const express=require('express');
const router=express.Router();
const admin=require('firebase-admin');
const db=()=>admin.database();
const URL='https://open.er-api.com/v6/latest/USD';
const FRESH=3600000,MAX_AGE=48*3600000,MAX_JUMP=0.25;
let cache=null,at=0;

const clean=v=>{
  const out={USD:1};
  Object.keys(v||{}).forEach(k=>{
    const n=Number(v[k]);
    if(/^[A-Z]{3}$/.test(k)&&k!=='USD'&&Number.isFinite(n)&&n>0)out[k]=n;
  });
  return out;
};

async function fetchLive(){
  const ctl=new AbortController();
  const t=setTimeout(()=>ctl.abort(),10000);
  try{
    const r=await fetch(URL,{signal:ctl.signal});
    if(!r.ok)throw new Error('http_'+r.status);
    const j=await r.json();
    const out=clean(j.rates);
    if(!out.XAF)throw new Error('no_xaf');
    return out;
  }finally{clearTimeout(t);}
}

async function getRates(){
  if(cache&&Date.now()-at<FRESH)return cache;
  const auto=(await db().ref('/currencyConfig/auto').once('value')).val()||{};
  const stored=clean(auto.rates);
  const age=Date.now()-Number(auto.updatedAt||0);
  try{
    const live=await fetchLive();
    if(stored.XAF&&age<MAX_AGE&&Math.abs(live.XAF-stored.XAF)/stored.XAF>MAX_JUMP)throw new Error('rate_jump');
    await db().ref('/currencyConfig/auto').set({rates:live,updatedAt:Date.now()});
    cache=live;
    at=Date.now();
    return live;
  }catch(e){
    console.error('Rates fetch problem:',e.message);
    if(stored.XAF&&age<MAX_AGE){cache=stored;at=Date.now()-FRESH+300000;return stored;}
    const manual=clean((await db().ref('/currencyConfig/rates').once('value')).val());
    if(manual.XAF){cache=manual;at=Date.now()-FRESH+300000;return manual;}
    throw new Error('rates_unavailable');
  }
}

router.get('/rates',async(req,res)=>{
  try{
    const r=await getRates();
    res.json({ok:true,base:'XAF',perUsd:r});
  }catch(e){
    res.status(503).json({ok:false,error:'rates_unavailable'});
  }
});

router.getRates=getRates;
module.exports=router;
