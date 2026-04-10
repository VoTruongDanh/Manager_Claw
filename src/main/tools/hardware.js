const { exec } = require('child_process');
const os = require('os');

function execPromise(command) {
  return new Promise((resolve) => {
    exec(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

function parseWmicOutput(output) {
  const lines = output.split('\n').map(line => line.trim()).filter(line => line);
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(/\s{2,}/).map(h => h.trim());
  const results = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(/\s{2,}/).map(v => v.trim());
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    results.push(obj);
  }
  
  return results;
}

async function getCPUInfo() {
  try {
    const cpus = os.cpus();
    const { stdout } = await execPromise('wmic cpu get Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed,CurrentClockSpeed,LoadPercentage /format:list');
    
    const info = {
      model: cpus[0]?.model || 'Unknown',
      cores: cpus.length,
      speed: cpus[0]?.speed || 0,
      usage: 0
    };
    
    const lines = stdout.split('\n');
    lines.forEach(line => {
      if (line.includes('NumberOfCores=')) info.physicalCores = parseInt(line.split('=')[1]) || info.cores;
      if (line.includes('NumberOfLogicalProcessors=')) info.logicalCores = parseInt(line.split('=')[1]) || info.cores;
      if (line.includes('MaxClockSpeed=')) info.maxSpeed = parseInt(line.split('=')[1]) || info.speed;
      if (line.includes('CurrentClockSpeed=')) info.currentSpeed = parseInt(line.split('=')[1]) || info.speed;
      if (line.includes('LoadPercentage=')) info.usage = parseInt(line.split('=')[1]) || 0;
    });
    
    return { ok: true, data: info };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function getMemoryInfo() {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    const { stdout } = await execPromise('wmic memorychip get Capacity,Speed,Manufacturer,PartNumber /format:list');
    
    const slots = [];
    let currentSlot = {};
    
    stdout.split('\n').forEach(line => {
      line = line.trim();
      if (!line) {
        if (Object.keys(currentSlot).length > 0) {
          slots.push(currentSlot);
          currentSlot = {};
        }
        return;
      }
      
      if (line.includes('=')) {
        const [key, value] = line.split('=');
        if (value && value.trim()) {
          currentSlot[key.trim()] = value.trim();
        }
      }
    });
    
    if (Object.keys(currentSlot).length > 0) {
      slots.push(currentSlot);
    }
    
    return {
      ok: true,
      data: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercent: ((usedMem / totalMem) * 100).toFixed(1),
        slots: slots.map(slot => ({
          capacity: parseInt(slot.Capacity) || 0,
          speed: parseInt(slot.Speed) || 0,
          manufacturer: slot.Manufacturer || 'Unknown',
          partNumber: slot.PartNumber || 'Unknown'
        }))
      }
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function getDiskInfo() {
  try {
    const { stdout } = await execPromise('wmic logicaldisk get DeviceID,Size,FreeSpace,FileSystem,VolumeName /format:csv');
    
    const lines = stdout.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('Node'));
    const disks = [];
    
    lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length >= 5) {
        const size = parseInt(parts[3]) || 0;
        const free = parseInt(parts[2]) || 0;
        const used = size - free;
        
        if (size > 0) {
          disks.push({
            drive: parts[1] || '',
            fileSystem: parts[2] || '',
            volumeName: parts[5] || '',
            total: size,
            free: free,
            used: used,
            usagePercent: size > 0 ? ((used / size) * 100).toFixed(1) : 0
          });
        }
      }
    });
    
    return { ok: true, data: disks };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function getGPUInfo() {
  try {
    const { stdout } = await execPromise('wmic path win32_VideoController get Name,AdapterRAM,DriverVersion,VideoModeDescription /format:list');
    
    const gpus = [];
    let currentGPU = {};
    
    stdout.split('\n').forEach(line => {
      line = line.trim();
      if (!line) {
        if (Object.keys(currentGPU).length > 0) {
          gpus.push(currentGPU);
          currentGPU = {};
        }
        return;
      }
      
      if (line.includes('=')) {
        const [key, value] = line.split('=');
        if (value && value.trim()) {
          currentGPU[key.trim()] = value.trim();
        }
      }
    });
    
    if (Object.keys(currentGPU).length > 0) {
      gpus.push(currentGPU);
    }
    
    return {
      ok: true,
      data: gpus.map(gpu => ({
        name: gpu.Name || 'Unknown',
        memory: parseInt(gpu.AdapterRAM) || 0,
        driver: gpu.DriverVersion || 'Unknown',
        resolution: gpu.VideoModeDescription || 'Unknown'
      }))
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function getNetworkInfo() {
  try {
    const interfaces = os.networkInterfaces();
    const adapters = [];
    
    Object.keys(interfaces).forEach(name => {
      const iface = interfaces[name];
      const ipv4 = iface.find(i => i.family === 'IPv4');
      const ipv6 = iface.find(i => i.family === 'IPv6');
      
      if (ipv4 || ipv6) {
        adapters.push({
          name: name,
          ipv4: ipv4?.address || 'N/A',
          ipv6: ipv6?.address || 'N/A',
          mac: ipv4?.mac || ipv6?.mac || 'N/A',
          internal: ipv4?.internal || ipv6?.internal || false
        });
      }
    });
    
    return { ok: true, data: adapters };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function getSystemInfo() {
  try {
    const { stdout: biosOut } = await execPromise('wmic bios get Manufacturer,SMBIOSBIOSVersion,ReleaseDate /format:list');
    const { stdout: csOut } = await execPromise('wmic computersystem get Manufacturer,Model,TotalPhysicalMemory /format:list');
    const { stdout: osOut } = await execPromise('wmic os get Caption,Version,BuildNumber,OSArchitecture,InstallDate /format:list');
    
    const parseKeyValue = (output) => {
      const result = {};
      output.split('\n').forEach(line => {
        line = line.trim();
        if (line.includes('=')) {
          const [key, value] = line.split('=');
          if (value && value.trim()) {
            result[key.trim()] = value.trim();
          }
        }
      });
      return result;
    };
    
    const bios = parseKeyValue(biosOut);
    const cs = parseKeyValue(csOut);
    const osInfo = parseKeyValue(osOut);
    
    return {
      ok: true,
      data: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        osName: osInfo.Caption || os.type(),
        osVersion: osInfo.Version || os.release(),
        osBuild: osInfo.BuildNumber || '',
        osArch: osInfo.OSArchitecture || os.arch(),
        manufacturer: cs.Manufacturer || 'Unknown',
        model: cs.Model || 'Unknown',
        biosManufacturer: bios.Manufacturer || 'Unknown',
        biosVersion: bios.SMBIOSBIOSVersion || 'Unknown',
        biosDate: bios.ReleaseDate || 'Unknown',
        uptime: os.uptime()
      }
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function getBatteryInfo() {
  try {
    const { stdout } = await execPromise('wmic path Win32_Battery get BatteryStatus,EstimatedChargeRemaining,EstimatedRunTime /format:list');
    
    if (!stdout || stdout.trim().length === 0) {
      return { ok: true, data: null }; // No battery (desktop)
    }
    
    const info = {};
    stdout.split('\n').forEach(line => {
      line = line.trim();
      if (line.includes('=')) {
        const [key, value] = line.split('=');
        if (value && value.trim()) {
          info[key.trim()] = value.trim();
        }
      }
    });
    
    const statusMap = {
      '1': 'Discharging',
      '2': 'AC Connected',
      '3': 'Fully Charged',
      '4': 'Low',
      '5': 'Critical',
      '6': 'Charging',
      '7': 'Charging High',
      '8': 'Charging Low',
      '9': 'Charging Critical',
      '10': 'Undefined',
      '11': 'Partially Charged'
    };
    
    return {
      ok: true,
      data: {
        status: statusMap[info.BatteryStatus] || 'Unknown',
        chargeRemaining: parseInt(info.EstimatedChargeRemaining) || 0,
        estimatedRunTime: parseInt(info.EstimatedRunTime) || 0
      }
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function getTemperatureInfo() {
  try {
    // Windows không có built-in command để lấy nhiệt độ, cần tool bên thứ 3
    // Trả về thông báo thay vì lỗi
    return {
      ok: true,
      data: {
        available: false,
        message: 'Temperature monitoring requires third-party tools (e.g., Open Hardware Monitor)'
      }
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function getAllHardwareInfo() {
  try {
    const [system, cpu, memory, disk, gpu, network, battery, temperature] = await Promise.all([
      getSystemInfo(),
      getCPUInfo(),
      getMemoryInfo(),
      getDiskInfo(),
      getGPUInfo(),
      getNetworkInfo(),
      getBatteryInfo(),
      getTemperatureInfo()
    ]);
    
    return {
      ok: true,
      data: {
        system: system.ok ? system.data : null,
        cpu: cpu.ok ? cpu.data : null,
        memory: memory.ok ? memory.data : null,
        disk: disk.ok ? disk.data : null,
        gpu: gpu.ok ? gpu.data : null,
        network: network.ok ? network.data : null,
        battery: battery.ok ? battery.data : null,
        temperature: temperature.ok ? temperature.data : null
      },
      timestamp: Date.now()
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = {
  getCPUInfo,
  getMemoryInfo,
  getDiskInfo,
  getGPUInfo,
  getNetworkInfo,
  getSystemInfo,
  getBatteryInfo,
  getTemperatureInfo,
  getAllHardwareInfo
};
