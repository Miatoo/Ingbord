/**
 * AI生图服务层
 * 支持多种AI图片生成API格式：
 * - Gemini API格式（/v1beta/models/...:generateContent）
 * - OpenAI风格API格式（/v1/images/generations, /v1/chat/completions）
 * - Nano Banana API格式（/v1/draw/nano-banana）
 * - 其他自定义API格式（自动检测并适配）
 */

import { AIImageConfig } from '../types';
import { imageToBase64, calculateImageSize } from '../utils/imageUtils';

/**
 * 将URL图片下载并转换为base64格式
 * @param imageUrl 图片URL
 * @returns base64格式的图片（data URL）
 */
async function downloadImageAsBase64(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`下载图片失败: ${response.status} ${response.statusText}`);
    }
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error: any) {
    throw new Error(`图片下载转换失败: ${error.message}`);
  }
}

const CONFIG_STORAGE_KEY = 'aiImageConfig';

/**
 * 获取API配置
 */
export function getAIImageConfig(): AIImageConfig | null {
  const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored) as AIImageConfig;
  } catch {
    return null;
  }
}

/**
 * 保存API配置
 */
export function saveAIImageConfig(config: AIImageConfig): void {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

/**
 * 验证API配置
 */
export async function validateAPIConfig(config: AIImageConfig): Promise<boolean> {
  try {
    // 检查API地址格式
    if (!config.apiEndpoint) {
      throw new Error('API地址不能为空');
    }
    
    // 检查是否是文档页面地址（常见错误）
    const endpoint = config.apiEndpoint.toLowerCase();
    if (endpoint.includes('/doc') || 
        endpoint.includes('/docs') || 
        endpoint.includes('/documentation') ||
        endpoint.endsWith('.html') ||
        endpoint.includes('/#/')) {
      throw new Error('API地址看起来像是文档页面，请使用实际的接口地址（通常以 /v1/ 或 /api/ 开头）');
    }
    
    // 根据API地址特征自动检测API类型
    const isGeminiAPI = endpoint.includes('/v1beta/models/') && endpoint.includes(':generateContent');
    const isNanoBananaAPI = endpoint.includes('/v1/draw/');
    
    // 构建测试请求体（根据API类型）
    let testBody: any;
    let apiUrl: URL;
    let headers: Record<string, string>;
    
    try {
      apiUrl = new URL(config.apiEndpoint);
    } catch (error) {
      throw new Error(`API地址格式无效：${config.apiEndpoint}。请确保是完整的URL，包含协议（https://）`);
    }
    
    if (isGeminiAPI) {
      // Gemini API格式
      testBody = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'test'
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['TEXT'] // 测试时使用TEXT模式，避免需要图片输入
        }
      };
      apiUrl.searchParams.set('key', config.apiKey);
      headers = { 'Content-Type': 'application/json' };
    } else if (isNanoBananaAPI) {
      // Nano Banana API格式（根据文档推测）
      testBody = {
        model: config.modelName || 'nano-banana',
        prompt: 'test',
        size: '1024x1024',
      };
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      };
    } else {
      // OpenAI风格或其他自定义API格式
      testBody = {
        model: config.modelName || 'test-model',
        prompt: 'test',
      };
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      };
    }
    
    const response = await fetch(apiUrl.toString(), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(testBody),
    });
    
    const contentType = response.headers.get('content-type') || '';
    
    // 如果返回HTML，说明地址错误
    if (contentType.includes('text/html')) {
      const text = await response.text();
      throw new Error(
        `API地址返回了HTML页面，请检查地址是否正确。\n` +
        `当前地址：${config.apiEndpoint}\n` +
        `返回内容：${text.slice(0, 200)}...`
      );
    }
    
    // 如果返回了JSON格式的错误，说明API地址是正确的，只是请求有问题
    if (contentType.includes('application/json')) {
      try {
        const errorData = await response.json();
        const errorMsg = JSON.stringify(errorData);
        
        // 如果错误信息中包含"Gemini"、"candidates"、"channel_error"等关键词，
        // 说明API地址是正确的，只是请求格式或API状态有问题
        if (errorMsg.includes('Gemini') || errorMsg.includes('candidates') || 
            errorMsg.includes('channel_error') || errorMsg.includes('empty response') ||
            errorMsg.includes('channel:') || errorMsg.includes('request id:')) {
          
          // API地址正确，但请求可能有问题
          if (response.status === 401 || response.status === 403) {
            throw new Error('API认证失败，请检查API Key是否正确');
          }
          
          // 429限流错误 - API地址正确，只是被限流了
          if (response.status === 429) {
            return true; // 地址和认证都正确，只是被限流
          }
          
          // 其他错误（如400参数错误、500服务器错误等）说明API地址是正确的
          // 对于验证来说，只要地址正确就够了
          return true;
        }
      } catch (e) {
        // JSON解析失败，继续下面的处理
      }
    }
    
    // 401/403 表示认证问题，但至少地址是对的
    if (response.status === 401 || response.status === 403) {
      return true; // 地址正确，只是认证失败
    }
    
    // 400/422/429 可能是参数错误或限流，但说明接口存在
    if (response.status === 400 || response.status === 422 || response.status === 429) {
      return true; // 地址正确，只是请求有问题
    }
    
    // 其他错误
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      // 如果错误信息中包含API相关信息，说明地址可能是对的
      if (errorText.includes('Gemini') || errorText.includes('candidates')) {
        return true; // 地址正确，只是请求有问题
      }
      throw new Error(`API返回错误 ${response.status}: ${errorText.slice(0, 300)}`);
    }
    
    return true;
  } catch (error: any) {
    console.error('API配置验证失败:', error);
    throw error; // 抛出错误以便UI显示
  }
}

/**
 * 生成AI图片
 */
export interface GenerateAIImageParams {
  prompt: string; // 提示词
  negativePrompt?: string; // 负面提示词
  storyboardImage: string; // 当前分镜图（Base64或Blob URL）
  roleImage?: string; // 参考角色图（Base64或Blob URL，兼容单图）
  sceneImage?: string; // 参考场景图（Base64或Blob URL，兼容单图）
  roleImages?: string[]; // 多角色参考
  sceneImages?: string[]; // 多场景参考
  aspectRatio: string; // 画幅比例
  onProgress?: (progress: number) => void; // 进度回调
}

export interface GenerateAIImageResult {
  image: string; // 生成的图片（Base64或URL）
  model: string; // 使用的模型
}

/**
 * 生成AI图片
 */
export async function generateAIImage(
  params: GenerateAIImageParams
): Promise<GenerateAIImageResult> {
  const config = getAIImageConfig();
  if (!config) {
    throw new Error('API配置未设置，请在设置中配置API信息');
  }
  
  if (!config.apiEndpoint || !config.apiKey || !config.modelName) {
    throw new Error('API配置不完整，请检查API地址、密钥和模型名称');
  }
  
  const endpoint = config.apiEndpoint.trim();
  
  // 检测API类型（不强制格式，根据地址特征自动判断）
  const isGeminiAPI = endpoint.includes('/v1beta/models/') && endpoint.includes(':generateContent');
  const isNanoBananaAPI = endpoint.includes('/v1/draw/');
  
  // 转换所有图片为base64
  console.log('========== 开始转换图片为base64 ==========');
  console.log('分镜图片输入类型:', params.storyboardImage.substring(0, 100));
  console.log('分镜图片输入长度:', params.storyboardImage.length);
  console.log('是否有参考角色图:', !!params.roleImage);
  console.log('是否有参考场景图:', !!params.sceneImage);
  
  const storyboardBase64 = await convertToBase64(params.storyboardImage);
  console.log('✓ 分镜图片转换完成');
  console.log('  - 输出长度:', storyboardBase64.length);
  console.log('  - 输出类型:', storyboardBase64.substring(0, 50));
  console.log('  - 是否为data URL:', storyboardBase64.startsWith('data:'));
  
  // 验证分镜图片是否有效
  if (!storyboardBase64 || storyboardBase64.length < 100) {
    throw new Error('分镜图片转换失败或数据不完整');
  }
  
  const roleSources = [
    ...(params.roleImages || []),
    ...(params.roleImage ? [params.roleImage] : []),
  ].filter(Boolean);
  const sceneSources = [
    ...(params.sceneImages || []),
    ...(params.sceneImage ? [params.sceneImage] : []),
  ].filter(Boolean);

  // 多参考图合并进同一次生图请求（一张成图），不按参考图拆任务
  const roleBase64List: string[] = [];
  for (const src of roleSources.slice(0, 3)) {
    const b64 = await convertToBase64(src);
    if (b64 && b64.length >= 100) roleBase64List.push(b64);
  }
  const sceneBase64List: string[] = [];
  for (const src of sceneSources.slice(0, 3)) {
    const b64 = await convertToBase64(src);
    if (b64 && b64.length >= 100) sceneBase64List.push(b64);
  }
  const imageTypeLabels = [
    '分镜草图（当前镜头）',
    ...roleBase64List.map((_, i) =>
      roleBase64List.length > 1 ? `参考角色图 ${i + 1}` : '参考角色图'
    ),
    ...sceneBase64List.map((_, i) =>
      sceneBase64List.length > 1 ? `参考场景图 ${i + 1}` : '参考场景图'
    ),
  ];

  console.log('========== 图片转换完成 ==========');
  console.log('角色参考数量:', roleBase64List.length);
  console.log('场景参考数量:', sceneBase64List.length);
  
  let requestBody: any;
  let apiUrl: URL;
  let headers: Record<string, string>;
  
  try {
    apiUrl = new URL(endpoint);
  } catch (error) {
    throw new Error(`API地址格式无效：${endpoint}。请确保是完整的URL，包含协议（https://）`);
  }
  
  // 记录使用的画幅比例
  const aspectRatio = params.aspectRatio || '16:9';
  console.log('========== 画幅比例信息 ==========');
  console.log('使用的画幅比例:', aspectRatio);
  const { width, height } = calculateImageSize(aspectRatio, 1024);
  console.log('计算的图片尺寸:', `${width}x${height}`);
  
  // 根据API类型构建不同的请求格式
  if (isGeminiAPI) {
    // Gemini API格式
    const extractBase64 = (dataUrl: string): { data: string; mimeType: string } => {
      if (dataUrl.startsWith('data:')) {
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          return { mimeType: match[1], data: match[2] };
        }
      }
      return { mimeType: 'image/png', data: dataUrl };
    };
    
    const storyboardData = extractBase64(storyboardBase64);
    
    // Gemini API使用parts数组传递图片
    // 图片顺序（按parts数组中的位置）：
    // 1. 用户提示词（text）
    // 2. 分镜草图（inline_data）- 第1张图片
    // 3. 参考角色图（inline_data，可选）- 第2张图片（如果有）
    // 4. 参考场景图（inline_data，可选）- 第3张图片（如果有）
    
    console.log('========== 开始构建 Gemini API parts 数组 ==========');
    console.log('画幅比例:', aspectRatio, `(${width}x${height})`);
    
    // 构建提示词，包含负面提示词和比例信息
    let fullPrompt = params.prompt;
    // 在提示词中添加比例信息，确保生成的图片符合指定比例
    if (aspectRatio && aspectRatio !== 'auto') {
      fullPrompt += `\n画面比例：${aspectRatio}（${width}x${height}像素）`;
    }
    if (params.negativePrompt && params.negativePrompt.trim()) {
      fullPrompt += `\n避免：${params.negativePrompt}`;
      console.log('✓ 负面提示词已添加到Gemini API提示词中');
      console.log('  - 负面提示词内容:', params.negativePrompt);
    } else {
      console.log('未提供负面提示词');
    }
    
    const parts: any[] = [
      {
        text: fullPrompt
      },
      {
        inline_data: {
          mime_type: storyboardData.mimeType,
          data: storyboardData.data
        }
      }
    ];
    
    console.log('【第1张图片】分镜草图（当前镜头的分镜图）');
    console.log('  - 位置: parts[1].inline_data');
    console.log('  - 用途: 这是当前要生成最终分镜图的分镜草图，AI需要参考这张图的构图、景别、镜头角度、动作姿态和画面比例');
    console.log('  - MIME类型:', storyboardData.mimeType);
    console.log('  - base64长度:', storyboardData.data.length);
    console.log('  - base64预览:', storyboardData.data.substring(0, 50) + '...');
    
    // 追加全部角色 / 场景参考（同一 contents，一次生成）
    for (let i = 0; i < roleBase64List.length; i++) {
      const label = imageTypeLabels[1 + i] || `参考角色图 ${i + 1}`;
      console.log(`【第${parts.length}张图片】${label}`);
      const roleData = extractBase64(roleBase64List[i]);
      if (roleData?.data && roleData.data.length >= 100) {
        parts.push({
          inline_data: {
            mime_type: roleData.mimeType,
            data: roleData.data,
          },
        });
        console.log(`  ✓ 已添加到 parts[${parts.length - 1}]`);
      } else {
        console.warn(`  ⚠ ${label} 数据不完整，跳过`);
      }
    }
    if (!roleBase64List.length) {
      console.log('参考角色图 - 未提供（跳过）');
    }

    for (let i = 0; i < sceneBase64List.length; i++) {
      const label =
        imageTypeLabels[1 + roleBase64List.length + i] || `参考场景图 ${i + 1}`;
      console.log(`【第${parts.length}张图片】${label}`);
      const sceneData = extractBase64(sceneBase64List[i]);
      if (sceneData?.data && sceneData.data.length >= 100) {
        parts.push({
          inline_data: {
            mime_type: sceneData.mimeType,
            data: sceneData.data,
          },
        });
        console.log(`  ✓ 已添加到 parts[${parts.length - 1}]`);
      } else {
        console.warn(`  ⚠ ${label} 数据不完整，跳过`);
      }
    }
    if (!sceneBase64List.length) {
      console.log('参考场景图 - 未提供（跳过）');
    }

    console.log('========== Gemini API parts 数组构建完成 ==========');
    console.log('总parts数量:', parts.length);
    console.log('图片顺序说明:');
    parts.forEach((part, index) => {
      if (index === 0) {
        console.log(`  parts[${index}]: 用户提示词（text）`);
      } else if (part.inline_data) {
        console.log(
          `  parts[${index}]: ${imageTypeLabels[index - 1] || '未知类型'}（inline_data）`
        );
      }
    });

    const imagePartsCount = parts.filter((p) => p.inline_data).length;
    console.log('========== Gemini API 最终请求参数 ==========');
    console.log('总parts数量:', parts.length);
    console.log('图片parts数量:', imagePartsCount);
    console.log('parts结构详情:');
    parts.forEach((p, i) => {
      if (i === 0 && p.text) {
        console.log(`  parts[${i}]: 用户提示词（text）`);
        console.log(`    - 内容预览: ${p.text.substring(0, 100)}...`);
      } else if (p.inline_data) {
        const imageType =
          imageTypeLabels[i - 1] || `第${i}张图片（未知类型）`;
        console.log(`  parts[${i}]: ${imageType}（inline_data）`);
        console.log(`    - MIME类型: ${p.inline_data.mime_type}`);
        console.log(`    - base64长度: ${p.inline_data.data?.length || 0}`);
      }
    });
    
    requestBody = {
      contents: [{ role: 'user', parts: parts }],
      generationConfig: { responseModalities: ['IMAGE'] }
    };
    
    apiUrl.searchParams.set('key', config.apiKey);
    headers = { 'Content-Type': 'application/json' };
  } else if (isNanoBananaAPI) {
    // Nano Banana API格式（根据文档：POST /v1/draw/nano-banana）
    // 需要提取纯base64字符串（去掉data URL前缀）
    const extractPureBase64 = (dataUrl: string): string => {
      if (dataUrl.startsWith('data:')) {
        const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
        if (match) {
          return match[1]; // 返回纯base64字符串
        }
      }
      // 如果已经是纯base64，直接返回
      return dataUrl;
    };
    
    // 提取纯base64字符串
    const storyboardPureBase64 = extractPureBase64(storyboardBase64);
    
    // 验证base64字符串是否有效
    if (!storyboardPureBase64 || storyboardPureBase64.length < 100) {
      throw new Error('分镜图片base64数据不完整，无法上传');
    }
    
    console.log('Nano Banana API - 分镜图片数据:', {
      originalLength: storyboardBase64.length,
      pureBase64Length: storyboardPureBase64.length,
      preview: storyboardPureBase64.substring(0, 50) + '...'
    });
    
    // Nano Banana：一次请求 urls = [分镜, ...角色参考, ...场景参考]，生成一张图
    // 文档：https://grsai.com/zh/dashboard/documents/nano-banana
    const urls: string[] = [];

    console.log('========== 开始构建图片数组（单次任务多参考） ==========');

    urls.push(storyboardPureBase64);
    console.log('【urls[0]】分镜草图 base64长度:', storyboardPureBase64.length);

    for (let i = 0; i < roleBase64List.length; i++) {
      const rolePureBase64 = extractPureBase64(roleBase64List[i]);
      if (rolePureBase64 && rolePureBase64.length >= 100) {
        urls.push(rolePureBase64);
        console.log(`【urls[${urls.length - 1}]】${imageTypeLabels[urls.length - 1]} 已添加`);
      } else {
        console.warn(`  ⚠ 角色参考 ${i + 1} 数据不完整，跳过`);
      }
    }

    for (let i = 0; i < sceneBase64List.length; i++) {
      const scenePureBase64 = extractPureBase64(sceneBase64List[i]);
      if (scenePureBase64 && scenePureBase64.length >= 100) {
        urls.push(scenePureBase64);
        console.log(`【urls[${urls.length - 1}]】${imageTypeLabels[urls.length - 1]} 已添加`);
      } else {
        console.warn(`  ⚠ 场景参考 ${i + 1} 数据不完整，跳过`);
      }
    }

    console.log('========== 图片数组构建完成 ==========');
    console.log('总图片数量（单任务）:', urls.length);
    urls.forEach((_url, index) => {
      console.log(`  urls[${index}]: ${imageTypeLabels[index] || `参考图${index + 1}`}`);
    });

    requestBody = {
      model: config.modelName || 'nano-banana',
      prompt: params.prompt,
      imageSize: `${width}x${height}`,
      aspectRatio: aspectRatio,
      // 与托管通道一致：webHook=-1 走轮询拿结果，避免流式拆成多次提交观感
      webhook: '-1',
      webHook: '-1',
      shutProgress: true,
      urls, // 多参考合并进同一 urls，一次生图任务
    };

    if (params.negativePrompt && params.negativePrompt.trim()) {
      requestBody.negativePrompt = params.negativePrompt;
      console.log('✓ 负面提示词已添加');
    }

    console.log('========== Nano Banana API 最终请求参数 ==========');
    console.log('模型:', requestBody.model);
    console.log('提示词长度:', requestBody.prompt.length);
    console.log('图片尺寸:', requestBody.imageSize);
    console.log('画幅比例:', requestBody.aspectRatio);
    console.log('urls 数量（单任务多参考）:', requestBody.urls.length);
    requestBody.urls.forEach((url: string, index: number) => {
      console.log(
        `  urls[${index}]: ${imageTypeLabels[index] || `图${index + 1}`} len=${url?.length || 0}`
      );
    });
    
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };
  } else {
    // OpenAI风格或其他自定义API格式
    // 验证分镜图片
    if (!storyboardBase64 || storyboardBase64.length < 100) {
      throw new Error('分镜图片数据不完整，无法上传');
    }
    
    console.log('OpenAI风格API - 分镜图片数据长度:', storyboardBase64.length);
    
    requestBody = {
      model: config.modelName,
      prompt: params.prompt,
      n: 1,
      image: storyboardBase64, // 使用完整data URL
      size: `${width}x${height}`,
    };
    
    // 多参考合并进同一请求（不拆成多次生成）
    if (roleBase64List.length) {
      requestBody.reference_image = roleBase64List[0];
      requestBody.reference_images = roleBase64List;
    }
    if (sceneBase64List.length) {
      requestBody.scene_image = sceneBase64List[0];
      requestBody.scene_images = sceneBase64List;
    }
    if (roleBase64List.length || sceneBase64List.length) {
      requestBody.urls = [
        storyboardBase64,
        ...roleBase64List,
        ...sceneBase64List,
      ];
    }
    // 负面提示词
    if (params.negativePrompt && params.negativePrompt.trim()) {
      requestBody.negative_prompt = params.negativePrompt;
      console.log('✓ 负面提示词已添加到OpenAI风格API请求中');
      console.log('  - 负面提示词内容:', params.negativePrompt);
    } else {
      console.log('未提供负面提示词');
    }
    
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };
  }
  
  if (params.onProgress) {
    params.onProgress(10);
  }
  
  let retryCount = 0;
  const maxRetries = 3;
  // 一旦上游已创建生图任务，禁止整单重试（否则多参考会被拆成多个计费任务）
  let upstreamTaskSubmitted = false;

  while (retryCount < maxRetries) {
    try {
      if (params.onProgress) {
        params.onProgress(30 + retryCount * 10);
      }

      if (upstreamTaskSubmitted) {
        throw new Error('生图任务已提交，请勿重复请求；请稍后查询结果或重新发起一次生成');
      }
      
      const response = await fetch(apiUrl.toString(), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      });
      
      if (params.onProgress) {
        params.onProgress(70);
      }
      
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        // 优先尝试读取文本，很多网关/文档站会返回 HTML
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        try {
          if (contentType.includes('application/json')) {
            const errorData = await response.json();
            if (errorData?.error?.message) {
              errorMessage = errorData.error.message;
            }
          } else {
            const text = await response.text();
            // 截断一下，避免太长
            errorMessage = text.slice(0, 200);
          }
        } catch {
          // ignore parse errors, keep default message
        }
        
        // 如果是认证错误，不重试
        if (response.status === 401) {
          throw new Error(`API认证失败: ${errorMessage}`);
        }
        
        // 如果是限流错误，等待后重试
        if (response.status === 429 && retryCount < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          retryCount++;
          continue;
        }
        
        throw new Error(`API调用失败: ${errorMessage}`);
      }

      // Draw 类接口：HTTP 200 即表示上游已建任务，后续失败只能查结果，不可再 POST 生图
      if (isNanoBananaAPI) {
        upstreamTaskSubmitted = true;
      }
      
      // 处理 SSE (Server-Sent Events) 流式响应或标准 JSON 响应
      let data: any;
      
      if (contentType.includes('text/event-stream')) {
        // 读取 SSE 流
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        if (!reader) {
          throw new Error('无法读取响应流');
        }
        
        let buffer = '';
        let lastData: any = null;
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          
          // 解析 SSE 格式：data: {...}\n\n
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留最后不完整的行
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.substring(6).trim(); // 去掉 "data: " 前缀并去除空白
                if (jsonStr) {
                  const eventData = JSON.parse(jsonStr);
                  lastData = eventData;
                  
                  // 更新进度
                  if (eventData.progress !== undefined && params.onProgress) {
                    params.onProgress(10 + (eventData.progress * 0.8)); // 10-90%
                  }
                  
                  // 如果任务完成或失败，退出循环
                  if (eventData.status === 'succeeded' || eventData.status === 'completed' || 
                      eventData.status === 'failed' || eventData.status === 'error') {
                    // 处理剩余缓冲区
                    if (buffer.trim()) {
                      const remainingLine = buffer.trim();
                      if (remainingLine.startsWith('data: ')) {
                        try {
                          const remainingJson = JSON.parse(remainingLine.substring(6).trim());
                          lastData = remainingJson;
                        } catch {
                          // 忽略解析错误
                        }
                      }
                    }
                    break;
                  }
                }
              } catch (e) {
                // 忽略单个事件的解析错误，继续处理下一个
                console.warn('SSE事件解析失败:', line, e);
              }
            }
          }
          
          // 如果已经得到最终状态，退出循环
          if (lastData && (lastData.status === 'succeeded' || lastData.status === 'completed' || 
              lastData.status === 'failed' || lastData.status === 'error')) {
            break;
          }
        }
        
        if (!lastData) {
          throw new Error('无法从SSE流中解析数据');
        }
        
        data = lastData;
      } else if (!contentType.includes('application/json')) {
        // 确认返回的是 JSON；如果是 HTML 等，给出更友好的错误
        const text = await response.text();
        const preview = text.slice(0, 300);
        
        // 检查是否是常见的HTML错误页面
        let helpfulHint = '';
        if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
          helpfulHint = '\n\n提示：返回的是HTML页面，可能的原因：\n' +
            '1. API地址配置错误，可能填成了文档介绍页而不是接口地址\n' +
            '2. 请填写兼容 OpenAI 图像生成接口的完整 URL\n' +
            '3. 请从服务商文档中复制「请求 URL / 接口地址」，不要用文档站点本身\n' +
            '4. 确保地址以 /v1/ 或 /api/ 等接口路径结尾，而不是 .html 或 /doc/';
        }
        
        throw new Error(
          `API 返回的不是 JSON 格式（Content-Type: ${contentType}）\n` +
          `当前配置的API地址：${config.apiEndpoint}\n` +
          `返回内容预览：${preview}${helpfulHint}`
        );
      } else {
        // 标准 JSON 响应
        data = await response.json();
      }
      
      if (params.onProgress) {
        params.onProgress(90);
      }
      
      // 检查异步任务状态（某些API返回任务状态而不是直接返回结果）
      if (data.status) {
        if (data.status === 'failed' || data.status === 'error') {
          // 任务失败，提取错误信息
          const errorMsg = data.error || data.failure_reason || data.message || '任务失败';
          let friendlyError = errorMsg;
          
          // 针对常见错误类型提供友好提示
          if (data.failure_reason === 'output_moderation' || errorMsg.toLowerCase().includes('moderation') || errorMsg.toLowerCase().includes('policy')) {
            friendlyError = '内容审核未通过：' + errorMsg + '\n\n建议：\n1. 修改提示词，避免敏感内容\n2. 更换参考图片\n3. 调整负面提示词';
          } else if (errorMsg.toLowerCase().includes('rate limit') || errorMsg.toLowerCase().includes('quota')) {
            friendlyError = 'API调用频率限制：' + errorMsg + '\n\n建议：请稍后再试';
          } else if (errorMsg.toLowerCase().includes('auth') || errorMsg.toLowerCase().includes('key')) {
            friendlyError = 'API认证失败：' + errorMsg + '\n\n建议：请检查API Key是否正确';
          }
          
          throw new Error(friendlyError);
        }
        
        if (data.status === 'pending' || data.status === 'processing' || data.status === 'in_progress' || data.status === 'running') {
          // 任务进行中，尝试轮询获取结果
          const taskId = data.id || data.task_id || data.job_id || data.data?.id;
          if (taskId) {
            upstreamTaskSubmitted = true;
          }
          if (taskId && isNanoBananaAPI) {
            // Nano Banana API 使用 /v1/draw/result 获取结果
            const resultUrl = new URL(config.apiEndpoint);
            resultUrl.pathname = resultUrl.pathname.replace(/\/draw\/[^/]+$/, '/draw/result');
            
            if (params.onProgress) {
              params.onProgress(50);
            }
            
            // 轮询获取结果（最多等待60秒，每2秒查询一次）
            const maxPollingAttempts = 30;
            const pollingInterval = 2000;
            
            for (let attempt = 0; attempt < maxPollingAttempts; attempt++) {
              await new Promise(resolve => setTimeout(resolve, pollingInterval));
              
              if (params.onProgress) {
                params.onProgress(50 + Math.min(30, (attempt / maxPollingAttempts) * 30));
              }
              
              try {
                const resultResponse = await fetch(resultUrl.toString(), {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`,
                  },
                  body: JSON.stringify({ id: taskId }),
                });
                
                if (!resultResponse.ok) {
                  continue; // 继续轮询
                }
                
                const resultData = await resultResponse.json();
                
                if (resultData.status === 'completed' || resultData.status === 'success') {
                  // 任务完成，使用结果数据
                  let resultImage: string | null = null;
                  
                  if (resultData.results) {
                    if (Array.isArray(resultData.results) && resultData.results.length > 0) {
                      const result = resultData.results[0];
                      resultImage = result.image || result.url || result.data || result.base64 || null;
                    } else if (typeof resultData.results === 'object') {
                      resultImage = resultData.results.image || resultData.results.url || resultData.results.data || resultData.results.base64 || null;
                    }
                  } else if (resultData.image || resultData.url || resultData.data || resultData.base64) {
                    resultImage = resultData.image || resultData.url || resultData.data || resultData.base64;
                  }
                  
                  if (resultImage) {
                    // 如果返回的是纯base64字符串，转换为data URL格式
                    if (!resultImage.startsWith('data:') && !resultImage.startsWith('http') && !resultImage.startsWith('blob:')) {
                      // 假设是base64字符串，添加data URL前缀
                      resultImage = `data:image/png;base64,${resultImage}`;
                    }
                    data.image = resultImage;
                    data.status = 'completed';
                    break; // 退出轮询循环
                  }
                } else if (resultData.status === 'failed' || resultData.status === 'error') {
                  // 任务失败
                  const errorMsg = resultData.error || resultData.failure_reason || resultData.message || '任务失败';
                  let friendlyError = errorMsg;
                  
                  if (resultData.failure_reason === 'output_moderation' || errorMsg.toLowerCase().includes('moderation') || errorMsg.toLowerCase().includes('policy')) {
                    friendlyError = '内容审核未通过：' + errorMsg + '\n\n建议：\n1. 修改提示词，避免敏感内容\n2. 更换参考图片\n3. 调整负面提示词';
                  }
                  
                  throw new Error(friendlyError);
                }
                // 如果状态还是pending/processing，继续轮询
              } catch (pollError: any) {
                // 如果是明确的错误（如失败状态），抛出
                if (pollError.message && !pollError.message.includes('fetch')) {
                  throw pollError;
                }
                // 否则继续轮询
              }
            }
            
            // 如果轮询超时
            if (data.status !== 'completed' && data.status !== 'success') {
              throw new Error(
                `任务处理超时（已等待${maxPollingAttempts * pollingInterval / 1000}秒）\n` +
                `任务ID：${taskId}\n` +
                `当前状态：${data.status}\n\n` +
                `建议：请稍后手动查询任务结果`
              );
            }
          } else {
            // 没有任务ID或不是Nano Banana API，无法轮询
            throw new Error(
              `任务正在处理中（状态：${data.status}）\n` +
              (taskId ? `任务ID：${taskId}\n` : '') +
              `当前进度：${data.progress || 0}%\n\n` +
              `注意：此API需要轮询获取结果，但缺少必要的任务ID或结果查询接口。\n` +
              `请查看API文档了解如何通过任务ID获取结果。`
            );
          }
        }
        
        if (data.status === 'completed' || data.status === 'success' || data.status === 'succeeded') {
          // 任务完成，从results中提取图片
          let resultImage: string | null = null;
          
          if (data.results) {
            // 如果results是数组，取第一个
            if (Array.isArray(data.results) && data.results.length > 0) {
              const result = data.results[0];
              resultImage = result.image || result.url || result.data || result.base64 || null;
            } else if (typeof data.results === 'object') {
              // 如果results是对象
              resultImage = data.results.image || data.results.url || data.results.data || data.results.base64 || null;
            }
          } else if (data.image || data.url || data.data || data.base64) {
            resultImage = data.image || data.url || data.data || data.base64;
          }
          
          if (resultImage) {
            // 如果是URL，需要转换为base64或保持URL
            if (resultImage.startsWith('http://') || resultImage.startsWith('https://')) {
              // 保持URL格式，或者可以选择转换为base64
              data.image = resultImage;
            } else if (!resultImage.startsWith('data:') && !resultImage.startsWith('blob:')) {
              // 假设是base64字符串，添加data URL前缀
              data.image = `data:image/png;base64,${resultImage}`;
            } else {
              data.image = resultImage;
            }
          }
        }
      }
      
      // 尝试从不同API格式中提取图片
      let generatedImage: string = '';
      
      // 1. Gemini API格式：data.candidates[0].content.parts[].inlineData
      if (data.candidates && Array.isArray(data.candidates) && data.candidates.length > 0) {
        const candidate = data.candidates[0];
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            const inlineData = part.inlineData || part.inline_data;
            if (inlineData && inlineData.data) {
              const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
              generatedImage = `data:${mimeType};base64,${inlineData.data}`;
              break;
            }
          }
        }
      }
      
      // 2. OpenAI风格格式：data.data[0].url 或 data.data[0].b64_json
      if (!generatedImage && data.data && Array.isArray(data.data) && data.data.length > 0) {
        const item = data.data[0];
        generatedImage = item.url || item.b64_json || item.image || '';
        if (generatedImage && !generatedImage.startsWith('data:') && !generatedImage.startsWith('http')) {
          // 如果是纯base64字符串，添加data URL前缀
          generatedImage = `data:image/png;base64,${generatedImage}`;
        }
      }
      
      // 3. 通用格式：data.images[] 或 data.result.image 或 data.image
      if (!generatedImage) {
        if (data.images && Array.isArray(data.images) && data.images.length > 0) {
          generatedImage = data.images[0];
        } else if (data.result?.image) {
          generatedImage = data.result.image;
        } else if (data.image) {
          generatedImage = data.image;
        } else if (data.url) {
          generatedImage = data.url;
        } else if (data.data && typeof data.data === 'string') {
          // 直接返回base64字符串
          generatedImage = data.data.startsWith('data:') ? data.data : `data:image/png;base64,${data.data}`;
        }
      }
      
      // 4. 如果还没找到，尝试从JSON字符串中提取
      if (!generatedImage) {
        console.warn('API响应格式未知，尝试提取图片:', data);
        const jsonStr = JSON.stringify(data);
        const base64Match = jsonStr.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
        const urlMatch = jsonStr.match(/https?:\/\/[^\s"']+\.(jpg|jpeg|png|webp|webm)/i);
        
        if (base64Match) {
          generatedImage = base64Match[0];
        } else if (urlMatch) {
          generatedImage = urlMatch[0];
        }
      }
      
      if (!generatedImage) {
        throw new Error('无法从API响应中提取生成的图片。响应格式：' + JSON.stringify(data).slice(0, 500));
      }
      
      // 如果返回的是URL格式的图片，下载并转换为base64
      if (generatedImage.startsWith('http://') || generatedImage.startsWith('https://')) {
        if (params.onProgress) {
          params.onProgress(95);
        }
        
        try {
          console.log('正在下载并转换图片URL:', generatedImage);
          generatedImage = await downloadImageAsBase64(generatedImage);
          console.log('图片下载转换成功');
        } catch (error: any) {
          console.error('图片下载转换失败:', error);
          throw new Error(`图片下载失败: ${error.message}\n图片URL: ${generatedImage}`);
        }
      }
      
      if (params.onProgress) {
        params.onProgress(100);
      }
      
      return {
        image: generatedImage,
        model: config.modelName,
      };
    } catch (error: any) {
      if (upstreamTaskSubmitted) {
        throw error;
      }
      retryCount++;
      
      if (retryCount >= maxRetries) {
        throw error;
      }
      
      // 仅在尚未成功创建上游任务时重试提交
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }
  
  throw new Error('生成失败：达到最大重试次数');
}

/**
 * 将图片转换为base64
 */
async function convertToBase64(image: string): Promise<string> {
  if (!image || image.trim().length === 0) {
    throw new Error('图片数据为空');
  }
  
  if (image.startsWith('data:')) {
    // 已经是base64，验证格式
    if (image.length < 100) {
      throw new Error('Base64图片数据太短，可能不完整');
    }
    // 验证是否是有效的base64格式
    const base64Match = image.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (!base64Match || base64Match[1].length < 50) {
      throw new Error('Base64图片格式无效或数据不完整');
    }
    return image;
  }
  
  if (image.startsWith('blob:')) {
    // Blob URL，需要转换为base64
    try {
      const response = await fetch(image);
      if (!response.ok) {
        throw new Error(`无法加载Blob URL: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Blob数据为空');
      }
      const base64 = await imageToBase64(blob);
      if (!base64 || base64.length < 100) {
        throw new Error('Blob转换为base64失败或数据不完整');
      }
      return base64;
    } catch (error: any) {
      throw new Error(`无法转换Blob URL为base64: ${error.message}`);
    }
  }
  
  // 假设是普通URL，尝试获取
  try {
    const response = await fetch(image);
    if (!response.ok) {
      throw new Error(`无法加载图片URL: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    if (blob.size === 0) {
      throw new Error('下载的图片数据为空');
    }
    const base64 = await imageToBase64(blob);
    if (!base64 || base64.length < 100) {
      throw new Error('URL图片转换为base64失败或数据不完整');
    }
    return base64;
  } catch (error: any) {
    throw new Error(`无法加载图片: ${error.message}`);
  }
}

