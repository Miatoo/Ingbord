/** 工程外部文件路径（用户另存为选择），不写进工程内容本身，便于拷贝分享 */
const externalPaths = new Map<string, string>();

export function getProjectExternalPath(projectId: string): string | undefined {
  return externalPaths.get(projectId);
}

export function setProjectExternalPath(projectId: string, filePath: string | null | undefined): void {
  if (!projectId) return;
  if (!filePath) {
    externalPaths.delete(projectId);
    return;
  }
  externalPaths.set(projectId, filePath);
}

export function clearProjectExternalPath(projectId: string): void {
  externalPaths.delete(projectId);
}
