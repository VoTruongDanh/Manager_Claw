const { ipcRenderer } = require('electron');
const ui = require('../../ui');

function init() {
  const resetBtn = ui.$('idm-reset-btn');
  const statusEl = ui.$('idm-status');
  const checkBtn = ui.$('idm-check-btn');
  const progressEl = ui.$('idm-progress');
  const stepsEl = ui.$('idm-steps');

  if (!resetBtn || !statusEl || !checkBtn || !progressEl || !stepsEl) {
    return;
  }

  let isCheckingIDM = false;
  let isResetting = false;

  function showStep(step, status = 'running') {
    const stepEl = ui.$(`idm-step-${step}`);
    if (!stepEl) return;

    document.querySelectorAll('.idm-step').forEach(el => {
      el.classList.remove('running', 'success', 'error');
    });

    stepEl.classList.add(status);

    if (status === 'running') {
      stepEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function resetSteps() {
    document.querySelectorAll('.idm-step').forEach(el => {
      el.classList.remove('running', 'success', 'error');
    });
  }

  checkBtn.addEventListener('click', async () => {
    if (isCheckingIDM) return;
    isCheckingIDM = true;

    checkBtn.disabled = true;
    checkBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" class="spin">
        <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
      </svg>
      Đang kiểm tra
    `;
    statusEl.textContent = 'Đang kiểm tra';
    statusEl.className = 'idm-status checking';

    try {
      const result = await ipcRenderer.invoke('idm-check-running');

      if (result.running) {
        let statusText = 'IDM đang chạy';
        let toastText = 'IDM đang chạy';

        if (result.daysLeft !== null && result.daysLeft !== undefined) {
          statusText += ` • Còn ${result.daysLeft} ngày`;
          toastText += ` • Còn ${result.daysLeft} ngày trial`;
        } else if (result.hasRegistry) {
          statusText += ' • Trial hoạt động';
          toastText += ' • Trial đang hoạt động';
        }

        statusEl.textContent = statusText;
        statusEl.className = 'idm-status running';
        ui.showToast(toastText, 'info');
      } else {
        statusEl.textContent = 'IDM không chạy';
        statusEl.className = 'idm-status stopped';
        ui.showToast('IDM không chạy', 'info');
      }
    } catch (err) {
      statusEl.textContent = `Lỗi: ${err.message}`;
      statusEl.className = 'idm-status error';
      ui.showToast(`Lỗi kiểm tra: ${err.message}`, 'error');
    } finally {
      checkBtn.disabled = false;
      checkBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
        </svg>
        Kiểm tra
      `;
      isCheckingIDM = false;
    }
  });

  resetBtn.addEventListener('click', async () => {
    if (isResetting) return;
    isResetting = true;

    const confirmed = confirm(
      'Xác nhận reset IDM trial\n\n' +
      'Thao tác này sẽ tắt IDM, xóa registry trial và xóa thư mục cấu hình.\n\n' +
      'Bạn có chắc chắn?'
    );

    if (!confirmed) {
      isResetting = false;
      return;
    }

    resetBtn.disabled = true;
    checkBtn.disabled = true;
    progressEl.style.display = 'block';
    stepsEl.style.display = 'block';
    resetSteps();

    showStep(1, 'running');
    statusEl.textContent = 'Đang tắt IDM';
    statusEl.className = 'idm-status checking';
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const result = await ipcRenderer.invoke('idm-reset-trial');

      if (result.ok) {
        showStep(1, 'success');
        await new Promise(resolve => setTimeout(resolve, 300));

        showStep(2, 'running');
        statusEl.textContent = 'Đang xóa registry';
        await new Promise(resolve => setTimeout(resolve, 500));
        showStep(2, 'success');
        await new Promise(resolve => setTimeout(resolve, 300));

        showStep(3, 'running');
        statusEl.textContent = 'Đang xóa cấu hình';
        await new Promise(resolve => setTimeout(resolve, 500));
        showStep(3, 'success');
        await new Promise(resolve => setTimeout(resolve, 300));

        showStep(4, 'running');
        statusEl.textContent = 'Đang hoàn tất';
        await new Promise(resolve => setTimeout(resolve, 500));
        showStep(4, 'success');

        statusEl.textContent = 'Reset xong. Mở lại IDM.';
        statusEl.className = 'idm-status success';
        ui.showToast('Reset IDM trial thành công. Mở lại IDM để áp dụng.', 'success');

        setTimeout(() => {
          progressEl.style.display = 'none';
        }, 3000);
      } else {
        showStep(1, 'error');
        statusEl.textContent = `Lỗi: ${result.error}`;
        statusEl.className = 'idm-status error';
        ui.showToast(`Lỗi: ${result.error}`, 'error');

        setTimeout(() => {
          progressEl.style.display = 'none';
          stepsEl.style.display = 'none';
        }, 3000);
      }
    } catch (err) {
      showStep(1, 'error');
      statusEl.textContent = `Lỗi: ${err.message}`;
      statusEl.className = 'idm-status error';
      ui.showToast(`Lỗi: ${err.message}`, 'error');

      setTimeout(() => {
        progressEl.style.display = 'none';
        stepsEl.style.display = 'none';
      }, 3000);
    } finally {
      resetBtn.disabled = false;
      checkBtn.disabled = false;
      isResetting = false;
    }
  });
}

module.exports = { init };
