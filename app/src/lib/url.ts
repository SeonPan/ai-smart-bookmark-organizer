// URL 相关工具函数（纯函数，可独立测试）

// 常见的追踪/统计参数，不影响页面内容
const TRACKING_PARAMS = /^(utm_|spm|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_|_ga|_gl)/i;

// 标准化 URL（用于重复书签比较）
// 保留 query string（避免 ?page=1 与 ?page=2 误判为重复），仅剔除追踪参数
export const normalizeUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    // 剔除追踪参数，保留其余 query 参数
    const keptParams: string[] = [];
    urlObj.searchParams.forEach((value, key) => {
      if (!TRACKING_PARAMS.test(key)) {
        keptParams.push(`${key}=${value}`);
      }
    });
    keptParams.sort(); // 参数排序，避免顺序不同导致误判
    const query = keptParams.length > 0 ? `?${keptParams.join('&')}` : '';
    // 移除末尾的斜杠和 hash
    return `${urlObj.origin}${urlObj.pathname}${query}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.toLowerCase();
  }
};
