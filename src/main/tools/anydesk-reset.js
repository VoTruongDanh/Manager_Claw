const { exec, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROGRAMDATA_DIR = process.env.PROGRAMDATA || 'C:\\ProgramData';
const APPDATA_DIR = process.env.APPDATA;

const CONFIG_FILENAMES = ['service.conf', 'system.conf'];
const USER_CONF_NAME = 'user.conf';
const ADMIN_REQUIRED_MESSAGE =
  'AnyDesk dang chay o installed-service mode. Hay mo app bang Administrator de dung service va xoa C:\\ProgramData\\AnyDesk.';

function readFileSafe(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  } catch (_) {
    return null;
  }
}

function execCommand(command, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true }, (error, stdout = '', stderr = '') => {
      const result = {
        ok: !error,
        code: error && typeof error.code !== 'undefined' ? error.code : 0,
        stdout: String(stdout).trim(),
        stderr: String(stderr).trim(),
      };

      if (error && !allowFailure) {
        error.stdout = result.stdout;
        error.stderr = result.stderr;
        return reject(error);
      }

      resolve(result);
    });
  });
}

function quotePs(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function runPowerShell(script, options = {}) {
  const command = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`;
  return execCommand(command, options);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean).map((entry) => path.normalize(entry)))];
}

function joinCommandOutput(result) {
  return [result && result.stdout, result && result.stderr]
    .filter(Boolean)
    .join('\n')
    .trim();
}

function isAccessDeniedText(text) {
  return /OpenService FAILED 5|Access is denied|FAILED 5/i.test(String(text || ''));
}

function isPermissionError(error) {
  return Boolean(
    error
      && (
        error.code === 'EPERM'
        || error.code === 'EACCES'
        || isAccessDeniedText(error.message)
      ),
  );
}

function isSystemScopePath(filePath) {
  const normalizedPath = path.normalize(String(filePath || '')).toLowerCase();
  const normalizedProgramData = path.normalize(PROGRAMDATA_DIR).toLowerCase();
  return normalizedPath.startsWith(normalizedProgramData);
}

function buildAdminRequiredMessage({ serviceNames = [], remainingArtifacts = [] } = {}) {
  const details = [];

  if (serviceNames.length) {
    details.push(`Khong du quyen dung AnyDesk service (${serviceNames.join(', ')})`);
  }

  const criticalArtifacts = remainingArtifacts.filter((filePath) => isSystemScopePath(filePath));
  if (criticalArtifacts.length) {
    details.push(`Con file he thong: ${criticalArtifacts.join(', ')}`);
  }

  return details.length
    ? `${ADMIN_REQUIRED_MESSAGE} ${details.join('. ')}.`
    : ADMIN_REQUIRED_MESSAGE;
}

function getConfigRoots() {
  const baseRoots = uniquePaths([
    path.join(PROGRAMDATA_DIR, 'AnyDesk'),
    APPDATA_DIR ? path.join(APPDATA_DIR, 'AnyDesk') : null,
  ]);
  const roots = [];

  for (const baseRoot of baseRoots) {
    roots.push(baseRoot);

    try {
      if (!fs.existsSync(baseRoot) || !fs.statSync(baseRoot).isDirectory()) {
        continue;
      }

      for (const entry of fs.readdirSync(baseRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && /^ad_/i.test(entry.name)) {
          roots.push(path.join(baseRoot, entry.name));
        }
      }
    } catch (_) {
      // Ignore unreadable directories; verification later will surface actionable errors.
    }
  }

  return uniquePaths(roots);
}

function getIdArtifacts() {
  return getConfigRoots().flatMap((root) => CONFIG_FILENAMES.map((name) => path.join(root, name)));
}

function getUserConfCandidates() {
  return getConfigRoots().map((root) => path.join(root, USER_CONF_NAME));
}

function getAnyDeskId() {
  const candidates = [];

  for (const root of getConfigRoots()) {
    candidates.push(path.join(root, 'service.conf'));
    candidates.push(path.join(root, 'system.conf'));
  }

  for (const filePath of uniquePaths(candidates)) {
    const content = readFileSafe(filePath);
    if (!content) continue;

    const match = content.match(/^ad\.anynet\.id\s*=\s*(\d+)/m);
    if (match) return match[1];
  }

  return null;
}

function formatId(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return digits;
}

async function getAnyDeskServiceNames() {
  const script = [
    '$services = Get-Service | Where-Object { $_.Name -like \'*AnyDesk*\' -or $_.DisplayName -like \'*AnyDesk*\' }',
    '$services | Select-Object -ExpandProperty Name',
  ].join('; ');

  const result = await runPowerShell(script, { allowFailure: true });
  if (!result.stdout) return [];

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseScState(output) {
  const match = String(output).match(/STATE\s*:\s*\d+\s+([A-Z_]+)/i);
  return match ? match[1].toUpperCase() : null;
}

async function queryServiceState(serviceName) {
  const result = await execCommand(`sc query "${serviceName}"`, { allowFailure: true });
  const output = joinCommandOutput(result);

  if (!result.ok && /does not exist|specified service does not exist/i.test(output)) {
    return { exists: false, state: null, result };
  }

  if (!result.ok && isAccessDeniedText(output)) {
    return { exists: true, state: null, accessDenied: true, result };
  }

  return {
    exists: result.ok,
    state: parseScState(output),
    accessDenied: false,
    result,
  };
}

async function waitForServiceStopped(serviceName, timeoutMs = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = await queryServiceState(serviceName);
    if (!status.exists || status.state === 'STOPPED') {
      return status;
    }

    await sleep(500);
  }

  return queryServiceState(serviceName);
}

async function stopServiceWithSc(serviceName, log, dryRun) {
  const status = await queryServiceState(serviceName);

  if (!status.exists) {
    log.push({ step: 'stop-services', status: 'noop', detail: `Service ${serviceName} not found` });
    return { serviceName, exists: false, accessDenied: false };
  }

  if (status.accessDenied) {
    log.push({
      step: 'stop-services',
      status: 'warning',
      detail: `Access denied while querying service ${serviceName}. ${ADMIN_REQUIRED_MESSAGE}`,
    });
    return { serviceName, exists: true, accessDenied: true };
  }

  if (status.state === 'STOPPED') {
    log.push({ step: 'stop-services', status: 'noop', detail: `Service ${serviceName} already stopped` });
    return { serviceName, exists: true, accessDenied: false, stopped: true };
  }

  if (dryRun) {
    log.push({ step: 'stop-services', status: 'dry-run', detail: `sc stop "${serviceName}" (current state: ${status.state || 'unknown'})` });
    log.push({ step: 'wait-service-stop', status: 'dry-run', detail: `Would poll sc query "${serviceName}" until STOPPED` });
    return { serviceName, exists: true, accessDenied: false, stopped: true };
  }

  const stopResult = await execCommand(`sc stop "${serviceName}"`, { allowFailure: true });
  const stopOutput = joinCommandOutput(stopResult);

  if (!stopResult.ok && isAccessDeniedText(stopOutput)) {
    log.push({
      step: 'stop-services',
      status: 'warning',
      detail: `Access denied while stopping service ${serviceName}. ${ADMIN_REQUIRED_MESSAGE}`,
    });
    return { serviceName, exists: true, accessDenied: true };
  }

  if (!stopResult.ok && !/service has not been started|service not active/i.test(stopOutput)) {
    throw new Error(`Failed to stop service ${serviceName}: ${stopResult.stderr || stopResult.stdout || 'sc stop failed'}`);
  }

  log.push({ step: 'stop-services', status: 'ok', detail: `Sent stop to service ${serviceName}` });

  const finalStatus = await waitForServiceStopped(serviceName);
  if (finalStatus.accessDenied) {
    log.push({
      step: 'wait-service-stop',
      status: 'warning',
      detail: `Access denied while verifying service ${serviceName} stopped. ${ADMIN_REQUIRED_MESSAGE}`,
    });
    return { serviceName, exists: true, accessDenied: true };
  }

  if (finalStatus.state !== 'STOPPED' && finalStatus.exists) {
    throw new Error(`Service ${serviceName} is still ${finalStatus.state || 'running'} after stop request. Close AnyDesk and retry.`);
  }

  log.push({ step: 'wait-service-stop', status: 'ok', detail: `Service ${serviceName} confirmed stopped` });
  return { serviceName, exists: true, accessDenied: false, stopped: true };
}

async function stopAnyDeskProcesses(log, dryRun) {
  const targets = ['AnyDesk.exe', 'ad_svc.exe'];

  for (const imageName of targets) {
    const command = `taskkill /F /T /IM ${imageName}`;
    if (dryRun) {
      log.push({ step: 'stop-processes', status: 'dry-run', detail: command });
      continue;
    }

    const result = await execCommand(command, { allowFailure: true });
    if (result.ok) {
      log.push({ step: 'stop-processes', status: 'ok', detail: `Stopped ${imageName}` });
      continue;
    }

    const notRunning = /not found|no running instance|cannot find/i.test(`${result.stdout}\n${result.stderr}`);
    log.push({
      step: 'stop-processes',
      status: notRunning ? 'noop' : 'warning',
      detail: notRunning ? `${imageName} was not running` : `${imageName}: ${result.stderr || result.stdout || 'taskkill failed'}`,
    });
  }
}

async function stopAnyDeskServices(log, dryRun) {
  const serviceNames = uniquePaths(['AnyDesk', ...(await getAnyDeskServiceNames())]);

  if (!serviceNames.length) {
    log.push({ step: 'stop-services', status: 'noop', detail: 'No AnyDesk Windows service detected' });
    return { serviceNames: [], deniedServiceNames: [] };
  }

  const deniedServiceNames = [];

  for (const serviceName of serviceNames) {
    const result = await stopServiceWithSc(serviceName, log, dryRun);
    if (result && result.accessDenied) {
      deniedServiceNames.push(serviceName);
    }
  }

  return { serviceNames, deniedServiceNames };
}

function isLikelyElevated() {
  try {
    execSync('net session', {
      windowsHide: true,
      stdio: 'ignore',
      shell: 'cmd.exe',
    });
    return true;
  } catch (_) {
    return false;
  }
}

function inspectFileAccess(filePath) {
  let fd = null;

  try {
    fd = fs.openSync(filePath, 'r+');
    return { locked: false, writable: true };
  } catch (error) {
    if (error && (error.code === 'EPERM' || error.code === 'EBUSY')) {
      return { locked: true, writable: false, code: error.code };
    }

    if (error && error.code === 'EACCES') {
      return { locked: false, writable: false, code: error.code };
    }

    return { locked: false, writable: false, code: error && error.code };
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

function ensureDeletePermission(filePath) {
  const parentDir = path.dirname(filePath);
  const commands = [
    `icacls "${filePath}" /grant *S-1-5-32-544:F /C`,
    `icacls "${parentDir}" /grant *S-1-5-32-544:F /T /C`,
  ];

  for (const command of commands) {
    execSync(command, {
      windowsHide: true,
      stdio: 'ignore',
      shell: 'cmd.exe',
    });
  }
}

function getQuarantinePath(filePath) {
  const quarantineDir = path.join(os.tmpdir(), 'claw-anydesk-quarantine');
  const safeName = filePath.replace(/[:\\\/]+/g, '_');
  return path.join(quarantineDir, `${Date.now()}-${safeName}`);
}

function moveFileToQuarantine(filePath) {
  const quarantinePath = getQuarantinePath(filePath);
  fs.mkdirSync(path.dirname(quarantinePath), { recursive: true });
  fs.renameSync(filePath, quarantinePath);
  return quarantinePath;
}

function buildArtifactRemovalError(filePath, error, accessState, elevatedTried) {
  if (!isPermissionError(error)) {
    return error;
  }

  const reasons = [];

  if (accessState.locked) {
    reasons.push('AnyDesk service/process is still locking the file');
  }

  reasons.push(isLikelyElevated()
    ? elevatedTried
      ? 'admin rights are present but Windows still denied delete access after icacls'
      : 'admin rights are present but Windows denied delete access'
    : 'the app is not running with administrator rights');

  const detail = reasons.join('; ');
  const wrapped = new Error(`Cannot remove ${filePath}: ${detail}. Close AnyDesk completely and run the app as administrator.`);
  wrapped.code = error.code;
  wrapped.cause = error;
  return wrapped;
}

function removeArtifact(filePath, log, dryRun) {
  if (dryRun) {
    log.push({ step: 'remove-id-artifacts', status: 'dry-run', detail: `Delete ${filePath}` });
    return { removed: true, filePath };
  }

  const accessState = inspectFileAccess(filePath);
  log.push({
    step: 'check-file-lock',
    status: accessState.locked ? 'warning' : accessState.writable ? 'ok' : 'warning',
    detail: accessState.locked
      ? `${filePath} appears locked (${accessState.code || 'unknown'})`
      : `${filePath} access ${accessState.writable ? 'looks writable' : `is limited (${accessState.code || 'unknown'})`}`,
  });

  let elevatedTried = false;

  try {
    fs.unlinkSync(filePath);
    log.push({ step: 'remove-id-artifacts', status: 'ok', detail: `Deleted ${filePath}` });
    return { removed: true, filePath };
  } catch (error) {
    if (error.code === 'EPERM' && isLikelyElevated()) {
      elevatedTried = true;

      try {
        ensureDeletePermission(filePath);
        fs.unlinkSync(filePath);
        log.push({ step: 'grant-delete-permission', status: 'ok', detail: `Granted delete rights and removed ${filePath}` });
        return { removed: true, filePath };
      } catch (grantError) {
        error = grantError;
      }
    }

    try {
      const quarantinePath = moveFileToQuarantine(filePath);
      log.push({ step: 'quarantine-id-artifact', status: 'ok', detail: `${filePath} -> ${quarantinePath}` });
      return { removed: true, filePath, quarantinePath };
    } catch (moveError) {
      throw buildArtifactRemovalError(filePath, moveError.code === 'EPERM' ? moveError : error, accessState, elevatedTried);
    }
  }
}

function backupUserConfs(log, dryRun) {
  const backups = [];

  for (const filePath of getUserConfCandidates()) {
    if (!fs.existsSync(filePath)) continue;

    const data = fs.readFileSync(filePath, 'utf8');
    const tempPath = path.join(os.tmpdir(), `claw-anydesk-userconf-${Date.now()}-${backups.length}.bak`);

    if (dryRun) {
      log.push({ step: 'backup-user-conf', status: 'dry-run', detail: `${filePath} -> ${tempPath}` });
      backups.push({ originalPath: filePath, tempPath, data });
      continue;
    }

    fs.writeFileSync(tempPath, data, 'utf8');
    log.push({ step: 'backup-user-conf', status: 'ok', detail: `${filePath} -> ${tempPath}` });
    backups.push({ originalPath: filePath, tempPath, data });
  }

  if (!backups.length) {
    log.push({ step: 'backup-user-conf', status: 'noop', detail: 'No user.conf found to preserve' });
  }

  return backups;
}

function removeIdArtifacts(log, dryRun) {
  const removed = [];
  const failed = [];

  for (const filePath of getIdArtifacts()) {
    if (!fs.existsSync(filePath)) continue;

    try {
      removeArtifact(filePath, log, dryRun);
      removed.push(filePath);
    } catch (error) {
      failed.push({
        filePath,
        message: error.message,
        code: error.code || null,
        accessDenied: isPermissionError(error),
      });
      log.push({
        step: 'remove-id-artifacts',
        status: isPermissionError(error) ? 'warning' : 'error',
        detail: error.message,
      });
    }
  }

  if (!removed.length && !failed.length) {
    log.push({ step: 'remove-id-artifacts', status: 'noop', detail: 'No AnyDesk ID artifacts found' });
  }

  return { removed, failed };
}

function restoreUserConfs(backups, log, dryRun) {
  for (const backup of backups) {
    if (dryRun) {
      log.push({ step: 'restore-user-conf', status: 'dry-run', detail: `${backup.tempPath} -> ${backup.originalPath}` });
      continue;
    }

    fs.mkdirSync(path.dirname(backup.originalPath), { recursive: true });
    const content = fs.existsSync(backup.tempPath)
      ? fs.readFileSync(backup.tempPath, 'utf8')
      : backup.data;
    fs.writeFileSync(backup.originalPath, content, 'utf8');
    log.push({ step: 'restore-user-conf', status: 'ok', detail: `Restored ${backup.originalPath}` });
  }

  if (!backups.length) {
    log.push({ step: 'restore-user-conf', status: 'noop', detail: 'Nothing to restore' });
  }
}

function cleanupBackups(backups) {
  for (const backup of backups) {
    try {
      if (fs.existsSync(backup.tempPath)) {
        fs.unlinkSync(backup.tempPath);
      }
    } catch (_) {
      // Temp cleanup failure is non-fatal.
    }
  }
}

function verifyArtifactsRemoved(log, dryRun, context = {}) {
  const deniedServiceNames = context.deniedServiceNames || [];
  const removalFailures = context.removalFailures || [];
  const remaining = getIdArtifacts().filter((filePath) => fs.existsSync(filePath));

  if (dryRun) {
    log.push({
      step: 'verify',
      status: 'dry-run',
      detail: remaining.length
        ? `Would fail verification, still present: ${remaining.join(', ')}`
        : 'No ID artifacts currently present after planned operations',
    });
    return { remaining, needsAdmin: false, error: null };
  }

  const deniedSystemArtifacts = removalFailures
    .filter((item) => item.accessDenied && isSystemScopePath(item.filePath))
    .map((item) => item.filePath);
  const needsAdmin = deniedServiceNames.length > 0 || deniedSystemArtifacts.length > 0 || remaining.some((filePath) => isSystemScopePath(filePath));

  if (remaining.length || deniedSystemArtifacts.length) {
    const remainingArtifacts = uniquePaths([...remaining, ...deniedSystemArtifacts]);
    const error = needsAdmin
      ? buildAdminRequiredMessage({ serviceNames: deniedServiceNames, remainingArtifacts })
      : `AnyDesk ID artifacts still present: ${remainingArtifacts.join(', ')}`;

    log.push({
      step: 'verify',
      status: needsAdmin ? 'warning' : 'error',
      detail: error,
    });
    return { remaining: remainingArtifacts, needsAdmin, error };
  }

  log.push({ step: 'verify', status: 'ok', detail: 'AnyDesk ID artifacts removed successfully' });
  return { remaining, needsAdmin: false, error: null };
}

function checkAnyDeskRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq AnyDesk.exe" /NH', { windowsHide: true }, (err, stdout = '') => {
      const running = !err && stdout.toLowerCase().includes('anydesk.exe');
      const rawId = getAnyDeskId();

      resolve({
        running,
        id: formatId(rawId),
        rawId,
        configRoots: getConfigRoots(),
        hasAnyDeskConfig: getConfigRoots().some((root) => fs.existsSync(root)),
      });
    });
  });
}

async function resetAnyDeskId(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const log = [];
  const backups = [];

  try {
    const serviceResult = await stopAnyDeskServices(log, dryRun);
    await stopAnyDeskProcesses(log, dryRun);

    backups.push(...backupUserConfs(log, dryRun));
    const removalResult = removeIdArtifacts(log, dryRun);
    restoreUserConfs(backups, log, dryRun);
    const verification = verifyArtifactsRemoved(log, dryRun, {
      deniedServiceNames: serviceResult.deniedServiceNames,
      removalFailures: removalResult.failed,
    });

    return {
      ok: !verification.error,
      dryRun,
      steps: log,
      remainingArtifacts: verification.remaining,
      needsAdmin: verification.needsAdmin,
      error: verification.error || null,
    };
  } catch (error) {
    try {
      restoreUserConfs(backups, log, dryRun);
    } catch (restoreError) {
      log.push({
        step: 'rollback',
        status: 'error',
        detail: restoreError.message,
      });
    }

    return {
      ok: false,
      dryRun,
      error: error.message,
      steps: log,
      needsAdmin: isPermissionError(error),
    };
  } finally {
    if (!dryRun) {
      cleanupBackups(backups);
    }
  }
}

module.exports = { checkAnyDeskRunning, resetAnyDeskId };
