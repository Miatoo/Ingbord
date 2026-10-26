import { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { ImageVersion, AIImageConfig } from '../../../types';
import { generateAIImage, getAIImageConfig } from '../../../services/aiImageService';
import { ImageUploader } from '../aiimage/ImageUploader';
import { PromptInput } from '../aiimage/PromptInput';
import { APIConfigPanel } from '../aiimage/APIConfigPanel';
import { GenerationStatus } from '../aiimage/GenerationStatus';
import { ResultPreview } from '../aiimage/ResultPreview';
import { VersionSelector } from '../aiimage/VersionSelector';
import { useTranslation } from '../../../i18n/useTranslation';
import { compressImageUnderMaxBytes, cropToSafeFrame } from '../../../utils/imageUtils';
import { createId } from '../../../utils/id';

export function AIImageView() {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const activeShotId = useUIStore((state) => state.activeShotId);
  const getShot = useProjectStore((state) => state.getShot);
  const addImageVersion = useProjectStore((state) => state.addImageVersion);
  const setActiveImageVersion = useProjectStore((state) => state.setActiveImageVersion);

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [roleImages, setRoleImages] = useState<string[]>([]);
  const [sceneImages, setSceneImages] = useState<string[]>([]);
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string>('');
  const [apiConfig, setApiConfig] = useState<AIImageConfig | null>(null);

  const blobUrlsRef = useRef<Set<string>>(new Set());

  const activeShot = activeShotId ? getShot(activeShotId) : null;

  const getCurrentShotImage = () => {
    if (!activeShot) return '';
    if (activeShot.activeVersionId && activeShot.imageVersions) {
      const version = activeShot.imageVersions.find((v) => v.id === activeShot.activeVersionId);
      if (version && version.image) {
        return version.image;
      }
    }
    return activeShot.image || '';
  };

  const currentShotImage = getCurrentShotImage();
  const versions = activeShot?.imageVersions || [];

  useEffect(() => {
    if (generatedImage && generatedImage.startsWith('blob:')) {
      URL.revokeObjectURL(generatedImage);
      blobUrlsRef.current.delete(generatedImage);
    }
    setGeneratedImage('');
    setGenerationStatus('idle');
    setErrorMessage('');
    setGenerationProgress(0);
  }, [activeShotId]);

  useEffect(() => {
    const saved = getAIImageConfig();
    if (saved) {
      setApiConfig(saved);
    }
    return () => {
      blobUrlsRef.current.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      blobUrlsRef.current.clear();
    };
  }, []);

  const handleGenerate = async () => {
    if (!activeShot) {
      setErrorMessage(t('aiImage.error.selectShotFirst'));
      return;
    }

    if (!prompt.trim()) {
      setErrorMessage(t('aiImage.error.enterPrompt'));
      return;
    }

    const hasConfig = apiConfig?.apiEndpoint && apiConfig?.apiKey && apiConfig?.modelName;
    if (!hasConfig) {
      setErrorMessage(t('settings.aiImageConfig.needConfigHint'));
      return;
    }

    if (!currentShotImage) {
      setErrorMessage(t('aiImage.error.shotNoImage'));
      return;
    }

    setGenerationStatus('generating');
    setGenerationProgress(0);
    setErrorMessage('');
    setGeneratedImage('');

    const latestShotImage = getCurrentShotImage();

    if (!latestShotImage) {
      setErrorMessage(t('aiImage.error.shotNoImage'));
      setGenerationStatus('error');
      return;
    }

    if (!activeShot || activeShot.id !== activeShotId) {
      setErrorMessage(t('aiImage.error.shotSwitched'));
      setGenerationStatus('error');
      return;
    }

    try {
      setGenerationProgress(10);
      const [shotForGen, ...restCompressed] = await Promise.all([
        compressImageUnderMaxBytes(latestShotImage),
        ...roleImages.slice(0, 3).map((img) => compressImageUnderMaxBytes(img)),
        ...sceneImages.slice(0, 3).map((img) => compressImageUnderMaxBytes(img)),
      ]);
      const roleForGenList = restCompressed.slice(0, roleImages.length).filter(Boolean);
      const sceneForGenList = restCompressed.slice(roleImages.length).filter(Boolean);
      const roleForGen = roleForGenList[0] || '';
      const sceneForGen = sceneForGenList[0] || '';

      const result = await generateAIImage({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        storyboardImage: shotForGen,
        roleImage: roleForGen || undefined,
        sceneImage: sceneForGen || undefined,
        roleImages: roleForGenList.length ? roleForGenList : undefined,
        sceneImages: sceneForGenList.length ? sceneForGenList : undefined,
        aspectRatio: project?.aspectRatio || '16:9',
        onProgress: (progress) => {
          setGenerationProgress(progress);
        },
      });
      if (result.image.startsWith('blob:')) {
        blobUrlsRef.current.add(result.image);
      }
      setGeneratedImage(result.image);
      setGenerationStatus('success');
    } catch (error: any) {
      setGenerationStatus('error');
      setErrorMessage(error.message || t('aiImage.error.generateFailedRetry'));
      console.error('影格生图失败:', error);
    }
  };

  const handleSaveVersion = async () => {
    if (!activeShot || !generatedImage) return;

    try {
      let croppedImage = generatedImage;
      if (project?.aspectRatio) {
        try {
          croppedImage = await cropToSafeFrame(generatedImage, project.aspectRatio);
        } catch (error) {
          console.error('裁剪图片失败:', error);
        }
      }

      const newVersion: ImageVersion = {
        id: createId(),
        image: croppedImage,
        source: 'ai_generated',
        createdAt: Date.now(),
        aiPrompt: prompt,
        aiConfig: {
          model: apiConfig?.modelName,
          referenceImages: [...roleImages, ...sceneImages].filter(Boolean),
        },
      };

      addImageVersion(activeShot.id, newVersion);
      setGeneratedImage('');
      setGenerationStatus('idle');
    } catch (error) {
      console.error('保存版本失败:', error);
      setErrorMessage(error instanceof Error ? error.message : '保存版本失败');
      setGenerationStatus('error');
    }
  };

  const handleCancel = () => {
    if (generatedImage && generatedImage.startsWith('blob:')) {
      URL.revokeObjectURL(generatedImage);
      blobUrlsRef.current.delete(generatedImage);
    }
    setGeneratedImage('');
    setGenerationStatus('idle');
  };

  const handleRegenerate = () => {
    if (generatedImage && generatedImage.startsWith('blob:')) {
      URL.revokeObjectURL(generatedImage);
      blobUrlsRef.current.delete(generatedImage);
    }
    setGeneratedImage('');
    setGenerationStatus('idle');
    handleGenerate();
  };

  const hasConfig =
    apiConfig !== null &&
    apiConfig.apiEndpoint &&
    apiConfig.apiKey &&
    apiConfig.modelName;

  const canGenerate =
    activeShot !== null &&
    currentShotImage !== '' &&
    prompt.trim() !== '' &&
    !!hasConfig;

  const shotImageOf = (shot: NonNullable<typeof project>['shots'][number]) => {
    if (shot.activeVersionId && shot.imageVersions) {
      const version = shot.imageVersions.find((v) => v.id === shot.activeVersionId);
      if (version?.image) return version.image;
    }
    return shot.image || '';
  };

  const handleBatchGenerate = async () => {
    if (!project?.shots?.length) return;
    if (!window.confirm(t('aiImage.batchWarning'))) return;
    if (!canGenerate && !(prompt.trim() && hasConfig)) {
      return;
    }

    const shotsWithImage = [...project.shots]
      .sort((a, b) => a.order - b.order)
      .filter((s) => Boolean(shotImageOf(s)));
    if (shotsWithImage.length === 0) {
      setErrorMessage(t('aiImage.error.shotNoImage'));
      setGenerationStatus('error');
      return;
    }

    setGenerationStatus('generating');
    setErrorMessage('');
    setBatchProgress({ current: 0, total: shotsWithImage.length });

    try {
      const roleCompressed = await Promise.all(
        roleImages.filter(Boolean).slice(0, 3).map((img) => compressImageUnderMaxBytes(img))
      );
      const sceneCompressed = await Promise.all(
        sceneImages.filter(Boolean).slice(0, 3).map((img) => compressImageUnderMaxBytes(img))
      );

      for (let i = 0; i < shotsWithImage.length; i++) {
        const shot = shotsWithImage[i];
        setBatchProgress({ current: i + 1, total: shotsWithImage.length });
        const shotImg = shotImageOf(shot);
        const shotForGen = await compressImageUnderMaxBytes(shotImg);

        const result = await generateAIImage({
          prompt: prompt.trim(),
          negativePrompt: negativePrompt.trim() || undefined,
          storyboardImage: shotForGen,
          roleImage: roleCompressed[0],
          sceneImage: sceneCompressed[0],
          roleImages: roleCompressed.length ? roleCompressed : undefined,
          sceneImages: sceneCompressed.length ? sceneCompressed : undefined,
          aspectRatio: project.aspectRatio || '16:9',
        });
        const imageOut = result.image;

        let cropped = imageOut;
        if (project.aspectRatio) {
          try {
            cropped = await cropToSafeFrame(imageOut, project.aspectRatio);
          } catch {
            /* keep original */
          }
        }
        const newVersion: ImageVersion = {
          id: createId(),
          image: cropped,
          source: 'ai_generated',
          createdAt: Date.now(),
          aiPrompt: prompt,
          aiConfig: {
            model: apiConfig?.modelName,
            referenceImages: [...roleImages, ...sceneImages].filter(Boolean),
          },
        };
        addImageVersion(shot.id, newVersion);
      }
      setGenerationStatus('success');
    } catch (error: any) {
      setGenerationStatus('error');
      setErrorMessage(error?.message || t('aiImage.error.generateFailedRetry'));
    } finally {
      setBatchProgress(null);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full overflow-auto lg:overflow-hidden">
      <div className="w-full lg:w-80 flex flex-col shrink-0 p-1 min-w-0 max-h-[40vh] lg:max-h-none">
        <div className="retro-window flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
          <div className="retro-header">
            <span>{t('aiImage.referenceImages')}</span>
          </div>
          <div className="p-2 space-y-2 overflow-y-auto">
            {activeShot ? (
              <>
                <div>
                  <h3 className="text-sm font-bold uppercase mb-2">{t('aiImage.currentShot')}</h3>
                  {currentShotImage ? (
                    <img
                      src={currentShotImage}
                      alt={t('aiImage.currentShot.alt')}
                      className="theme-frame w-full object-contain"
                    />
                  ) : (
                    <div className="theme-frame text-xs theme-muted p-2 text-center">
                      {t('aiImage.noImage')}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold uppercase mb-2">{t('aiImage.reference')}</h3>
                  <div className="space-y-3">
                    {roleImages.map((img, index) => (
                      <ImageUploader
                        key={`role-${index}`}
                        label={t('aiImage.roleRefN').replace('{n}', String(index + 1))}
                        value={img}
                        onChange={(v) =>
                          setRoleImages((prev) => prev.map((x, i) => (i === index ? v : x)))
                        }
                        onRemove={() => setRoleImages((prev) => prev.filter((_, i) => i !== index))}
                      />
                    ))}
                    {roleImages.length < 3 && (
                      <button
                        type="button"
                        className="pixel-border-button px-2 py-1 text-xs w-full"
                        onClick={() => setRoleImages((prev) => [...prev, ''])}
                      >
                        {t('aiImage.addRoleRef')}
                      </button>
                    )}
                    {sceneImages.map((img, index) => (
                      <ImageUploader
                        key={`scene-${index}`}
                        label={t('aiImage.sceneRefN').replace('{n}', String(index + 1))}
                        value={img}
                        onChange={(v) =>
                          setSceneImages((prev) => prev.map((x, i) => (i === index ? v : x)))
                        }
                        onRemove={() => setSceneImages((prev) => prev.filter((_, i) => i !== index))}
                      />
                    ))}
                    {sceneImages.length < 3 && (
                      <button
                        type="button"
                        className="pixel-border-button px-2 py-1 text-xs w-full"
                        onClick={() => setSceneImages((prev) => [...prev, ''])}
                      >
                        {t('aiImage.addSceneRef')}
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500 py-8">
                {t('aiImage.selectShot')}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden p-1 min-w-0">
        <div className="retro-window flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
          <div className="retro-header">
            <span>{t('aiImage.preview.title')}</span>
          </div>
          <div className="flex-1 p-2 overflow-y-auto">
            {activeShot ? (
              <div className="space-y-2">
                {generatedImage ? (
                  <ResultPreview
                    originalImage={currentShotImage}
                    generatedImage={generatedImage}
                    onSave={handleSaveVersion}
                    onCancel={handleCancel}
                    onRegenerate={handleRegenerate}
                  />
                ) : (
                  <div className="retro-window p-2 bg-white dark:bg-gray-900">
                    <h3 className="text-sm font-bold uppercase mb-2 border-b border-black dark:border-white">
                      {t('aiImage.preview.currentShot')}
                    </h3>
                    {currentShotImage ? (
                      <img
                        src={currentShotImage}
                        alt={t('aiImage.currentShot.alt')}
                        className="theme-frame w-full max-w-2xl mx-auto object-contain mt-4"
                      />
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        {t('aiImage.preview.noShotImage')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                {t('aiImage.selectShot')}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-80 flex flex-col shrink-0 p-1 min-w-0">
        <div className="retro-window flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
          <div className="retro-header">
            <span>{t('aiImage.panel.title')}</span>
          </div>
          <div className="p-2 space-y-3 overflow-y-auto">
            <div className="text-xs theme-muted border-b border-black/10 dark:border-white/10 pb-2">
              {t('settings.aiImageConfig.needConfigHint')}
            </div>
            <APIConfigPanel onConfigChange={setApiConfig} />

            {activeShot && (
              <>
                <div className="border-t-2 border-black dark:border-white pt-4">
                  <PromptInput
                    prompt={prompt}
                    negativePrompt={negativePrompt}
                    onPromptChange={setPrompt}
                    onNegativePromptChange={setNegativePrompt}
                  />
                </div>

                <div className="border-t-2 border-black dark:border-white pt-4">
                  <GenerationStatus
                    status={generationStatus}
                    progress={generationProgress}
                    errorMessage={errorMessage}
                  />
                  {batchProgress && (
                    <p className="text-xs mb-2 theme-muted">
                      {t('aiImage.batchProgress')
                        .replace('{current}', String(batchProgress.current))
                        .replace('{total}', String(batchProgress.total))}
                    </p>
                  )}
                  <button
                    onClick={handleGenerate}
                    disabled={!canGenerate || generationStatus === 'generating'}
                    className={`
                    pixel-border-button w-full px-4 py-2 mb-2
                    ${
                      canGenerate && generationStatus !== 'generating'
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }
                  `}
                  >
                    {generationStatus === 'generating' && !batchProgress
                      ? t('aiImage.generating')
                      : t('aiImage.generate')}
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchGenerate}
                    disabled={!canGenerate || generationStatus === 'generating'}
                    className="pixel-border-button w-full px-4 py-2 text-sm disabled:opacity-40"
                    title={t('aiImage.batchWarning')}
                  >
                    {t('aiImage.batchGenerate')}
                  </button>
                </div>

                {versions.length > 0 && (
                  <div className="border-t-2 border-black dark:border-white pt-4">
                    <VersionSelector
                      versions={versions}
                      activeVersionId={activeShot.activeVersionId}
                      onSelectVersion={(versionId) => {
                        if (activeShot) {
                          setActiveImageVersion(activeShot.id, versionId);
                        }
                      }}
                      onDeleteVersion={(versionId) => {
                        console.log('删除版本:', versionId);
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
