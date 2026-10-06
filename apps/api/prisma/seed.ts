import { Prisma, PrismaClient } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
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
}

async function seedDevelopmentPlatformAdmin(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.global_access', 'true', true)`;
    const role = await tx.role.findUniqueOrThrow({ where: { name: 'platform_admin' } });
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
    if (duplicateEmail) {
      throw new Error('DEV_PLATFORM_ADMIN_EMAIL ya pertenece a otro usuario.');
    }

    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    const passwordHash = `scrypt$${salt}$${derivedKey.toString('hex')}`;

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
