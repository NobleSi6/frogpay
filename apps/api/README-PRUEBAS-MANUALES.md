# Pruebas manuales de FrogPay con Swagger

Esta guía recorre los endpoints de onboarding, invitaciones y API keys desde
Swagger. Las operaciones de creación, activación y revocación escriben en la
base de datos.

## 1. Preparar el entorno

Desde la raíz del repositorio, configura `.env` con una base de datos de prueba
aislada y los valores locales descritos en `.env.example`. No compartas ni
pegues aquí el contenido de `.env`.

```powershell
docker compose up --build -d
docker compose ps
```

Abre Swagger en <http://localhost:4000/api/docs>. La bandeja local de correo
está en <http://localhost:8025>. RabbitMQ Management está en
<http://localhost:15672>; usa las credenciales que configuraste localmente.

> **Importante:** no ejecutes el registro válido contra una base real. Crea un
> tenant, su owner, dos API keys y un evento de outbox que quedan persistidos.

## 2. Revisar salud y validación

1. En la sección **Health**, ejecuta `GET /health`. Debe devolver `200` con
   `status: "ok"` cuando API, PostgreSQL y RabbitMQ están disponibles.
2. En **Tenants**, abre `POST /api/tenants`, pulsa **Try it out** y agrega el
   header `x-user-role` con valor `PLATFORM_ADMIN`.
3. Para comprobar la validación sin crear datos, envía este body deliberadamente
   inválido:

   ```json
   {
     "name": "QA",
     "taxId": "123",
     "contactEmail": "qa@example.com",
     "plan": "free"
   }
   ```

   Espera `400` porque el NIT no cumple el formato. Esta solicitud no crea el
   tenant.

## 3. Crear un tenant de prueba

Continúa solo si confirmaste que la API apunta a tu base aislada. En
`POST /api/tenants`, conserva el header `x-user-role: PLATFORM_ADMIN` y envía,
por ejemplo:

```json
{
  "name": "Empresa QA Manual",
  "taxId": "QA-20260929-001",
  "contactEmail": "qa+manual@example.com",
  "plan": "free",
  "metadata": {
    "purpose": "manual-swagger-test"
  }
}
```

La respuesta esperada es `201` e incluye:

- `invitationQueued: true`.
- Un `id` de tenant y el owner con estado `invited`.
- Dos API keys iniciales, `test` y `live`.
- `rawKey` de cada llave, visible solo en esta respuesta. Guárdalo de forma
  segura para la prueba y no lo pongas en capturas, logs, tickets ni commits.

Si usas un NIT, nombre o correo ya existente, espera `409`. La entrega del
correo es asíncrona: `invitationQueued` confirma que el evento quedó encolado,
no que el proveedor ya entregó el mensaje.

## 4. Revisar y activar la invitación

1. Espera unos segundos y abre Mailpit en <http://localhost:8025>.
2. Abre el correo del owner y copia el enlace
   `/activar-cuenta/{token}?email=...`.
3. En Swagger, ejecuta **Identity** → `POST /api/identity/activate-invitation`
   con el email de la URL, el token y una contraseña de al menos 12 caracteres:

   ```json
   {
     "email": "qa+manual@example.com",
     "token": "PEGA_AQUI_EL_TOKEN_DEL_CORREO",
     "password": "ClaveManualQA-2026"
   }
   ```

   Debe responder `200`. El token se genera al consumir `tenant.creado`, se
   guarda como hash y no viene en la respuesta de creación del tenant.

## 5. Probar administración de API keys

Usa el `id` devuelto por `POST /api/tenants` como `tenantId` de la ruta. En
estos endpoints agrega `x-user-role: PLATFORM_ADMIN`.

1. `POST /api/tenants/{tenantId}/api-keys`, con este body:

   ```json
   {
     "name": "Llave QA manual",
     "type": "test"
   }
   ```

   Debe responder `201`. Copia `rawKey` de forma segura; solo se entrega una
   vez.
2. `GET /api/tenants/{tenantId}/api-keys`: verifica que las llaves se muestran
   enmascaradas y que no aparecen `rawKey` ni hashes.
3. `DELETE /api/tenants/{tenantId}/api-keys/{apiKeyId}`: usa el `id` de la llave
   recién creada. Debe quedar revocada (`isActive: false`). Esta acción modifica
   la base de datos.

## 6. Qué comprobar en RabbitMQ

El registro persiste `tenant.creado` en outbox junto con tenant, owner y llaves;
el publicador lo envía a RabbitMQ. Notifications genera el token y envía el
correo. Ante un error de correo, el consumidor reintenta tres veces; si sigue
fallando, RabbitMQ deriva el mensaje a la DLQ de esa cola. Swagger no muestra el
contenido del outbox ni fuerza errores del proveedor: revisa los logs de API,
la cola y su DLQ en RabbitMQ Management.

## Límites de las pruebas manuales

- El header `x-user-role` sirve solo fuera de `production`; todavía no hay
  login/JWT de producción.
- Para API keys, `OWNER` y `ADMIN` requieren un tenant autenticado disponible
  como `@CurrentTenant`. Enviar solo `x-user-role: OWNER` o `ADMIN` no crea ese
  contexto; usa `PLATFORM_ADMIN` en Swagger para recorrer el CRUD. El aislamiento
  por rol está cubierto por pruebas automatizadas.
- No envíes un registro válido a Supabase real si no quieres dejar datos allí.

