const DRIVE_DISCOVERY = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const DATA_FOLDER = 'keiei-soudan-ai-data';
const FILES_FOLDER = 'keiei-soudan-ai-files';
const CONSULTATIONS_FILE = 'consultations.json';

const driveState = {
  initialized: false,
  dataFolderId: '',
  filesFolderId: '',
  consultationsFileId: '',
};

async function ensureGapiClient() {
  if (!window.gapi) {
    throw new Error('Google APIクライアント（gapi）が読み込まれていません。');
  }

  if (!driveState.initialized) {
    await new Promise((resolve, reject) => {
      window.gapi.load('client', {
        callback: resolve,
        onerror: () => reject(new Error('gapi clientの初期化に失敗しました。')),
      });
    });
    await window.gapi.client.init({ discoveryDocs: [DRIVE_DISCOVERY] });
    driveState.initialized = true;
  }

  const token = window.gapi.client.getToken?.()?.access_token;
  if (!token) {
    throw new Error('Googleログインが必要です。アクセストークンが見つかりません。');
  }
  return token;
}

async function ensureFolder(name) {
  const escapedName = String(name).replaceAll("'", "\\'");
  const q = `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${escapedName}'`;
  const listed = await window.gapi.client.drive.files.list({ q, fields: 'files(id,name)', pageSize: 1 });
  if (listed.result.files?.length) return listed.result.files[0].id;

  const created = await window.gapi.client.drive.files.create({
    resource: { name, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return created.result.id;
}

async function ensureConsultationsFile(folderId) {
  const q = `'${folderId}' in parents and trashed=false and name='${CONSULTATIONS_FILE}'`;
  const listed = await window.gapi.client.drive.files.list({ q, fields: 'files(id,name)', pageSize: 1 });
  if (listed.result.files?.length) return listed.result.files[0].id;

  const boundary = 'drive_json_boundary';
  const metadata = { name: CONSULTATIONS_FILE, parents: [folderId], mimeType: 'application/json' };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n[]\r\n` +
    `--${boundary}--`;

  const created = await window.gapi.client.request({
    path: '/upload/drive/v3/files',
    method: 'POST',
    params: { uploadType: 'multipart' },
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });

  return created.result.id;
}

async function ensureDrivePaths() {
  await ensureGapiClient();

  if (!driveState.dataFolderId) driveState.dataFolderId = await ensureFolder(DATA_FOLDER);
  if (!driveState.filesFolderId) driveState.filesFolderId = await ensureFolder(FILES_FOLDER);
  if (!driveState.consultationsFileId) {
    driveState.consultationsFileId = await ensureConsultationsFile(driveState.dataFolderId);
  }

  return { ...driveState };
}

export async function loadRecords() {
  await ensureDrivePaths();
  const res = await window.gapi.client.drive.files.get({ fileId: driveState.consultationsFileId, alt: 'media' });
  return Array.isArray(res.result) ? res.result : [];
}

export async function saveRecords(records) {
  await ensureDrivePaths();
  const payload = Array.isArray(records) ? records : [];
  const boundary = 'drive_json_boundary';
  const metadata = { mimeType: 'application/json' };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n` +
    `--${boundary}--`;

  await window.gapi.client.request({
    path: `/upload/drive/v3/files/${driveState.consultationsFileId}`,
    method: 'PATCH',
    params: { uploadType: 'multipart' },
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

export async function uploadAttachment(file) {
  const token = await ensureGapiClient();
  await ensureDrivePaths();

  const metadata = { name: file.name, parents: [driveState.filesFolderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,createdTime,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`添付ファイルのDrive保存に失敗しました: ${text || resp.status}`);
  }

  return resp.json();
}

export function getStorageTargetInfo() {
  return {
    dataFolderName: DATA_FOLDER,
    filesFolderName: FILES_FOLDER,
    consultationsFileName: CONSULTATIONS_FILE,
  };
}
