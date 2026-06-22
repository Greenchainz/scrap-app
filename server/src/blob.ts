// Azure Blob Storage helpers for scan images.
//
// Centralizes SAS generation so the container stays PRIVATE (no anonymous public
// read) and clients only ever receive least-privilege, short-lived tokens:
//   - upload SAS: create/write only, used by the mobile app to PUT one image.
//   - read SAS:   read only, minted server-side just before the OpenAI vision
//                 call so GPT-4o can fetch an otherwise-private blob.
//
// Auth uses the storage account connection string (shared key) already wired
// through BLOB_STORAGE_CONNECTION_STRING, matching the rest of the server.

import {
  BlobServiceClient,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';

const UPLOAD_SAS_TTL_MS = 15 * 60 * 1000; // 15 min: time to capture + upload
const READ_SAS_TTL_MS = 5 * 60 * 1000; // 5 min: just long enough for the OpenAI fetch

export type UploadSas = { uploadUrl: string; blobUrl: string };

function getContainerName(): string {
  return process.env['BLOB_CONTAINER_NAME'] ?? 'scrap-images';
}

function getSharedKeyCredential(
  serviceClient: BlobServiceClient,
  connStr: string,
): StorageSharedKeyCredential {
  const accountName = serviceClient.accountName;
  const accountKey = connStr.match(/AccountKey=([^;]+)/)?.[1] ?? '';
  return new StorageSharedKeyCredential(accountName, accountKey);
}

// Strips any path components and keeps a safe filename, then namespaces it with a
// timestamp to avoid collisions. Prevents path traversal into other blobs/containers.
export function sanitizeBlobName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'scan';
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128) || 'scan';
  return `${Date.now()}-${safe}`;
}

// Returns the decoded blob name when `blobUrl` points at `<container>/<blob>` of
// our container, otherwise null. Scoped strictly to our container so we never
// sign a SAS for an arbitrary, attacker-supplied blob path.
export function extractOwnBlobName(blobUrl: string, containerUrl: string): string | null {
  const blob = new URL(blobUrl);
  const container = new URL(containerUrl);
  if (blob.host !== container.host) return null;

  const prefix = container.pathname.endsWith('/') ? container.pathname : `${container.pathname}/`;
  if (!blob.pathname.startsWith(prefix)) return null;

  const encodedName = blob.pathname.slice(prefix.length);
  if (!encodedName) return null;
  return decodeURIComponent(encodedName);
}

// Creates (if needed) a PRIVATE container and returns a write-only upload URL
// plus the bare blob URL the client will later submit for analysis.
export async function createUploadSas(filename: string): Promise<UploadSas> {
  const connStr = process.env['BLOB_STORAGE_CONNECTION_STRING'];
  if (!connStr) {
    throw new Error('Blob storage not configured');
  }
  const containerName = getContainerName();

  const serviceClient = BlobServiceClient.fromConnectionString(connStr);
  const containerClient = serviceClient.getContainerClient(containerName);
  // No `access` option => private container (no anonymous public read).
  await containerClient.createIfNotExists();

  const blobName = sanitizeBlobName(filename);
  const blobClient = containerClient.getBlobClient(blobName);
  const credential = getSharedKeyCredential(serviceClient, connStr);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('cw'), // create + write only — no read/delete
      expiresOn: new Date(Date.now() + UPLOAD_SAS_TTL_MS),
    },
    credential,
  ).toString();

  return {
    uploadUrl: `${blobClient.url}?${sasToken}`,
    blobUrl: blobClient.url,
  };
}

// Given a bare blob URL that belongs to our storage account + container, returns
// a short-lived READ-ONLY SAS URL so the OpenAI vision API can fetch the (now
// private) image. URLs that don't belong to our container — or when storage is
// unconfigured — are returned unchanged, so analysis never breaks.
export async function toReadableImageUrl(blobUrl: string): Promise<string> {
  const connStr = process.env['BLOB_STORAGE_CONNECTION_STRING'];
  if (!connStr) return blobUrl;

  let serviceClient: BlobServiceClient;
  try {
    serviceClient = BlobServiceClient.fromConnectionString(connStr);
  } catch {
    return blobUrl;
  }

  const containerName = getContainerName();
  const containerClient = serviceClient.getContainerClient(containerName);

  let blobName: string | null;
  try {
    blobName = extractOwnBlobName(blobUrl, containerClient.url);
  } catch {
    return blobUrl; // not a parseable URL — leave it untouched
  }
  if (!blobName) return blobUrl;

  const credential = getSharedKeyCredential(serviceClient, connStr);
  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'), // read only
      expiresOn: new Date(Date.now() + READ_SAS_TTL_MS),
    },
    credential,
  ).toString();

  const blobClient = containerClient.getBlobClient(blobName);
  return `${blobClient.url}?${sasToken}`;
}
