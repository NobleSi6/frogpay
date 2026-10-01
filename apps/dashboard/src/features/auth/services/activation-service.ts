import { apiRequest } from "@/lib/api-client";

export function activateInvitation(email: string, token: string, password: string) {
  return apiRequest<{ message: string }>("/identity/activate-invitation", {
    method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase(), token, password }),
  }, false);
}
