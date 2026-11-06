/** Vite 静态资源模块:图片 import 得到 URL 字符串 */
declare module '*.png' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}

/** Vite 的 import.meta.glob(cappella 头像/表情包目录扫描用) */
interface ImportMeta {
  glob<T = unknown>(pattern: string, options?: { eager?: boolean; query?: string }): Record<string, T>
}
