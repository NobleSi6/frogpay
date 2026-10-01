import { apiRequest } from "@/lib/api-client";

export type TenantDraft = { company: string; legalName: string; taxId: string; address: string; email: string };
type CreatedTenant = { id: string; name: string; contactEmail: string; createdAt: string; invitationQueued: boolean; owner: { email: string; status: string } };
export type TenantSummary = { id: string; name: string; ownerEmail: string; status: string; createdAt: string };

export const listTenants = () => apiRequest<TenantSummary[]>("/tenants");

export async function createTenant(draft: TenantDraft): Promise<CreatedTenant> {
  const result = await apiRequest<CreatedTenant>("/tenants", { method: "POST", body: JSON.stringify({
    name: draft.company.trim(), taxId: draft.taxId.trim(), contactEmail: draft.email.trim().toLowerCase(),
    // The current DTO only supports these additional fields inside metadata.
    metadata: { businessName: draft.legalName.trim(), fiscalAddress: draft.address.trim() },
  }) });
  // Do not retain the initial raw API keys returned by this endpoint.
  return { id: result.id, name: result.name, contactEmail: result.contactEmail, createdAt: result.createdAt, invitationQueued: result.invitationQueued, owner: result.owner };
}
