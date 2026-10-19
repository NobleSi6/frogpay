import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

const directUrl = process.env.DIRECT_URL;

if (!directUrl) {
  throw new Error('DIRECT_URL es obligatoria para ejecutar el seed.');
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: directUrl },
  },
});

const plans = [
  {
    name: 'Free',
    monthly_price: '0.00',
    monthly_volume_limit: '5000.00',
    commission_fixed: '0.50',
    commission_pct: '0.0350',
    features: {
      webhooks: true,
      dashboard_basic: true,
      analytics: false,
      fraud_detection: false,
      multi_region: false,
      max_users: 1,
    } satisfies Prisma.InputJsonObject,
  },
  {
    name: 'Premium',
    monthly_price: '150.00',
    monthly_volume_limit: null,
    commission_fixed: '0.30',
    commission_pct: '0.0250',
    features: {
      webhooks: true,
      dashboard_basic: true,
      analytics: true,
      fraud_detection: true,
      multi_region: true,
      max_users: 10,
    } satisfies Prisma.InputJsonObject,
  },
] as const;

async function seed(): Promise<void> {
  for (const name of [
    'platform_admin',
    'tenant_owner',
    'tenant_operator',
    'tenant_viewer',
    'tenant_admin',
    'tenant_developer',
    'tenant_finance',
    'tenant_support',
  ]) {
    await prisma.role.upsert({
      where: { name },
      create: { name },
      update: { name },
    });
  }

  const paymentMethods = [
    { code: 'card', name: 'Tarjeta' },
    { code: 'wallet', name: 'Billetera digital' },
    { code: 'qr', name: 'QR interoperable' },
    { code: 'bank_transfer', name: 'Transferencia bancaria' },
  ];

  for (const paymentMethod of paymentMethods) {
    await prisma.payment_method.upsert({
      where: { code: paymentMethod.code },
      create: paymentMethod,
      update: { name: paymentMethod.name },
    });
  }

  const card = await prisma.payment_method.findUniqueOrThrow({
    where: { code: 'card' },
    select: { id: true },
  });
  const qr = await prisma.payment_method.findUniqueOrThrow({
    where: { code: 'qr' },
    select: { id: true },
  });

  await prisma.provider.upsert({
    where: { code: 'stripe' },
    create: {
      code: 'stripe',
      name: 'Stripe',
      payment_method_id: card.id,
    },
    update: {
      name: 'Stripe',
      payment_method_id: card.id,
    },
  });

  const bankTransfer = await prisma.payment_method.findUniqueOrThrow({
    where: { code: 'bank_transfer' },
    select: { id: true },
  });

  await prisma.provider.upsert({
    where: { code: 'bank_transfer_local' },
    create: {
      code: 'bank_transfer_local',
      name: 'Banco FrogPay Simulado',
      payment_method_id: bankTransfer.id,
    },
    update: {
      name: 'Banco FrogPay Simulado',
      payment_method_id: bankTransfer.id,
      is_active: true,
    },
  });

  await prisma.provider.upsert({
    where: { code: 'qr_local' },
    create: {
      code: 'qr_local',
      name: 'QR Local',
      payment_method_id: qr.id,
    },
    update: {
      name: 'QR Local',
      payment_method_id: qr.id,
      is_active: true,
    },
  });

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      create: {
        ...plan,
        monthly_price: new Prisma.Decimal(plan.monthly_price),
        monthly_volume_limit: plan.monthly_volume_limit
          ? new Prisma.Decimal(plan.monthly_volume_limit)
          : null,
        commission_fixed: new Prisma.Decimal(plan.commission_fixed),
        commission_pct: new Prisma.Decimal(plan.commission_pct),
      },
      update: {
        monthly_price: new Prisma.Decimal(plan.monthly_price),
        monthly_volume_limit: plan.monthly_volume_limit
          ? new Prisma.Decimal(plan.monthly_volume_limit)
          : null,
        commission_fixed: new Prisma.Decimal(plan.commission_fixed),
        commission_pct: new Prisma.Decimal(plan.commission_pct),
        features: plan.features,
      },
    });
  }

  await seedDevelopmentPlatformAdmin();
  await seedSprint4Demo();
}

async function seedSprint4Demo(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;

  const premium = await prisma.plan.findUniqueOrThrow({
    where: { name: 'Premium' },
  });
  const tenant = await prisma.tenant.upsert({
    where: { tax_id: 'DEMO-SPRINT4-001' },
    create: {
      name: 'Comercio Demo Sprint 4',
      business_name: 'FrogPay Demo SRL',
      tax_id: 'DEMO-SPRINT4-001',
      contact_email: 'owner.demo@frogpay.local',
      status: 'active',
      plan_id: premium.id,
      metadata: { purpose: 'sprint4-dashboard-demo' },
    },
    update: { status: 'active', plan_id: premium.id },
  });

  const ownerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'tenant_owner' },
  });
  const demoPassword = process.env.DEV_DEMO_OWNER_PASSWORD ?? 'FrogPayDemo123!';
  const passwordHash = await hashPassword(demoPassword);
  const owner = await prisma.app_user.findFirst({
    where: { tenant_id: tenant.id, email: 'owner.demo@frogpay.local' },
    select: { id: true },
  });
  if (owner) {
    await prisma.app_user.update({
      where: { id: owner.id },
      data: { password_hash: passwordHash, status: 'active' },
    });
  } else {
    await prisma.app_user.create({
      data: {
        tenant_id: tenant.id,
        role_id: ownerRole.id,
        email: 'owner.demo@frogpay.local',
        name: 'Owner Demo',
        password_hash: passwordHash,
        status: 'active',
      },
    });
  }

  const demoRawApiKey = 'fp_live_sprint4_demo_key_local_only';
  await prisma.api_key.upsert({
    where: { key_prefix: 'fp_live_sprint4' },
    create: {
      tenant_id: tenant.id,
      name: 'Integración demo Sprint 4',
      key_prefix: 'fp_live_sprint4',
      secret_hash: createHash('sha256').update(demoRawApiKey).digest('hex'),
      masked_key: 'fp_live_sprint4••••only',
      environment: 'production',
      status: 'active',
    },
    update: { tenant_id: tenant.id, status: 'active' },
  });

  const providers = await prisma.provider.findMany({
    where: { code: { in: ['stripe', 'qr_local', 'bank_transfer_local'] } },
    include: { payment_method: true },
  });
  const byCode = new Map(providers.map((provider) => [provider.code, provider]));
  for (let dayOffset = 29; dayOffset >= 0; dayOffset -= 1) {
    for (let sequence = 0; sequence < 3; sequence += 1) {
      const providerCode = ['stripe', 'qr_local', 'bank_transfer_local'][sequence];
      const provider = byCode.get(providerCode);
      if (!provider) throw new Error(`Proveedor demo no encontrado: ${providerCode}`);
      const status =
        (dayOffset + sequence) % 7 === 0
          ? 'rejected'
          : (dayOffset + sequence) % 11 === 0
            ? 'expired'
            : 'approved';
      const amount = 80 + (29 - dayOffset) * 13 + sequence * 27;
      const createdAt = new Date();
      createdAt.setUTCHours(12 + sequence, 0, 0, 0);
      createdAt.setUTCDate(createdAt.getUTCDate() - dayOffset);
      const idempotencyKey = `sprint4-demo-${dayOffset}-${sequence}`;
      const commission = status === 'approved' ? Number((amount * 0.025 + 0.3).toFixed(2)) : 0;
      const demoPayment = await prisma.payment.upsert({
        where: {
          tenant_id_idempotency_key: {
            tenant_id: tenant.id,
            idempotency_key: idempotencyKey,
          },
        },
        create: {
          tenant_id: tenant.id,
          idempotency_key: idempotencyKey,
          idempotency_body_hash: `demo-${dayOffset}-${sequence}`,
          amount: new Prisma.Decimal(amount),
          status,
          payment_method_id: provider.payment_method_id,
          provider_id: provider.id,
          environment: 'production',
          merchant_reference: `DEMO-${dayOffset}-${sequence}`,
          commission_amount: new Prisma.Decimal(commission),
          net_amount: new Prisma.Decimal(amount - commission),
          created_at: createdAt,
          updated_at: createdAt,
        },
        update: {
          status,
          amount: new Prisma.Decimal(amount),
          commission_amount: new Prisma.Decimal(commission),
          net_amount: new Prisma.Decimal(amount - commission),
          created_at: createdAt,
          updated_at: createdAt,
        },
      });
      const existingHistory = await prisma.payment_status_history.findFirst({
        where: {
          payment_id: demoPayment.id,
          tenant_id: tenant.id,
          new_status: status,
        },
        select: { id: true },
      });
      if (!existingHistory) {
        await prisma.payment_status_history.create({
          data: {
            payment_id: demoPayment.id,
            tenant_id: tenant.id,
            previous_status: 'pending',
            new_status: status,
            metadata: { source: 'sprint4-demo-seed' },
            created_at: createdAt,
          },
        });
      }

      if (providerCode === 'bank_transfer_local' && dayOffset === 0) {
        await prisma.bank_transaction.upsert({
          where: {
            tenant_id_external_id: {
              tenant_id: tenant.id,
              external_id: 'sprint4-demo-bank-deposit',
            },
          },
          create: {
            tenant_id: tenant.id,
            external_id: 'sprint4-demo-bank-deposit',
            reference: demoPayment.merchant_reference!,
            amount: demoPayment.amount,
            bank_name: 'Banco Demo Local',
            received_at: createdAt,
            status: 'reconciled',
            payment_id: demoPayment.id,
            metadata: { source: 'sprint4-demo-seed' },
          },
          update: {
            reference: demoPayment.merchant_reference!,
            amount: demoPayment.amount,
            received_at: createdAt,
            status: 'reconciled',
            payment_id: demoPayment.id,
          },
        });
      }
    }
  }

  const webhook = await prisma.webhook.findFirst({
    where: {
      tenant_id: tenant.id,
      url: 'https://example.test/frogpay-webhook',
    },
  });
  if (!webhook) {
    await prisma.webhook.create({
      data: {
        tenant_id: tenant.id,
        url: 'https://example.test/frogpay-webhook',
        secret_encrypted: 'demo-seed-not-a-real-secret',
        event_types: ['pago.aprobado', 'pago.rechazado'],
        environment: 'production',
      },
    });
  }
  console.log(
    'Demo Sprint 4 listo: owner.demo@frogpay.local (contraseña DEV_DEMO_OWNER_PASSWORD o FrogPayDemo123!).',
  );
}

async function seedDevelopmentPlatformAdmin(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.global_access', 'true', true)`;
    const role = await tx.role.findUniqueOrThrow({
      where: { name: 'platform_admin' },
    });
    const existingAdmin = await tx.app_user.findFirst({
      where: { role_id: role.id },
      select: { id: true },
    });
    const email = process.env.DEV_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.DEV_PLATFORM_ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error(
        'Configura DEV_PLATFORM_ADMIN_EMAIL y DEV_PLATFORM_ADMIN_PASSWORD en apps/api/.env para crear el Platform Admin de desarrollo.',
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('DEV_PLATFORM_ADMIN_EMAIL debe ser un correo válido.');
    }
    if (password.length < 12) {
      throw new Error('DEV_PLATFORM_ADMIN_PASSWORD debe tener al menos 12 caracteres.');
    }

    const duplicateEmail = await tx.app_user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicateEmail && duplicateEmail.id !== existingAdmin?.id) {
      throw new Error('DEV_PLATFORM_ADMIN_EMAIL ya pertenece a otro usuario.');
    }
    const passwordHash = await hashPassword(password);

    if (existingAdmin) {
      await tx.app_user.update({
        where: { id: existingAdmin.id },
        data: { email, password_hash: passwordHash, status: 'active' },
      });
      console.log('Platform Admin de desarrollo actualizado correctamente.');
      return;
    }

    await tx.app_user.create({
      data: {
        tenant_id: null,
        role_id: role.id,
        email,
        status: 'active',
        password_hash: passwordHash,
      },
    });
    console.log('Platform Admin de desarrollo creado correctamente.');
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

async function main(): Promise<void> {
  try {
    await seed();
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('No se pudo cargar el catálogo inicial:', error);
  process.exitCode = 1;
});
