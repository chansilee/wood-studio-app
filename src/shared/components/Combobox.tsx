import { useEffect, useRef, useState } from 'react'

export interface ComboboxOption {
  value: string
  label: string
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  className,
}: {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) {
      setQuery(selected ? selected.label : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open])

  useEffect(() => {
    const onClickOutside = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  const selectOption = (opt: ComboboxOption) => {
    onChange(opt.value)
    setQuery(opt.label)
    setOpen(false)
  }

  const handleKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (ev.key === 'Enter') {
      ev.preventDefault()
      if (filtered.length === 1) {
        selectOption(filtered[0])
      } else if (filtered[highlight]) {
        selectOption(filtered[highlight])
      }
    } else if (ev.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="border rounded px-2 py-1.5 text-sm w-full"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto border rounded bg-white shadow-lg">
          {filtered.map((opt, idx) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectOption(opt)}
              className={`block w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 ${idx === highlight ? 'bg-gray-100' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-10 mt-1 w-full border rounded bg-white shadow-lg px-2 py-1.5 text-sm text-gray-400">
          找不到符合的選項
        </div>
      )}
    </div>
  )
}
