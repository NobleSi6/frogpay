import { Prisma, PrismaClient } from '@prisma/client';

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