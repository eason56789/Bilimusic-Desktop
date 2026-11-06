// stub: 上游依赖播放器设置窗口的 settings kit(modal/settings/kit),此处降级实现。
// 只保留 monet / pendolo 设置面板用到的组件:外观尽量接近,但不含上游的主题联动与持久化。
import React, { createContext, useContext, useState } from 'react'

/* ===================== Group ===================== */

export interface SettingsGroupDef {
    id: string
    /** i18n key of the group's title. */
    titleKey: string
}

export const Group: React.FC<{ def: SettingsGroupDef; foot?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode }> = ({ def, foot, action, children }) => (
    <section data-group-id={def.id} className="flex flex-col gap-3 py-2">
        <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold opacity-60">{def.titleKey}</h4>
            {action}
        </div>
        {children}
        {foot != null && <p className="text-xs opacity-50">{foot}</p>}
    </section>
)

/* ===================== Row ===================== */

export const Row: React.FC<{
    label?: React.ReactNode
    note?: React.ReactNode
    hint?: React.ReactNode
    below?: React.ReactNode
    /** nebbia / sonnet 面板用的一行说明(与 note 同级的另一条,渲染在 note 之后)。 */
    notice?: React.ReactNode
    sub?: boolean
    disabled?: boolean
    children?: React.ReactNode
}> = ({ label, note, hint, below, notice, sub, disabled, children }) => (
    <div
        className={`flex flex-col gap-1 ${sub ? 'pl-4 opacity-80' : ''} ${disabled ? 'opacity-40' : ''}`}
        aria-disabled={disabled || undefined}
    >
        <div className="flex items-center justify-between gap-3">
            <span className="text-sm">{label}</span>
            {hint != null && <span className="truncate text-xs opacity-50">{hint}</span>}
            {children}
        </div>
        {note != null && <p className="text-xs opacity-50">{note}</p>}
        {notice != null && <p className="text-xs opacity-50">{notice}</p>}
        {below}
    </div>
)

/* ===================== Slider ===================== */

export const Slider: React.FC<{
    label?: React.ReactNode
    /** 值的读法(machi 取景条用它显示带单位的读数)。 */
    format?: (value: number) => string
    value: number
    min: number
    max: number
    step?: number
    /** 上游让 slider 独占一行(stack);降级版同样如此。 */
    stacked?: boolean
    disabled?: boolean
    /** 外部可访问控件的 id(machi 取景条的 aria)。 */
    id?: string
    labelledBy?: string
    onChange: (value: number) => void
}> = ({ label, format, value, min, max, step = 1, stacked, disabled, id, labelledBy, onChange }) => (
    <div className={stacked === false ? 'flex items-center gap-2' : 'flex flex-col gap-1'}>
        {label != null && (
            <div className="flex items-center justify-between gap-2 text-xs">
                <span>{label}</span>
                {format != null && <span className="opacity-60 tabular-nums">{format(value)}</span>}
            </div>
        )}
        <input
            type="range"
            id={id}
            aria-labelledby={labelledBy}
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-current"
        />
    </div>
)

/* ===================== Toggle ===================== */

export const Toggle: React.FC<{ checked: boolean; disabled?: boolean; labelledBy?: string; onChange: (checked: boolean) => void }> = ({
    checked,
    disabled,
    labelledBy,
    onChange,
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelledBy}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-gray-400/50'}`}
    >
        <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
    </button>
)

/* ===================== Segmented ===================== */

export interface SegmentedOption<V extends string> {
    value: V
    label: string
    disabled?: boolean
}

export function Segmented<V extends string>({
    value,
    options,
    onChange,
    disabled,
}: {
    value: V
    options: readonly SegmentedOption<V>[]
    onChange: (value: V) => void
    disabled?: boolean
}) {
    return (
        <div className={`flex overflow-hidden rounded-md border border-current/20 text-xs ${disabled ? 'opacity-40' : ''}`}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    disabled={disabled || option.disabled}
                    onClick={() => onChange(option.value)}
                    className={`px-2 py-1 transition-colors ${
                        option.value === value ? 'bg-current/15 font-medium' : 'opacity-60 hover:opacity-100'
                    } ${disabled || option.disabled ? 'cursor-not-allowed opacity-30' : ''}`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}

/* ===================== Select ===================== */

export function Select<V extends string>({
    value,
    options,
    onChange,
}: {
    value: V
    options: readonly { value: string; label: string }[]
    onChange: (value: V) => void
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value as V)}
            className="rounded-md border border-current/20 bg-transparent px-2 py-1 text-xs"
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    )
}

/* ===================== Button ===================== */

export const Button: React.FC<{
    icon?: React.ComponentType<{ size?: number | string; className?: string }>
    /** 上游 kit 的外观档位(quiet/primary 等);降级版只区分 quiet(去边框)。 */
    variant?: string
    /** 悬停提示。 */
    tip?: string
    onClick?: () => void
    disabled?: boolean
    children?: React.ReactNode
}> = ({ icon: Icon, variant, tip, onClick, disabled, children }) => (
    <button
        type="button"
        title={tip}
        onClick={onClick}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-md border border-current/20 px-2.5 py-1 text-xs transition-colors hover:bg-current/10 ${
            variant === 'quiet' ? 'border-transparent' : ''
        } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
        {Icon && <Icon size={13} />}
        {children}
    </button>
)

/* ===================== Tabs ===================== */

/** 上游 kit 的 Tabs:一排文字页签,右端可挂一个操作。降级为纯布局实现。 */
export const Tabs: React.FC<{
    tabs: ReadonlyArray<{ id: string; label: string; dot?: boolean }>
    activeId: string | null
    onSelect: (id: string) => void
    action?: React.ReactNode
    contents?: boolean
    label?: string
    className?: string
}> = ({ tabs, activeId, onSelect, action, label, className = '' }) => (
    <div className={`flex items-center gap-4 ${className}`}>
        <div role="tablist" aria-label={label} className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={tab.id === activeId || undefined}
                    onClick={() => onSelect(tab.id)}
                    className={`relative flex shrink-0 items-center gap-1.5 border-b-2 pb-1.5 pt-2 text-[13px] transition-colors ${
                        tab.id === activeId ? 'border-current font-medium' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                >
                    {tab.label}
                    {tab.dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </button>
            ))}
        </div>
        {action}
    </div>
)

/* ===================== PictureGrid ===================== */

export function PictureGrid<V extends string>({
    label,
    value,
    options,
    columns = 4,
    picture,
    onChange,
}: {
    className?: string
    label: string
    value: V
    options: readonly { value: V; label: string }[]
    columns?: number
    picture: (value: V) => React.ReactNode
    onChange: (value: V) => void
}) {
    return (
        <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={option.value === value}
                    title={option.label}
                    onClick={() => onChange(option.value)}
                    className={`relative aspect-[4/3] overflow-hidden rounded-lg border transition-colors ${
                        option.value === value ? 'border-blue-400 ring-1 ring-blue-400/50' : 'border-current/15 hover:border-current/40'
                    }`}
                >
                    {picture(option.value)}
                </button>
            ))}
        </div>
    )
}

/* ===================== Reveal ===================== */

export const Reveal: React.FC<{ when: boolean; children?: React.ReactNode }> = ({ when, children }) => {
    const [mounted] = useState(when)
    if (!when && !mounted) return null
    if (!when) return null
    return <>{children}</>
}

export const SettingsKitContext = createContext<{ isDaylight?: boolean }>({})
export const useSettingsKit = () => useContext(SettingsKitContext)
