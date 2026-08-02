
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


const menuToggle=document.getElementById('menuToggle');
const mobileMenu=document.getElementById('mobileMenu');
if(menuToggle && mobileMenu){
  menuToggle.addEventListener('click',()=>{
    const open=mobileMenu.classList.toggle('open');
    menuToggle.classList.toggle('active',open);
    menuToggle.setAttribute('aria-expanded',String(open));
    document.body.style.overflow=open?'hidden':'';
  });
  mobileMenu.querySelectorAll('a').forEach(link=>{
    link.addEventListener('click',()=>{
      mobileMenu.classList.remove('open');
      menuToggle.classList.remove('active');
      menuToggle.setAttribute('aria-expanded','false');
      document.body.style.overflow='';
    });
  });
}


const feedItems=[...document.querySelectorAll('.feed-item')];
if(feedItems.length){
  let activeFeed=0;
  setInterval(()=>{
    feedItems[activeFeed].classList.remove('active');
    activeFeed=(activeFeed+1)%feedItems.length;
    feedItems[activeFeed].classList.add('active');
  },2200);
}

const preview=document.querySelector('.dashboard-preview-v6');
if(preview && window.matchMedia('(min-width:901px)').matches){
  preview.addEventListener('pointermove',e=>{
    const r=preview.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width-.5;
    const y=(e.clientY-r.top)/r.height-.5;
    preview.style.transform=`perspective(1200px) rotateY(${x*7-4}deg) rotateX(${-y*5+1}deg) translateY(-2px)`;
  });
  preview.addEventListener('pointerleave',()=>{
    preview.style.transform='perspective(1200px) rotateY(-5deg) rotateX(1deg)';
  });
}
