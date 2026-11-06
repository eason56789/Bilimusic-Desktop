// stub: 上游 i18n/config 是播放器级 i18next 实例;此处降级为直接回显 key 的最小实现。
// monet 的 portraitUpload 等非组件代码用它取提示文案,回显 key 即可(界面仍是中文单语)。
const i18n = {
    t: (key: string, opts?: Record<string, unknown>): string => {
        if (opts && typeof opts.defaultValue === 'string') return opts.defaultValue
        return key
    },
    language: 'zh-CN',
}

export default i18n
