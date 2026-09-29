"use client"

import * as React from "react"
import { cn } from "cn"
import { useReveal } from "../hooks/useReveal"

function Reveal({
  className,
  delay = 0,
  immediate = false,
  style,
  ...props
}: React.ComponentProps<"div"> & { delay?: number; immediate?: boolean }) {
  const { ref, isVisible } = useReveal<HTMLDivElement>(immediate)

  return (
    <div
      ref={ref}
      style={{ ...style, transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        className
      )}
      {...props}
    />
  )
}

export { Reveal }
