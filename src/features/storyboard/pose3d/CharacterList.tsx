import { useState, useEffect, useRef } from 'react';
import { PoseEditorCanvasRef, Character } from './PoseEditorCanvas';
import { useTranslation } from '../../../i18n/useTranslation';
import {
  BUILT_IN_CHARACTERS,
  findBuiltInCharacterByPath,
} from './builtInCharacters';

interface CharacterListProps {
  canvasRef: React.RefObject<PoseEditorCanvasRef>;
}

export function CharacterList({ canvasRef }: CharacterListProps) {
  const { t } = useTranslation();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updateCharacters = () => {
      if (canvasRef.current) {
        const chars = canvasRef.current.getCharacters();
        setCharacters(chars);
        setSelectedId(canvasRef.current.getSelectedCharacterId());
      }
    };
    updateCharacters();
    const interval = setInterval(updateCharacters, 500);
    return () => clearInterval(interval);
  }, [canvasRef]);

  const handleAddCharacter = async (modelPath: string, filename?: string) => {
    if (!canvasRef.current) return;
    const currentChars = canvasRef.current.getCharacters();
    if (currentChars.length >= 10) {
      alert(t('pose3d.maxCharacters'));
      return;
    }
    const id = canvasRef.current.addCharacter(modelPath, filename);
    setTimeout(() => {
      canvasRef.current?.selectCharacter(id);
      setSelectedId(id);
    }, 200);
  };

  const handleAddBuiltIn = async (index: number) => {
    const model = BUILT_IN_CHARACTERS[index];
    if (!model) return;
    await handleAddCharacter(model.path);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !canvasRef.current) return;
    const currentChars = canvasRef.current.getCharacters();
    const remaining = Math.max(0, 10 - currentChars.length);
    if (remaining === 0) {
      alert(t('pose3d.maxCharacters'));
      e.target.value = '';
      return;
    }
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      await handleAddCharacter(url, file.name);
    }
    e.target.value = '';
  };

  const handleSelectCharacter = (id: string) => {
    canvasRef.current?.selectCharacter(id);
    setSelectedId(id);
  };

  const handleRemoveCharacter = (id: string) => {
    if (confirm(t('pose3d.deleteCharacterConfirm'))) {
      canvasRef.current?.removeCharacter(id);
      if (selectedId === id) setSelectedId(null);
    }
  };

  const handleClearSelection = () => {
    canvasRef.current?.selectCharacter(null);
    setSelectedId(null);
  };

  const selected = characters.find((c) => c.id === selectedId);
  const selectedLabel = selected
    ? findBuiltInCharacterByPath(selected.modelPath)
      ? t(findBuiltInCharacterByPath(selected.modelPath)!.key as 'pose3d.character.adultMale')
      : selected.name
    : t('pose3d.deselect');

  return (
    <div className="sticky top-0 z-10 -mx-2 px-2 pt-1 pb-2 bg-transparent border-b border-black/20 dark:border-white/20">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-sm font-bold uppercase mb-1 hover:bg-gray-100 dark:hover:bg-gray-800 px-1 py-1"
      >
        <span className="truncate">
          {t('pose3d.characterManagement').replace('{count}', String(characters.length))}
          {!expanded && selected ? ` · ${selectedLabel}` : ''}
        </span>
        <span className="text-xs shrink-0">{expanded ? '▼' : '▶'}</span>
      </button>

      {!expanded && characters.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {characters.map((char) => {
            const modelInfo = findBuiltInCharacterByPath(char.modelPath);
            const label = modelInfo ? t(modelInfo.key as 'pose3d.character.adultMale') : char.name;
            return (
              <button
                key={char.id}
                type="button"
                onClick={() => handleSelectCharacter(char.id)}
                className={`pixel-border-button px-2 py-0.5 text-[10px] whitespace-nowrap shrink-0 ${
                  selectedId === char.id ? 'is-active' : ''
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {expanded && (
        <>
          <div className="flex items-center justify-end mb-1">
            {selectedId && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="pixel-border-button px-2 py-1 text-xs"
              >
                {t('pose3d.deselect')}
              </button>
            )}
          </div>
          <div className="retro-window space-y-1 mb-2 max-h-36 overflow-y-auto p-2 bg-transparent">
            {characters.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-3">{t('pose3d.noCharacters')}</div>
            ) : (
              characters.map((char) => {
                const modelInfo = findBuiltInCharacterByPath(char.modelPath);
                const isSelected = selectedId === char.id;
                return (
                  <div
                    key={char.id}
                    onClick={() => handleSelectCharacter(char.id)}
                    className={`flex items-center justify-between p-1.5 cursor-pointer text-xs ${
                      isSelected ? 'ring-2 ring-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="font-bold truncate">
                      {modelInfo ? t(modelInfo.key as 'pose3d.character.adultMale') : char.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCharacter(char.id);
                      }}
                      className="pixel-border-button px-1.5 py-0.5 text-xs shrink-0"
                    >
                      {t('aiImage.upload.delete')}
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".fbx,.glb,.gltf"
            multiple
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            type="button"
            onClick={() => {
              fileInputRef.current?.click();
            }}
            disabled={characters.length >= 10}
            className="pixel-border-button w-full px-2 py-1 text-xs mb-1 disabled:opacity-50"
          >
            {t('pose3d.importModel')}
          </button>
          <div className="grid grid-cols-2 gap-1">
            {BUILT_IN_CHARACTERS.map((model, index) => (
              <button
                key={model.path}
                type="button"
                onClick={() => handleAddBuiltIn(index)}
                disabled={characters.length >= 10}
                className="pixel-border-button px-2 py-1 text-xs disabled:opacity-50"
              >
                + {t(model.key as 'pose3d.character.adultMale')}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
