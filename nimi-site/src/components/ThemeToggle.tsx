'use client'
import { useEffect, useState } from 'react'
import { SunIcon, MoonIcon } from 'lucide-react'

export function ThemeToggle() {
    const [isDark, setIsDark] = useState(true)

    useEffect(() => {
        const saved = localStorage.getItem('nimi-theme')
        if (saved === 'light') {
            setIsDark(false)
            document.documentElement.classList.remove('dark')
            document.documentElement.classList.add('light')
        }
    }, [])

    const toggle = () => {
        const next = !isDark
        setIsDark(next)
        const root = document.documentElement
        if (next) {
            root.classList.remove('light')
            root.classList.add('dark')
            localStorage.setItem('nimi-theme', 'dark')
        } else {
            root.classList.remove('dark')
            root.classList.add('light')
            localStorage.setItem('nimi-theme', 'light')
        }
    }

    return (
        <button onClick={toggle} className="btn-ghost p-2 rounded-md">
            {isDark ? (
                <SunIcon className="w-4 h-4 text-text-secondary" />
            ) : (
                <MoonIcon className="w-4 h-4 text-text-secondary" />
            )}
        </button>
    )
}
