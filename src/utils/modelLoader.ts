import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getAssetPath } from './pathUtils';

/**
 * 加载 GLB/GLTF 模型
 */
export async function loadCharacterModel(url: string): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        resolve(gltf.scene);
      },
      (progress) => {
        console.log('加载进度:', (progress.loaded / progress.total) * 100, '%');
      },
      (error) => {
        console.error('加载模型失败:', error);
        reject(error);
      }
    );
  });
}

/**
 * 加载预设动作数据
 */
export async function loadPosePreset(url: string): Promise<any> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('加载预设动作失败:', error);
    throw error;
  }
}

/**
 * 加载镜头预设配置
 */
export async function loadCameraPreset(url: string): Promise<any> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('加载镜头预设失败:', error);
    throw error;
  }
}

/**
 * 获取默认角色模型路径
 */
export function getDefaultCharacterPath(): string {
  // 如果 Storyboarder 的模型已复制，使用该路径
  // 否则使用默认的简化模型
  return getAssetPath('/models/characters/default.glb');
}

/**
 * 获取预设动作列表
 */
export async function getPosePresetList(): Promise<string[]> {
  try {
    // 尝试加载预设列表文件
    const response = await fetch(getAssetPath('/models/poses/preset-list.json'));
    if (response.ok) {
      const list = await response.json();
      return list;
    }
  } catch (error) {
    console.warn('无法加载预设列表:', error);
  }
  
  // 返回默认预设列表
  return ['standing', 'sitting', 'walking', 'running'];
}



