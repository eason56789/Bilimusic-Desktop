/**
 * 图片 URL 归一化:把 http:// 升级成 https://。
 *
 * 为什么需要:渲染层的 CSP 只放行 https 图源(见 src/renderer/index.html 的 img-src),
 * 而 B站/网易云/酷狗等 CDN 经常仍返回 http:// 的封面。这些地址一旦被直接塞进
 * `new Image()` 或 background-image,CSP 会直接拦掉请求 —— 表现为该处封面空白、
 * 封面取色拿不到颜色,而控制台里只有一条 Refused to load the image 的警告。
 *
 * 这些 CDN(hdslb.com / music.126.net / y.qq.com / kugou.com / douyinpic.com)
 * 全部支持 https,所以升级是安全的;万一某个图床确实只有 http,主进程侧
 * bmedia://img 代理会再用原始地址兜底重试一次(主进程不受 CSP 约束)。
 */
export function httpsImageUrl(url: string): string {
  // 库里的历史数据有两种非 https 形态,两种都要处理:
  //  - 'http://host/x.jpg':直接换协议头;
  //  - '//host/x.jpg'(协议相对,网易云早期接口就是这种):在 dev 里会被解析成
  //    http://host/x.jpg 然后撞上 CSP,所以这里显式补成 https。
  const trimmed = url.trim()
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  return trimmed.startsWith('http://') ? `https://${trimmed.slice('http://'.length)}` : trimmed
}
