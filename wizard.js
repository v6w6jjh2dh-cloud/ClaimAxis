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
const saveStatus=document.getElementById('saveStatus');
let current=0;
let leadId=sessionStorage.getItem('claimaxis_lead_id')||'';
let captureBusy=false;

function trackingSource(){
  const params=new URLSearchParams(window.location.search);
  const tracking={
    page:window.location.pathname.split('/').pop()||'injury-help.html',
    source:params.get('utm_source')||'',medium:params.get('utm_medium')||'',
    campaign:params.get('utm_campaign')||'',content:params.get('utm_content')||'',
    term:params.get('utm_term')||'',fbclid:params.get('fbclid')?'yes':'',gclid:params.get('gclid')?'yes':''
  };
  return Object.entries(tracking).filter(([,v])=>v).map(([k,v])=>`${k}=${String(v).slice(0,120)}`).join('|').slice(0,500);
}

function render(){
  steps.forEach((s,i)=>s.classList.toggle('active',i===current));
  const p=Math.round(((current+1)/steps.length)*100);
  fill.style.width=p+'%';
  label.textContent=current===0?'QUICK REVIEW':`STEP ${current}`;
  pct.textContent=current===0?'Start':p+'%';
  title.textContent=steps[current].dataset.title;
  prevBtn.style.visibility=current===0?'hidden':'visible';
  nextBtn.style.display=current===steps.length-1?'none':'inline-flex';
  nextBtn.textContent=current===0?'Get My Free Review':'Continue';
  submitBtn.style.display=current===steps.length-1?'inline-flex':'none';
}

function valid(){
  const fields=[...steps[current].querySelectorAll('input,select,textarea')];
  for(const f of fields){if(!f.checkValidity()){f.reportValidity();return false;}}
  return true;
}

function setCaptureBusy(busy){
  captureBusy=busy;nextBtn.disabled=busy;
  if(current===0) nextBtn.textContent=busy?'Saving…':'Get My Free Review';
}
function setSubmitting(busy){submitBtn.disabled=busy;submitBtn.textContent=busy?'Submitting…':'Submit Review';}

async function captureContact(){
  if(leadId) return true;
  const data=new FormData(form);
  const payload={
    full_name:String(data.get('full_name')||'').trim(),
    phone:String(data.get('phone')||'').trim(),
    state:String(data.get('state')||'New York').trim(),
    email:String(data.get('email')||'').trim(),
    consent:Boolean(data.get('initial_consent')),
    source_page:trackingSource()
  };
  setCaptureBusy(true);saveStatus.textContent='Saving your contact details…';
  try{
    const response=await fetch('/api/leads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json();
    if(!response.ok||!result.ok) throw new Error(result.error||'Unable to save your details.');
    leadId=result.lead_id;sessionStorage.setItem('claimaxis_lead_id',leadId);
    saveStatus.textContent='Your contact details are saved.';
    return true;
  }catch(error){
    saveStatus.textContent='';alert(error.message||'Unable to save. Please try again.');return false;
  }finally{setCaptureBusy(false);}
}

nextBtn.onclick=async()=>{
  if(captureBusy||!valid()||current>=steps.length-1) return;
  if(current===0){const saved=await captureContact();if(!saved)return;}
  current++;render();
  document.querySelector('.wizard-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
};
prevBtn.onclick=()=>{if(current>0){current--;render();}};

form.onsubmit=async(e)=>{
  e.preventDefault();if(!valid())return;
  if(!leadId){const saved=await captureContact();if(!saved)return;}
  setSubmitting(true);
  const fd=new FormData(form);
  const payload=Object.fromEntries(fd.entries());
  payload.consent=Boolean(fd.get('final_consent'));
  payload.source_page=trackingSource();
  try{
    const response=await fetch(`/api/leads/${encodeURIComponent(leadId)}/intake`,{
      method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
    });
    const result=await response.json();
    if(!response.ok||!result.ok) throw new Error(result.error||'Unable to submit your inquiry.');
    sessionStorage.removeItem('claimaxis_lead_id');
    form.style.display='none';success.style.display='block';
    const idLine=document.createElement('p');idLine.className='submission-reference';idLine.textContent=`Reference: ${leadId}`;success.appendChild(idLine);
  }catch(error){alert(error.message||'Unable to submit. Please try again.');setSubmitting(false);}
};
render();
