
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
function render(){
  steps.forEach((s,i)=>s.classList.toggle('active',i===current));
  const p=Math.round(((current+1)/steps.length)*100);
  fill.style.width=p+'%';label.textContent=`Step ${current+1} of ${steps.length}`;
  pct.textContent=p+'%';title.textContent=steps[current].dataset.title;
  prevBtn.style.visibility=current===0?'hidden':'visible';
  nextBtn.style.display=current===steps.length-1?'none':'inline-flex';
  submitBtn.style.display=current===steps.length-1?'inline-flex':'none';
}
function valid(){
  const fields=[...steps[current].querySelectorAll('input,select,textarea')];
  for(const f of fields){if(!f.checkValidity()){f.reportValidity();return false}}
  return true;
}
nextBtn.onclick=()=>{if(valid()&&current<steps.length-1){current++;render()}};
prevBtn.onclick=()=>{if(current>0){current--;render()}};
form.onsubmit=e=>{e.preventDefault();if(!valid())return;console.log('ClaimAxis intake:',Object.fromEntries(new FormData(form).entries()));form.style.display='none';success.style.display='block'};
render();
