# 第三方组件声明

本项目包含以下第三方开源代码，按其原始许可使用。

## JIZURA

- 仓库：https://github.com/852wa/JIZURA
- 作者：Copyright (c) 2026 hakoniwa
- 许可：MIT License
- 用途：全屏歌词「JIZURA（印刷分镜）」排布样式的文字动画引擎
- 位置：`src/renderer/src/lib/jizura/`（引擎原样搬运，`index.ts` 为本项目新增的加载器）

引擎模块全部保持原样，仅新增了一个按原 `build.py` 顺序（文件名字母序）import 的
barrel 文件。原始许可全文如下：

```
MIT License

Copyright (c) 2026 hakoniwa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## folia-major

- 仓库：https://github.com/chthollyphile/folia-major
- 用途：凝彩（Tempera）歌词样式的参考实现（架构与运动学参数对齐）
