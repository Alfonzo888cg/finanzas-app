(function(){
  let store=null;
  let period=TDCDomain.currentPeriod();

  function el(id){return document.getElementById(id);}
  function fmt(n){return AppShared.fmt(n);}

  function setSync(state){
    el('sdot').className='sync-dot'+(state==='syncing'?' syncing':state==='error'?' error':'');
    el('slabel').textContent=state==='syncing'?'Guardando...':state==='error'?'Error':'OK';
  }

  function showMsg(id,msg,ok){
    const node=el(id);
    node.textContent=msg;
    node.className='msg '+(ok?'ok':'err');
    setTimeout(()=>{node.className='msg';},3000);
  }

  function cardColor(cardId){
    return cardId==='ITAU'?'#D85A30':'#185FA5';
  }

  function fillCardSelects(){
    const options=TDCDomain.cardIds(store.data).map(id=>'<option value="'+id+'">'+(store.data.cards[id].name||id)+'</option>').join('');
    el('cf-t').innerHTML=options;
  }

  function renderCards(){
    const html=TDCDomain.cardIds(store.data).map(cardId=>{
      const card=store.data.cards[cardId];
      const month=TDCDomain.amountForCardInPeriod(store.data,cardId,period);
      const pending=TDCDomain.outstandingForCard(store.data,cardId,period);
      const limit=Number(card.limitNational)||0;
      const pct=limit?Math.min(100,Math.round(pending/limit*100)):0;
      return '<div class="tdc-box">'+
        '<div class="tdc-card-head"><span>'+card.name+'</span><span class="badge">'+cardId+'</span></div>'+
        '<div class="metric-label">Gasto del periodo</div><div class="metric-value" style="color:'+cardColor(cardId)+'">'+fmt(month)+'</div>'+
        '<div class="mini-label">Deuda pendiente</div><div class="strong">'+fmt(pending)+'</div>'+
        '<div class="cupo-bar"><div class="cupo-fill" style="width:'+pct+'%;background:'+cardColor(cardId)+'"></div></div>'+
        '<div class="cupo-labels"><span>Cupo: '+fmt(limit)+'</span><span>'+pct+'% usado</span></div>'+
      '</div>';
    }).join('');
    el('tdc-cards').innerHTML=html||'<div class="empty">Sin tarjetas configuradas</div>';
  }

  function renderPeriod(){
    el('tdc-period').value=period;
    el('tdc-mes-lbl').textContent=TDCDomain.monthLabel(period);
    const movements=TDCDomain.getPeriodMovements(store.data,period);
    if(!movements.length){
      el('tdc-mes-detail').innerHTML='<div class="empty">Sin movimientos este mes</div>';
      return;
    }
    const groups=TDCDomain.cardIds(store.data).map(cardId=>{
      const items=movements.filter(x=>x.cardId===cardId);
      if(!items.length)return '';
      const subtotal=items.reduce((s,x)=>s+x.amount,0);
      const rows=items.map(x=>{
        const pending=x.kind==='admin_fee'&&!x.confirmed?' <span class="status-chip">Pendiente</span>':'';
        return '<div class="cuota-row"><span>'+x.description+pending+'</span><span>'+fmt(x.amount)+'</span></div>';
      }).join('');
      return '<div class="sec-sub" style="color:'+cardColor(cardId)+'">'+cardId+'</div>'+rows+
        '<div class="cuota-sub"><span>Subtotal</span><span style="color:'+cardColor(cardId)+'">'+fmt(subtotal)+'</span></div>';
    }).join('');
    const total=movements.reduce((s,x)=>s+x.amount,0);
    el('tdc-mes-detail').innerHTML=groups+'<div class="cuota-sub total-row"><span>Total</span><span>'+fmt(total)+'</span></div>';
  }

  function renderAdminFees(){
    const fees=TDCDomain.getAdminFees(store.data,period);
    const html=fees.map(f=>{
      const card=store.data.cards[f.cardId]||{name:f.cardId};
      return '<div class="admin-row">'+
        '<div><strong>'+card.name+'</strong><div class="muted">'+(f.confirmed?'Confirmado':'Pendiente de confirmar')+'</div></div>'+
        '<input type="number" min="0" value="'+f.amount+'" data-fee-amount="'+f.id+'">'+
        '<button class="btn-sm" data-confirm-fee="'+f.id+'">Confirmar</button>'+
      '</div>';
    }).join('');
    el('admin-fees').innerHTML=html||'<div class="empty">Sin costos de administracion para este periodo</div>';
  }

  function renderTimeline(){
    let html='';
    for(let i=0;i<9;i++){
      const p=TDCDomain.addMonths(period,i);
      const[y,m]=p.split('-').map(Number);
      const total=TDCDomain.getPeriodMovements(store.data,p).reduce((s,x)=>s+x.amount,0);
      const lines=TDCDomain.cardIds(store.data).map(cardId=>{
        const amount=TDCDomain.amountForCardInPeriod(store.data,cardId,p);
        return '<div style="color:'+cardColor(cardId)+'">'+(amount?'$'+Math.round(amount/1000)+'k':'&#8212;')+'</div>';
      }).join('');
      html+='<div class="tcell'+(p===period?' now':'')+'"><div class="tl">'+AppShared.MN[m-1]+' '+String(y).slice(2)+'</div>'+lines+'<div class="tt">'+(total?'$'+Math.round(total/1000)+'k':'&#8212;')+'</div></div>';
    }
    el('tdc-tl').innerHTML=html;
  }

  function renderPurchases(){
    const html=TDCDomain.cardIds(store.data).map(cardId=>{
      const purchases=(store.data.compras||[]).filter(c=>c.tarjeta===cardId&&c.activa&&c.migratedToMonthlyFee!==true);
      const rows=purchases.map(c=>{
        const rest=TDCDomain.remainingInstallments(c,period);
        const total=rest.reduce((s,q)=>s+(Number(q.monto)||0),0);
        const first=Number(c.cuotas?.[0]?.monto)||0;
        return '<div class="pitem">'+
          '<div><strong>'+c.descripcion+'</strong><div class="muted">'+(c.recurrente?'Cargo recurrente':rest.length+' cuota'+(rest.length!==1?'s':'')+' restante'+(rest.length!==1?'s':''))+'</div></div>'+
          '<div class="pitem-actions"><div><strong>'+fmt(first)+'</strong><div class="muted">Total: '+fmt(total)+'</div></div><button class="btn-del" data-delete-purchase="'+c.id+'">x</button></div>'+
        '</div>';
      }).join('');
      return '<div class="sec-sub">'+cardId+'</div>'+(rows||'<div class="empty small">Sin compras vigentes</div>');
    }).join('');
    el('purchase-list').innerHTML=html;
  }

  function renderCardSettings(){
    const html=TDCDomain.cardIds(store.data).map(cardId=>{
      const c=store.data.cards[cardId];
      return '<div class="settings-row">'+
        '<strong>'+c.name+'</strong>'+
        '<label>Costo admin.<input type="number" min="0" value="'+(c.adminFeeDefault||0)+'" data-card-admin="'+cardId+'"></label>'+
        '<label>Cupo nacional<input type="number" min="0" value="'+(c.limitNational||0)+'" data-card-limit="'+cardId+'"></label>'+
        '<button class="btn-sm" data-save-card="'+cardId+'">Guardar</button>'+
      '</div>';
    }).join('');
    el('card-settings').innerHTML=html;
  }

  function renderAll(){
    fillCardSelects();
    renderCards();
    renderPeriod();
    renderAdminFees();
    renderTimeline();
    renderPurchases();
    renderCardSettings();
  }

  async function persist(message){
    setSync('syncing');
    await store.save(message);
    setSync('ok');
  }

  function toggleForm(){
    el('cf').classList.toggle('open');
    if(el('cf').classList.contains('open')){
      el('cf-mi').value=TDCDomain.currentPeriod();
      el('cf-n').value='1';
    }
  }

  async function init(client){
    store=TDCStore.createStore(client);
    const loaded=await store.load();
    const changed=loaded.migrated||TDCDomain.ensureAdminFees(store.data,period);
    if(changed)await persist('migrate tdc module');
    renderAll();
    window.TDCApp={prev,next,setPeriod,toggleForm,savePurchase};
  }

  async function prev(){
    period=TDCDomain.addMonths(period,-1);
    if(TDCDomain.ensureAdminFees(store.data,period))await persist('ensure tdc admin fees');
    renderAll();
  }

  async function next(){
    period=TDCDomain.addMonths(period,1);
    if(TDCDomain.ensureAdminFees(store.data,period))await persist('ensure tdc admin fees');
    renderAll();
  }

  async function setPeriod(value){
    if(!value)return;
    period=value;
    if(TDCDomain.ensureAdminFees(store.data,period))await persist('ensure tdc admin fees');
    renderAll();
  }

  async function savePurchase(){
    const input={
      cardId:el('cf-t').value,
      description:el('cf-d').value.trim(),
      amount:Number(el('cf-m').value),
      installments:Number(el('cf-n').value),
      firstPeriod:el('cf-mi').value||TDCDomain.currentPeriod(),
      recurring:el('cf-r').value==='si'
    };
    if(!input.cardId||!input.description||!input.amount||input.amount<=0||!input.installments||input.installments<1){
      showMsg('cf-msg','Completa todos los campos',false);
      return;
    }
    TDCDomain.addPurchase(store.data,input);
    await persist('add tdc purchase');
    renderAll();
    toggleForm();
    el('cf-d').value='';
    el('cf-m').value='';
    showMsg('cf-msg','Guardado',true);
  }

  document.addEventListener('click',async ev=>{
    const feeId=ev.target.dataset.confirmFee;
    if(feeId){
      const amount=el('admin-fees').querySelector('[data-fee-amount="'+feeId+'"]').value;
      TDCDomain.updateAdminFee(store.data,feeId,amount,true);
      await persist('confirm tdc admin fee');
      renderAll();
      return;
    }
    const purchaseId=ev.target.dataset.deletePurchase;
    if(purchaseId){
      if(!confirm('Eliminar esta compra?'))return;
      TDCDomain.deactivatePurchase(store.data,purchaseId);
      await persist('delete tdc purchase');
      renderAll();
      return;
    }
    const cardId=ev.target.dataset.saveCard;
    if(cardId){
      const admin=el('card-settings').querySelector('[data-card-admin="'+cardId+'"]').value;
      const limit=el('card-settings').querySelector('[data-card-limit="'+cardId+'"]').value;
      TDCDomain.updateCard(store.data,cardId,{adminFeeDefault:Number(admin)||0,limitNational:Number(limit)||0});
      await persist('update tdc card');
      renderAll();
    }
  });

  window.TDCUi={init,setSync,showMsg};
})();
