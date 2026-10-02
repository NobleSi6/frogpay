import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ className = "h-auto w-56 sm:w-80", priority = false }: BrandLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="FrogPay"
      width={1240}
      height={201}
      priority={priority}
      className={className}
    />
  );
}
