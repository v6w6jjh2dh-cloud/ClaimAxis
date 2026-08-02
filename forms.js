const firmForm=document.getElementById('firmForm');
if(firmForm){
  firmForm.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const button=firmForm.querySelector('button[type="submit"]');
    button.disabled=true;
    const oldText=button.textContent;
    button.textContent='Submitting…';

    try{
      const payload=Object.fromEntries(new FormData(firmForm).entries());
      const response=await fetch('/api/firm-requests',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(payload)
      });
      const result=await response.json();

      if(!response.ok || !result.ok){
        throw new Error(result.error || 'Unable to submit your request.');
      }

      firmForm.style.display='none';
      const success=document.getElementById('firmSuccess');
      success.style.display='block';
      const ref=document.createElement('p');
      ref.className='submission-reference';
      ref.textContent=`Reference: ${result.request_id}`;
      success.appendChild(ref);
    }catch(error){
      alert(error.message || 'Unable to submit. Please try again.');
      button.disabled=false;
      button.textContent=oldText;
    }
  });
}
