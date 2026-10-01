import { ActivationScreen } from "@/features/auth/components/activation-screen";

export default async function ActivarCuentaPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ email?: string | string[] }> }) {
  const { token } = await params;
  const { email } = await searchParams;
  return <ActivationScreen key={token} token={token} invitationEmail={typeof email === "string" ? email : ""} />;
}
