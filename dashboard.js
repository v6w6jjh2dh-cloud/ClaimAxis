const loginOverlay=document.getElementById('adminLogin');
const loginForm=document.getElementById('loginForm');
const tokenInput=document.getElementById('adminTokenInput');
const sidebar=document.getElementById('sidebar');
const dashboardMain=document.getElementById('dashboardMain');
const leadTable=document.getElementById('leadTable');
const message=document.getElementById('dashboardMessage');
const searchInput=document.getElementById('searchInput');
const refreshBtn=document.getElementById('refreshBtn');
const logoutBtn=document.getElementById('logoutBtn');
const modal=document.getElementById('leadModal');
const modalContent=document.getElementById('leadModalContent');
const dashTitle=document.getElementById('dashTitle');
const dashEyebrow=document.getElementById('dashEyebrow');
const dashStats=document.getElementById('dashStats');
const autoAssignmentToggle=document.getElementById('autoAssignmentToggle');
const autoAssignmentStatus=document.getElementById('autoAssignmentStatus');
let currentFilter='all';
let searchTimer;
let lawFirmsCache=[];

function token(){return sessionStorage.getItem('claimaxis_admin_token')||''}
function authHeaders(){return {'authorization':`Bearer ${token()}`,'content-type':'application/json'}}

function showDashboard(){
  loginOverlay.style.display='none';
  sidebar.style.display='';
  dashboardMain.style.display='';
}
function showLogin(){
  loginOverlay.style.display='grid';
  sidebar.style.display='none';
  dashboardMain.style.display='none';
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[ch]);
}
function prettyStatus(status){
  return {
    new:'New',contacted:'Contacted',qualified:'Qualified',
    sent_to_firm:'Sent to Firm',signed:'Signed',
    closed:'Closed',rejected:'Rejected'
  }[status]||status;
}
function prettyDate(value){
  if(!value)return '';
  const d=new Date(value.replace(' ','T')+'Z');
  return Number.isNaN(d.getTime())?value:d.toLocaleString();
}
function statusClass(status){
  if(status==='new')return 'blue';
  if(status==='qualified'||status==='signed')return 'green';
  if(status==='contacted'||status==='sent_to_firm')return 'gold';
  return 'purple';
}

async function api(url,options={}){
  const response=await fetch(url,{...options,headers:{...authHeaders(),...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(response.status===401){
    sessionStorage.removeItem('claimaxis_admin_token');
    showLogin();
    throw new Error('Invalid admin token.');
  }
  if(!response.ok||!data.ok)throw new Error(data.error||'Request failed.');
  return data;
}

async function loadLeads(){
  message.textContent='Loading leads…';
  const params=new URLSearchParams({status:currentFilter,limit:'250'});
  const q=searchInput.value.trim();
  if(q)params.set('search',q);

  try{
    const data=await api(`/api/leads?${params}`);
    renderCounts(data.counts||{});
    renderLeads(data.leads||[]);
    message.textContent=data.leads?.length?'':'No leads found.';
  }catch(error){
    message.textContent=error.message;
  }
}
function renderCounts(c){
  document.getElementById('countAll').textContent=c.all||0;
  document.getElementById('countNew').textContent=c.new||0;
  document.getElementById('countQualified').textContent=c.qualified||0;
  document.getElementById('countSigned').textContent=c.signed||0;
}
function renderLeads(leads){
  leadTable.querySelectorAll('.dash-row:not(.head)').forEach(row=>row.remove());
  for(const lead of leads){
    const row=document.createElement('button');
    row.className='dash-row lead-row-button';
    row.dataset.id=lead.public_id;
    row.innerHTML=`
      <span><strong>${escapeHtml(lead.full_name)}</strong><small>${escapeHtml(lead.public_id)}</small></span>
      <span>${escapeHtml(lead.state||'—')}</span>
      <span>${escapeHtml(lead.incident_type||'—')}</span>
      <span><b class="status ${statusClass(lead.status)}">${escapeHtml(prettyStatus(lead.status))}</b></span>
      <span>${escapeHtml(prettyDate(lead.created_at))}</span>
    `;
    row.addEventListener('click',()=>openLead(lead.public_id));
    leadTable.appendChild(row);
  }
}

async function openLead(id){
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  modalContent.innerHTML='<p>Loading lead…</p>';
  try{
    if(!lawFirmsCache.length){
      try{ const firms=await api('/api/law-firms'); lawFirmsCache=firms.firms||[]; }catch(_error){}
    }
    const data=await api(`/api/leads/${encodeURIComponent(id)}`);
    const l=data.lead;
    modalContent.innerHTML=`
      <span class="eyebrow">LEAD DETAILS</span>
      <h2>${escapeHtml(l.full_name)}</h2>
      <p class="lead-reference">${escapeHtml(l.public_id)} · ${escapeHtml(prettyDate(l.created_at))}</p>

      <div class="lead-detail-grid">
        <div><small>Phone</small><a href="tel:${escapeHtml(l.phone)}">${escapeHtml(l.phone)}</a></div>
        <div><small>Email</small><a href="mailto:${escapeHtml(l.email)}">${escapeHtml(l.email)}</a></div>
        <div><small>State</small><strong>${escapeHtml(l.state||'—')}</strong></div>
        <div><small>Incident</small><strong>${escapeHtml(l.incident_type||'—')}</strong></div>
        <div><small>Accident Date</small><strong>${escapeHtml(l.accident_date||'—')}</strong></div>
        <div><small>Treatment</small><strong>${escapeHtml(l.treatment||'—')}</strong></div>
        <div><small>Has Attorney</small><strong>${escapeHtml(l.has_attorney||'—')}</strong></div>
        <div><small>Fault</small><strong>${escapeHtml(l.fault||'—')}</strong></div>
      </div>

      <div class="lead-long-text"><small>Injuries</small><p>${escapeHtml(l.injuries||'—')}</p></div>
      <div class="lead-long-text"><small>Description</small><p>${escapeHtml(l.description||'—')}</p></div>
      <div class="lead-long-text"><small>Law Firm Response</small><p><strong>${escapeHtml(l.firm_response||'Not sent / pending')}</strong>${l.firm_response_at ? ' · '+escapeHtml(prettyDate(l.firm_response_at)) : ''}</p></div>

      <form id="leadUpdateForm" class="lead-update-form">
        <label>Status
          <select name="status">
            ${['new','contacted','qualified','sent_to_firm','signed','closed','rejected']
              .map(s=>`<option value="${s}" ${s===l.status?'selected':''}>${prettyStatus(s)}</option>`).join('')}
          </select>
        </label>
        <label>Assigned firm
          <select name="assigned_firm" id="assignedFirmSelect">
            <option value="">Not assigned</option>
            ${lawFirmsCache.filter(f=>f.status==='active').map(f=>`<option value="${escapeHtml(f.firm_name)}" data-firm-id="${f.id}" ${f.firm_name===l.assigned_firm?'selected':''}>${escapeHtml(f.firm_name)}</option>`).join('')}
          </select>
        </label>
        <label>Internal notes
          <textarea name="notes" rows="5">${escapeHtml(l.notes||'')}</textarea>
        </label>
        <button class="btn full" type="submit">Save Changes</button>
        <button class="btn full" id="autoAssignLeadBtn" type="button">Assign Best Matching Firm</button>
        <button class="btn gold full" id="sendLeadToFirmBtn" type="button" ${lawFirmsCache.some(f=>f.status==='active')?'':'disabled'}>Send Lead to Law Firm</button>
        <small class="send-lead-note">This sends the lead by email and changes the status to Sent to Firm.</small>
      </form>
      <div id="modalMessage"></div>
    `;
    document.getElementById('leadUpdateForm').addEventListener('submit',async(e)=>{
      e.preventDefault();
      const msg=document.getElementById('modalMessage');
      const payload=Object.fromEntries(new FormData(e.currentTarget).entries());
      msg.textContent='Saving…';
      try{
        await api(`/api/leads/${encodeURIComponent(id)}`,{
          method:'PATCH',
          body:JSON.stringify(payload)
        });
        msg.textContent='Changes saved.';
        await loadLeads();
      }catch(error){msg.textContent=error.message}
    });

    const autoAssignButton=document.getElementById('autoAssignLeadBtn');
    if(autoAssignButton){
      autoAssignButton.addEventListener('click',async()=>{
        const msg=document.getElementById('modalMessage');
        autoAssignButton.disabled=true;
        msg.textContent='Finding the best matching firm…';
        try{
          const result=await api(`/api/leads/${encodeURIComponent(id)}/auto-assign`,{method:'POST',body:'{}'});
          msg.textContent=result.message||'Lead assigned.';
          await loadLeads();
          setTimeout(()=>openLead(id),500);
        }catch(error){msg.textContent=error.message}
        finally{autoAssignButton.disabled=false}
      });
    }

    const sendButton=document.getElementById('sendLeadToFirmBtn');
    if(sendButton){
      sendButton.addEventListener('click',async()=>{
        const msg=document.getElementById('modalMessage');
        const select=document.getElementById('assignedFirmSelect');
        const option=select.options[select.selectedIndex];
        const firmId=Number(option?.dataset?.firmId||0);
        if(!firmId){
          msg.textContent='Please select an active law firm first.';
          return;
        }
        const firmName=option.textContent.trim();
        if(!confirm(`Send this lead to ${firmName}?`)) return;
        sendButton.disabled=true;
        msg.textContent='Sending lead…';
        try{
          const result=await api(`/api/leads/${encodeURIComponent(id)}/send-to-firm`,{
            method:'POST',
            body:JSON.stringify({firm_id:firmId})
          });
          msg.textContent=result.message||'Lead sent successfully.';
          await loadLeads();
          setTimeout(closeModal,900);
        }catch(error){
          msg.textContent=error.message;
          sendButton.disabled=false;
        }
      });
    }
  }catch(error){
    modalContent.innerHTML=`<p>${escapeHtml(error.message)}</p>`;
  }
}
function closeModal(){
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
}
document.querySelectorAll('[data-close-modal]').forEach(el=>el.addEventListener('click',closeModal));

async function loadAutoAssignmentSetting(){
  if(!autoAssignmentToggle||!autoAssignmentStatus)return;
  autoAssignmentStatus.textContent='Checking status…';
  try{
    const data=await api('/api/settings/auto-assignment');
    autoAssignmentToggle.checked=Boolean(data.auto_assignment_enabled);
    autoAssignmentStatus.textContent=data.auto_assignment_enabled
      ? 'ON — new matching leads may be sent automatically.'
      : 'OFF — every lead stays New until you assign it.';
  }catch(error){
    autoAssignmentStatus.textContent=error.message;
  }
}

if(autoAssignmentToggle){
  autoAssignmentToggle.addEventListener('change',async()=>{
    const enabled=autoAssignmentToggle.checked;
    autoAssignmentToggle.disabled=true;
    autoAssignmentStatus.textContent='Saving…';
    try{
      const data=await api('/api/settings/auto-assignment',{
        method:'PATCH',
        body:JSON.stringify({auto_assignment_enabled:enabled})
      });
      autoAssignmentStatus.textContent=data.auto_assignment_enabled
        ? 'ON — new matching leads may be sent automatically.'
        : 'OFF — every lead stays New until you assign it.';
    }catch(error){
      autoAssignmentToggle.checked=!enabled;
      autoAssignmentStatus.textContent=error.message;
    }finally{autoAssignmentToggle.disabled=false}
  });
}

loginForm.addEventListener('submit',async(e)=>{
  e.preventDefault();
  sessionStorage.setItem('claimaxis_admin_token',tokenInput.value);
  showDashboard();
  showLeadView('All Leads');
  await Promise.all([loadLeads(),loadAutoAssignmentSetting()]);
});
logoutBtn.addEventListener('click',()=>{
  sessionStorage.removeItem('claimaxis_admin_token');
  showLogin();
});
refreshBtn.addEventListener('click',()=>{
  if(lawFirmsSection && lawFirmsSection.style.display!=='none') return loadLawFirms();
  if(firmSection && firmSection.style.display!=='none') return loadFirmRequests();
  return loadLeads();
});
searchInput.addEventListener('input',()=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(loadLeads,350);
});
document.querySelectorAll('.sidebar nav button[data-filter]').forEach(button=>{
  button.addEventListener('click',()=>{
    document.querySelectorAll('.sidebar nav button').forEach(b=>b.classList.remove('active'));
    button.classList.add('active');
    currentFilter=button.dataset.filter||'all';
    showLeadView(button.textContent);
    loadLeads();
  });
});

const firmRequestsTab=document.getElementById('firmRequestsTab');
const firmSection=document.getElementById('firmSection');
const leadSection=document.getElementById('leadSection');
const firmTable=document.getElementById('firmTable');
const firmMessage=document.getElementById('firmMessage');
const refreshFirmsBtn=document.getElementById('refreshFirmsBtn');

async function loadFirmRequests(){
  firmMessage.textContent='Loading firm requests…';
  try{
    const data=await api('/api/firm-requests');
    firmTable.querySelectorAll('.dash-row:not(.head)').forEach(row=>row.remove());
    for(const item of data.requests||[]){
      const row=document.createElement('div');
      row.className='dash-row';
      row.innerHTML=`
        <span><strong>${escapeHtml(item.firm_name)}</strong><small>${escapeHtml(item.contact_name||'')}</small></span>
        <span>${escapeHtml(item.state||'—')}</span>
        <span>${escapeHtml(item.practice_areas||'—')}</span>
        <span><b class="status ${statusClass(item.status)}">${escapeHtml(prettyStatus(item.status))}</b></span>
        <span>${escapeHtml(prettyDate(item.created_at))}</span>
      `;
      firmTable.appendChild(row);
    }
    firmMessage.textContent=(data.requests||[]).length?'':'No firm requests found.';
  }catch(error){
    firmMessage.textContent=error.message;
  }
}

if(firmRequestsTab){
  firmRequestsTab.addEventListener('click',()=>{
    document.querySelectorAll('.sidebar nav button').forEach(b=>b.classList.remove('active'));
    firmRequestsTab.classList.add('active');
    showFirmRequestsView();
    loadFirmRequests();
  });
}
if(refreshFirmsBtn) refreshFirmsBtn.addEventListener('click',loadFirmRequests);


// Law firm management
const lawFirmsTab=document.getElementById('lawFirmsTab');
const lawFirmsSection=document.getElementById('lawFirmsSection');
const lawFirmsTable=document.getElementById('lawFirmsTable');
const lawFirmsMessage=document.getElementById('lawFirmsMessage');
const refreshLawFirmsBtn=document.getElementById('refreshLawFirmsBtn');
const addLawFirmBtn=document.getElementById('addLawFirmBtn');
const lawFirmModal=document.getElementById('lawFirmModal');
const lawFirmForm=document.getElementById('lawFirmForm');
const lawFirmModalTitle=document.getElementById('lawFirmModalTitle');
const lawFirmFormMessage=document.getElementById('lawFirmFormMessage');

function hideAllSections(){
  if(leadSection) leadSection.style.display='none';
  if(firmSection) firmSection.style.display='none';
  if(lawFirmsSection) lawFirmsSection.style.display='none';
}

function showLeadView(title='All Leads'){
  hideAllSections();
  if(leadSection) leadSection.style.display='';
  if(dashStats) dashStats.style.display='';
  if(dashTitle) dashTitle.textContent='Lead Dashboard';
  if(dashEyebrow) dashEyebrow.textContent='CLAIMAXIS PLATFORM';
  const listTitle=document.getElementById('listTitle');
  if(listTitle) listTitle.textContent=title;
}

function showFirmRequestsView(){
  hideAllSections();
  if(firmSection) firmSection.style.display='';
  if(dashStats) dashStats.style.display='none';
  if(dashTitle) dashTitle.textContent='Firm Requests';
  if(dashEyebrow) dashEyebrow.textContent='PARTNER PIPELINE';
  dashboardMain.scrollIntoView({block:'start',behavior:'smooth'});
}

function showLawFirmsView(){
  hideAllSections();
  if(lawFirmsSection) lawFirmsSection.style.display='';
  if(dashStats) dashStats.style.display='none';
  if(dashTitle) dashTitle.textContent='Law Firms';
  if(dashEyebrow) dashEyebrow.textContent='PARTNER NETWORK';
  dashboardMain.scrollIntoView({block:'start',behavior:'smooth'});
}

function firmStatusLabel(status){
  return {active:'Active',pending:'Pending',paused:'Paused',declined:'Declined'}[status]||status;
}

async function loadLawFirms(){
  lawFirmsMessage.textContent='Loading law firms…';
  try{
    const data=await api('/api/law-firms');
    lawFirmsCache=data.firms||[];
    lawFirmsTable.querySelectorAll('.dash-row:not(.head)').forEach(row=>row.remove());
    for(const firm of lawFirmsCache){
      const row=document.createElement('div');
      row.className='dash-row';
      row.innerHTML=`
        <span><strong>${escapeHtml(firm.firm_name)}</strong><small>${escapeHtml(firm.contact_name||firm.email||'')}</small></span>
        <span>${escapeHtml([firm.city,firm.state].filter(Boolean).join(', ')||'—')}</span>
        <span>${escapeHtml(firm.practice_areas||'—')}</span>
        <span>${escapeHtml(String(firm.max_daily_leads??0))}</span>
        <span><b class="status ${statusClass(firm.status)}">${escapeHtml(firmStatusLabel(firm.status))}</b></span>
      `;
      row.addEventListener('click',()=>openLawFirmModal(firm));
      lawFirmsTable.appendChild(row);
    }
    lawFirmsMessage.textContent=lawFirmsCache.length?'':'No law firms added yet.';
  }catch(error){
    lawFirmsMessage.textContent=error.message;
  }
}

function openLawFirmModal(firm=null){
  lawFirmForm.reset();
  lawFirmFormMessage.textContent='';
  lawFirmModalTitle.textContent=firm?'Edit Law Firm':'Add Law Firm';
  document.getElementById('lawFirmId').value=firm?.id||'';
  if(firm){
    for(const [key,value] of Object.entries(firm)){
      const field=lawFirmForm.elements.namedItem(key);
      if(field) field.value=value??'';
    }
  }else{
    lawFirmForm.elements.namedItem('status').value='active';
    lawFirmForm.elements.namedItem('max_daily_leads').value='10';
  }
  lawFirmModal.classList.add('open');
  lawFirmModal.setAttribute('aria-hidden','false');
}

function closeLawFirmModal(){
  lawFirmModal.classList.remove('open');
  lawFirmModal.setAttribute('aria-hidden','true');
}

document.querySelectorAll('[data-close-firm-modal]').forEach(el=>el.addEventListener('click',closeLawFirmModal));
if(addLawFirmBtn) addLawFirmBtn.addEventListener('click',()=>openLawFirmModal());
if(refreshLawFirmsBtn) refreshLawFirmsBtn.addEventListener('click',loadLawFirms);
if(lawFirmsTab){
  lawFirmsTab.addEventListener('click',()=>{
    document.querySelectorAll('.sidebar nav button').forEach(b=>b.classList.remove('active'));
    lawFirmsTab.classList.add('active');
    showLawFirmsView();
    loadLawFirms();
  });
}

if(lawFirmForm){
  lawFirmForm.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const payload=Object.fromEntries(new FormData(lawFirmForm).entries());
    const id=payload.id;
    delete payload.id;
    payload.max_daily_leads=Number(payload.max_daily_leads||0);
    lawFirmFormMessage.textContent='Saving…';
    try{
      await api(id?`/api/law-firms/${encodeURIComponent(id)}`:'/api/law-firms',{
        method:id?'PATCH':'POST',
        body:JSON.stringify(payload)
      });
      lawFirmFormMessage.textContent='Law firm saved.';
      await loadLawFirms();
      setTimeout(closeLawFirmModal,450);
    }catch(error){
      lawFirmFormMessage.textContent=error.message;
    }
  });
}

// Start only after every dashboard section constant and handler has been initialized.
// This prevents an intermittent initialization crash that can leave the counters at zero.
if(token()){
  showDashboard();
  showLeadView('All Leads');
  Promise.all([loadLeads(),loadAutoAssignmentSetting()]);
}else{
  showLogin();
}
