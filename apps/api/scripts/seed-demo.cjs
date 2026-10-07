const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo data cannot be seeded in production');
}

const prisma = new PrismaClient();
const dealerLoginPhone = process.env.DEMO_DEALER_PHONE || '0920000001';
const dealerPhone = dealerLoginPhone.startsWith('0')
  ? `+218${dealerLoginPhone.slice(1)}`
  : dealerLoginPhone;
const dealerPassword = process.env.DEMO_DEALER_PASSWORD || 'DealerDemo2026!';
const now = new Date();
const subscriptionEnd = new Date(now);
subscriptionEnd.setUTCFullYear(subscriptionEnd.getUTCFullYear() + 1);

const dealerPermissions = [
  'auth.login',
  'vehicles.read_public',
  'vehicles.create_own',
  'vehicles.submit_review',
  'dealers.manage_own',
  'subscriptions.manage_own',
  'payments.create',
  'wallet.read_own',
  'ads.buy',
];

const planCapabilities = [
  ['CAN_CREATE_LISTING', 'إضافة وعرض السيارات'],
  ['CAN_CREATE_AUCTION', 'إنشاء مزاد'],
  ['CAN_LIVE_AUCTION', 'إنشاء مزاد مباشر'],
  ['CAN_PARTICIPATE_AUCTIONS', 'المشاركة في المزادات'],
  ['CAN_BUY_CARS', 'شراء السيارات'],
  ['CAN_REQUEST_INSPECTION', 'طلب فحص السيارة'],
  ['CAN_REQUEST_INSPECTION_REPORT', 'طلب تقرير الفحص'],
  ['CAN_RECEIVE_DEPOSIT', 'استقبال العربون'],
  ['CAN_USE_WALLET', 'استخدام المحفظة'],
  ['CAN_ADD_MULTIPLE_CARS', 'إضافة عدة سيارات'],
];

async function ensureDealerRole() {
  const role = await prisma.role.upsert({
    where: { code: 'DEALER_OWNER' },
    update: { name: 'Dealer Owner' },
    create: { code: 'DEALER_OWNER', name: 'Dealer Owner' },
  });
  for (const code of dealerPermissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
  return role;
}

async function ensureLocation() {
  let city = await prisma.city.findFirst({ where: { nameAr: 'بنغازي' }, include: { regions: true } });
  if (!city) {
    city = await prisma.city.create({
      data: {
        nameAr: 'بنغازي',
        nameEn: 'Benghazi',
        regions: { create: [{ nameAr: 'قاريونس', nameEn: 'Garyounis' }] },
      },
      include: { regions: true },
    });
  }
  let region = city.regions.find((item) => item.nameAr === 'قاريونس') || city.regions[0];
  if (!region) {
    region = await prisma.region.create({
      data: { cityId: city.id, nameAr: 'قاريونس', nameEn: 'Garyounis' },
    });
  }
  return { city, region };
}

async function upsertVehicle(dealer, owner, location, data) {
  return prisma.vehicle.upsert({
    where: { lotNumber: data.lotNumber },
    update: {
      ownerUserId: owner.id,
      dealerId: dealer.id,
      make: data.make,
      model: data.model,
      trim: data.trim,
      year: data.year,
      exteriorColor: data.exteriorColor,
      interiorColor: data.interiorColor,
      fuelType: data.fuelType,
      transmission: data.transmission,
      drivetrain: data.drivetrain,
      mileageKm: data.mileageKm,
      engineCapacityCc: data.engineCapacityCc,
      cylinders: data.cylinders,
      bodyType: data.bodyType,
      doors: data.doors,
      seats: data.seats,
      registrationStatus: 'مسجلة في ليبيا',
      ownershipStatus: 'ملكية المعرض',
      cityId: location.city.id,
      regionId: location.region.id,
      address: 'بنغازي، قاريونس',
      saleType: data.saleType,
      condition: data.condition,
      quickSalePrice: data.quickSalePrice,
      approvalStatus: 'Published',
      publishedAt: now,
      deletedAt: null,
    },
    create: {
      lotNumber: data.lotNumber,
      ownerUserId: owner.id,
      dealerId: dealer.id,
      make: data.make,
      model: data.model,
      trim: data.trim,
      year: data.year,
      exteriorColor: data.exteriorColor,
      interiorColor: data.interiorColor,
      fuelType: data.fuelType,
      transmission: data.transmission,
      drivetrain: data.drivetrain,
      mileageKm: data.mileageKm,
      engineCapacityCc: data.engineCapacityCc,
      cylinders: data.cylinders,
      bodyType: data.bodyType,
      doors: data.doors,
      seats: data.seats,
      registrationStatus: 'مسجلة في ليبيا',
      ownershipStatus: 'ملكية المعرض',
      cityId: location.city.id,
      regionId: location.region.id,
      address: 'بنغازي، قاريونس',
      saleType: data.saleType,
      condition: data.condition,
      quickSalePrice: data.quickSalePrice,
      approvalStatus: 'Published',
      publishedAt: now,
    },
  });
}

async function main() {
  for (const [code, name] of planCapabilities) {
    await prisma.planCapability.upsert({ where: { code }, update: { name }, create: { code, name } });
  }
  const [role, location, passwordHash] = await Promise.all([
    ensureDealerRole(),
    ensureLocation(),
    argon2.hash(dealerPassword, { type: argon2.argon2id }),
  ]);

  const existingOwner = await prisma.user.findFirst({
    where: { phone: { in: [dealerPhone, dealerLoginPhone] } },
  });
  const owner = existingOwner
    ? await prisma.user.update({
    where: { id: existingOwner.id },
    data: {
      phone: dealerPhone,
      fullName: 'محمد السنوسي',
      passwordHash,
      status: 'Active',
      phoneVerifiedAt: now,
      deletedAt: null,
    },
  })
    : await prisma.user.create({
    data: {
      phone: dealerPhone,
      fullName: 'محمد السنوسي',
      passwordHash,
      status: 'Active',
      phoneVerifiedAt: now,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: owner.id, roleId: role.id } },
    update: {},
    create: { userId: owner.id, roleId: role.id },
  });

  const existingDealer = await prisma.dealer.findUnique({ where: { ownerUserId: owner.id } });
  const dealer = existingDealer
    ? await prisma.dealer.update({
        where: { id: existingDealer.id },
        data: {
          name: 'معرض قاريونس للسيارات',
          phone: dealerPhone,
          cityId: location.city.id,
          regionId: location.region.id,
          address: 'بنغازي، قاريونس، الطريق الدائري',
          licenseNumber: 'DEMO-BEN-2026-001',
          status: 'Verified',
          verifiedAt: existingDealer.verifiedAt || now,
          deletedAt: null,
        },
      })
    : await prisma.dealer.create({
        data: {
          ownerUserId: owner.id,
          name: 'معرض قاريونس للسيارات',
          slug: 'garyounis-demo-motors',
          phone: dealerPhone,
          cityId: location.city.id,
          regionId: location.region.id,
          address: 'بنغازي، قاريونس، الطريق الدائري',
          licenseNumber: 'DEMO-BEN-2026-001',
          status: 'Verified',
          verifiedAt: now,
        },
      });

  const plan = await prisma.dealerPlan.upsert({
    where: { code: 'demo-professional' },
    update: {
      name: 'Professional تجريبي',
      price: 150_000n,
      currency: 'LYD',
      durationDays: 365,
      vehicleLimit: 50,
      auctionLimit: 20,
      staffLimit: 5,
      searchBoostEnabled: true,
      adsIncluded: true,
      billingModel: 'Subscription',
      features: {
        description: 'باقة معرض احترافية تشمل إدارة السيارات والمزادات والمحفظة.',
        audience: 'Dealer',
        auctionVehicleLimit: 10,
        permissions: [
          'CAN_CREATE_LISTING',
          'CAN_CREATE_AUCTION',
          'CAN_LIVE_AUCTION',
          'CAN_RECEIVE_DEPOSIT',
          'CAN_USE_WALLET',
          'CAN_ADD_MULTIPLE_CARS',
        ],
        verifiedBadge: true,
        reports: true,
        demo: true,
      },
      isActive: true,
    },
    create: {
      code: 'demo-professional',
      name: 'Professional تجريبي',
      price: 150_000n,
      currency: 'LYD',
      durationDays: 365,
      vehicleLimit: 50,
      auctionLimit: 20,
      staffLimit: 5,
      searchBoostEnabled: true,
      adsIncluded: true,
      billingModel: 'Subscription',
      features: {
        description: 'باقة معرض احترافية تشمل إدارة السيارات والمزادات والمحفظة.',
        audience: 'Dealer',
        auctionVehicleLimit: 10,
        permissions: [
          'CAN_CREATE_LISTING',
          'CAN_CREATE_AUCTION',
          'CAN_LIVE_AUCTION',
          'CAN_RECEIVE_DEPOSIT',
          'CAN_USE_WALLET',
          'CAN_ADD_MULTIPLE_CARS',
        ],
        verifiedBadge: true,
        reports: true,
        demo: true,
      },
      isActive: true,
    },
  });

  const activeSubscription = await prisma.dealerSubscription.findFirst({
    where: { dealerId: dealer.id, planId: plan.id, status: 'Active' },
    orderBy: { createdAt: 'desc' },
  });
  if (activeSubscription) {
    await prisma.dealerSubscription.update({
      where: { id: activeSubscription.id },
      data: { startsAt: now, endsAt: subscriptionEnd, activatedAt: activeSubscription.activatedAt || now },
    });
  } else {
    await prisma.dealerSubscription.create({
      data: {
        dealerId: dealer.id,
        planId: plan.id,
        status: 'Active',
        startsAt: now,
        endsAt: subscriptionEnd,
        activatedAt: now,
        metadata: { source: 'development_seed', paid: true },
      },
    });
  }

  const vehicles = await Promise.all([
    upsertVehicle(dealer, owner, location, {
      lotNumber: 'DEMO-BEN-0001',
      make: 'Toyota',
      model: 'Land Cruiser',
      trim: 'GXR',
      year: 2021,
      exteriorColor: 'أبيض لؤلؤي',
      interiorColor: 'بيج',
      fuelType: 'بنزين',
      transmission: 'أوتوماتيك',
      drivetrain: 'دفع رباعي',
      mileageKm: 68500,
      engineCapacityCc: 4000,
      cylinders: 6,
      bodyType: 'SUV',
      doors: 5,
      seats: 7,
      saleType: 'QuickSale',
      condition: 'Excellent',
      quickSalePrice: 185_000_000n,
    }),
    upsertVehicle(dealer, owner, location, {
      lotNumber: 'DEMO-BEN-0002',
      make: 'Hyundai',
      model: 'Tucson',
      trim: 'Premium',
      year: 2022,
      exteriorColor: 'رمادي',
      interiorColor: 'أسود',
      fuelType: 'بنزين',
      transmission: 'أوتوماتيك',
      drivetrain: 'دفع أمامي',
      mileageKm: 41200,
      engineCapacityCc: 2000,
      cylinders: 4,
      bodyType: 'Crossover',
      doors: 5,
      seats: 5,
      saleType: 'FixedPrice',
      condition: 'Used',
      quickSalePrice: 92_500_000n,
    }),
  ]);

  console.log(JSON.stringify({
    dealer: { id: dealer.id, name: dealer.name, phone: dealerLoginPhone, password: dealerPassword },
    subscription: { plan: plan.name, status: 'Active', endsAt: subscriptionEnd.toISOString() },
    vehicles: vehicles.map((vehicle) => ({ id: vehicle.id, lotNumber: vehicle.lotNumber, make: vehicle.make, model: vehicle.model })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
