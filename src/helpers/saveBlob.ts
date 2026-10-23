/**
 * How long an object URL outlives its download click. Revoking during the
 * click can cancel the download in some browsers, so it is revoked shortly
 * after instead; the file is already in the browser's hands by then.
 */
export const OBJECT_URL_REVOKE_DELAY_MS = 10_000;

/**
 * Hands a Blob to the browser as a download named `fileName`, from memory:
 * nothing is uploaded or opened in a tab. The temporary link is removed at
 * once and the object URL revoked after OBJECT_URL_REVOKE_DELAY_MS.
 */
export const saveBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
  }
};
