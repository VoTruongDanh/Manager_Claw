const { ipcRenderer } = require('electron');
const ui = require('../ui');

let schedules = [];
let selectedHour = 12;
let selectedMinute = 0;
let selectedType = 'once';
let selectedSound = 'default';
let currentStep = 1;
let isInitialized = false;

function init() {
  if (isInitialized) {
    console.log('Scheduler already initialized, skipping init');
    return;
  }
  
  try {
    console.log('Scheduler init called, schedules.length:', schedules.length);
    bindForm();
    bindClock();
    bindSteps();
    bindRepeatOptions();
    bindSoundOptions();
    updateClockHands();
    updateStepDisplay();
    isInitialized = true;
  } catch (error) {
    console.error('Scheduler init error:', error);
  }
}

function render() {
  console.log('Scheduler render called, schedules.length:', schedules.length);
  renderSchedules();
}

function bindForm() {
  const saveBtn = ui.$('save-schedule');
  const clearBtn = ui.$('clear-schedule-form');
  
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSchedule);
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', clearForm);
  }
}

function bindClock() {
  // Click on clock numbers to set hour
  const clockNumbers = document.querySelectorAll('.clock-number');
  if (clockNumbers.length > 0) {
    clockNumbers.forEach(num => {
      num.addEventListener('click', (e) => {
        e.stopPropagation();
        const hour = parseInt(num.dataset.hour);
        selectedHour = hour;
        updateClockHands();
        updateStepDisplay();
        // Auto advance to step 2
        setTimeout(() => goToStep(2), 300);
      });
    });
  }

  // Click on clock face to set minutes
  const clockFace = document.querySelector('.clock-face');
  if (!clockFace) return;
  
  let isDragging = false;

  clockFace.addEventListener('click', (e) => {
    if (e.target.classList.contains('clock-number')) return;
    updateMinutesFromMouse(e);
  });

  clockFace.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('clock-number')) return;
    isDragging = true;
    updateMinutesFromMouse(e);
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      updateMinutesFromMouse(e);
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

function updateMinutesFromMouse(e) {
  const clockFace = document.querySelector('.clock-face');
  if (!clockFace) return;
  
  const rect = clockFace.getBoundingClientRect();
  if (!rect) return;
  
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
  let degrees = angle * (180 / Math.PI);
  degrees = (degrees + 90 + 360) % 360;
  
  selectedMinute = Math.round(degrees / 6);
  if (selectedMinute >= 60) selectedMinute = 0;
  
  updateClockHands();
  updateTimeDisplay();
}

function updateClockHands() {
  const hourHand = document.getElementById('clock-hour');
  const minuteHand = document.getElementById('clock-minute');
  
  if (hourHand) {
    const hourAngle = (selectedHour % 12) * 30 + (selectedMinute / 60) * 30;
    hourHand.style.transform = `rotate(${hourAngle}deg)`;
  }
  
  if (minuteHand) {
    const minuteAngle = selectedMinute * 6;
    minuteHand.style.transform = `rotate(${minuteAngle}deg)`;
  }
}

function updateTimeDisplay() {
  const timeDisplay = document.getElementById('selected-time');
  if (timeDisplay) {
    const hourStr = selectedHour.toString().padStart(2, '0');
    const minuteStr = selectedMinute.toString().padStart(2, '0');
    timeDisplay.textContent = `${hourStr}:${minuteStr}`;
  }
}

function bindRepeatOptions() {
  const repeatBtns = document.querySelectorAll('.repeat-btn');
  if (repeatBtns.length === 0) return;
  
  repeatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      repeatBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.type;
      
      // Show/hide relevant groups
      const dateGroup = ui.$('date-group');
      const daysGroup = ui.$('days-group');
      
      if (dateGroup) dateGroup.style.display = 'none';
      if (daysGroup) daysGroup.style.display = 'none';
      
      if (selectedType === 'once' && dateGroup) {
        dateGroup.style.display = 'block';
      } else if (selectedType === 'weekly' && daysGroup) {
        daysGroup.style.display = 'block';
      }
    });
  });
}

function bindSoundOptions() {
  const soundBtns = document.querySelectorAll('.sound-btn');
  if (soundBtns.length === 0) return;
  
  soundBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      soundBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSound = btn.dataset.sound;
    });
  });
}

function bindTimeControls() {
  // Time buttons (+/-)
  const timeBtns = document.querySelectorAll('.time-btn');
  timeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const unit = btn.dataset.unit;
      const isPlus = btn.classList.contains('time-plus');
      
      if (unit === 'hour') {
        if (isPlus) {
          selectedHour = selectedHour >= 12 ? 1 : selectedHour + 1;
        } else {
          selectedHour = selectedHour <= 1 ? 12 : selectedHour - 1;
        }
      } else if (unit === 'minute') {
        if (isPlus) {
          selectedMinute = selectedMinute >= 59 ? 0 : selectedMinute + 1;
        } else {
          selectedMinute = selectedMinute <= 0 ? 59 : selectedMinute - 1;
        }
      }
      
      updateTimeInputs();
      updateClockHands();
      updateTimeDisplay();
    });
  });

  // Time inputs
  const hourInput = document.getElementById('hour-input');
  const minuteInput = document.getElementById('minute-input');
  
  if (hourInput) {
    hourInput.addEventListener('change', (e) => {
      let value = parseInt(e.target.value);
      if (value < 1) value = 1;
      if (value > 12) value = 12;
      selectedHour = value;
      e.target.value = value;
      updateClockHands();
      updateTimeDisplay();
    });
  }
  
  if (minuteInput) {
    minuteInput.addEventListener('change', (e) => {
      let value = parseInt(e.target.value);
      if (value < 0) value = 0;
      if (value > 59) value = 59;
      selectedMinute = value;
      e.target.value = value;
      updateClockHands();
      updateTimeDisplay();
    });
  }
}

function updateTimeInputs() {
  const hourInput = document.getElementById('hour-input');
  const minuteInput = document.getElementById('minute-input');
  
  if (hourInput) hourInput.value = selectedHour;
  if (minuteInput) minuteInput.value = selectedMinute;
}

function bindSteps() {
  // Next step buttons
  const nextBtns = document.querySelectorAll('.next-step-btn');
  nextBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const nextStep = parseInt(btn.dataset.next);
      goToStep(nextStep);
    });
  });

  // Previous step buttons
  const prevBtns = document.querySelectorAll('.prev-step-btn');
  prevBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const prevStep = parseInt(btn.dataset.prev);
      goToStep(prevStep);
    });
  });

  // Minute numbers click - auto advance to step 3
  const minuteNumbers = document.querySelectorAll('.minute-number');
  minuteNumbers.forEach(num => {
    num.addEventListener('click', () => {
      const minute = parseInt(num.dataset.minute);
      selectedMinute = minute;
      updateClockHands();
      updateStepDisplay();
      // Auto advance to step 3
      setTimeout(() => goToStep(3), 300);
    });
  });
}

function goToStep(step) {
  currentStep = step;
  updateStepDisplay();
}

function updateStepDisplay() {
  const steps = document.querySelectorAll('.step');
  const stepContents = document.querySelectorAll('.step-content');
  
  steps.forEach((step, index) => {
    const stepNum = index + 1;
    step.classList.remove('active', 'completed');
    if (stepNum < currentStep) {
      step.classList.add('completed');
    } else if (stepNum === currentStep) {
      step.classList.add('active');
    }
  });
  
  stepContents.forEach((content, index) => {
    const stepNum = index + 1;
    content.classList.remove('active');
    if (stepNum === currentStep) {
      content.classList.add('active');
    }
  });
  
  // Update time displays
  const hourDisplay = document.getElementById('selected-hour-display');
  const minuteDisplay = document.getElementById('selected-minute-display');
  const finalTimeDisplay = document.getElementById('final-time-display');
  
  if (hourDisplay) hourDisplay.textContent = selectedHour;
  if (minuteDisplay) minuteDisplay.textContent = selectedMinute.toString().padStart(2, '0');
  if (finalTimeDisplay) finalTimeDisplay.textContent = formatTime();
  
  // Focus on name input when entering step 4
  if (currentStep === 4) {
    const nameInput = document.getElementById('schedule-name');
    if (nameInput) {
      setTimeout(() => nameInput.focus(), 100);
    }
  }
}

function formatTime() {
  const hourStr = selectedHour.toString().padStart(2, '0');
  const minuteStr = selectedMinute.toString().padStart(2, '0');
  return `${hourStr}:${minuteStr}`;
}

function bindTypeChange() {
  // Not used in new clock-based UI - removed
}

function saveSchedule() {
  const hourStr = selectedHour.toString().padStart(2, '0');
  const minuteStr = selectedMinute.toString().padStart(2, '0');
  const timeString = `${hourStr}:${minuteStr}`;
  
  const schedule = {
    id: Date.now(),
    name: ui.$('schedule-name').value || 'Lịch không tên',
    message: ui.$('schedule-message').value || '',
    type: selectedType,
    time: timeString,
    date: ui.$('schedule-date') ? ui.$('schedule-date').value : new Date().toISOString().split('T')[0],
    days: getSelectedDays(),
    interval: 60,
    sound: selectedSound,
    enabled: true
  };

  console.log('Saving schedule:', schedule);

  if (!schedule.time) {
    alert('Vui lòng chọn thời gian');
    return;
  }

  // Auto-fill date if not provided and type is once
  if (schedule.type === 'once' && !schedule.date) {
    schedule.date = new Date().toISOString().split('T')[0];
  }

  schedules.push(schedule);
  console.log('Schedules after push:', schedules.length, 'first item:', schedules[0]);
  
  // Show debug info
  const debugCount = document.getElementById('debug-count');
  if (debugCount) {
    debugCount.textContent = schedules.length;
  }
  
  renderSchedules();
  console.log('After renderSchedules, count:', schedules.length);
  clearForm();

  // Save to main process
  ipcRenderer.send('save-schedule', schedule);
  alert('Đã lưu lịch: ' + schedule.name + ' (' + schedule.time + ')');
}

function getSelectedDays() {
  const checkboxes = ui.$('#days-group input[type="checkbox"]');
  if (!checkboxes) return [];
  
  const selected = [];
  checkboxes.forEach(cb => {
    if (cb.checked) selected.push(parseInt(cb.value));
  });
  return selected;
}

function clearForm() {
  // Reset clock state
  selectedHour = 12;
  selectedMinute = 0;
  selectedType = 'once';
  selectedSound = 'default';
  currentStep = 1;
  updateClockHands();
  updateStepDisplay();

  // Reset inputs
  ui.$('schedule-name').value = '';
  ui.$('schedule-date').value = '';
  
  // Reset message
  const messageInput = ui.$('schedule-message');
  if (messageInput) messageInput.value = '';

  // Reset checkboxes
  const checkboxes = ui.$('#days-group input[type="checkbox"]');
  if (checkboxes) {
    checkboxes.forEach(cb => cb.checked = false);
  }

  // Reset repeat buttons
  const repeatBtns = document.querySelectorAll('.repeat-btn');
  repeatBtns.forEach(btn => btn.classList.remove('active'));
  const defaultRepeatBtn = document.querySelector('.repeat-btn[data-type="once"]');
  if (defaultRepeatBtn) defaultRepeatBtn.classList.add('active');

  // Reset sound buttons
  const soundBtns = document.querySelectorAll('.sound-btn');
  soundBtns.forEach(btn => btn.classList.remove('active'));
  const defaultSoundBtn = document.querySelector('.sound-btn[data-sound="default"]');
  if (defaultSoundBtn) defaultSoundBtn.classList.add('active');

  // Hide optional groups
  const dateGroup = ui.$('date-group');
  const daysGroup = ui.$('days-group');
  
  if (dateGroup) dateGroup.style.display = 'none';
  if (daysGroup) daysGroup.style.display = 'none';
}

function renderSchedules() {
  try {
    const container = document.getElementById('schedule-list-container');
    const countBadge = document.getElementById('schedule-count');
    if (!container) {
      console.error('schedule-list-container not found');
      return;
    }

    console.log('Rendering schedules, count:', schedules.length);

    // Update count badge
    if (countBadge) {
      countBadge.textContent = schedules.length;
    }

    // Update debug info
    const debugCount = document.getElementById('debug-count');
    if (debugCount) {
      debugCount.textContent = schedules.length;
    }

    if (schedules.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Chưa có lịch nào</p></div>';
      return;
    }

    const html = schedules.map(schedule => `
      <div class="schedule-item ${schedule.enabled ? '' : 'disabled'}">
        <div class="schedule-info">
          <h3>${schedule.name}</h3>
          <p>${schedule.message || ''}</p>
          <p class="schedule-time">${getScheduleDescription(schedule)}</p>
        </div>
        <div class="schedule-actions">
          <button onclick="toggleSchedule(${schedule.id})" class="btn btn-sm ${schedule.enabled ? 'btn-warning' : 'btn-success'}">
            ${schedule.enabled ? 'Tắt' : 'Bật'}
          </button>
          <button onclick="deleteSchedule(${schedule.id})" class="btn btn-sm btn-danger">Xóa</button>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = html;
    console.log('Rendered HTML length:', html.length);

    // Make functions global for onclick
    window.toggleSchedule = toggleSchedule;
    window.deleteSchedule = deleteSchedule;
  } catch (error) {
    console.error('Error in renderSchedules:', error);
  }
}

function getScheduleDescription(schedule) {
  const typeNames = {
    once: 'Một lần',
    daily: 'Hàng ngày',
    weekly: 'Hàng tuần',
    monthly: 'Hàng tháng',
    custom: 'Tùy chỉnh'
  };

  let desc = `${typeNames[schedule.type] || 'Không xác định'} lúc ${schedule.time}`;

  if (schedule.type === 'once' && schedule.date) {
    desc += ` vào ${schedule.date}`;
  } else if (schedule.type === 'weekly' && schedule.days && schedule.days.length > 0) {
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const daysStr = schedule.days.map(d => dayNames[d]).join(', ');
    desc += ` vào ${daysStr}`;
  } else if (schedule.type === 'custom') {
    desc += ` (mỗi ${schedule.interval} phút)`;
  }

  const soundNames = {
    default: 'Âm thanh mặc định',
    chime: 'Chuông',
    alert: 'Cảnh báo',
    none: 'Không có âm thanh'
  };

  desc += ` - ${soundNames[schedule.sound] || 'Không xác định'}`;

  return desc;
}

function toggleSchedule(id) {
  const schedule = schedules.find(s => s.id === id);
  if (schedule) {
    schedule.enabled = !schedule.enabled;
    renderSchedules();
    ipcRenderer.send('toggle-schedule', id);
  }
}

function deleteSchedule(id) {
  schedules = schedules.filter(s => s.id !== id);
  renderSchedules();
  ipcRenderer.send('delete-schedule', id);
  alert('Đã xóa lịch');
}

function loadSchedules() {
  ipcRenderer.send('load-schedules');
  ipcRenderer.on('schedules-loaded', (_, loadedSchedules) => {
    console.log('Schedules loaded from main:', loadedSchedules ? loadedSchedules.length : 0, 'current:', schedules.length);
    
    // Update debug UI
    const debugInfo = document.getElementById('debug-info');
    if (debugInfo) {
      debugInfo.innerHTML = `Loaded from main: ${loadedSchedules ? loadedSchedules.length : 0}, current: ${schedules.length}`;
    }
    
    if (schedules.length === 0) {
      schedules = loadedSchedules || [];
      renderSchedules();
      
      // Update debug after load
      const debugCount = document.getElementById('debug-count');
      if (debugCount) {
        debugCount.textContent = schedules.length;
      }
    }
  });
}

module.exports = { init, render };
