
const firmForm=document.getElementById('firmForm');
if(firmForm){
  firmForm.addEventListener('submit',e=>{
    e.preventDefault();
    console.log('ClaimAxis firm request:',Object.fromEntries(new FormData(firmForm).entries()));
    firmForm.style.display='none';
    document.getElementById('firmSuccess').style.display='block';
  });
}
