
const observer=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')})},{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));

document.querySelectorAll('[data-counter]').forEach(el=>{
  const target=Number(el.dataset.counter);
  let started=false;
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting&&!started){
        started=true;
        let value=0;
        const step=Math.max(1,Math.ceil(target/30));
        const timer=setInterval(()=>{value+=step;if(value>=target){value=target;clearInterval(timer)}el.textContent=value},35);
      }
    })
  },{threshold:.5});
  obs.observe(el);
});

const glow=document.querySelector('.cursor-glow');
if(glow){
  window.addEventListener('pointermove',e=>{glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px'});
}
