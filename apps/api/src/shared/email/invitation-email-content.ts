export function buildInvitationEmail(input: {
  tenantName: string;
  invitationUrl: string;
  expiresAt: Date;
}): { subject: string; html: string } {
  return {
    subject: `Activa tu cuenta de FrogPay para ${input.tenantName}`,
    html: `<p>Hola,</p><p>Se creó una cuenta de FrogPay para <strong>${escapeHtml(input.tenantName)}</strong>.</p><p><a href="${escapeHtml(input.invitationUrl)}">Definir contraseña y activar cuenta</a></p><p>Este enlace vence el ${input.expiresAt.toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}.</p><p>Si no esperabas esta invitación, puedes ignorar este correo.</p>`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}