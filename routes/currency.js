const express=require('express');
const router=express.Router();
const admin=require('firebase-admin');

let cache=null,at=0;

async function getRates(){
  if(cache&&Date.now()-at<300000)return cache;
  const v=(await admin.database().ref('/currencyConfig/rates').once('value')).val()||{};
  const out={USD:1};
  Object.keys(v).forEach(k=>{
    const n=Number(v[k]);
    if(/^[A-Z]{3}$/.test(k)&&k!=='USD'&&Number.isFinite(n)&&n>0)out[k]=n;
  });
  if(!out.XAF)throw new Error('rates_unavailable');
  cache=out;
  at=Date.now();
  return out;
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
