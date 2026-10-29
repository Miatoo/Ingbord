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

/** PDF 导出现在始终带品牌水印/角标；此开关保留兼容，开源版不再单独控制 */
export function showPdfCreditFooter(): boolean {
  return true;
}

export function canUseByokAI(): boolean {
  return true;
}

export function getAiCredits(): number {
  return 0;
}
