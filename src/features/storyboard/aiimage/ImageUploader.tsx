import { useState, useRef } from 'react';
import { useTranslation } from '../../../i18n/useTranslation';

interface ImageUploaderProps {
  label: string;
  value?: string; // Base64或Blob URL
  onChange: (image: string) => void;
  onRemove?: () => void;
  accept?: string;
}

export function ImageUploader({
  label,
  value,
  onChange,
  onRemove,
  accept = 'image/*',
}: ImageUploaderProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert(t('aiImage.upload.alertImageOnly'));
      return;
    }

    // 转换为base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        onChange(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      
      {value ? (
        <div className="relative">
          <img
            src={value}
            alt={label}
            className="w-full h-32 object-contain border border-gray-300 rounded bg-gray-50"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleClick}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              {t('aiImage.upload.replace')}
            </button>
            {onRemove && (
              <button
                onClick={onRemove}
                className="px-3 py-1 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50"
              >
                {t('aiImage.upload.delete')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
          className={`
            border-2 border-dashed rounded p-4 text-center cursor-pointer transition-colors
            ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className="hidden"
          />
          <p className="text-sm text-gray-600">
            {t('aiImage.upload.clickOrDrag')}
          </p>
        </div>
      )}
    </div>
  );
}

