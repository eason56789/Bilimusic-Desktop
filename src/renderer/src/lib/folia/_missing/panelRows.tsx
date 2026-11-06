// stub: 上游 visualizer/panelRows.tsx 的降级版,依赖 _missing/settingsKit 而非播放器的设置 kit。
import React, { useEffect, useRef } from 'react'
import { Row, Slider, Toggle } from './settingsKit'

export const percent = (value: number) => `${Math.round(value * 100)}%`
export const times = (value: number) => `${value.toFixed(2)}x`

type SliderRowProps = {
    label: React.ReactNode
    value: number
    min: number
    max: number
    step: number
    format: (value: number) => string
    onChange: (value: number) => void
    /** A pointer took hold of the slider: until onDragEnd the window keeps the values as a draft. */
    onDragStart?: () => void
    /** The pointer let go, wherever it was by then. */
    onDragEnd?: () => void
    marks?: ReadonlyArray<{ value: number; label?: string }>
    note?: React.ReactNode
    sub?: boolean
    disabled?: boolean
}

/** A row that is one slider: the value ends the label's line, the track spans the row. */
export const SliderRow: React.FC<SliderRowProps> = ({ label, format, onDragStart, onDragEnd, note, sub, disabled, ...slider }) => {
    const markRef = useRef<HTMLSpanElement>(null)

    useEffect(() => {
        const box = markRef.current?.parentElement
        if (!box || !onDragStart) {
            return
        }
        let dragging = false
        const end = () => {
            if (!dragging) {
                return
            }
            dragging = false
            window.removeEventListener('pointerup', end, true)
            window.removeEventListener('pointercancel', end, true)
            window.removeEventListener('blur', end)
            onDragEnd?.()
        }
        const start = (event: PointerEvent) => {
            if (!(event.target instanceof HTMLInputElement)) {
                return
            }
            dragging = true
            onDragStart()
            window.addEventListener('pointerup', end, true)
            window.addEventListener('pointercancel', end, true)
            window.addEventListener('blur', end)
        }
        box.addEventListener('pointerdown', start)
        return () => {
            box.removeEventListener('pointerdown', start)
            end()
        }
    }, [onDragStart, onDragEnd])

    return (
        <Row label={label} note={note} sub={sub} disabled={disabled}>
            <span className="flex flex-1 items-center gap-2">
                <Slider {...slider} stacked disabled={disabled} />
                <span className="w-12 shrink-0 text-right text-xs tabular-nums opacity-60">{format(slider.value)}</span>
            </span>
            <span ref={markRef} hidden />
        </Row>
    )
}

type ToggleRowProps = {
    label: React.ReactNode
    checked: boolean
    onChange: (checked: boolean) => void
    note?: React.ReactNode
    sub?: boolean
    disabled?: boolean
}

/** A row that is one switch. */
export const ToggleRow: React.FC<ToggleRowProps> = ({ checked, onChange, ...row }) => (
    <Row {...row}>
        <Toggle checked={checked} onChange={onChange} disabled={row.disabled} />
    </Row>
)
