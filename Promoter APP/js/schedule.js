// ============================================================
// Schedule — read-only list of the shifts THIS promoter is working. Only
// their own cards are shown (no one else's, no open dates); a shift
// tomorrow is highlighted with a "Tomorrow" tag, today's with "Today".
// No add/edit/delete here — that stays in the office app.
// ============================================================

let scheduleShowMore = false;

function renderSchedule(){
  let html = renderMyMonthPay();

  const myJobs = jobs.filter(j => j.promoter_id === currentPromoterId);
  if(myJobs.length===0){
    return html + emptyState('🗓️','No shifts scheduled for you yet','Check back once the office assigns your shifts.');
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const windowEnd = new Date(today); windowEnd.setDate(windowEnd.getDate() + 28);
  const windowEndStr = localDateStr(windowEnd);
  const now = new Date();

  function hasEnded(j){
    const end = new Date(j.work_date + 'T' + (j.end_time || '23:59'));
    return end < now;
  }

  const nearJobs = myJobs.filter(j => !hasEnded(j) && j.work_date <= windowEndStr);
  const pastJobs = myJobs.filter(j => hasEnded(j));
  const futureJobs = myJobs.filter(j => !hasEnded(j) && j.work_date > windowEndStr);
  const otherJobs = [...pastJobs, ...futureJobs];

  html += `<div class="section-title">My upcoming shifts <span class="count-pill">${nearJobs.length}</span></div>`;

  if(nearJobs.length === 0){
    html += emptyState('🗓️','Nothing in the next 4 weeks','Check "earlier & later jobs" below.');
  }else{
    html += renderJobList(nearJobs);
  }

  if(otherJobs.length > 0){
    html += `
      <button class="btn btn-ghost btn-block" style="margin-top:14px;" onclick="toggleScheduleMore()">
        ${scheduleShowMore ? 'Hide' : 'Show'} earlier &amp; later jobs (${otherJobs.length})
      </button>
    `;
    if(scheduleShowMore){
      html += `<div class="day-group-label" style="margin-top:18px;">Outside the next 4 weeks</div>`;
      html += renderJobList(pastJobs, 'desc');
      html += renderJobList(futureJobs, 'asc');
    }
  }

  return html;
}

// This promoter's own pay for the current calendar month — a private
// total shown only to them, never derived from the shared job cards
// below (which never carry pay/commission for anyone).
function renderMyMonthPay(){
  if(!myMonthPay){
    return `<div class="summary-strip"><div class="stat-card"><div class="num">—</div><div class="lbl">Total pay</div></div></div>`;
  }
  const total = myMonthPay.pay + myMonthPay.commission;
  let html = `<div class="summary-strip">`;
  html += `<div class="stat-card"><div class="num">RM ${total.toFixed(2)}</div><div class="lbl">Total pay</div></div>`;
  html += `<div class="stat-card"><div class="num">${myMonthPay.count}</div><div class="lbl">Total shifts</div></div>`;
  html += `</div>`;
  return html;
}

function renderJobList(list, sortDir){
  sortDir = sortDir || 'asc';
  const sorted = [...list].sort((a,b)=> sortDir === 'desc'
    ? b.work_date.localeCompare(a.work_date)
    : a.work_date.localeCompare(b.work_date));
  let lastDate = null;
  let html = '';
  sorted.forEach(j=>{
    if(j.work_date !== lastDate){
      html += `<div class="day-group-label">${formatDateLong(j.work_date)}</div>`;
      lastDate = j.work_date;
    }
    const isTomorrow = j.work_date === tomorrowStr();
    const isToday = j.work_date === todayStr();
    const storeName = j.stores ? j.stores.name : '(store removed)';
    const start = shortTime(j.start_time), end = shortTime(j.end_time);
    const d = new Date(j.work_date+'T00:00:00');
    const hrs = timeDiffHours(start, end);
    const position = j.position || 'Promoter';

    html += `
      <div class="job-card ${isTomorrow?'tomorrow-schedule-job':''}">
        <div class="job-date">
          <div class="dow">${d.toLocaleDateString('en-GB',{weekday:'short'})}</div>
          <div class="dom">${d.getDate()}</div>
          <div class="mon">${d.toLocaleDateString('en-GB',{month:'short'})}</div>
        </div>
        <div class="job-body">
          <div class="job-store">${esc(storeName)}${isTomorrow?' <span class="tomorrow-highlight-pill">Tomorrow</span>':isToday?' <span class="tomorrow-highlight-pill today-pill">Today</span>':''}</div>
          <span class="job-position job-position-${position.toLowerCase()}">${esc(position)}</span>
        </div>
        <div class="job-side"><b>${start}–${end}</b><small>${hrs} hours</small></div>
      </div>
    `;
  });
  return html;
}

function toggleScheduleMore(){
  scheduleShowMore = !scheduleShowMore;
  render();
}
