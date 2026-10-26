function safeFileName(name: string) {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned || 'storyboard';
}

/** Browser download of a Blob as a file. */
export async function saveBlob(blob: Blob, filename: string) {
  const name = safeFileName(filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
