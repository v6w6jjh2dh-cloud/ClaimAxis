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
let savedLeadId='';
let savedPhone='';

function render(){
  steps.forEach((s,i)=>s.classList.toggle('active',i===current));
  const p=Math.round(((current+1)/steps.length)*100);
  fill.style.width=p+'%';
  label.textContent=current===0?'Quick 30-Second Review':`Quick Review`;
  pct.textContent=current===0?'Start':p+'%';
  title.textContent=steps[current].dataset.title;
  prevBtn.style.visibility=current===0?'hidden':'visible';
  nextBtn.style.display=current===steps.length-1?'none':'inline-flex';
  nextBtn.textContent=current===0?'Get My Free Review':'Continue';
  submitBtn.style.display=current===steps.length-1?'inline-flex':'none';
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

function trackingSource(){
  const params=new URLSearchParams(window.location.search);
  const tracking={
    page:window.location.pathname.split('/').pop()||'injury-help.html',
    stage:'contact_saved',
    source:params.get('utm_source')||'', medium:params.get('utm_medium')||'',
    campaign:params.get('utm_campaign')||'', content:params.get('utm_content')||'',
    term:params.get('utm_term')||'', fbclid:params.get('fbclid')?'yes':'', gclid:params.get('gclid')?'yes':''
  };
  return Object.entries(tracking).filter(([,v])=>v).map(([k,v])=>`${k}=${String(v).slice(0,120)}`).join('|').slice(0,500);
}

function contactPayload(){
  const fd=new FormData(form);
  return {
    full_name:String(fd.get('full_name')||'').trim(),
    phone:String(fd.get('phone')||'').trim(),
    state:String(fd.get('state')||'').trim(),
    email:String(fd.get('email')||'').trim(),
    consent:document.getElementById('contactConsent')?.checked===true,
    source_page:trackingSource()
  };
}

function setSaving(on){
  nextBtn.disabled=on;
  nextBtn.textContent=on?'Saving…':'Get My Free Review';
}
function setSubmitting(on){
  submitBtn.disabled=on;
  submitBtn.textContent=on?'Submitting…':'Finish Review';
}

async function saveContactFirst(){
  setSaving(true);
  try{
    const payload=contactPayload();
    const response=await fetch('/api/leads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok) throw new Error(result.error||'Unable to save your information.');
    savedLeadId=result.lead_id;
    savedPhone=payload.phone;
    sessionStorage.setItem('claimaxis_lead_id',savedLeadId);
    sessionStorage.setItem('claimaxis_lead_phone',savedPhone);
    return true;
  }catch(error){
    alert(error.message||'Unable to save. Please try again.');
    return false;
  }finally{setSaving(false)}
}

nextBtn.onclick=async()=>{
  if(!valid()||current>=steps.length-1) return;
  if(current===0&&!savedLeadId){
    const saved=await saveContactFirst();
    if(!saved) return;
  }
  current++;
  render();
  document.querySelector('.wizard-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
};
prevBtn.onclick=()=>{if(current>0){current--;render()}};

form.onsubmit=async(e)=>{
  e.preventDefault();
  if(!valid()) return;
  if(!savedLeadId){
    savedLeadId=sessionStorage.getItem('claimaxis_lead_id')||'';
    savedPhone=sessionStorage.getItem('claimaxis_lead_phone')||'';
  }
  if(!savedLeadId){
    alert('Please return to the first step and save your contact details.');
    return;
  }
  setSubmitting(true);
  const fd=new FormData(form);
  const payload=Object.fromEntries(fd.entries());
  payload.phone_match=savedPhone||String(fd.get('phone')||'').trim();
  payload.consent=document.getElementById('contactConsent')?.checked===true;
  try{
    const response=await fetch(`/api/leads/${encodeURIComponent(savedLeadId)}/complete`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok) throw new Error(result.error||'Unable to complete your inquiry.');
    sessionStorage.removeItem('claimaxis_lead_id');
    sessionStorage.removeItem('claimaxis_lead_phone');
    form.style.display='none';
    success.style.display='block';
    const idLine=document.createElement('p');
    idLine.className='submission-reference';
    idLine.textContent=`Reference: ${savedLeadId}`;
    success.appendChild(idLine);
  }catch(error){
    alert(error.message||'Unable to submit. Please try again.');
    setSubmitting(false);
  }
};
render();
