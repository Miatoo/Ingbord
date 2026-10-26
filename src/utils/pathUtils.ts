/**
 * 路径工具函数
 * 用于在子路径部署时正确处理资源路径
 */

/**
 * 获取正确的资源路径（自动加上 base path）
 * @param path 资源路径（如 '/models/characters/adult-male.glb'）
 * @returns 完整的路径（如 '/storyboard/models/characters/adult-male.glb'）
 */
export function getAssetPath(path: string): string {
  // 确保 path 以 / 开头
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  
  // import.meta.env.BASE_URL 在 Vite 中自动包含 base path
  // 例如：如果 base 是 '/storyboard/'，BASE_URL 就是 '/storyboard/'
  // 如果 base 是 '/'，BASE_URL 就是 '/'
  const baseUrl = import.meta.env.BASE_URL;
  
  // 如果 baseUrl 是 '/'，直接返回 path
  // 如果 baseUrl 是 '/storyboard/'，需要拼接
  if (baseUrl === '/') {
    return path;
  }
  
  // 移除 baseUrl 末尾的 / 和 path 开头的 /，然后拼接
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  
  return cleanBase + cleanPath;
}
















































