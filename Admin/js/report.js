// ============================================================
// Reports — monthly pay summary per promoter, Excel export
// ============================================================

function renderReports(){
  const monthJobs = jobs.filter(j=>j.work_date.startsWith(reportMonth));
  const byPromoter = {};
  monthJobs.forEach(j=>{
    if(!byPromoter[j.promoter_id]) byPromoter[j.promoter_id] = {pay:0, commission:0, dates:new Set()};
    byPromoter[j.promoter_id].pay += Number(j.pay||0);
    byPromoter[j.promoter_id].commission += Number(j.commission||0);
    byPromoter[j.promoter_id].dates.add(j.work_date);
  });
  const rows = Object.entries(byPromoter).map(([pid, agg])=>{
    const p = promoters.find(x=>x.id===pid);
    return {
      name: p?p.full_name:'(removed promoter)', ic: p?p.ic_number:'',
      pay: agg.pay, commission: agg.commission, count: agg.dates.size,
      total: agg.pay+agg.commission
    };
  }).sort((a,b)=>b.total-a.total);

  const distinctDays = new Set(monthJobs.map(j=>j.work_date)).size;
  const grandTotal = rows.reduce((s,r)=>s+r.total,0);
  const monthLabel = new Date(reportMonth+'-01').toLocaleDateString('en-GB',{month:'long', year:'numeric'});

  let html = `
    <div class="section-title">Monthly pay report</div>
    <div class="month-picker-row">
      <input id="month-input" type="month" value="${reportMonth}">
      <button class="btn btn-gold" id="export-btn">Export .xlsx</button>
    </div>
    <div class="summary-strip">
      <div class="stat-card"><div class="num">${rows.length}</div><div class="lbl">Promoters paid</div></div>
      <div class="stat-card"><div class="num">${distinctDays}</div><div class="lbl">Roadshow days</div></div>
      <div class="stat-card"><div class="num">RM ${grandTotal.toFixed(0)}</div><div class="lbl">Total payout</div></div>
    </div>
  `;
  if(rows.length===0){
    html += emptyState('📊', `No jobs in ${monthLabel}`, 'Pick a different month or add jobs in Schedule.');
  }else{
    html += `<div class="section-title" style="margin-top:2px;">${monthLabel}</div>`;
    rows.forEach(r=>{
      html += `
        <div class="report-row">
          <div>
            <div class="rname">${esc(r.name)}</div>
            <div class="rsub">${r.count} day${r.count>1?'s':''} · pay RM${r.pay.toFixed(2)}${r.commission?` + comm RM${r.commission.toFixed(2)}`:''}</div>
          </div>
          <div class="rtotal"><span class="cur">RM</span> ${r.total.toFixed(2)}</div>
        </div>
      `;
    });
  }
  return html;
}

function wireReportControls(){
  const mi = document.getElementById('month-input');
  if(mi) mi.addEventListener('change', e=>{ reportMonth = e.target.value; render(); });
  const eb = document.getElementById('export-btn');
  if(eb) eb.addEventListener('click', exportExcel);
}

function exportExcel(){
  const monthJobs = jobs.filter(j=>j.work_date.startsWith(reportMonth));
  if(monthJobs.length===0){ showToast('No jobs to export for this month'); return; }
  const byPromoter = {};
  monthJobs.forEach(j=>{
    if(!byPromoter[j.promoter_id]) byPromoter[j.promoter_id] = {pay:0, commission:0, dates:new Set()};
    byPromoter[j.promoter_id].pay += Number(j.pay||0);
    byPromoter[j.promoter_id].commission += Number(j.commission||0);
    byPromoter[j.promoter_id].dates.add(j.work_date);
  });
  const rows = Object.entries(byPromoter).map(([pid, agg])=>{
    const p = promoters.find(x=>x.id===pid);
    return {
      'Name': p?p.full_name:'(removed promoter)',
      'IC Number': p?p.ic_number||'':'',
      'Bank Name': p?p.bank_name||'':'',
      'Bank Account': p?p.bank_account||'':'',
      'Roadshow Days': agg.dates.size,
      'Total Pay (RM)': Number(agg.pay.toFixed(2)),
      'Total Commission (RM)': Number(agg.commission.toFixed(2)),
      'Total Payout (RM)': Number((agg.pay+agg.commission).toFixed(2))
    };
  }).sort((a,b)=>b['Total Payout (RM)']-a['Total Payout (RM)']);

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:24},{wch:16},{wch:16},{wch:16},{wch:14},{wch:15},{wch:20},{wch:17}];

  // Sheet 2 — one row per shift, grouped by crew and then date. This is
  // the audit trail behind the monthly payout totals in Sheet 1.
  const workingDetails = [...monthJobs]
    .sort((a,b)=>{
      const ap = promoters.find(p=>p.id===a.promoter_id);
      const bp = promoters.find(p=>p.id===b.promoter_id);
      const an = ap ? ap.full_name : '(removed promoter)';
      const bn = bp ? bp.full_name : '(removed promoter)';
      return an.localeCompare(bn) || a.work_date.localeCompare(b.work_date) || shortTime(a.start_time).localeCompare(shortTime(b.start_time));
    })
    .map(j=>{
      const p = promoters.find(x=>x.id===j.promoter_id);
      return {
        'Crew Name': p ? p.full_name : '(removed promoter)',
        'Date': new Date(j.work_date+'T00:00:00'),
        'Start Time': shortTime(j.start_time),
        'End Time': shortTime(j.end_time),
        'Hours Worked': Number(timeDiffHours(j.start_time,j.end_time)),
        'Location': j.stores ? j.stores.name : '(not specified)',
        'Position': j.position || 'Promoter'
      };
    });
  const detailsWs = XLSX.utils.json_to_sheet(workingDetails);
  detailsWs['!cols'] = [{wch:24},{wch:13},{wch:12},{wch:12},{wch:14},{wch:24},{wch:14}];
  for(let row=2; row<=workingDetails.length+1; row++){
    if(detailsWs['B'+row]) detailsWs['B'+row].z = 'dd/mm/yyyy';
    if(detailsWs['E'+row]) detailsWs['E'+row].z = '0.0';
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Pay');
  XLSX.utils.book_append_sheet(wb, detailsWs, 'Working Details');
  XLSX.writeFile(wb, `Golden_Panda_Pay_${reportMonth}.xlsx`);
  showToast('Excel file downloaded');
}
