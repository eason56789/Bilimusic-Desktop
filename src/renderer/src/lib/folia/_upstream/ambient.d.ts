/**
 * 上游缺失模块的通配声明
 *
 * folia 源码快照缺 services/utils 下的多数模块。这里用一个**通配模块声明**兜住,
 * 让任何指向缺失文件的 import 都能拿到 any —— 运行时会由实际存在的桩文件提供,
 * 缺失的则得到 undefined。样式因此仍可编译并渲染核心画面。
 */
declare module '*services/*' {
  const anyExport: any
  export = anyExport
}
