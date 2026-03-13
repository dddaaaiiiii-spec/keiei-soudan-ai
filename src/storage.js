const CLIENT_ID = "611836615589-2frs69tns3q77dbf0a4f7fuikgc307hb.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/drive.file";

const DATA_FOLDER_NAME = "keiei-soudan-ai-data";
const FILES_FOLDER_NAME = "keiei-soudan-ai-files";
const CONSULTATIONS_FILE_NAME = "consultations.json";

let tokenClient = null;
let accessToken = null;
let gisPromise = null;

function loadGoogleScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Google GIS の読み込みに失敗しました"));
    document.head.appendChild(script);
  });

  return gisPromise;
}

async function ensureTokenClient() {
  await loadGoogleScript();

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: () => {}
    });
  }
}

async function getAccessToken() {
  await ensureTokenClient();

  if (accessToken) return accessToken;

  accessToken = await new Promise((resolve, reject) => {
    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.access_token);
    };

    tokenClient.requestAccessToken({ prompt: "consent" });
  });

  return accessToken;
}

async function driveFetch(url, options = {}) {
  const token = await getAccessToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Drive API error: ${response.status} ${text}`);
  }

  return response;
}

function escapeQueryValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolderByName(name) {
  const q = [
    `name='${escapeQueryValue(name)}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    `trashed=false`
  ].join(" and ");

  const url =
    "https://www.googleapis.com/drive/v3/files" +
    `?q=${encodeURIComponent(q)}` +
    "&fields=files(id,name)" +
    "&pageSize=10";

  const response = await driveFetch(url);
  const data = await response.json();
  return data.files?.[0] || null;
}

async function createFolder(name) {
  const response = await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder"
    })
  });

  return response.json();
}

async function ensureFolder(name) {
  const found = await findFolderByName(name);
  if (found) return found.id;

  const created = await createFolder(name);
  return created.id;
}

async function findFileInFolder(fileName, folderId) {
  const q = [
    `name='${escapeQueryValue(fileName)}'`,
    `'${folderId}' in parents`,
    `trashed=false`
  ].join(" and ");

  const url =
    "https://www.googleapis.com/drive/v3/files" +
    `?q=${encodeURIComponent(q)}` +
    "&fields=files(id,name,modifiedTime)" +
    "&pageSize=10";

  const response = await driveFetch(url);
  const data = await response.json();
  return data.files?.[0] || null;
}

async function createMultipartFile({ name, mimeType, body, folderId }) {
  const metadata = {
    name,
    mimeType,
    parents: [folderId]
  };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", body);

  const response = await driveFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
    {
      method: "POST",
      body: form
    }
  );

  return response.json();
}

async function updateMultipartFile({ fileId, mimeType, body }) {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ mimeType })], { type: "application/json" }));
  form.append("file", body);

  const response = await driveFetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name`,
    {
      method: "PATCH",
      body: form
    }
  );

  return response.json();
}

async function downloadTextFile(fileId) {
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return response.text();
}

async function ensureConsultationsFile() {
  const folderId = await ensureFolder(DATA_FOLDER_NAME);
  const existing = await findFileInFolder(CONSULTATIONS_FILE_NAME, folderId);

  if (existing) {
    return { folderId, fileId: existing.id };
  }

  const emptyBlob = new Blob([JSON.stringify([], null, 2)], {
    type: "application/json"
  });

  const created = await createMultipartFile({
    name: CONSULTATIONS_FILE_NAME,
    mimeType: "application/json",
    body: emptyBlob,
    folderId
  });

  return { folderId, fileId: created.id };
}

export async function loadRecords() {
  const { fileId } = await ensureConsultationsFile();
  const text = await downloadTextFile(fileId);

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveRecords(records) {
  const { fileId } = await ensureConsultationsFile();

  const blob = new Blob([JSON.stringify(records || [], null, 2)], {
    type: "application/json"
  });

  await updateMultipartFile({
    fileId,
    mimeType: "application/json",
    body: blob
  });

  return true;
}

export async function uploadAttachment(file) {
  if (!file) throw new Error("ファイルが選択されていません");

  const folderId = await ensureFolder(FILES_FOLDER_NAME);

  const uploaded = await createMultipartFile({
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    body: file,
    folderId
  });

  return {
    id: uploaded.id,
    name: uploaded.name,
    webViewLink: `https://drive.google.com/file/d/${uploaded.id}/view`
  };
}

export async function listAttachments() {
  const folderId = await ensureFolder(FILES_FOLDER_NAME);
  const q = [`'${folderId}' in parents`, `trashed=false`].join(" and ");

  const url =
    "https://www.googleapis.com/drive/v3/files" +
    `?q=${encodeURIComponent(q)}` +
    "&fields=files(id,name,mimeType,modifiedTime)" +
    "&pageSize=100";

  const response = await driveFetch(url);
  const data = await response.json();

  return (data.files || []).map((file) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    webViewLink: `https://drive.google.com/file/d/${file.id}/view`
  }));
}

export function clearDriveSession() {
  accessToken = null;
}
