(function(){
  const MN=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const MF=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  function fmt(n){
    return '$'+Math.round(Math.abs(Number(n)||0)).toLocaleString('es-CL');
  }

  function decodeJson(content){
    const binary=atob(content.replace(/\n/g,''));
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  }

  function encodeJson(data){
    return btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2))));
  }

  function loadCfg(){
    try{return JSON.parse(localStorage.getItem('gh_cfg'));}catch{return null;}
  }

  function saveCfg(cfg){
    localStorage.setItem('gh_cfg',JSON.stringify(cfg));
  }

  function githubClient(cfg){
    function url(path){
      return 'https://api.github.com/repos/'+cfg.user+'/'+cfg.repo+'/contents/'+path;
    }
    function headers(){
      return {
        'Authorization':'token '+cfg.token,
        'Content-Type':'application/json',
        'Accept':'application/vnd.github.v3+json'
      };
    }
    return {
      async get(path){
        const r=await fetch(url(path),{headers:headers()});
        if(r.status==404)return null;
        if(r.status==401)throw new Error('Token invalido. Usa el boton Reconfigurar.');
        if(!r.ok)throw new Error('GitHub '+r.status+' al leer '+path);
        return r.json();
      },
      async put(path,data,sha,msg){
        const body={message:msg,content:encodeJson(data)};
        if(sha)body.sha=sha;
        const r=await fetch(url(path),{method:'PUT',headers:headers(),body:JSON.stringify(body)});
        if(!r.ok)throw new Error('Error guardando '+path+' ('+r.status+')');
        return (await r.json()).content.sha;
      }
    };
  }

  window.AppShared={MN,MF,fmt,decodeJson,loadCfg,saveCfg,githubClient};
})();
