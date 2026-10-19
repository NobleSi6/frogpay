/**
 * Catálogo de eventos de dominio del sistema FrogPay.
 * Regla de arquitectura: <dominio>.<acción en participio> en español.
 */
export const EventCatalog = {
  // Dominio: Identidad / Tenants
  TENANT_CREADO: 'tenant.creado',
  USUARIO_INVITADO: 'usuario.invitado',
  USUARIO_ACTIVADO: 'usuario.activado',
  APIKEY_GENERADA: 'apikey.generada',
  APIKEY_REVOCADA: 'apikey.revocada',
  CREDENCIAL_PROVEEDOR_ACTUALIZADA: 'credencial.proveedor.actualizada',
  WEBHOOK_CREADO: 'webhook.creado',
  WEBHOOK_ACTUALIZADO: 'webhook.actualizado',
  WEBHOOK_ELIMINADO: 'webhook.eliminado',
  ARQUITECTURA_PRUEBA: 'arquitectura.prueba',

  // Dominio: Pagos
  PAGO_CREADO: 'pago.creado',
  PAGO_APROBADO: 'pago.aprobado',
  PAGO_RECHAZADO: 'pago.rechazado',
  PAGO_REEMBOLSADO: 'pago.reembolsado',
} as const;

export type EventName = (typeof EventCatalog)[keyof typeof EventCatalog];
