const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Get all network adapters with their status
 * @returns {Promise<Array>} List of adapters with name, status, type
 */
async function getAdapters() {
  try {
    // Use PowerShell to get network adapters
    const cmd = `powershell -Command "Get-NetAdapter | Select-Object Name, Status, InterfaceDescription, MacAddress, LinkSpeed | ConvertTo-Json"`;
    const { stdout } = await execAsync(cmd, { encoding: 'utf8' });
    
    let adapters = JSON.parse(stdout);
    
    // Ensure it's always an array
    if (!Array.isArray(adapters)) {
      adapters = [adapters];
    }
    
    return adapters.map(adapter => ({
      name: adapter.Name,
      status: adapter.Status,
      description: adapter.InterfaceDescription,
      mac: adapter.MacAddress,
      speed: adapter.LinkSpeed || 'N/A',
      type: detectAdapterType(adapter.InterfaceDescription)
    }));
  } catch (error) {
    console.error('Failed to get adapters:', error);
    throw new Error(`Không lấy được danh sách adapter: ${error.message}`);
  }
}

/**
 * Detect adapter type from description
 */
function detectAdapterType(description) {
  const desc = description.toLowerCase();
  if (desc.includes('wi-fi') || desc.includes('wireless')) return 'wifi';
  if (desc.includes('ethernet') || desc.includes('realtek') || desc.includes('intel')) return 'ethernet';
  if (desc.includes('hyper-v') || desc.includes('virtual') || desc.includes('vmware')) return 'virtual';
  if (desc.includes('bluetooth')) return 'bluetooth';
  return 'other';
}

/**
 * Enable a network adapter
 * @param {string} name - Adapter name
 */
async function enableAdapter(name) {
  try {
    const cmd = `powershell -Command "Enable-NetAdapter -Name '${name}' -Confirm:$false"`;
    await execAsync(cmd);
    return { ok: true, message: `Đã bật adapter "${name}"` };
  } catch (error) {
    console.error('Failed to enable adapter:', error);
    throw new Error(`Không bật được adapter: ${error.message}`);
  }
}

/**
 * Disable a network adapter
 * @param {string} name - Adapter name
 */
async function disableAdapter(name) {
  try {
    const cmd = `powershell -Command "Disable-NetAdapter -Name '${name}' -Confirm:$false"`;
    await execAsync(cmd);
    return { ok: true, message: `Đã tắt adapter "${name}"` };
  } catch (error) {
    console.error('Failed to disable adapter:', error);
    throw new Error(`Không tắt được adapter: ${error.message}`);
  }
}

/**
 * Reset adapter (disable then enable)
 * @param {string} name - Adapter name
 */
async function resetAdapter(name) {
  try {
    await disableAdapter(name);
    // Wait 2 seconds before re-enabling
    await new Promise(resolve => setTimeout(resolve, 2000));
    await enableAdapter(name);
    return { ok: true, message: `Đã reset adapter "${name}"` };
  } catch (error) {
    console.error('Failed to reset adapter:', error);
    throw new Error(`Không reset được adapter: ${error.message}`);
  }
}

/**
 * Flush DNS cache
 */
async function flushDNS() {
  try {
    await execAsync('ipconfig /flushdns');
    return { ok: true, message: 'Đã xóa DNS cache' };
  } catch (error) {
    console.error('Failed to flush DNS:', error);
    throw new Error(`Không xóa được DNS cache: ${error.message}`);
  }
}

/**
 * Release and renew IP for an adapter
 * @param {string} name - Adapter name
 */
async function releaseRenewIP(name) {
  try {
    // Release
    await execAsync(`ipconfig /release "${name}"`);
    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Renew
    await execAsync(`ipconfig /renew "${name}"`);
    return { ok: true, message: `Đã renew IP cho "${name}"` };
  } catch (error) {
    console.error('Failed to release/renew IP:', error);
    throw new Error(`Không renew được IP: ${error.message}`);
  }
}

/**
 * Get IP configuration for an adapter
 * @param {string} name - Adapter name
 */
async function getIPConfig(name) {
  try {
    const cmd = `powershell -Command "Get-NetIPAddress -InterfaceAlias '${name}' | Select-Object IPAddress, PrefixLength, AddressFamily | ConvertTo-Json"`;
    const { stdout } = await execAsync(cmd, { encoding: 'utf8' });
    
    let ips = JSON.parse(stdout);
    if (!Array.isArray(ips)) {
      ips = [ips];
    }
    
    return ips.map(ip => ({
      address: ip.IPAddress,
      prefix: ip.PrefixLength,
      family: ip.AddressFamily === 2 ? 'IPv4' : 'IPv6'
    }));
  } catch (error) {
    console.error('Failed to get IP config:', error);
    return [];
  }
}

module.exports = {
  getAdapters,
  enableAdapter,
  disableAdapter,
  resetAdapter,
  flushDNS,
  releaseRenewIP,
  getIPConfig
};
