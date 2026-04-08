const zlib = require('zlib');
const crypto = require('crypto');

function text(value) {
  return String(value || '').trim();
}

function safeBase64Decode(value) {
  const raw = text(value);
  if (!raw) throw new Error('Token rỗng');
  return Buffer.from(raw, 'base64').toString('utf8');
}

function parseUploadthingToken(token) {
  const decoded = safeBase64Decode(token);
  let payload;
  try {
    payload = JSON.parse(decoded);
  } catch (_) {
    throw new Error('Token không đúng định dạng JSON base64');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Token payload không hợp lệ');
  }

  return {
    appId: text(payload.appId),
    apiKey: text(payload.apiKey),
    regions: Array.isArray(payload.regions) ? payload.regions.map((x) => text(x)).filter(Boolean) : [],
    raw: payload
  };
}

function encodeSettingsBlob(settingsObject) {
  const json = JSON.stringify(settingsObject || {});
  return zlib.gzipSync(Buffer.from(json, 'utf8'));
}

function decodeSettingsBlob(buffer) {
  const raw = zlib.gunzipSync(buffer).toString('utf8');
  return JSON.parse(raw);
}

function hashObject(input) {
  const json = JSON.stringify(input || {});
  return crypto.createHash('sha256').update(json).digest('hex');
}

function buildSyncFileName(appId) {
  const date = new Date().toISOString().replace(/[:.]/g, '-');
  return `settings-sync-${appId || 'unknown'}-${date}.json.gz`;
}

async function createUploadthingPresign({ apiKey, fileName, fileBuffer, metadata = {} }) {
  const response = await fetch('https://api.uploadthing.com/v6/uploadFiles', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-uploadthing-api-key': apiKey
    },
    body: JSON.stringify({
      files: [{ name: fileName, size: fileBuffer.length, type: 'application/gzip' }],
      metadata
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`UploadThing presign thất bại (${response.status}): ${body.slice(0, 260)}`);
  }

  const data = await response.json();
  const item = Array.isArray(data) ? data[0] : (Array.isArray(data?.data) ? data.data[0] : null);
  if (!item || !item.url) {
    throw new Error('UploadThing presign response không có url');
  }

  return { url: item.url, key: item.key || item.fileKey || '' };
}

async function uploadToPresignedUrl(url, fileName, fileBuffer) {
  const form = new FormData();
  const file = new File([fileBuffer], fileName, { type: 'application/gzip' });
  form.append('file', file);

  const response = await fetch(url, { method: 'POST', body: form });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Upload file thất bại (${response.status}): ${body.slice(0, 260)}`);
  }
}

async function getFileUrlByKey({ apiKey, fileKey }) {
  const response = await fetch('https://api.uploadthing.com/v6/getFileUrl', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-uploadthing-api-key': apiKey
    },
    body: JSON.stringify({ fileKeys: [fileKey] })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Lấy file URL thất bại (${response.status}): ${body.slice(0, 260)}`);
  }

  const data = await response.json();
  const item = Array.isArray(data) ? data[0] : (Array.isArray(data?.data) ? data.data[0] : null);
  const url = item?.url || '';
  if (!url) throw new Error('Không lấy được URL tải file');

  return url;
}

module.exports = {
  parseUploadthingToken,
  encodeSettingsBlob,
  decodeSettingsBlob,
  hashObject,
  buildSyncFileName,
  createUploadthingPresign,
  uploadToPresignedUrl,
  getFileUrlByKey
};