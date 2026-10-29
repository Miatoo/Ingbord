/** 导出物品牌信息（开源版本地导出用，无后端） */
export const EXPORT_BRAND = {
  name: '影格 Ingbord',
  nameEn: 'Ingbord',
  site: 'https://www.aitocg.cn/ingbord/',
  siteHost: 'www.aitocg.cn/ingbord',
  watermarkZh: '影格 Ingbord  www.aitocg.cn/ingbord',
  watermarkEn: 'Ingbord  www.aitocg.cn/ingbord',
  creditZh: '由影格 Ingbord 制作 · www.aitocg.cn/ingbord',
  creditEn: 'Made with Ingbord · www.aitocg.cn/ingbord',
  pageHeaderZh: '第 {page} 页',
  pageHeaderEn: 'Page {page}',
  readmeZh: `本文件由影格 Ingbord 导出。

工具主站：https://www.aitocg.cn/ingbord/
开源仓库：https://github.com/Miatoo/Ingbord
`,
  readmeEn: `Exported with Ingbord.

Website: https://www.aitocg.cn/ingbord/
Repository: https://github.com/Miatoo/Ingbord
`,
} as const;

/** 按界面语言解析 PDF 右上角页码文案（默认模板随语言切换） */
export function resolvePdfPageHeaderText(
  stored: string | undefined,
  locale: 'zh' | 'en'
): string {
  const value = (stored || '').trim();
  const zhDefault = EXPORT_BRAND.pageHeaderZh;
  const enDefault = EXPORT_BRAND.pageHeaderEn;
  if (!value || value === zhDefault || value === enDefault) {
    return locale === 'en' ? enDefault : zhDefault;
  }
  if (locale === 'en' && /第\s*\{page\}\s*页/.test(value)) {
    return enDefault;
  }
  if (locale === 'zh' && /^Page\s*\{page\}$/i.test(value)) {
    return zhDefault;
  }
  return value;
}

/** ZIP / 文本类导出附带的品牌说明 */
export function exportBrandReadme(locale: 'zh' | 'en' = 'zh'): string {
  return locale === 'en' ? EXPORT_BRAND.readmeEn : EXPORT_BRAND.readmeZh;
}
