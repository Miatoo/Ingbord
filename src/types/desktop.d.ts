export interface ClapboardDesktopApi {
  isDesktop: true;
  openExternal: (url: string) => Promise<{ ok: boolean }>;
  saveProjectDialog: (defaultName?: string) => Promise<{ canceled: boolean; filePath: string | null }>;
  openProjectDialog: () => Promise<{
    canceled: boolean;
    filePath: string | null;
    content: string | null;
  }>;
  writeProjectFile: (filePath: string, content: string) => Promise<{ ok: boolean }>;
  readProjectFile: (filePath: string) => Promise<string>;
  listLibrary: () => Promise<
    Array<{
      id: string;
      name: string;
      updatedAt: number;
      shotCount: number;
      cover: string;
      externalPath?: string;
    }>
  >;
  upsertLibrary: (record: {
    id: string;
    name: string;
    updatedAt: number;
    shotCount: number;
    cover: string;
    externalPath?: string;
    projectJson: string;
  }) => Promise<{ ok: boolean }>;
  loadLibraryProject: (
    id: string
  ) => Promise<{ content: string; externalPath?: string } | null>;
  deleteLibraryProject: (id: string) => Promise<{ ok: boolean }>;
}

declare global {
  interface Window {
    clapboardDesktop?: ClapboardDesktopApi;
  }
}

export {};
