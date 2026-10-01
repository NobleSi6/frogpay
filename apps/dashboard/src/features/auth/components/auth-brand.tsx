import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export function AuthBrand() {
  return (
    <Link href="/" aria-label="Ir al inicio de FrogPay" className="inline-flex items-center">
      <BrandLogo className="h-auto w-80 max-w-full" priority />
    </Link>
  );
}
