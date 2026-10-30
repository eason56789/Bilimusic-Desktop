/** 页面统一页头:图标 + 标题 + 副标题 + 右侧操作区 */
import type { ReactNode } from 'react'
import { Text, makeStyles, tokens } from '@fluentui/react-components'

const useStyles = makeStyles({
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    flexShrink: 0
  },
  iconBox: {
    width: '40px',
    height: '40px',
    borderRadius: tokens.borderRadiusLarge,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    flexShrink: 0
  },
  titles: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 },
  actions: { display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }
})

export function PageHeader({
  icon,
  title,
  subtitle,
  actions
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  const styles = useStyles()
  return (
    <div className={styles.header}>
      <div className={styles.iconBox}>{icon}</div>
      <div className={styles.titles}>
        <Text size={600} weight="semibold">
          {title}
        </Text>
        {subtitle ? (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {subtitle}
          </Text>
        ) : null}
      </div>
      <div className={styles.actions}>{actions}</div>
    </div>
  )
}

/** 页面统一容器:页头 + 可滚动内容 */
export function PageLayout({
  icon,
  title,
  subtitle,
  actions,
  children,
  footer
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        // minHeight 必须显式设为 0:flex 子项默认 min-height:auto 会被内容撑高,
        // 导致整页比 main 的实际可用高度更高、向下溢出,滚动区底边压到播放条底下,
        // 滚到最后一行时只能看到一半(列表页、最近播放页都受影响)。
        minHeight: 0,
        padding: '18px 24px 16px',
        gap: '14px',
        minWidth: 0
      }}
    >
      <PageHeader icon={icon} title={title} subtitle={subtitle} actions={actions} />
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          paddingRight: '4px',
          // 底部留一点滚动余量:滚到底时最后一行与边缘之间有空隙,
          // 不会因为紧贴容器下边缘而显得被裁掉一半
          paddingBottom: '20px'
        }}
      >
        {children}
      </div>
      {footer}
    </div>
  )
}
