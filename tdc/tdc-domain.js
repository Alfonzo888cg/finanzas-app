(function(){
  const ADMIN_WORDS=['administracion','administracion','admnistracion','mantencion','mantenimiento'];

  function normalizeText(value){
    return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  function isAdminPurchase(purchase){
    const text=normalizeText(purchase.descripcion);
    return ADMIN_WORDS.some(word=>text.includes(word));
  }

  function currentPeriod(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }

  function addMonths(period,amount){
    const[y,m]=period.split('-').map(Number);
    const d=new Date(y,m-1+amount,1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }

  function monthLabel(period){
    const[y,m]=period.split('-').map(Number);
    return AppShared.MF[m-1]+' '+y;
  }

  function cardIds(data){
    return Object.keys(data.cards||{}).filter(id=>data.cards[id].active!==false).sort();
  }

  function latestAdminAmountForCard(data,cardId){
    const rows=[];
    (data.compras||[]).forEach(purchase=>{
      if(purchase.tarjeta!==cardId||!isAdminPurchase(purchase))return;
      (purchase.cuotas||[]).forEach(q=>rows.push({period:q.mes,amount:Number(q.monto)||0}));
    });
    rows.sort((a,b)=>String(b.period).localeCompare(String(a.period)));
    return rows[0]?.amount||4000;
  }

  function migrate(data){
    let changed=false;
    data.version=data.version||1;
    data.compras=data.compras||[];
    data.cupos=data.cupos||{};
    data.monthlyFees=data.monthlyFees||[];
    data.cards=data.cards||{};

    const knownCards=new Set([...Object.keys(data.cupos),...data.compras.map(c=>c.tarjeta).filter(Boolean)]);
    knownCards.forEach(id=>{
      if(!data.cards[id]){
        data.cards[id]={
          id,
          name:id,
          limitNational:Number(data.cupos[id]?.nacional)||0,
          limitInternational:Number(data.cupos[id]?.internacional)||0,
          adminFeeDefault:latestAdminAmountForCard(data,id),
          billingDay:null,
          dueDay:null,
          active:true
        };
        changed=true;
      }
    });

    data.compras.forEach(purchase=>{
      if(purchase.migratedToMonthlyFee||!isAdminPurchase(purchase))return;
      (purchase.cuotas||[]).forEach(q=>{
        const period=q.mes;
        const cardId=purchase.tarjeta;
        if(!period||!cardId)return;
        const exists=data.monthlyFees.some(f=>f.cardId===cardId&&f.period===period);
        if(!exists){
          data.monthlyFees.push({
            id:'fee_'+cardId+'_'+period,
            cardId,
            period,
            amount:Math.round(Number(q.monto)||0),
            confirmed:true,
            type:'admin_fee',
            sourceCompraId:purchase.id
          });
        }
      });
      purchase.migratedToMonthlyFee=true;
      purchase.activa=false;
      changed=true;
    });

    data.version=2;
    return changed;
  }

  function ensureAdminFees(data,period){
    let changed=false;
    cardIds(data).forEach(cardId=>{
      const exists=(data.monthlyFees||[]).some(f=>f.cardId===cardId&&f.period===period);
      if(exists)return;
      data.monthlyFees.push({
        id:'fee_'+cardId+'_'+period,
        cardId,
        period,
        amount:Math.round(Number(data.cards[cardId].adminFeeDefault)||0),
        confirmed:false,
        type:'admin_fee'
      });
      changed=true;
    });
    return changed;
  }

  function getAdminFees(data,period){
    return (data.monthlyFees||[]).filter(f=>f.period===period);
  }

  function getPurchaseInstallments(data,period){
    return (data.compras||[])
      .filter(c=>c.activa&&c.migratedToMonthlyFee!==true&&!isAdminPurchase(c))
      .map(c=>{
        const q=(c.cuotas||[]).find(x=>x.mes===period);
        return q?{id:c.id,cardId:c.tarjeta,description:c.descripcion,amount:Number(q.monto)||0,kind:'purchase',purchase:c}:null;
      })
      .filter(Boolean);
  }

  function getPeriodMovements(data,period){
    const fees=getAdminFees(data,period).map(f=>({
      id:f.id,
      cardId:f.cardId,
      description:'Administracion '+f.cardId,
      amount:Number(f.amount)||0,
      confirmed:f.confirmed,
      kind:'admin_fee',
      fee:f
    }));
    return [...getPurchaseInstallments(data,period),...fees];
  }

  function amountForCardInPeriod(data,cardId,period){
    return getPeriodMovements(data,period).filter(x=>x.cardId===cardId).reduce((s,x)=>s+x.amount,0);
  }

  function remainingInstallments(purchase,fromPeriod){
    return (purchase.cuotas||[]).filter(q=>q.mes>=fromPeriod);
  }

  function outstandingForCard(data,cardId,fromPeriod){
    return (data.compras||[])
      .filter(c=>c.tarjeta===cardId&&c.activa&&c.migratedToMonthlyFee!==true&&!isAdminPurchase(c))
      .reduce((sum,c)=>sum+remainingInstallments(c,fromPeriod).reduce((s,q)=>s+(Number(q.monto)||0),0),0);
  }

  function addPurchase(data,input){
    const first=input.firstPeriod||currentPeriod();
    const[y,m]=first.split('-').map(Number);
    const count=input.recurring?24:input.installments;
    const cuotas=[];
    for(let i=0;i<count;i++){
      const d=new Date(y,m-1+i,1);
      cuotas.push({mes:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),monto:Math.round(input.amount)});
    }
    data.last_id=(data.last_id||0)+1;
    data.compras.push({
      id:'c'+data.last_id,
      descripcion:input.description,
      tarjeta:input.cardId,
      cuotas,
      activa:true,
      recurrente:!!input.recurring
    });
  }

  function deactivatePurchase(data,id){
    const purchase=(data.compras||[]).find(x=>x.id===id);
    if(purchase)purchase.activa=false;
  }

  function updateAdminFee(data,id,amount,confirmed){
    const fee=(data.monthlyFees||[]).find(x=>x.id===id);
    if(!fee)return;
    fee.amount=Math.round(Number(amount)||0);
    fee.confirmed=confirmed!==false;
  }

  function updateCard(data,cardId,changes){
    if(!data.cards[cardId])return;
    data.cards[cardId]={...data.cards[cardId],...changes};
    data.cupos=data.cupos||{};
    data.cupos[cardId]={
      nacional:Number(data.cards[cardId].limitNational)||0,
      internacional:Number(data.cards[cardId].limitInternational)||0
    };
  }

  window.TDCDomain={
    currentPeriod,
    addMonths,
    monthLabel,
    cardIds,
    migrate,
    ensureAdminFees,
    getAdminFees,
    getPeriodMovements,
    amountForCardInPeriod,
    remainingInstallments,
    outstandingForCard,
    addPurchase,
    deactivatePurchase,
    updateAdminFee,
    updateCard
  };
})();
