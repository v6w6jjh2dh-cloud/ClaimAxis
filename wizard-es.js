const steps=[...document.querySelectorAll('.form-step')];
const nextBtn=document.getElementById('nextBtn');
const prevBtn=document.getElementById('prevBtn');
const submitBtn=document.getElementById('submitBtn');
const form=document.getElementById('intakeForm');
const success=document.getElementById('successPanel');
const fill=document.getElementById('progressFill');
const label=document.getElementById('stepLabel');
const pct=document.getElementById('progressPercent');
const title=document.getElementById('stepTitle');
let current=0;
let capturedLeadId='';
let captureToken='';

function render(){
  steps.forEach((s,i)=>s.classList.toggle('active',i===current));
  const p=Math.round(((current+1)/steps.length)*100);
  fill.style.width=p+'%';
  if(label){ label.textContent=''; label.style.display='none'; }
  pct.textContent=p+'%';
  title.textContent=steps[current].dataset.title;
  prevBtn.style.visibility=current===0?'hidden':'visible';
  nextBtn.style.display=current===steps.length-1?'none':'inline-flex';
  submitBtn.style.display=current===steps.length-1?'inline-flex':'none';
  if(current===0) nextBtn.textContent=capturedLeadId?'Continuar':'Comenzar mi evaluación gratuita';
  else nextBtn.textContent='Continuar';
}

function valid(){
  const fields=[...steps[current].querySelectorAll('input,select,textarea')];
  for(const f of fields){
    if(!f.checkValidity()){
      f.reportValidity();
      return false;
    }
  }
  return true;
}

function trackingString(stage){
  const params=new URLSearchParams(window.location.search);
  const tracking={
    page:window.location.pathname.split('/').pop()||'injury-help.html',
    stage,
    source:params.get('utm_source')||'',
    medium:params.get('utm_medium')||'',
    campaign:params.get('utm_campaign')||'',
    content:params.get('utm_content')||'',
    term:params.get('utm_term')||'',
    fbclid:params.get('fbclid')?'yes':'',
    gclid:params.get('gclid')?'yes':''
  };
  return Object.entries(tracking).filter(([,v])=>v).map(([k,v])=>`${k}=${String(v).slice(0,120)}`).join('|').slice(0,500);
}

function setButtonBusy(button,busy,busyText,normalText){
  button.disabled=busy;
  button.textContent=busy?busyText:normalText;
}

async function captureContact(){
  const data=new FormData(form);
  const payload={
    capture_stage:'contact',
    full_name:data.get('full_name'),
    phone:data.get('phone'),
    state:data.get('state'),
    email:data.get('email')||'',
    consent:Boolean(form.querySelector('input[name="contact_consent"]')?.checked),
    source_page:trackingString('contact_captured')
  };

  const response=await fetch('/api/leads',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(payload)
  });
  const result=await response.json();
  if(!response.ok||!result.ok) throw new Error(result.error||'No se pudieron guardar sus datos de contacto.');
  capturedLeadId=result.lead_id;
  captureToken=result.capture_token;
  sessionStorage.setItem('claimaxis_lead_id',capturedLeadId);
  sessionStorage.setItem('claimaxis_capture_token',captureToken);
}

nextBtn.onclick=async()=>{
  if(!valid()||current>=steps.length-1) return;

  if(current===0&&!capturedLeadId){
    const normal='Comenzar mi evaluación gratuita';
    setButtonBusy(nextBtn,true,'Guardando…',normal);
    try{
      await captureContact();
    }catch(error){
      alert(error.message||'No se pudo guardar. Inténtelo de nuevo.');
      setButtonBusy(nextBtn,false,'Guardando…',normal);
      return;
    }
    setButtonBusy(nextBtn,false,'Guardando…','Continuar');
  }

  current++;
  render();
  document.querySelector('.wizard-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
};

prevBtn.onclick=()=>{if(current>0){current--;render()}};

form.onsubmit=async(e)=>{
  e.preventDefault();
  if(!valid()) return;

  if(!capturedLeadId||!captureToken){
    alert('Su sesión expiró. Regrese al primer paso e inténtelo de nuevo.');
    current=0;render();return;
  }

  setButtonBusy(submitBtn,true,'Enviando…','Completar mi evaluación');
  const data=new FormData(form);
  const payload=Object.fromEntries(data.entries());
  payload.capture_token=captureToken;
  payload.source_page=trackingString('completed');
  payload.consent=Boolean(form.querySelector('input[name="contact_consent"]')?.checked);

  try{
    const response=await fetch(`/api/leads/${encodeURIComponent(capturedLeadId)}/intake`,{
      method:'PATCH',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload)
    });
    const result=await response.json();
    if(!response.ok||!result.ok) throw new Error(result.error||'No se pudo completar su evaluación.');

    if(typeof window.fbq==='function'){
      window.fbq('track','Lead',{content_name:'Completed Case Review'});
    }

    form.style.display='none';
    success.style.display='block';
    const idLine=document.createElement('p');
    idLine.className='submission-reference';
    idLine.textContent=`Referencia: ${capturedLeadId}`;
    success.appendChild(idLine);
    sessionStorage.removeItem('claimaxis_lead_id');
    sessionStorage.removeItem('claimaxis_capture_token');
  }catch(error){
    alert(error.message||'No se pudo enviar. Inténtelo de nuevo.');
    setButtonBusy(submitBtn,false,'Enviando…','Completar mi evaluación');
  }
};

render();
