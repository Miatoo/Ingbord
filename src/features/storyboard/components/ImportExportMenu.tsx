import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '../../../store/projectStore';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import { useTranslation } from '../../../i18n/useTranslation';
import { saveBlob } from '../../../utils/saveFile';
import { upsertSavedProject } from '../../../services/projectService';
import { isClapboardProjectFile, parseProjectFile } from '../../../services/projectFileFormat';
import { buildStoryboardWorkbook, parseStoryboardWorkbook } from '../../../services/excelIO';
import { UiIcon } from './UiIcon';
import { anchorPortalMenu } from '../../../utils/anchorPortalMenu';

export function ImportExportMenu({ block = false }: { block?: boolean }) {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const getShotsSorted = useProjectStore((state) => state.getShotsSorted);
  const importProject = useProjectStore((state) => state.importProject);
  const setProjectFromServer = useProjectStore((state) => state.setProjectFromServer);
  const [isExporting, setIsExporting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, maxHeight: 400 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showMenu || !buttonRef.current) return;
    const update = () => {
      if (!buttonRef.current) return;
      setMenuPosition(
        anchorPortalMenu(buttonRef.current.getBoundingClientRect(), {
          estimatedHeight: 420,
        })
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showMenu]);

  const confirmOverwrite = () =>
    window.confirm(
      project
        ? t('import.confirmOverwrite').replace('{name}', project.name)
        : t('import.confirm')
    );

  const handleImportProjectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.json') && !lower.endsWith('.clapboard')) {
      alert(t('import.invalidFileType'));
      e.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!confirmOverwrite()) return;

      if (
        isClapboardProjectFile(parsed) ||
        (parsed && typeof parsed === 'object' && Array.isArray(parsed.shots))
      ) {
        const full = parseProjectFile(text);
        await upsertSavedProject(full);
        setProjectFromServer(full);
        alert(t('import.success'));
        return;
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error(t('import.invalidJson'));
      }
      if (!parsed.project) {
        throw new Error(t('import.missingProject'));
      }
      if (!Array.isArray(parsed.shots)) {
        throw new Error(t('import.missingShots'));
      }

      await importProject({
        project: {
          name: parsed.project.name,
          aspectRatio: parsed.project.aspectRatio,
          pdfHeaderText: parsed.project.pdfHeaderText,
          pdfColumns: parsed.project.pdfColumns,
          pdfRows: parsed.project.pdfRows,
          pdfPageWidthMm: parsed.project.pdfPageWidthMm,
          pdfPageHeightMm: parsed.project.pdfPageHeightMm,
          createdAt: parsed.project.createdAt,
        },
        shots: parsed.shots || [],
      });
      alert(t('import.success'));
    } catch (error) {
      console.error('导入失败:', error);
      alert(
        `${t('import.failedPrefix')}${error instanceof Error ? error.message : t('aiImage.status.unknownError')}`
      );
    } finally {
      e.target.value = '';
      setShowMenu(false);
    }
  };

  const handleImportExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      alert(t('import.invalidExcelType'));
      e.target.value = '';
      return;
    }

    try {
      if (!confirmOverwrite()) return;
      const buffer = await file.arrayBuffer();
      const data = await parseStoryboardWorkbook(buffer);
      await importProject(data);
      alert(t('import.success'));
    } catch (error) {
      console.error('导入 Excel 失败:', error);
      const msg =
        error instanceof Error && /missing shots|empty workbook/i.test(error.message)
          ? t('import.excelEmpty')
          : error instanceof Error
            ? error.message
            : t('aiImage.status.unknownError');
      alert(`${t('import.failedPrefix')}${msg}`);
    } finally {
      e.target.value = '';
      setShowMenu(false);
    }
  };

  const handleExportExcel = async () => {
    if (!project) return;
    setIsExporting(true);
    setShowMenu(false);
    try {
      const shots = getShotsSorted();
      const blob = await buildStoryboardWorkbook(project, shots);
      await saveBlob(blob, `${project.name || 'storyboard'}.xlsx`);
    } catch (error) {
      console.error('导出 Excel 失败:', error);
      alert(t('export.excelFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    if (!project) return;
    setShowMenu(false);
    setIsExporting(true);
    try {
      const shots = getShotsSorted();
      
      // 创建 ZIP 文件，包含 CSV 和所有图片
      const zip = new JSZip();
      
      // CSV 中只包含图片文件名，不包含 base64 编码
      const headers = ['Shot Number', 'Order', 'Framing', 'Camera Angle', 'Shot Type', 'Duration', 'Notes', 'Image File'];
      const rows = shots.map((shot) => {
        const imageFileName = shot.image ? `Shot_${shot.shotNumber.padStart(3, '0')}.png` : '';
        return [
          shot.shotNumber,
          shot.order,
          shot.framing,
          shot.cameraAngle,
          shot.shotType,
          shot.duration,
          `"${shot.notes.replace(/"/g, '""')}"`,
          imageFileName,
        ];
      });

      const csv = [
        headers.join(','),
        ...rows.map((row) => row.join(',')),
      ].join('\n');

      // 将 CSV 添加到 ZIP
      zip.file(`${project.name || 'storyboard'}.csv`, '\ufeff' + csv);

      // 将所有图片添加到 ZIP
      for (const shot of shots) {
        if (shot.image) {
          const base64Data = shot.image.split(',')[1] || shot.image;
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'image/png' });
          const filename = `Shot_${shot.shotNumber.padStart(3, '0')}.png`;
          zip.file(filename, blob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      await saveBlob(zipBlob, `${project.name || 'storyboard'}_export.zip`);
    } catch (error) {
      console.error('导出 CSV 失败:', error);
      alert(t('export.csvFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportImages = async () => {
    if (!project) return;
    setShowMenu(false);
    setIsExporting(true);
    try {
      const shots = getShotsSorted();
      const zip = new JSZip();

      for (const shot of shots) {
        if (shot.image) {
          // 将 base64 转换为 blob
          const base64Data = shot.image.split(',')[1] || shot.image;
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'image/png' });
          const filename = `Shot_${shot.shotNumber.padStart(3, '0')}.png`;
          zip.file(filename, blob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      await saveBlob(zipBlob, `${project.name || 'storyboard'}_images.zip`);
    } catch (error) {
      console.error('导出图片失败:', error);
      alert(t('export.imagesFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  // 辅助函数：将中文文本渲染为图片（解决 jsPDF 中文乱码问题）
  const renderChineseTextToImage = (
    text: string,
    fontSize: number,
    color: { r: number; g: number; b: number } = { r: 100, g: 100, b: 100 }
  ): { imageData: string; width: number; height: number } => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return { imageData: '', width: 0, height: 0 };

    // 设置字体和大小（优先使用系统中文字体）
    ctx.font = `${fontSize}px "Microsoft YaHei", "SimHei", "SimSun", Arial, sans-serif`;
    ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    ctx.textBaseline = 'top';

    // 测量文本宽度
    const metrics = ctx.measureText(text);
    const textWidth = Math.ceil(metrics.width);
    const textHeight = Math.ceil(fontSize * 1.2); // 行高

    // 设置画布大小（添加一些 padding）
    const padding = 10;
    canvas.width = textWidth + padding * 2;
    canvas.height = textHeight + padding * 2;

    // 重新设置上下文（canvas 尺寸改变后需要重新设置）
    ctx.font = `${fontSize}px "Microsoft YaHei", "SimHei", "SimSun", Arial, sans-serif`;
    ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    ctx.textBaseline = 'top';

    // 绘制文本
    ctx.fillText(text, padding, padding);

    return {
      imageData: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    };
  };

  const renderShotCaption = (
    shot: { shotNumber: string; framing: string; cameraAngle: string; duration: number; notes?: string },
    widthPx: number
  ): { imageData: string; width: number; height: number } => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return { imageData: '', width: 0, height: 0 };

    const font = '"Microsoft YaHei", "SimHei", "SimSun", Arial, sans-serif';
    const titleSize = 28;
    const noteSize = 22;
    const pad = 4;
    const maxW = Math.max(80, widthPx - pad * 2);

    const wrap = (text: string, size: number, maxLines: number) => {
      ctx.font = `${size}px ${font}`;
      const chars = Array.from(text);
      const lines: string[] = [];
      let current = '';
      let consumed = 0;
      for (const ch of chars) {
        const trial = current + ch;
        if (ctx.measureText(trial).width > maxW && current) {
          lines.push(current);
          current = ch;
          if (lines.length === maxLines) break;
        } else {
          current = trial;
        }
        consumed += 1;
      }
      if (lines.length < maxLines && current) lines.push(current);
      const overflow = consumed < chars.length;
      if (overflow && lines.length > 0) {
        let last = lines[lines.length - 1];
        while (last.length > 0 && ctx.measureText(`${last}…`).width > maxW) {
          last = last.slice(0, -1);
        }
        lines[lines.length - 1] = `${last}…`;
      }
      return lines;
    };

    const title = `#${shot.shotNumber}  ${shot.framing} / ${shot.cameraAngle}`;
    const duration = shot.duration > 0 ? `${shot.duration}s` : '';
    const noteLines = shot.notes && String(shot.notes).trim()
      ? wrap(String(shot.notes).trim(), noteSize, 2)
      : [];
    const height =
      pad * 2 +
      titleSize +
      (noteLines.length ? 6 + noteLines.length * (noteSize + 4) : 0);

    canvas.width = widthPx;
    canvas.height = Math.ceil(height);
    ctx.textBaseline = 'top';
    ctx.font = `${titleSize}px ${font}`;
    const durationWidth = duration ? ctx.measureText(duration).width : 0;
    const titleMax = Math.max(40, maxW - (durationWidth > 0 ? durationWidth + 16 : 0));
    ctx.font = `700 ${titleSize}px ${font}`;
    ctx.fillStyle = '#111111';
    ctx.fillText(title, pad, pad, titleMax);
    if (duration) {
      ctx.font = `${titleSize}px ${font}`;
      ctx.fillText(duration, widthPx - pad - durationWidth, pad);
    }
    ctx.font = `${noteSize}px ${font}`;
    ctx.fillStyle = '#3f3f46';
    noteLines.forEach((line, index) => {
      ctx.fillText(line, pad, pad + titleSize + 6 + index * (noteSize + 4), maxW);
    });

    return {
      imageData: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    };
  };

  const handleExportPDF = async () => {
    if (!project) return;
    setShowMenu(false);
    setIsExporting(true);
    try {
      const shots = getShotsSorted();
      
      // 解析项目的画幅比例
      const ratioString = project.aspectRatio || '16:9';
      const [wStr, hStr] = ratioString.split(':');
      const w = parseFloat(wStr || '16');
      const h = parseFloat(hStr || '9');
      const aspect = h === 0 ? 16 / 9 : w / h;
      
      const cols = Math.min(12, Math.max(1, Math.round(project.pdfColumns || 4)));
      const rows = Math.min(12, Math.max(1, Math.round(project.pdfRows || 3)));
      const defaultPortrait = aspect < 1;
      const pageWidth = project.pdfPageWidthMm || (defaultPortrait ? 210 : 297);
      const pageHeight = project.pdfPageHeightMm || (defaultPortrait ? 297 : 210);
      const pdf = new jsPDF({
        orientation: pageWidth >= pageHeight ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [pageWidth, pageHeight],
      });

      const drawEmptyFrame = (x: number, y: number, width: number, height: number) => {
        pdf.setFillColor(244, 244, 245);
        pdf.rect(x, y, width, height, 'F');
        const label = renderChineseTextToImage(t('shot.noImage'), 22, { r: 63, g: 63, b: 70 });
        if (!label.imageData || label.width <= 0 || label.height <= 0) return;
        const labelW = (label.width / 96) * 25.4;
        const labelH = (label.height / 96) * 25.4;
        const scale = Math.min((width * 0.8) / labelW, (height * 0.4) / labelH, 1);
        const drawW = labelW * scale;
        const drawH = labelH * scale;
        pdf.addImage(label.imageData, 'PNG', x + (width - drawW) / 2, y + (height - drawH) / 2, drawW, drawH);
      };
      
      const margin = 16;
      const headerHeight = 18;
      const footerHeight = 0;
      const gap = 4;
      
      // 计算可用区域
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2 - headerHeight - footerHeight;
      
      // 计算每个卡片的大小（考虑间距）
      const totalGapWidth = gap * (cols - 1);
      const totalGapHeight = gap * (rows - 1);
      const cardWidth = (usableWidth - totalGapWidth) / cols;
      const cardHeight = (usableHeight - totalGapHeight) / rows;
      
      // 卡片内边距；标签区高度与字号随卡片比例变化（9:16 等竖版时标签不会过大）
      const cardPadding = 3;
      const innerHeight = Math.max(0, cardHeight - cardPadding * 2);
      const infoHeight = Math.min(16, innerHeight * 0.32);
      const imageAreaWidth = cardWidth - cardPadding * 2;
      const imageAreaHeight = Math.max(0, innerHeight - infoHeight);
      
      // 计算图片区域的实际尺寸，使其与安全框画幅比例一致
      let finalImageAreaWidth = imageAreaWidth;
      let finalImageAreaHeight = imageAreaHeight;
      
      const imageAreaAspect = imageAreaWidth / imageAreaHeight;
      
      if (imageAreaAspect > aspect) {
        // 图片区域更宽，以高度为准，调整宽度
        finalImageAreaWidth = imageAreaHeight * aspect;
      } else {
        // 图片区域更高，以宽度为准，调整高度
        finalImageAreaHeight = imageAreaWidth / aspect;
      }
      
      // 计算居中偏移
      const imageOffsetX = (imageAreaWidth - finalImageAreaWidth) / 2;
      const imageOffsetY = (imageAreaHeight - finalImageAreaHeight) / 2;
      
      // 辅助函数：获取图片尺寸（从 base64）
      const getImageDimensions = (base64Image: string): Promise<{ width: number; height: number }> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            resolve({ width: img.width, height: img.height });
          };
          img.onerror = () => {
            resolve({ width: 1, height: 1 }); // 默认比例
          };
          img.src = base64Image;
        });
      };
      
      // 预先获取所有图片的尺寸
      const imageDimensionsMap = new Map<string, { width: number; height: number }>();
      await Promise.all(
        shots.map(async (shot) => {
          if (shot.image) {
            const dims = await getImageDimensions(shot.image);
            imageDimensionsMap.set(shot.id, dims);
          }
        })
      );
      
      let shotIndex = 0;
      let pageNum = 0;
      
      while (shotIndex < shots.length) {
        if (pageNum > 0) {
          pdf.addPage();
        }
        
        // 绘制页面标题（使用 Canvas 渲染中文）
        const titleText = project.name || t('app.title');
        const titleResult = renderChineseTextToImage(titleText, 16, { r: 0, g: 0, b: 0 });
        if (titleResult.imageData && titleResult.width > 0 && titleResult.height > 0) {
          // 将像素转换为 mm（假设 96 DPI: 1 inch = 25.4mm, 96 pixels = 25.4mm）
          const titleWidthMm = (titleResult.width / 96) * 25.4;
          const titleHeightMm = (titleResult.height / 96) * 25.4;
          pdf.addImage(titleResult.imageData, 'PNG', margin, margin, titleWidthMm, titleHeightMm);
        }
        
        // 绘制右上角文本（支持占位符 {page}，使用 Canvas 渲染中文）
        const headerText = project.pdfHeaderText || t('settings.pdfHeaderText.placeholder');
        const headerTextWithPage = headerText.replace(/\{page\}/g, String(pageNum + 1));
        const headerResult = renderChineseTextToImage(headerTextWithPage, 14, { r: 63, g: 63, b: 70 });
        if (headerResult.imageData && headerResult.width > 0 && headerResult.height > 0) {
          // 将像素转换为 mm（假设 96 DPI）
          const headerWidthMm = (headerResult.width / 96) * 25.4;
          const headerHeightMm = (headerResult.height / 96) * 25.4;
          // 右对齐：从页面右边缘减去边距和图片宽度
          pdf.addImage(
            headerResult.imageData,
            'PNG',
            pageWidth - margin - headerWidthMm,
            margin,
            headerWidthMm,
            headerHeightMm
          );
        }
        
        // 绘制每个镜头卡片
        for (let r = 0; r < rows && shotIndex < shots.length; r++) {
          for (let c = 0; c < cols && shotIndex < shots.length; c++) {
            const shot = shots[shotIndex];
            
            // 计算卡片位置
            const cardX = margin + c * (cardWidth + gap);
            const cardY = margin + headerHeight + r * (cardHeight + gap);
            
            // 绘制卡片阴影效果（浅灰色矩形，稍微偏移）
            pdf.setFillColor(240, 240, 240);
            pdf.setDrawColor(240, 240, 240);
            pdf.rect(cardX + 1, cardY + 1, cardWidth, cardHeight, 'F');
            
            // 绘制卡片背景（白色，模拟卡片效果）
            pdf.setFillColor(255, 255, 255);
            pdf.setDrawColor(220, 220, 220); // 浅灰色边框
            pdf.setLineWidth(0.5);
            pdf.rect(cardX, cardY, cardWidth, cardHeight, 'FD'); // FD = fill and draw
            
            // 图片区域（已根据安全框画幅比例调整）
            const imageX = cardX + cardPadding + imageOffsetX;
            const imageY = cardY + cardPadding + imageOffsetY;
            
            if (shot.image) {
              try {
                // 获取图片的实际尺寸，确保按正确比例显示，不变形
                const imgDims = imageDimensionsMap.get(shot.id);
                if (imgDims && imgDims.width > 0 && imgDims.height > 0) {
                  const imgAspect = imgDims.width / imgDims.height;
                  
                  // 计算图片在PDF中的实际显示尺寸（保持宽高比，不变形）
                  let displayWidth = finalImageAreaWidth;
                  let displayHeight = finalImageAreaHeight;
                  
                  // 如果图片宽高比与目标区域不一致，按比例缩放以适应区域
                  const targetAspect = finalImageAreaWidth / finalImageAreaHeight;
                  
                  if (imgAspect > targetAspect) {
                    // 图片更宽，以高度为准
                    displayHeight = finalImageAreaHeight;
                    displayWidth = finalImageAreaHeight * imgAspect;
                    // 如果超出区域，则以宽度为准
                    if (displayWidth > finalImageAreaWidth) {
                      displayWidth = finalImageAreaWidth;
                      displayHeight = finalImageAreaWidth / imgAspect;
                    }
                  } else {
                    // 图片更高，以宽度为准
                    displayWidth = finalImageAreaWidth;
                    displayHeight = finalImageAreaWidth / imgAspect;
                    // 如果超出区域，则以高度为准
                    if (displayHeight > finalImageAreaHeight) {
                      displayHeight = finalImageAreaHeight;
                      displayWidth = finalImageAreaHeight * imgAspect;
                    }
                  }
                  
                  // 居中显示
                  const displayX = imageX + (finalImageAreaWidth - displayWidth) / 2;
                  const displayY = imageY + (finalImageAreaHeight - displayHeight) / 2;
                  
                  // 图片已经按照安全框画幅比例裁剪，按实际比例显示，不变形
                  pdf.addImage(
                    shot.image,
                    'PNG',
                    displayX,
                    displayY,
                    displayWidth,
                    displayHeight,
                    undefined,
                    'FAST'
                  );
                } else {
                  // 如果无法获取图片尺寸，使用默认方式（可能变形）
                  pdf.addImage(
                    shot.image,
                    'PNG',
                    imageX,
                    imageY,
                    finalImageAreaWidth,
                    finalImageAreaHeight,
                    undefined,
                    'FAST'
                  );
                }
              } catch (error) {
                console.error('添加图片失败:', error);
                drawEmptyFrame(imageX, imageY, finalImageAreaWidth, finalImageAreaHeight);
              }
            } else {
              drawEmptyFrame(imageX, imageY, finalImageAreaWidth, finalImageAreaHeight);
            }

            const caption = renderShotCaption(shot, 640);
            if (caption.imageData && caption.width > 0 && caption.height > 0) {
              const bandW = cardWidth - cardPadding * 2;
              const bandH = infoHeight - 1;
              const naturalH = (caption.height / caption.width) * bandW;
              const scale = Math.min(1, bandH / naturalH);
              const drawW = bandW * scale;
              const drawH = naturalH * scale;
              pdf.addImage(
                caption.imageData,
                'PNG',
                cardX + cardPadding,
                cardY + cardHeight - cardPadding - drawH,
                drawW,
                drawH
              );
            }
            
            shotIndex++;
          }
        }

        pageNum++;
      }

      const pdfBlob = pdf.output('blob');
      await saveBlob(pdfBlob, `${project.name || 'storyboard'}.pdf`);
    } catch (error) {
      console.error('导出 PDF 失败:', error);
      alert(t('export.pdfFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  const itemClass =
    'pixel-border-button w-full px-3 py-2 text-left text-sm bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <>
      <div className={block ? 'w-full' : 'relative'}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className={`pixel-border-button shrink-0 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
            block ? 'w-full h-9 px-3 text-sm justify-start' : 'min-h-10 px-3 py-1 text-sm'
          }`}
          disabled={isExporting}
          title={t('common.importExport')}
          aria-label={t('common.importExport')}
          aria-expanded={showMenu}
        >
          <UiIcon name="folder" />
          <span className="truncate">
            {isExporting ? t('common.exporting') : t('common.importExport')}
          </span>
          <span className="ml-auto opacity-60 text-xs" aria-hidden>
            ▾
          </span>
        </button>
      </div>

      <input
        ref={projectFileRef}
        type="file"
        accept=".clapboard,.json,application/json,application/x-clapboard-project"
        onChange={handleImportProjectFile}
        style={{ display: 'none' }}
      />
      <input
        ref={excelFileRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        onChange={handleImportExcelFile}
        style={{ display: 'none' }}
      />

      {showMenu &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[10030]" onClick={() => setShowMenu(false)} />
            <div
              className="fixed z-[10035] retro-window bg-white dark:bg-gray-900 min-w-[220px] max-w-[90vw] flex flex-col overflow-hidden"
              style={{
                top: `${menuPosition.top}px`,
                right: `${menuPosition.right}px`,
                maxHeight: `${menuPosition.maxHeight}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="retro-header shrink-0">
                <span>{t('common.importExport')}</span>
                <button
                  type="button"
                  onClick={() => setShowMenu(false)}
                  className="text-white dark:text-black hover:opacity-70"
                >
                  ×
                </button>
              </div>
              <div className="p-2 space-y-1 overflow-y-auto overscroll-contain min-h-0 flex-1">
                <div className="px-1 pt-1 pb-0.5 text-xs opacity-60">{t('common.import')}</div>
                <button
                  type="button"
                  className={itemClass}
                  disabled={isExporting}
                  onClick={() => projectFileRef.current?.click()}
                >
                  {t('import.projectFile')}
                </button>
                <button
                  type="button"
                  className={itemClass}
                  disabled={isExporting}
                  onClick={() => excelFileRef.current?.click()}
                >
                  {t('import.excel')}
                </button>

                <div className="px-1 pt-2 pb-0.5 text-xs opacity-60 border-t border-black/10 dark:border-white/10 mt-1">
                  {t('common.export')}
                </div>
                <button
                  type="button"
                  className={itemClass}
                  disabled={isExporting || !project}
                  onClick={() => void handleExportExcel()}
                >
                  {t('export.excel')}
                </button>
                <button
                  type="button"
                  className={itemClass}
                  disabled={isExporting || !project}
                  onClick={() => void handleExportCSV()}
                >
                  {t('export.csv')}
                </button>
                <button
                  type="button"
                  className={itemClass}
                  disabled={isExporting || !project}
                  onClick={() => void handleExportImages()}
                >
                  {t('export.imagesZip')}
                </button>
                <button
                  type="button"
                  className={itemClass}
                  disabled={isExporting || !project}
                  onClick={() => void handleExportPDF()}
                >
                  {t('export.pdf')}
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}

