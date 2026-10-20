"use client"

import * as React from "react"

export function useReveal<T extends HTMLElement = HTMLDivElement>(
  immediate = false
) {
  const ref = React.useRef<T | null>(null)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (immediate) return

    const node = ref.current
    if (!node) return

    if (typeof IntersectionObserver === "undefined") {
      const timeout = window.setTimeout(() => setVisible(true), 0)
      return () => window.clearTimeout(timeout)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setVisible(true)
        observer.disconnect()
      },
      { threshold: 0.15, rootMargin: "0px 0px -80px 0px" }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [immediate])

  return { ref, isVisible: immediate || visible }
}
