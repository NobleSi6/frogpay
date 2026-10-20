/**
 * Planes publicados en la Landing.
 *
 * Espejan el seed de `apps/api/prisma/seed.ts` (fuente de verdad de precios y
 * comisiones). No se consultan en tiempo real: el catálogo del backend
 * (`GET /api/plans`) está protegido por el guard global de autenticación y la
 * Landing es pública.
 */
export interface LandingPlan {
  id: string;
  name: string;
  monthlyPrice: string;
  monthlyVolumeLimit: string | null;
  commissionFixed: string;
  commissionPct: string;
  features: Record<string, unknown>;
}

export const LANDING_PLANS: LandingPlan[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: "0.00",
    monthlyVolumeLimit: "5000.00",
    commissionFixed: "0.50",
    commissionPct: "0.0350",
    features: {
      webhooks: true,
      dashboard_basic: true,
      analytics: false,
      fraud_detection: false,
      multi_region: false,
      max_users: 1,
    },
  },
  {
    id: "premium",
    name: "Premium",
    monthlyPrice: "150.00",
    monthlyVolumeLimit: null,
    commissionFixed: "0.30",
    commissionPct: "0.0250",
    features: {
      webhooks: true,
      dashboard_basic: true,
      analytics: true,
      fraud_detection: true,
      multi_region: true,
      max_users: 10,
    },
  },
];
