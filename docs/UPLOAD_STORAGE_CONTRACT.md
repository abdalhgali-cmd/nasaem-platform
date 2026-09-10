# Upload storage contract

## Runtime root

- Development and tests default to `<process.cwd()>/uploads`.
- Production must set `UPLOAD_ROOT` to an absolute path on persistent storage. The intended Railway mount is `/data/uploads`.
- Production startup fails closed when `UPLOAD_ROOT` is missing or relative.
- All disk-backed upload writers and readers resolve through `backend/src/config/uploadRoot.js`.

## PostgreSQL values

New rows store a path relative to `UPLOAD_ROOT`, never an absolute server path. Current prefixes are:

- `documents/<generated-name>`
- `contact-request-documents/<generated-name>`
- `contact-request-deliverables/<generated-name>`
- `site-assets/<generated-name>`

The database continues to store the original client filename separately for download/display. Passport OCR buffers are transient; saved passport documents follow the relative-path contract above.

## Historical compatibility

`resolveStoredUploadPath()` accepts and safely maps all known historical shapes:

- current relative paths such as `documents/file.pdf`
- legacy root-prefixed paths such as `uploads/documents/file.pdf`
- legacy absolute paths whose suffix is `/uploads/...`, such as `/app/uploads/documents/file.pdf`
- absolute paths already under the configured `UPLOAD_ROOT`

Legacy shapes are mapped onto the current configured root, so changing the mount to `/data/uploads` does not require a destructive database migration. Traversal and unrelated absolute paths fail closed. Existing file bytes must still be copied/mounted under the matching relative directory on the persistent volume; this code does not delete or relocate historical files.

## Staging persistence gate

Before Production rollout, Staging must prove:

1. upload a file;
2. download it;
3. restart or redeploy the backend;
4. download the same database record again;
5. confirm the bytes are unchanged.

This gate is not satisfied by local or CI filesystem tests because those do not prove Railway Volume persistence.
