// ============================================================
// Admin schedule reminders
// Sends one device notification when there are jobs scheduled tomorrow.
// Browser permission must be granted by the admin from the Schedule screen.
// ============================================================

const JOB_REMINDER_STORAGE_KEY = 'gp_admin_tomorrow_schedule_reminders_v1';
let jobReminderTimer = null;
let openedTomorrowSchedule = new URLSearchParams(window.location.search).get('tomorrowSchedule') === '1';
let highlightTomorrowSchedule = false;

function supportsJobNotifications(){
  return 'Notification' in window && 'serviceWorker' in navigator;
}

function jobNotificationPermission(){
  return supportsJobNotifications() ? Notification.permission : 'unsupported';
}

function reminderDateKey(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function tomorrowDateKey(){
  const tomorrow = new Date();
  tomorrow.setHours(0,0,0,0);
  tomorrow.setDate(tomorrow.getDate()+1);
  return reminderDateKey(tomorrow);
}

function readSentJobReminders(){
  try{
    const value = JSON.parse(localStorage.getItem(JOB_REMINDER_STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  }catch(e){
    return {};
  }
}

function writeSentJobReminders(sent){
  // Keep only recent entries so local storage never grows without bound.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate()-7);
  const cutoffKey = reminderDateKey(cutoff);
  Object.keys(sent).forEach(key=>{ if(sent[key] < cutoffKey) delete sent[key]; });
  localStorage.setItem(JOB_REMINDER_STORAGE_KEY, JSON.stringify(sent));
}

async function showTomorrowScheduleReminder(workDate){
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification("Tomorrow's working schedule", {
    body: "Tap to view tomorrow's schedule",
    icon: 'assets/icon-192.png',
    badge: 'assets/icon-192.png',
    tag: `gp-tomorrow-schedule-${workDate}`,
    renotify: false,
    data: { url: './index.html?tomorrowSchedule=1' }
  });
}

async function checkJobReminders(){
  if(jobNotificationPermission() !== 'granted' || !Array.isArray(jobs)) return;
  const targetDate = tomorrowDateKey();
  const dueJobs = jobs.filter(job=>job.work_date === targetDate);
  if(!dueJobs.length) return;

  const sent = readSentJobReminders();
  if(sent[targetDate]) return;
  try{
    await showTomorrowScheduleReminder(targetDate);
    sent[targetDate] = reminderDateKey(new Date());
    writeSentJobReminders(sent);
  }catch(e){
    console.warn('Could not show tomorrow schedule reminder:', e);
  }
}

async function enableJobNotifications(){
  if(!supportsJobNotifications()){
    showToast('Notifications are not supported on this browser');
    return;
  }
  try{
    const permission = await Notification.requestPermission();
    if(permission === 'granted'){
      showToast('Schedule reminders enabled');
      await checkJobReminders();
    }else{
      showToast('Notifications were not enabled');
    }
  }catch(e){
    console.error(e);
    showToast('Could not enable notifications');
  }
}

// Called directly from the admin's tap on the Schedule tab so the browser
// is allowed to show its native permission prompt. Browsers remember the
// answer, so this only prompts the first time.
function requestJobNotificationsFromScheduleTap(){
  if(jobNotificationPermission() === 'default') enableJobNotifications();
}

function openTappedScheduleReminder(){
  if(!openedTomorrowSchedule) return false;
  if(typeof rosterPage !== 'undefined') rosterPage = 'schedule';
  highlightTomorrowSchedule = true;
  history.replaceState({}, document.title, `${location.pathname}${location.hash}`);
  openedTomorrowSchedule = false;
  return true;
}

function isTomorrowScheduleHighlighted(workDate){
  return highlightTomorrowSchedule && workDate === tomorrowDateKey();
}

function startJobReminderChecks(){
  if(jobReminderTimer) clearInterval(jobReminderTimer);
  checkJobReminders();
  jobReminderTimer = setInterval(checkJobReminders, 30 * 60 * 1000);
}

document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible') checkJobReminders();
});
