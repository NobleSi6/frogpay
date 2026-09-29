"use client"

import * as React from "react"

export function useReveal<T extends HTMLElement = HTMLDivElement>(
  immediate = false
) {
  const ref = React.useRef<T | null>(null)
  const [isVisible, setIsVisible] = React.useState(false)

  React.useEffect(() => {
    if (immediate) {
      setIsVisible(true)
      return
    }

    const node = ref.current
    if (!node) return

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setIsVisible(true)
        observer.disconnect()
      },
      { threshold: 0.15, rootMargin: "0px 0px -80px 0px" }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [immediate])

  return { ref, isVisible }
}
