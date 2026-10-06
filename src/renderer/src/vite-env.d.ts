/** Vite 静态资源模块:图片 import 得到 URL 字符串 */
declare module '*.png' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}
