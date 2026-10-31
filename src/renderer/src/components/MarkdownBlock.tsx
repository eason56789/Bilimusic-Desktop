/** 轻量 Markdown 渲染:用于更新说明(标题/列表/粗体/行内代码/链接/表格)
 *
 * 不引入第三方依赖:release notes 只需要这几种常见语法。
 * 刻意不渲染 HTML,避免注入风险。
 */
import type { ReactNode } from 'react'
import { Link, Text } from '@fluentui/react-components'

/** 行内解析:**粗体**、`代码`、[文字](链接) */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  // 依次匹配粗体 / 行内代码 / 链接,其余按纯文本输出
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${keyPrefix}-i${i++}`
    if (m[1] != null) {
      out.push(
        <strong key={key} style={{ fontWeight: 600 }}>
          {m[1]}
        </strong>
      )
    } else if (m[2] != null) {
      out.push(
        <code
          key={key}
          style={{
            fontFamily: 'Consolas, "Cascadia Mono", monospace',
            fontSize: '0.92em',
            padding: '1px 5px',
            borderRadius: 4,
            background: 'rgba(128,128,128,0.18)'
          }}
        >
          {m[2]}
        </code>
      )
    } else if (m[3] != null && m[4] != null) {
      // 仅渲染 http/https 链接;其它协议(javascript: 等)按原文输出
      if (/^https?:\/\//i.test(m[4])) {
        out.push(
          <Link key={key} href={m[4]} target="_blank" rel="noreferrer" style={{ fontSize: 'inherit' }}>
            {m[3]}
          </Link>
        )
      } else {
        out.push(m[0])
      }
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** 块级渲染:### 标题 / - 列表 / 1. 列表 / 表格 / 空行分段 */

/** 表格分隔行:|---|:---:|---| 之类,只含 | - : 和空白,且至少有一个 - */
function isTableSeparator(line: string): boolean {
  const t = line.trim()
  if (!t.includes('|')) return false
  if (!/^[|\s:-]+$/.test(t)) return false
  return t.includes('-')
}

/** 拆分一行表格:`| a | b |` → ['a','b'];首尾的空竖线会被去掉 */
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

export function MarkdownBlock({ source }: { source: string }): ReactNode {
  const lines = String(source ?? '').split(/\r?\n/)
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushList = (): void => {
    if (!list) return
    const items = list.items
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag
        key={`list-${blocks.length}`}
        style={{
          margin: '2px 0 8px',
          paddingLeft: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 3
        }}
      >
        {items.map((it, i) => (
          <li key={i} style={{ lineHeight: 1.6 }}>
            {inline(it, `li-${blocks.length}-${i}`)}
          </li>
        ))}
      </Tag>
    )
    list = null
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx]
    const line = raw.trimEnd()
    const trimmed = line.trim()

    // 空行:结束列表
    if (!trimmed) {
      flushList()
      continue
    }
    // 分隔线
    if (/^---+$/.test(trimmed)) {
      flushList()
      blocks.push(
        <div
          key={`hr-${idx}`}
          style={{ height: 1, background: 'rgba(128,128,128,0.28)', margin: '10px 0' }}
        />
      )
      continue
    }
    // 标题
    const h = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (h) {
      flushList()
      const level = h[1].length
      const size = level <= 2 ? 400 : 300
      blocks.push(
        <Text
          key={`h-${idx}`}
          size={size}
          weight="semibold"
          style={{
            display: 'block',
            margin: level <= 2 ? '10px 0 6px' : '12px 0 4px',
            color: 'inherit'
          }}
        >
          {inline(h[2], `h-${idx}`)}
        </Text>
      )
      continue
    }
    // 表格:当前行含 |,且下一行是分隔行 → 收集到空行/非表格行为止
    if (trimmed.includes('|') && idx + 1 < lines.length && isTableSeparator(lines[idx + 1])) {
      flushList()
      const header = splitRow(trimmed)
      const rows: string[][] = []
      let j = idx + 2
      for (; j < lines.length; j++) {
        const t = lines[j].trim()
        if (!t || !t.includes('|')) break
        rows.push(splitRow(t))
      }
      blocks.push(
        // 横向滚动:窄弹窗里列多时不会挤压变形
        <div key={`table-${idx}`} style={{ overflowX: 'auto', margin: '4px 0 10px' }}>
          <table
            style={{
              borderCollapse: 'collapse',
              fontSize: '0.94em',
              width: '100%',
              minWidth: 320
            }}
          >
            <thead>
              <tr>
                {header.map((c, ci) => (
                  <th
                    key={ci}
                    style={{
                      textAlign: 'left',
                      padding: '5px 10px',
                      fontWeight: 600,
                      borderBottom: '1px solid rgba(128,128,128,0.45)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {inline(c, `th-${idx}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {header.map((_, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: '5px 10px',
                        borderBottom: '1px solid rgba(128,128,128,0.18)',
                        verticalAlign: 'top'
                      }}
                    >
                      {inline(r[ci] ?? '', `td-${idx}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      idx = j - 1
      continue
    }
    // 列表项
    const ul = /^[-*+]\s+(.*)$/.exec(trimmed)
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (ul || ol) {
      const ordered = !!ol
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list.items.push((ul ? ul[1] : ol![1]) ?? '')
      continue
    }
    // 普通段落
    flushList()
    blocks.push(
      <div key={`p-${idx}`} style={{ lineHeight: 1.65, margin: '0 0 6px' }}>
        {inline(trimmed, `p-${idx}`)}
      </div>
    )
  }
  flushList()
  return <>{blocks}</>
}
