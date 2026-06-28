(function(){
  function createStore(client){
    let sha=null;
    let data=null;

    async function load(){
      const meta=await client.get('tdc_data.json');
      if(meta){
        sha=meta.sha;
        data=AppShared.decodeJson(meta.content);
      }else{
        data={version:2,compras:[],cupos:{},cards:{},monthlyFees:[],last_id:0};
        sha=await client.put('tdc_data.json',data,null,'init tdc');
      }
      const migrated=TDCDomain.migrate(data);
      return {data,sha,migrated};
    }

    async function save(message){
      sha=await client.put('tdc_data.json',data,sha,message||'update tdc');
      return sha;
    }

    return {
      load,
      save,
      get data(){return data;},
      get sha(){return sha;}
    };
  }

  window.TDCStore={createStore};
})();
