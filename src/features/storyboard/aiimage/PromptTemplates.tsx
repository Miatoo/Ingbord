/**
 * 提示词模板组件
 * 提供分镜草图转最终分镜的提示词模板和编写建议
 */

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../../i18n/useTranslation';

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  negativePrompt?: string;
}

const templatesZh: PromptTemplate[] = [
  {
    id: 'basic',
    name: '基础模板',
    description: '适用于一般分镜转换，包含角色和场景参考',
    prompt: `严格按照第1张图片的动作、角度、景别、构图生成。使用第2张图片的角色外观，第3张图片的场景内容，但场景必须转换为与整体一致的风格。

最终效果：生成一张完整的分镜图，角色和场景风格统一，画面完整。不要包含图1的任何笔迹，仅参考动作构图。
画面填满，无黑边，无文字，无画框。`,
    negativePrompt: '文字, 水印, 画框, 边框, 黑边, 笔迹, 低质量, 模糊, 变形, 风格不一致, 场景保持原风格'
  },
  {
    id: 'cinematic',
    name: '电影级模板',
    description: '强调电影质感和专业效果，包含场景参考',
    prompt: `严格按照第1张图片的动作、角度、景别、构图生成。使用第2张图片的角色外观，第3张图片的场景内容，但场景必须转换为电影级风格。

最终效果：生成一张电影级分镜图，专业光影，细节丰富，电影质感。角色、场景、光影、色调统一。不要包含图1的任何笔迹，仅参考动作构图。
画面填满，无黑边，无文字，无画框。`,
    negativePrompt: '文字, 水印, 画框, 边框, 黑边, 笔迹, 低质量, 模糊, 变形, 卡通风格, 游戏风格, 风格不一致, 场景保持原风格'
  },
  {
    id: 'character_focus',
    name: '角色重点模板',
    description: '强调角色细节和服装，包含场景参考',
    prompt: `严格按照第1张图片的动作、角度、景别、构图生成。使用第2张图片的角色外观（必须完全一致），第3张图片的场景内容，但场景必须转换为与整体一致的风格。

最终效果：生成一张完整的分镜图，角色外观与参考图完全一致，角色和场景风格统一。不要包含图1的任何笔迹，仅参考动作构图。
画面填满，无黑边，无文字，无画框。`,
    negativePrompt: '文字, 水印, 画框, 边框, 黑边, 笔迹, 角色外观不一致, 服装错误, 低质量, 模糊, 风格不一致, 场景保持原风格'
  },
  {
    id: 'action_scene',
    name: '动作场景模板',
    description: '适用于动作和动态场景，包含场景环境',
    prompt: `严格按照第1张图片的动作、角度、景别、构图生成。使用第2张图片的角色外观，第3张图片的场景内容，但场景必须转换为动作场景风格。

最终效果：生成一张动作场景分镜图，动作流畅有力，角色、场景、光影、色调统一。不要包含图1的任何笔迹，仅参考动作构图。
画面填满，无黑边，无文字，无画框。`,
    negativePrompt: '文字, 水印, 画框, 边框, 黑边, 笔迹, 动作僵硬, 变形, 低质量, 模糊, 风格不一致, 场景保持原风格'
  },
  {
    id: 'scene_detail',
    name: '场景细节模板',
    description: '强调场景和环境的细节',
    prompt: `严格按照第1张图片的动作、角度、景别、构图生成。使用第2张图片的角色外观，第3张图片的场景内容，但场景必须转换为场景细节风格。

最终效果：生成一张场景细节丰富的分镜图，场景细节清晰，角色、场景、光影、色调统一。不要包含图1的任何笔迹，仅参考动作构图。
画面填满，无黑边，无文字，无画框。`,
    negativePrompt: '文字, 水印, 画框, 边框, 黑边, 笔迹, 场景简单, 细节缺失, 低质量, 模糊, 风格不一致, 场景保持原风格'
  },
  {
    id: 'black_white',
    name: '黑白风格模板',
    description: '黑白风格分镜，简洁专业',
    prompt: `严格按照第1张图片的动作、角度、景别、构图生成。使用第2张图片的角色外观，第3张图片的场景内容，但场景必须转换为黑白风格。

最终效果：生成一张黑白风格分镜图，无任何彩色元素，角色、场景、光影、色调统一为黑白。不要包含图1的任何笔迹，仅参考动作构图。
画面填满，无黑边，无文字，无画框。`,
    negativePrompt: '文字, 水印, 画框, 边框, 黑边, 笔迹, 彩色, 颜色, 低质量, 模糊, 变形, 风格不一致, 场景保持原风格, 场景保持彩色'
  },
  {
    id: 'sketch_style',
    name: '手绘线稿风格模板',
    description: '输出手绘线稿风格，线条感强，有手绘质感',
    prompt: `严格按照第1张图片的动作、角度、景别、构图生成。使用第2张图片的角色外观，第3张图片的场景内容，但场景必须转换为手绘线稿风格。

最终效果：生成一张手绘线稿风格分镜图，线条感强，有手绘质感，角色、场景、线条统一。不要包含图1的任何笔迹，仅参考动作构图。
画面填满，无黑边，无文字，无画框。`,
    negativePrompt: '文字, 水印, 画框, 边框, 黑边, 笔迹, 过度渲染, 照片级, 3D渲染, 上色, 彩色, 阴影, 渐变, 低质量, 模糊, 变形, 风格不一致, 场景保持原风格'
  }
];

const templatesEn: PromptTemplate[] = [
  {
    id: 'basic',
    name: 'Basic',
    description: 'General storyboard conversion with character + scene references',
    prompt: `Follow the action, angle, framing, and composition of Image 1 strictly. Use the character appearance from Image 2 and the scene content from Image 3, but unify everything into a consistent final style.

Final output: a complete storyboard frame with unified character + scene style. Do NOT include any sketch strokes from Image 1—only use it as composition/pose reference.
Fill the frame. No black bars. No text. No frame/border.`,
    negativePrompt: 'text, watermark, frame, border, black bars, sketch strokes, low quality, blurry, deformed, inconsistent style, keep original scene style'
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Emphasize cinematic look with professional lighting and detail',
    prompt: `Follow the action, angle, framing, and composition of Image 1 strictly. Use the character appearance from Image 2 and the scene content from Image 3, but render it in a cinematic, film-quality style.

Final output: a cinematic storyboard frame with professional lighting and rich details. Character, scene, lighting, and color tone must be consistent. Do NOT include any sketch strokes from Image 1—only use it as composition/pose reference.
Fill the frame. No black bars. No text. No frame/border.`,
    negativePrompt: 'text, watermark, frame, border, black bars, sketch strokes, low quality, blurry, deformed, cartoon style, game style, inconsistent style, keep original scene style'
  },
  {
    id: 'character_focus',
    name: 'Character focus',
    description: 'Prioritize character fidelity (outfit/appearance) while keeping scene consistent',
    prompt: `Follow the action, angle, framing, and composition of Image 1 strictly. Use the character appearance from Image 2 (must match exactly) and the scene content from Image 3, while keeping a unified overall style.

Final output: a complete storyboard frame. The character appearance must match the reference exactly. Do NOT include any sketch strokes from Image 1—only use it as composition/pose reference.
Fill the frame. No black bars. No text. No frame/border.`,
    negativePrompt: 'text, watermark, frame, border, black bars, sketch strokes, character mismatch, wrong outfit, low quality, blurry, inconsistent style, keep original scene style'
  },
  {
    id: 'action_scene',
    name: 'Action scene',
    description: 'For dynamic action shots with energetic motion',
    prompt: `Follow the action, angle, framing, and composition of Image 1 strictly. Use the character appearance from Image 2 and the scene content from Image 3, but render it as a dynamic action scene.

Final output: an action storyboard frame with strong motion and unified character/scene/lighting/color. Do NOT include any sketch strokes from Image 1—only use it as composition/pose reference.
Fill the frame. No black bars. No text. No frame/border.`,
    negativePrompt: 'text, watermark, frame, border, black bars, sketch strokes, stiff action, deformed, low quality, blurry, inconsistent style, keep original scene style'
  },
  {
    id: 'scene_detail',
    name: 'Scene detail',
    description: 'Emphasize environment and background detail',
    prompt: `Follow the action, angle, framing, and composition of Image 1 strictly. Use the character appearance from Image 2 and the scene content from Image 3, but enrich environmental detail while keeping a unified style.

Final output: a detailed environment storyboard frame with consistent character/scene/lighting/color. Do NOT include any sketch strokes from Image 1—only use it as composition/pose reference.
Fill the frame. No black bars. No text. No frame/border.`,
    negativePrompt: 'text, watermark, frame, border, black bars, sketch strokes, simple background, missing detail, low quality, blurry, inconsistent style, keep original scene style'
  },
  {
    id: 'black_white',
    name: 'Black & white',
    description: 'Clean black-and-white storyboard style',
    prompt: `Follow the action, angle, framing, and composition of Image 1 strictly. Use the character appearance from Image 2 and the scene content from Image 3, but render the final result strictly in black and white.

Final output: a black-and-white storyboard frame with no colored elements. Character/scene/lighting/tone must be consistent in B&W. Do NOT include any sketch strokes from Image 1—only use it as composition/pose reference.
Fill the frame. No black bars. No text. No frame/border.`,
    negativePrompt: 'text, watermark, frame, border, black bars, sketch strokes, color, low quality, blurry, deformed, inconsistent style, keep original scene style, keep scene in color'
  },
  {
    id: 'sketch_style',
    name: 'Hand-drawn line art',
    description: 'Hand-drawn line-art output with strong sketch texture',
    prompt: `Follow the action, angle, framing, and composition of Image 1 strictly. Use the character appearance from Image 2 and the scene content from Image 3, but render as hand-drawn line art.

Final output: a hand-drawn line-art storyboard frame with strong linework and unified style. Do NOT include any sketch strokes from Image 1—only use it as composition/pose reference.
Fill the frame. No black bars. No text. No frame/border.`,
    negativePrompt: 'text, watermark, frame, border, black bars, sketch strokes, over-rendered, photorealistic, 3D render, colored, shadow gradients, low quality, blurry, deformed, inconsistent style, keep original scene style'
  }
];

interface PromptTemplatesProps {
  onSelectTemplate: (template: PromptTemplate) => void;
}

export function PromptTemplates({ onSelectTemplate }: PromptTemplatesProps) {
  const { t, language } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const templates = useMemo(() => (language === 'en' ? templatesEn : templatesZh), [language]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs text-blue-600 hover:text-blue-800 underline"
      >
        {t('aiImage.templates.open')}
      </button>
      
      {isOpen && (
        createPortal(
          <>
            {/* 遮罩层 */}
            <div
              className="fixed inset-0 bg-black bg-opacity-30 z-[9998]"
              onClick={() => setIsOpen(false)}
            />

            {/* 悬浮弹窗 - 固定在视口正中心（不受父级 transform/overflow 影响） */}
            <div className="fixed left-1/2 top-1/2 z-[9999] w-[min(42rem,calc(100vw-2rem))] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 pointer-events-auto">
              <div
                className="bg-white border border-gray-300 rounded-lg shadow-2xl p-6 w-full max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">{t('aiImage.templates.title')}</h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                    aria-label={t('aiImage.templates.close')}
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto pr-2">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 hover:border-blue-300 transition-colors cursor-pointer"
                      onClick={() => {
                        onSelectTemplate(template);
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-sm font-medium text-gray-800">{template.name}</span>
                          <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTemplate(template);
                            setIsOpen(false);
                          }}
                          className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          {t('aiImage.templates.use')}
                        </button>
                      </div>
                      <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded max-h-24 overflow-y-auto">
                        {template.prompt.substring(0, 150)}...
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">{t('aiImage.templates.tipsTitle')}</h4>
                  <ul className="text-xs text-gray-600 space-y-1">
                    <li>• {t('aiImage.templates.tip1')}</li>
                    <li>• {t('aiImage.templates.tip2')}</li>
                    <li>• {t('aiImage.templates.tip3')}</li>
                    <li>• {t('aiImage.templates.tip4')}</li>
                    <li>• {t('aiImage.templates.tip5')}</li>
                    <li>• {t('aiImage.templates.tip6')}</li>
                  </ul>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      )}
    </>
  );
}

export { templatesZh as templates };
export type { PromptTemplate };

