# Manual de usuario de FrogPay

## 1. Requisitos y acceso

1. Levanta el entorno con Docker siguiendo `docs/GUIA-PUESTA-EN-MARCHA.md`.
2. Abre `http://localhost:3001/login`.
3. Ingresa con el usuario owner creado por el seed de desarrollo.
4. Verifica que el encabezado muestre el comercio y el ambiente correcto.

> **CAPTURA PENDIENTE 1:** pantalla de inicio de sesión.

## 2. Inicio y métricas

La ruta `/dashboard` es el inicio del tenant. La API ofrece métricas aisladas por tenant y ambiente en `GET /api/dashboard/metrics`. El periodo permitido es de 7 o 30 días. Los datos de `sandbox` nunca se mezclan con producción.

> **CAPTURA PENDIENTE 2:** inicio del dashboard del tenant.

## 3. Consultar pagos

En **Pagos** (`/dashboard/pagos`) se consulta el listado. Selecciona un registro para abrir `/dashboard/pagos/{id}` y revisar importe, estado, método y referencias. Para crear una prueba usa **Nuevo pago** (`/dashboard/pagos/nuevo`).

> **CAPTURA PENDIENTE 3:** listado y detalle de un pago.

## 4. Pago QR

En `/dashboard/pagos/qr` crea un pago QR de sandbox. Escanea o copia el payload y espera la confirmación. Un QR puede terminar confirmado o expirado; no se procesa dos veces un callback repetido.

> **CAPTURA PENDIENTE 4:** QR generado y estado final.

## 5. Transferencia y conciliación bancaria

En `/dashboard/pagos/transferencia` genera las instrucciones y la referencia única. Después registra el depósito y consulta la conciliación en `/dashboard/pagos/conciliacion`. La referencia y el monto deben coincidir; los casos alternativos se muestran como referencia desconocida, monto distinto, transferencia vencida o depósito duplicado.

> **CAPTURA PENDIENTE 5:** instrucciones bancarias y resultado de conciliación.

## 6. API keys

En `/dashboard/api-keys` crea, regenera o revoca claves. La clave completa se muestra una sola vez. Cópiala en ese momento y no la publiques en capturas, documentación ni repositorios.

> **CAPTURA PENDIENTE 6:** listado con claves enmascaradas.

## 7. Webhooks

En `/dashboard/webhooks` registra una URL, elige eventos y ambiente, y envía una prueba. El secreto de firma solo se revela al crear o rotar el endpoint. Los fallos se reintentan y, al agotar intentos, se conservan para diagnóstico.

> **CAPTURA PENDIENTE 7:** configuración y prueba de un webhook.

## 8. Credenciales de Stripe

En `/dashboard/configuracion/proveedores/stripe` selecciona sandbox o producción y guarda las claves del ambiente correspondiente. FrogPay cifra la clave secreta y después solo muestra su versión enmascarada.

> **CAPTURA PENDIENTE 8:** credenciales configuradas sin exponer secretos.

## 9. Auditoría y soporte

El owner puede consultar el historial mediante `GET /api/dashboard/audit-logs`, filtrando por pago, acción y fechas. Los registros son append-only y su cadena de hashes permite detectar alteraciones.

> **CAPTURA PENDIENTE 9:** consulta de auditoría del owner sin datos sensibles.

Si ocurre un error, conserva el identificador de solicitud o referencia visible y contacta a soporte sin enviar contraseñas, API keys ni secretos de webhook.

## 10. Manual de Platform Admin

1. Inicia sesión con el usuario Platform Admin configurado mediante `DEV_PLATFORM_ADMIN_EMAIL`.
2. Accede a `/admin` para revisar los tenants y usa `/admin/tenants/nuevo` para aprovisionar uno nuevo.
3. Para comprobar la integridad de la auditoría de un tenant, ejecuta `GET /api/admin/audit/verify?tenantId={uuid}` desde Swagger con el token de Platform Admin.
4. Un resultado válido indica que la cadena está íntegra; si existe una ruptura, la respuesta identifica el primer evento afectado para su investigación.

El Platform Admin no debe reutilizar credenciales de owner ni compartir tokens, contraseñas o secretos en capturas.

> **CAPTURA PENDIENTE 10:** listado de tenants del Platform Admin.
>
> **CAPTURA PENDIENTE 11:** resultado de verificación de integridad en Swagger.

## 11. Usuario demo local

`npm run db:seed --workspace=apps/api` crea datos idempotentes de 30 días para tarjeta, QR y transferencia. En desarrollo crea `owner.demo@frogpay.local`; su contraseña se toma de `DEV_DEMO_OWNER_PASSWORD` y, si no se define, usa `FrogPayDemo123!`. Estas credenciales son exclusivamente locales.

## 12. Exportación a PDF

El documento usa títulos jerárquicos, pasos numerados y placeholders de captura independientes para poder exportarse sin reorganizar el contenido. Cuando las capturas estén listas, reemplaza cada bloque **CAPTURA PENDIENTE** por la imagen correspondiente, verifica que no muestre secretos y exporta desde el editor con **Archivo → Descargar/Exportar → PDF**.
