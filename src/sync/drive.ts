import { isAccountId, isDriveFileId, isDriveVersion } from './decide';
import { LIMITS } from '../model/limits';
import { t } from '../i18n';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const BACKUP_NAME = 'Brassy backup.json';
const APP_PROP = { key: 'brassy', value: 'backup-v1' };

export class DriveAuthError extends Error {}
export class DriveError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  } catch {
    throw new DriveError(t('gdrive.offline'));
  }
  if (res.status === 401) throw new DriveAuthError(t('gdrive.signInAgain'));
  if (!res.ok) throw new DriveError(t('gdrive.refused', res.status), res.status);
  return res;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  const v: unknown = await res.json().catch(() => null);
  if (!v || typeof v !== 'object') throw new DriveError(t('gdrive.unexpected'));
  return v as Record<string, unknown>;
}

export type Account = { accountId: string; email: string };

export async function getAccount(token: string): Promise<Account> {
  const r = await json(await call(token, `${API}/about?fields=user(permissionId,emailAddress)`));
  const user = (r.user ?? {}) as Record<string, unknown>;
  if (!isAccountId(user.permissionId)) throw new DriveError(t('gdrive.unexpected'));
  const email = typeof user.emailAddress === 'string' && user.emailAddress.length <= 320 ? user.emailAddress : '';
  return { accountId: user.permissionId, email };
}

export type FileInfo = { fileId: string; version: string };

function fileInfo(v: Record<string, unknown>): FileInfo {
  if (!isDriveFileId(v.id) || !isDriveVersion(v.version)) throw new DriveError(t('gdrive.unexpected'));
  return { fileId: v.id, version: v.version };
}

/** Our backup file (drive.file only lists files this app created). Newest first if there are several. */
export async function findBackup(token: string): Promise<FileInfo | null> {
  const q = `appProperties has { key='${APP_PROP.key}' and value='${APP_PROP.value}' } and trashed = false`;
  const url = `${API}/files?${new URLSearchParams({ q, spaces: 'drive', orderBy: 'modifiedTime desc', pageSize: '10', fields: 'files(id,version)' })}`;
  const r = await json(await call(token, url));
  const files = Array.isArray(r.files) ? r.files : [];
  const first = files[0];
  return first && typeof first === 'object' ? fileInfo(first as Record<string, unknown>) : null;
}

export async function getFileInfo(token: string, fileId: string): Promise<FileInfo | null> {
  if (!isDriveFileId(fileId)) throw new DriveError('Bad file id.');
  try {
    const r = await json(await call(token, `${API}/files/${fileId}?fields=id,version,trashed`));
    return r.trashed === true ? null : fileInfo(r);
  } catch (e) {
    if (e instanceof DriveError && e.status === 404) return null;
    throw e;
  }
}

export async function download(token: string, fileId: string): Promise<string> {
  if (!isDriveFileId(fileId)) throw new DriveError('Bad file id.');
  const res = await call(token, `${API}/files/${fileId}?alt=media`);
  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len) && len > LIMITS.backupFileMaxBytes) throw new DriveError(t('gdrive.tooBig'));
  const text = await res.text();
  if (text.length > LIMITS.backupFileMaxBytes) throw new DriveError(t('gdrive.tooBig'));
  return text;
}

export async function createBackup(token: string, content: string): Promise<FileInfo> {
  const boundary = `brassy${crypto.randomUUID().replace(/-/g, '')}`;
  const meta = { name: BACKUP_NAME, mimeType: 'application/json', appProperties: { [APP_PROP.key]: APP_PROP.value } };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await call(token, `${UPLOAD}/files?uploadType=multipart&fields=id,version`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return fileInfo(await json(res));
}

export async function updateBackup(token: string, fileId: string, content: string): Promise<FileInfo> {
  if (!isDriveFileId(fileId)) throw new DriveError('Bad file id.');
  const res = await call(token, `${UPLOAD}/files/${fileId}?uploadType=media&fields=id,version`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  });
  return fileInfo(await json(res));
}
