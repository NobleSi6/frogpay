import Image from "next/image"
import Link from "next/link"
import { AtSign, Globe, MessageCircle, Rss } from "lucide-react"

const socialLinks = [
  { label: "X (Twitter)", href: "#", icon: AtSign },
  { label: "Comunidad", href: "#", icon: MessageCircle },
  { label: "Sitio web", href: "#", icon: Globe },
  { label: "Feed", href: "#", icon: Rss },
]

const columns = [
  {
    title: "Empresa",
    links: [
      { label: "Quiénes somos", href: "#quienes-somos" },
      { label: "Nuestra visión", href: "#" },
      { label: "Prensa", href: "#" },
      { label: "Carreras", href: "#" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { label: "Documentación", href: "#" },
      { label: "API Status", href: "#" },
      { label: "Servicios", href: "#servicios" },
      { label: "Blog de desarrollo", href: "#" },
    ],
  },
  {
    title: "Soporte",
    links: [
      { label: "Ayuda directa", href: "#" },
      { label: "Clientes", href: "#" },
      { label: "Seguridad técnica", href: "#" },
      { label: "Contacto", href: "#" },
    ],
  },
]

export const Footer = () => {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-5">
          <div className="md:col-span-2">
            <Link href="/" className="mb-4 flex items-center">
              <Image
                src="/logo.png"
                alt="FrogPay"
                width={1240}
                height={201}
                className="h-6 w-auto"
              />
            </Link>

            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              La billetera y pasarela de pagos digitales de alto rendimiento diseñada
              específicamente para Latinoamérica.
            </p>

            <div className="mt-6 flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex size-8 items-center justify-center rounded-full bg-neutral-900 text-neutral-50 transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  <social.icon size={14} />
                </a>
              ))}
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h4 className="mb-4 text-xs font-semibold text-muted-foreground uppercase">
                {column.title}
              </h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="hover:text-foreground">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-[11px] text-muted-foreground md:flex-row">
          <p>© 2026 FrogPay Technologies, S.A. Todos los derechos reservados.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:underline">
              Términos de servicio
            </a>
            <a href="#" className="hover:underline">
              Políticas de privacidad
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
