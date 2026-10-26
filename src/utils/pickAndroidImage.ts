/** Web-only build: no native Android Capacitor camera. */
export function isAndroidApp() {
  return false;
}

export async function pickAndroidShotImage(_labels: {
  title: string;
  gallery: string;
  camera: string;
  cancel: string;
}): Promise<string | null> {
  return null;
}
