import { createContext, useContext, type RefObject } from 'react';
import type { PoseEditorCanvasRef } from './PoseEditorCanvas';

export const PoseEditorRefContext = createContext<RefObject<PoseEditorCanvasRef | null> | null>(null);

export function usePoseEditorRef(): RefObject<PoseEditorCanvasRef | null> | null {
  return useContext(PoseEditorRefContext);
}
