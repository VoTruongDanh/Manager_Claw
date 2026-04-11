const https = require('https');

const API_BASE = 'https://copy-paste.online/api/v1';

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (error) {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function uploadData(payload) {
  try {
    const jsonData = JSON.stringify(payload);
    const postData = `text=${encodeURIComponent(jsonData)}`;

    const url = new URL(`${API_BASE}/copy`);

    const response = await httpsRequest(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      body: postData
    });

    if (response.statusCode !== 200) {
      throw new Error(`Upload failed with status ${response.statusCode}`);
    }

    if (!response.data || response.data.message === undefined || response.data.message === null) {
      throw new Error('Invalid response from server');
    }

    return {
      ok: true,
      code: String(response.data.message).trim(),
      timestamp: Date.now()
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

async function downloadData(code) {
  try {
    const normalizedCode = String(code ?? '').trim();
    if (!normalizedCode) {
      throw new Error('Code không hợp lệ');
    }

    const url = new URL(`${API_BASE}/paste`);
    url.searchParams.set('code', normalizedCode);

    const response = await httpsRequest(url.toString(), {
      method: 'GET'
    });

    if (response.statusCode !== 200) {
      throw new Error(`Download failed with status ${response.statusCode}`);
    }

    const rawPayload = response.data && typeof response.data === 'object'
      ? (response.data.text ?? response.data.message)
      : null;

    if (!rawPayload || (typeof rawPayload === 'string' && rawPayload.toLowerCase() === 'nothing found')) {
      throw new Error('Không tìm thấy dữ liệu với code này');
    }

    let payload;
    try {
      payload = JSON.parse(rawPayload);
    } catch (error) {
      throw new Error('Dữ liệu không hợp lệ (không phải JSON)');
    }

    return {
      ok: true,
      data: payload,
      timestamp: Date.now()
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

module.exports = {
  uploadData,
  downloadData
};
