"use client"

import * as React from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { BrandLogo } from "@/components/brand-logo"

const navLinks = [
  { name: "Quiénes somos", href: "#quienes-somos" },
  { name: "Servicios", href: "#servicios" },
  { name: "Testimonios", href: "#testimonios" },
]

export const Header = () => {
  const [isScrolled, setIsScrolled] = React.useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)

  React.useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        isScrolled
          ? "border-b border-border bg-background/80 py-3 shadow-sm backdrop-blur-md"
          : "bg-transparent py-5"
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center">
          <BrandLogo priority />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.name}
            </a>
          ))}
        </nav>

        <div className="hidden items-center md:flex">
          <Button nativeButton={false} render={<Link href="/login" />}>
            Inicia sesión
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon-lg"
          className="md:hidden"
          aria-label="Abrir menú de navegación"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </Button>
      </div>

      {mobileMenuOpen && (
        <div className="flex flex-col gap-4 border-b border-border bg-background px-6 py-5 shadow-lg md:hidden">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.name}
            </a>
          ))}
          <Button
            nativeButton={false}
            render={<Link href="/login" />}
            className="w-full"
          >
            Inicia sesión
          </Button>
        </div>
      )}
    </header>
  )
}
