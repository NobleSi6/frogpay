export interface Plan {
  id: string;
  name: string;
  monthlyPrice: string;
  monthlyVolumeLimit: string | null;
  commissionFixed: string;
  commissionPct: string;
  features: unknown;
}