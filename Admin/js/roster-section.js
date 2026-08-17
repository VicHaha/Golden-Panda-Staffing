// ============================================================
// Roster — merged top-level tab combining what used to be two
// separate bottom-nav tabs (Promoters, Schedule) into one, with
// two pages switched by the top toggle (like flipping between
// sheets in a spreadsheet):
//   1. Schedule          — jobs.js's renderSchedule()
//   2. Promoter Details  — promoter.js's renderPromoters()
// Both pages stay fully editable (unlike the read-only Schedule/
// Promoter Details pages inside the Shift Report tab) — the FAB
// still adds a job or a promoter depending on which page is open.
// ============================================================

let rosterPage = 'schedule'; // 'schedule' | 'promoters'

const ROSTER_PAGES = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'promoters', label: 'Promoter Details' }
];

function renderRosterSection(){
  let html = `
    <div class="period-toggle" id="roster-page-toggle">
      ${ROSTER_PAGES.map(p=>`
        <button type="button" class="period-btn ${rosterPage===p.key?'active':''}" data-roster-page="${p.key}" aria-pressed="${rosterPage===p.key}">${p.label}</button>
      `).join('')}
    </div>
  `;

  html += rosterPage === 'schedule' ? renderSchedule() : renderPromoters();

  return html;
}

function wireRosterSectionControls(){
  document.querySelectorAll('#roster-page-toggle .period-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      rosterPage = btn.dataset.rosterPage;
      render();
    });
  });
}
