/** Open-source build: all features unlocked, no membership gates. */

export type ExportFormat = 'pdf' | 'excel' | 'csv' | 'images';

export function isFullTier(): boolean {
  return true;
}

export function canCreateOrImportProject(_libraryCount: number): boolean {
  return true;
}

export function canAddShot(_shotCount: number): boolean {
  return true;
}

export function canImportExcel(): boolean {
  return true;
}

export function canExport(_format: ExportFormat): boolean {
  return true;
}

export function canImportCustomModel(): boolean {
  return true;
}

export function showPdfCreditFooter(): boolean {
  return false;
}

export function canUseByokAI(): boolean {
  return true;
}

export function getAiCredits(): number {
  return 0;
}
