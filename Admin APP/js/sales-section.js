// ============================================================
// Sales Section — one table per outlet for the chosen day, SKU | Sales
// with a − 1 + stepper, free items in a separate "Given out" table, and an
// Undo button that reverses your last tap.
//
// Only TODAY can be changed with the stepper; earlier days are viewable
// but locked (🔒). Every tap also writes a row to sales_log; that log is
// what Undo steps back through.
//
// This file is identical in the admin and promoter apps. Each app's app.js
// supplies three small hooks:
//   salesActorName()        who is tapping (admin name / promoter name)
//   salesActorPromoterId()  promoter id for the log row (null for admin)
//   canEditPastSales()      whether past days can be edited via the form
// ============================================================

let salesViewDate = null; // null = today (so a tab left open overnight rolls over)
let salesLog = [];
let salesPhotosOpen = false;   // keeps the Photos & notes panel open across redraws        // sales_log rows for the day being viewed, newest first

function salesViewDateValue(){ return salesViewDate || todayStr(); }

// The day the Sales Section actually shows. Normally the day picked (today by
// default); but when today is not a working date it falls back to the most
// recent working day, so there is always one previous record to look at.
function salesEffectiveViewDate(){
  const date = salesViewDateValue();
  const today = todayStr();
  if(date === today && !scheduledStoreIdsForDate(today).size){
    const previous = previousWorkingDate();
    if(previous) return previous;
  }
  return date;
}

function salesDateOptions(){
  const today = todayStr();
  const dates = new Set(salesReports.map(r=>r.work_date));
  // Admin app: every day with records, plus today when it is a working date.
  // Promoter app: the days that promoter worked.
  if(isPromoterApp()){
    jobs.forEach(job=>{ if(jobCountsForSchedule(job) && job.work_date <= today) dates.add(job.work_date); });
    return [...dates].filter(d=>scheduledStoreIdsForDate(d).size).sort((a,b)=>b.localeCompare(a));
  }
  if(scheduledStoreIdsForDate(today).size) dates.add(today);
  return [...dates].sort((a,b)=>b.localeCompare(a));
}

async function setSalesViewDate(value){
  salesViewDate = value === todayStr() ? null : value;
  try{
    salesLog = await DB.getSalesLogForDate(salesEffectiveViewDate());
  }catch(e){
    console.warn('Could not load sales history (non-fatal):', e);
    salesLog = [];
  }
  render();
}

// The day-notes box (admin app) is a plain textarea inside the page, so a
// redraw would wipe a half-typed note. render() saves and restores it.
function captureNotesDraft(){
  const drafts = [];
  document.querySelectorAll('.day-feedback-block textarea').forEach(textarea=>{
    const saveButton = document.getElementById(textarea.id.replace('day-feedback-','day-feedback-save-'));
    if(saveButton && saveButton.style.display !== 'none') drafts.push({ id: textarea.id, value: textarea.value }); // unsaved only
  });
  return drafts.length ? drafts : null;
}
function restoreNotesDraft(drafts){
  (drafts || []).forEach(draft=>{
    const textarea = document.getElementById(draft.id);
    if(!textarea) return;
    textarea.value = draft.value;
    const saveButton = document.getElementById(draft.id.replace('day-feedback-','day-feedback-save-'));
    if(saveButton) saveButton.style.display = '';
  });
}

// Small product photo (one per product type), shown beside the product name.
function productThumb(name){
  const url = productPhotoFor(name);
  if(!url) return '';
  const label = esc(productFamilyName(name));
  return `<button type="button" class="ss-thumb" onclick="openPhotoLightbox('${esc(url)}','${label}')" aria-label="View photo of ${label}"><img src="${esc(url)}" alt=""></button>`;
}

// Row controls: the − n + stepper (or the plain number when locked).
function salesRowControl(row, steppable){
  const qty = Number(row.sales_qty||0);
  const full = esc(canonicalSkuName(row.product_name));
  return steppable
    ? `<span class="sales-qty-adjust sx-step">
        <button type="button" onclick="adjustSalesQuantity(event,'${row.id}',-1)" aria-label="Minus one ${full}">−</button>
        <b class="sales-table-number">${qty}</b>
        <button type="button" onclick="adjustSalesQuantity(event,'${row.id}',1)" aria-label="Add one ${full}">+</button>
      </span>`
    : `<span class="ss-locked sx-qty"><b class="sales-table-number">${qty}</b></span>`;
}

// The tappable (admin / today) or plain name of a SKU row.
function salesSkuLabel(row, text, canTapRow, cls){
  const full = esc(canonicalSkuName(row.product_name));
  return canTapRow
    ? `<button type="button" class="sx-label ${cls||''}" onclick="openSalesForm('${row.id}')" aria-label="Edit ${full}">${text}</button>`
    : `<span class="sx-label ${cls||''}">${text}</span>`;
}

// Sold SKUs: one block per product — photo and name on top, then one big,
// easy-to-tap row per variation (name left, − n + right).
// Free items ("Given out"): name with its opening / closing, then the stepper.
function renderSalesTable(rows, title, isToday, canTapRow){
  if(title !== 'SKU'){
    const body = rows.map(row=>{
      const variance = Number(row.opening_qty||0) - Number(row.closing_qty||0) - Number(row.sales_qty||0);
      const varianceNote = variance !== 0 ? `<span class="ss-variance-note">Variance ${variance > 0 ? '+' : '−'}${Math.abs(variance)}</span>` : '';
      const field = (key, label, value) => canTapRow
        ? `<label class="sx-go-field"><span>${label}</span><input type="number" inputmode="numeric" min="0" step="1" id="go-${key}-${row.id}" value="${value}" onchange="saveGivenOutField('${row.id}','${key}')" onfocus="this.select()"></label>`
        : `<div class="sx-go-field"><span>${label}</span><b>${value}</b></div>`;
      return `<div class="sx-free">
        <div class="sx-free-main">
          ${productThumb(row.product_name)}
          <div class="sx-free-text">
            ${salesSkuLabel(row, esc(canonicalSkuName(row.product_name)), canTapRow, 'sx-free-name')}
            <span class="sx-free-meta" id="go-note-${row.id}">${varianceNote}</span>
          </div>
        </div>
        <div class="sx-go-grid">
          ${field('open','Opening',Number(row.opening_qty||0))}
          ${field('close','Closing',Number(row.closing_qty||0))}
          ${field('given','Given out',Number(row.sales_qty||0))}
        </div>
      </div>`;
    }).join('');
    return `<div class="sx-section"><div class="sx-section-title">Given out</div>${body}</div>`;
  }
  const groups = [];
  rows.forEach(row=>{
    const { base, variation } = parseProductName(canonicalSkuName(row.product_name));
    let group = groups.find(g=>g.base.toLowerCase() === base.toLowerCase());
    if(!group){ group = { base, items: [] }; groups.push(group); }
    group.items.push({ row, variation });
  });
  return `<div class="sx-section">` + groups.map(group=>{
    const thumb = productThumb(group.items[0].row.product_name);
    const sum = group.items.reduce((acc,item)=>acc + Number(item.row.sales_qty||0), 0);
    if(group.items.length === 1 && !group.items[0].variation){
      const item = group.items[0];
      return `<div class="sx-product sx-single">
        <div class="sx-product-head">${thumb}${salesSkuLabel(item.row, esc(group.base), canTapRow, 'sx-product-name')}${salesRowControl(item.row, isToday)}</div>
      </div>`;
    }
    const variationRows = group.items.map(item=>`<div class="sx-var">${salesSkuLabel(item.row, esc(item.variation || '—'), canTapRow)}${salesRowControl(item.row, isToday)}</div>`).join('');
    return `<div class="sx-product">
      <div class="sx-product-head">${thumb}<span class="sx-product-name">${esc(group.base)}</span><span class="sx-product-sum">${sum} sold</span></div>
      <div class="sx-vars">${variationRows}</div>
    </div>`;
  }).join('') + `</div>`;
}

function renderSalesOutlet(group, isToday, canTapRow, date){
  const sorted = [...group.items].sort((a,b)=>skuOrderIndex(a)-skuOrderIndex(b));
  const sold = sorted.filter(r=>!isFreeItem(r));
  const given = sorted.filter(r=>isFreeItem(r));
  const total = sold.reduce((acc,r)=>acc + Number(r.sales_qty||0), 0);
  const storeKey = group.key === '__none__' ? null : group.key;
  return `<section class="panel sx-outlet">
    <header class="sx-outlet-head"><h2>${esc(group.label)}</h2><span class="sx-total"><b>${total}</b> sold</span></header>
    ${sold.length ? renderSalesTable(sold,'SKU',isToday,canTapRow) : ''}
    ${given.length ? renderSalesTable(given,'Item',isToday,canTapRow) : ''}
  </section>
  <section class="panel sx-outlet sx-extras-card">
    <header class="sx-outlet-head"><h2>Photos &amp; notes</h2><span class="sx-total">${esc(group.label)}</span></header>
    <div class="sx-extras">
      ${typeof renderDayPhotoRow === 'function' ? renderDayPhotoRow(date, storeKey) : ''}
      ${typeof renderDayFeedbackRow === 'function' ? renderDayFeedbackRow(date, storeKey) : ''}
    </div>
  </section>`;
}

// Given-out items: Opening, Closing and Given out sit in one row and work each
// other out once there is an opening count (opening = closing + given out).
//   closing typed  → given out = opening − closing
//   given out typed → closing  = opening − given out
//   opening typed   → closing  = opening − given out
async function saveGivenOutField(id, changed){
  const row = salesReports.find(r=>r.id===id);
  if(!row) return;
  const box = key => document.getElementById(`go-${key}-${id}`);
  const num = key => Math.max(0, Math.floor(parseFloat(box(key).value) || 0));
  let opening = num('open'), closing = num('close'), given = num('given');
  if(opening > 0){
    if(changed === 'close'){ closing = Math.min(closing, opening); given = opening - closing; }
    else if(changed === 'given'){ given = Math.min(given, opening); closing = opening - given; }
    else { given = Math.min(given, opening); closing = opening - given; }
  }
  box('open').value = opening; box('close').value = closing; box('given').value = given;
  const note = document.getElementById(`go-note-${id}`);
  const variance = opening - closing - given;
  if(note) note.innerHTML = variance !== 0 ? `<span class="ss-variance-note">Variance ${variance > 0 ? '+' : '−'}${Math.abs(variance)}</span>` : '';
  try{
    await DB.updateSalesReport(id, { opening_qty:opening, closing_qty:closing, sales_qty:given, ...stockRecordAttribution() });
    row.opening_qty = opening; row.closing_qty = closing; row.sales_qty = given;
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
  }
}

// The last +/- tap made today by THIS person (newest first in salesLog), if any.
function lastUndoableSalesEntry(){
  const name = salesActorName(), promoterId = salesActorPromoterId();
  return salesLog.find(e=>e.work_date === salesEffectiveViewDate() && (promoterId ? e.promoter_id === promoterId : (e.admin_name === name && !e.promoter_id))) || null;
}

// Undo: reverse the last tap and remove its log entry, so tapping Undo again
// steps back through your earlier taps one by one.
async function undoLastSalesChange(){
  const entry = lastUndoableSalesEntry();
  if(!entry){ showToast('Nothing to undo'); return; }
  const row = salesReports.find(r=>
    r.work_date === entry.work_date
    && (r.store_id||null) === (entry.store_id||null)
    && canonicalSkuName(r.product_name) === canonicalSkuName(entry.product_name)
  );
  const button = document.getElementById('sales-undo-btn');
  if(button) button.disabled = true;
  try{
    if(row){
      const next = Math.max(0, Number(row.sales_qty||0) - Number(entry.delta||0));
      await DB.updateSalesReport(row.id, { sales_qty: next });
      row.sales_qty = next;
    }
    await DB.deleteSalesLog(entry.id);
    salesLog = salesLog.filter(e=>e.id !== entry.id);
    render();
    showToast(`Undid ${Number(entry.delta)>0?'+':'−'}${Math.abs(entry.delta)} · ${canonicalSkuName(entry.product_name)}`);
  }catch(e){
    console.error(e);
    showToast('Could not undo — ' + (e.message || 'check your connection'));
    if(button) button.disabled = false;
  }
}

function renderSalesSection(){
  const today = todayStr();
  const date = salesEffectiveViewDate();
  const isToday = date === today;
  // Fell back to the previous working day because today isn't one.
  const idle = !isToday && salesViewDateValue() === today;
  // Admin app: everything is editable. Promoter app: only today.
  // The − / + buttons (and Undo) exist for TODAY only. On earlier days the numbers are
  // plain; the admin changes them from the SKU's edit form (tap the SKU name).
  const canEdit = isToday || canEditPastSales();   // can open the edit form
  const dates = salesDateOptions();
  // Today (and everything in the promoter app) only shows scheduled outlets; the admin app's earlier days show everything logged.
  const scheduled = (isToday || isPromoterApp()) ? scheduledStoreIdsForDate(date) : null;
  const rows = salesReports.filter(r=>r.work_date===date && (!scheduled || scheduled.has(r.store_id)));
  const outlets = groupByOutlet(rows).sort((a,b)=>a.label.localeCompare(b.label));

  // Not a working date and no earlier working day: just the message.
  if(isToday && !scheduled.size){
    return `<div class="section-title">Sales Report</div>` + emptyState('','Today is not a working date','Sales appear here on days you are scheduled.');
  }

  const dateRow = `<div class="ss-date-row">
      <label class="ss-date-label" for="sales-date-select">Date</label>
      <select id="sales-date-select" onchange="setSalesViewDate(this.value)">
        ${dates.includes(date) ? '' : `<option value="${date}" selected>${formatDateShort(date)}</option>`}
        ${dates.map(d=>`<option value="${d}" ${d===date?'selected':''}>${d===today?'Today · ':(canEditPastSales()?'':'')}${formatDateShort(d)}</option>`).join('')}
      </select>
      ${isToday ? `<button type="button" class="btn btn-ghost btn-sm" id="sales-undo-btn" onclick="undoLastSalesChange()" ${lastUndoableSalesEntry()?'':'disabled'} title="Undo your last + or −">Undo</button>` : ''}
    </div>`;
  // Promoter app on a non-working day: just the previous record, with its date.
  let html = `<div class="section-title">Sales Report</div>` + (idle && isPromoterApp() ? `<div class="ss-prev-date">${formatDateShort(date)}</div>` : dateRow);

  if(!rows.length){
    html += emptyState('', isToday ? 'No sales to log yet today' : 'No sales recorded for this day', isToday ? 'Add SKUs in Stock Management and they appear here.' : 'Pick another date above.');
    return html;
  }else{
    salesFirstOutletId = (outlets.find(g=>g.key !== '__none__') || {}).key || null;
    html += outlets.map(group=>renderSalesOutlet(group,isToday,canEdit,date)).join('');
  }

  return html;
}

// Tap on − / +. Updates today's sales_qty on the existing row and appends one
// sales_log entry (including decreases).
async function adjustSalesQuantity(event, id, delta){
  event.stopPropagation();
  const row = salesReports.find(item=>item.id===id);
  if(!row || row.work_date !== todayStr()) return;
  const prev = Number(row.sales_qty||0);
  const next = Math.max(0, prev + delta);
  if(next === prev) return;
  const control = event.currentTarget.closest('.sales-qty-adjust');
  const buttons = control ? [...control.querySelectorAll('button')] : [];
  buttons.forEach(button=>button.disabled = true);
  try{
    await DB.updateSalesReport(id, { sales_qty: next, ...stockRecordAttribution() });
    row.sales_qty = next;
    try{
      const entry = await DB.addSalesLog({
        work_date: row.work_date,
        store_id: row.store_id || null,
        product_name: canonicalSkuName(row.product_name),
        delta: next - prev,
        admin_name: salesActorName(),
        promoter_id: salesActorPromoterId()
      });
      if(entry.work_date === salesEffectiveViewDate()) salesLog.unshift(entry);
    }catch(logError){
      console.error(logError);
      showToast('Saved, but the history entry could not be logged');
    }
    render();
  }catch(e){
    console.error(e);
    showToast('Could not update quantity — ' + (e.message || 'check your connection'));
    buttons.forEach(button=>button.disabled = false);
  }
}
