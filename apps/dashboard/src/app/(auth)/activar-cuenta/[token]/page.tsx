export default function ActivarCuentaPage({
  params,
}: {
  params: { token: string };
}) {
  return (
    <div>
      <h1 className="text-h3 font-semibold mb-4">Define tu contraseña</h1>
      {/* Usará params.token para llamar a POST /invitations/:token/accept */}
    </div>
  );
}
