const express=require('express');
const router=express.Router();
const admin=require('firebase-admin');
const PLATFORM_UID='noOqePmdRKMf23QyJu14IUn8weq2';
const FEE_RATE=0.02;
const DELIVERY_FEE_RATE=0.10; // 10% of subtotal to driver for esar_rides
const db=()=>admin.database();
const num=v=>typeof v==='number'?v:Number(v);
const validId=v=>typeof v==='string'&&v.length>0&&v.length<200&&!v.includes('/');
const fail=(res,status,error)=>res.status(status).json({ok:false,error});

async function requireAuth(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return fail(res,401,'authentication_required');const d=await admin.auth().verifyIdToken(h.substring(7));req.uid=d.uid;next();}catch(e){return fail(res,401,'invalid_token');}}
async function getOrder(id){const s=await db().ref('/marketplaceOrders/'+id).once('value');return s.exists()?s.val():null;}

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

async function reserveStock(productId,orderId,qty){
  const ref=db().ref('/marketplaceProducts/'+productId);
  let problem=null;
  const r=await ref.transaction(p=>{
    if(!p)return;
    const reservations=p.marketplaceReservations&&typeof p.marketplaceReservations==='object'?p.marketplaceReservations:{};
    if(reservations[orderId])return p;
    const stock=num(p.quantityAvailable);
    if(!Number.isFinite(stock)||stock<qty){problem='insufficient_stock';return;}
    p.quantityAvailable=stock-qty;
    p.marketplaceReservations=reservations;
    p.marketplaceReservations[orderId]={quantity:qty,status:'reserved',createdAt:Date.now()};
    return p;
  });
  if(problem)throw new Error(problem);
  if(!r.committed)throw new Error('stock_reservation_failed');
}

async function releaseStock(productId,orderId){
  const ref=db().ref('/marketplaceProducts/'+productId);
  await ref.transaction(p=>{
    if(!p||!p.marketplaceReservations||!p.marketplaceReservations[orderId])return p;
    const r=p.marketplaceReservations[orderId];
    if(r.status==='reserved'){
      p.quantityAvailable=num(p.quantityAvailable)+num(r.quantity);
      r.status='released';
      p.marketplaceReservations[orderId]=r;
    }
    return p;
  });
}

router.get('/product/:productId/checkout-info',requireAuth,async(req,res)=>{
  try{
    const id=req.params.productId;
    if(!validId(id))return fail(res,400,'invalid_product_id');
    const s=await db().ref('/marketplaceProducts/'+id).once('value');
    if(!s.exists())return fail(res,404,'product_not_found');
    const p=s.val();
    if(p.status&&p.status!=='active')return fail(res,409,'product_unavailable');
    if(p.sellerId===req.uid)return fail(res,400,'cannot_buy_own_product');
    const price=num(p.price);
    if(!Number.isFinite(price)||price<=0)return fail(res,400,'invalid_product_price');
    res.json({ok:true,product:{productId:id,title:p.title||'',sellerId:p.sellerId,sellerName:p.sellerName||'',price,currency:p.currency||'XAF',quantityAvailable:num(p.quantityAvailable),imageUrls:p.imageUrls||[]},platformFeeRate:FEE_RATE});
  }catch(e){fail(res,500,'checkout_info_failed');}
});

router.post('/orders/create',requireAuth,async(req,res)=>{
  try{
    const productId=req.body.productId;
    const qty=num(req.body.quantity||1);
    const choice=req.body.deliveryChoice||'seller_arranged';
    const destination=req.body.destination||null;
    const pickup=req.body.pickup||null;
    const preferredDriverId=req.body.preferredDriverId||null;

    if(!validId(productId)||!Number.isInteger(qty)||qty<1||qty>100)return fail(res,400,'invalid_order_details');
    if(!['esar_rides','seller_arranged'].includes(choice))return fail(res,400,'invalid_delivery_choice');
    if(choice==='esar_rides'&&(!destination||!destination.address||typeof destination.address!=='string'))return fail(res,400,'delivery_destination_required');
    if(choice==='esar_rides'&&(!pickup||!pickup.address||typeof pickup.address!=='string'))return fail(res,400,'pickup_location_required');

    const s=await db().ref('/marketplaceProducts/'+productId).once('value');
    if(!s.exists())return fail(res,404,'product_not_found');
    const p=s.val();
    if(p.status&&p.status!=='active')return fail(res,409,'product_unavailable');
    if(!p.sellerId||p.sellerId===req.uid)return fail(res,400,'invalid_seller');
    const price=num(p.price);
    if(!Number.isFinite(price)||price<=0)return fail(res,400,'invalid_product_price');
    if(num(p.quantityAvailable)<qty)return fail(res,409,'insufficient_stock');

    const subtotal=Math.round(price*qty*100)/100;
    const platformFee=Math.round(subtotal*FEE_RATE*100)/100;
    const deliveryFee=choice==='esar_rides'?Math.round(subtotal*DELIVERY_FEE_RATE*100)/100:0;
    const sellerAmount=Math.round((subtotal-platformFee-deliveryFee)*100)/100;

    const ref=db().ref('/marketplaceOrders').push();
    const order={
      orderId:ref.key,
      buyerId:req.uid,
      sellerId:p.sellerId,
      productId,
      productTitle:p.title||'',
      productImage:(p.imageUrls||[])[0]||'',
      quantity:qty,
      unitPrice:price,
      subtotal,
      platformFee,
      deliveryFee,
      sellerAmount,
      currency:p.currency||'XAF',
      deliveryChoice:choice,
      deliveryDestination:choice==='esar_rides'?destination:null,
      pickupLocation:choice==='esar_rides'?pickup:null,
      preferredDriverId:preferredDriverId||null,
      paymentMethod:'esarPay',
      paymentStatus:'pending',
      orderStatus:'awaiting_payment',
      settlementStatus:'pending',
      createdAt:Date.now(),
      updatedAt:Date.now()
    };
    await ref.set(order);
    res.status(201).json({ok:true,order,platformFeeRate:FEE_RATE,deliveryFeeRate:DELIVERY_FEE_RATE});
  }catch(e){fail(res,500,'order_creation_failed');}
});

router.post('/orders/:orderId/pay',requireAuth,async(req,res)=>{
  const id=req.params.orderId;
  if(!validId(id))return fail(res,400,'invalid_order_id');
  let order=await getOrder(id);
  if(!order)return fail(res,404,'order_not_found');
  if(order.buyerId!==req.uid)return fail(res,403,'not_order_buyer');
  if(order.paymentStatus==='paid')return res.json({ok:true,message:'already_paid',order});
  if(['cancelled','refunded'].includes(order.paymentStatus))return fail(res,409,'order_not_payable');

  try{
    const ref=db().ref('/marketplaceOrders/'+id);
    const lock=await ref.transaction(o=>{
      if(!o||o.buyerId!==req.uid||o.paymentStatus==='paid'||['cancelled','refunded'].includes(o.paymentStatus)||o.paymentStatus==='processing')return;
      o.paymentStatus='processing';
      o.orderStatus='payment_processing';
      o.updatedAt=Date.now();
      return o;
    });
    if(!lock.snapshot.exists())return fail(res,404,'order_not_found');
    order=lock.snapshot.val();
    if(order.paymentStatus==='paid')return res.json({ok:true,message:'already_paid',order});
    if(!lock.committed)return fail(res,409,'payment_in_progress');

    await reserveStock(order.productId,id,num(order.quantity));
    try{
      await walletChange(order.buyerId,id+'_buyer',-num(order.subtotal),{orderId:id,type:'marketplace_purchase',description:'Marketplace purchase (held): '+(order.productTitle||id)});
    }catch(e){
      if(e.message==='insufficient_balance'){
        await releaseStock(order.productId,id);
        await ref.update({paymentStatus:'pending',orderStatus:'awaiting_payment',updatedAt:Date.now()});
        return fail(res,402,'insufficient_esarPay_balance');
      }
      throw e;
    }

    await ref.update({paymentStage:'buyer_debited_held',settlementStatus:'held',updatedAt:Date.now()});

    if(order.deliveryChoice==='esar_rides'){
      const dref=db().ref('/marketplaceDeliveryRequests/'+id);
      await dref.transaction(d=>d||({
        deliveryId:id,
        orderId:id,
        buyerId:order.buyerId,
        sellerId:order.sellerId,
        productId:order.productId,
        preferredDriverId:order.preferredDriverId||null,
        status:'requested',
        pickup:order.pickupLocation||null,
        destination:order.deliveryDestination||null,
        deliveryFee:order.deliveryFee||0,
        createdAt:Date.now(),
        updatedAt:Date.now()
      }));
    }

    await ref.update({
      paymentStatus:'paid',
      orderStatus:'confirmed',
      paymentStage:'held_awaiting_delivery',
      paidAt:Date.now(),
      updatedAt:Date.now()
    });

    await db().ref('/marketplaceTransactions/'+id).transaction(t=>t||({
      transactionId:id,
      orderId:id,
      buyerId:order.buyerId,
      sellerId:order.sellerId,
      productId:order.productId,
      subtotal:order.subtotal,
      platformFee:order.platformFee,
      deliveryFee:order.deliveryFee||0,
      sellerAmount:order.sellerAmount,
      currency:order.currency,
      status:'held',
      method:'esarPay',
      createdAt:Date.now()
    }));

    res.json({ok:true,message:'payment_held_until_delivery',order:await getOrder(id)});
  }catch(e){
    console.error('Marketplace payment processing error:',id,e.message);
    res.status(503).json({ok:false,error:'payment_processing_interrupted',orderId:id,message:'Payment processing needs administrator reconciliation. Do not create a second order.'});
  }
});

router.post('/orders/:orderId/complete-delivery',requireAuth,async(req,res)=>{
  const id=req.params.orderId;
  if(!validId(id))return fail(res,400,'invalid_order_id');
  const order=await getOrder(id);
  if(!order)return fail(res,404,'order_not_found');
  if(order.deliveryChoice!=='esar_rides')return fail(res,400,'not_esar_rides_delivery');
  if(order.settlementStatus==='settled')return res.json({ok:true,message:'already_settled',order});

  if(order.preferredDriverId&&order.preferredDriverId!==req.uid){
    return fail(res,403,'only_assigned_driver_can_complete');
  }

  try{
    const ref=db().ref('/marketplaceOrders/'+id);
    const lock=await ref.transaction(o=>{
      if(!o||o.settlementStatus==='settled'||o.paymentStatus!=='paid')return;
      o.settlementStatus='settling';
      o.updatedAt=Date.now();
      return o;
    });
    if(!lock.committed)return fail(res,409,'settlement_in_progress_or_already_done');

    if(num(order.sellerAmount)>0){
      await walletChange(order.sellerId,id+'_seller',num(order.sellerAmount),{orderId:id,type:'marketplace_sale',description:'Marketplace sale completed: '+(order.productTitle||id)});
    }
    if(num(order.platformFee)>0){
      await walletChange(PLATFORM_UID,id+'_platform',num(order.platformFee),{orderId:id,type:'marketplace_fee',description:'ESAR Marketplace platform fee'});
  }  if(num(order.deliveryFee)>0&&order.preferredDriverId){
      await walletChange(order.preferredDriverId,id+'_driver',num(order.deliveryFee),{orderId:id,type:'delivery_earnings',description:'Delivery earnings: '+(order.productTitle||id)});
    }

    await ref.update({
      settlementStatus:'settled',
      orderStatus:'delivered',
      paymentStage:'settled',
      deliveredAt:Date.now(),
      updatedAt:Date.now()
    });

    await db().ref('/marketplaceDeliveryRequests/'+id).update({
      status:'delivered',
      updatedAt:Date.now()
    });

    res.json({ok:true,message:'delivery_completed_and_settled',order:await getOrder(id)});
  }catch(e){
    console.error('Delivery completion error:',id,e.message);
    res.status(503).json({ok:false,error:'settlement_failed',orderId:id,message:'Contact support. Do not retry blindly.'});
  }
});

router.get('/orders/mine',requireAuth,async(req,res)=>{
  try{
    const s=await db().ref('/marketplaceOrders').orderByChild('buyerId').equalTo(req.uid).limitToLast(100).once('value');
    const out=[];s.forEach(c=>out.push(c.val()));out.reverse();
    res.json({ok:true,orders:out});
  }catch(e){fail(res,500,'orders_fetch_failed');}
});

router.get('/seller/orders',requireAuth,async(req,res)=>{
  try{
    const s=await db().ref('/marketplaceOrders').orderByChild('sellerId').equalTo(req.uid).limitToLast(100).once('value');
    const out=[];s.forEach(c=>out.push(c.val()));out.reverse();
    res.json({ok:true,orders:out});
  }catch(e){fail(res,500,'seller_orders_fetch_failed');}
});

router.get('/orders/:orderId',requireAuth,async(req,res)=>{
  try{
    const o=await getOrder(req.params.orderId);
    if(!o)return fail(res,404,'order_not_found');
    if(o.buyerId!==req.uid&&o.sellerId!==req.uid)return fail(res,403,'not_order_participant');
    res.json({ok:true,order:o});
  }catch(e){fail(res,500,'order_fetch_failed');}
});

module.exports=router;
