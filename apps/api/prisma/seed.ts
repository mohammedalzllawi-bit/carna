import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const roles = [
  ['SUPER_ADMIN', 'Super Admin'],
  ['ADMIN', 'Admin'],
  ['SUPPORT_AGENT', 'Support Agent'],
  ['AUCTION_MANAGER', 'Auction Manager'],
  ['FINANCE_MANAGER', 'Finance Manager'],
  ['CONTENT_MANAGER', 'Content Manager'],
  ['DEALER_OWNER', 'Dealer Owner'],
  ['DEALER_STAFF', 'Dealer Staff'],
  ['TECHNICIAN', 'Technician'],
  ['CUSTOMER', 'Customer'],
  ['SUSPENDED', 'Suspended'],
] as const;

const permissions = [
  'admin.access',
  'permissions.manage',
  'technicians.manage',
  'notifications.manage',
  'auth.login',
  'users.manage',
  'users.verify',
  'users.suspend',
  'vehicles.read_public',
  'vehicles.create_own',
  'vehicles.submit_review',
  'vehicles.approve',
  'vehicles.archive',
  'auctions.bid',
  'auctions.manage',
  'auctions.pause_resume',
  'dealers.create',
  'dealers.approve',
  'dealers.manage_own',
  'subscriptions.manage_own',
  'payments.create',
  'payments.read',
  'payments.refund',
  'wallet.read_own',
  'inspections.request',
  'inspections.perform',
  'inspections.manage',
  'disputes.create',
  'disputes.decide',
  'support.manage',
  'ads.buy',
  'ads.manage',
  'reviews.manage',
  'content.manage',
  'settings.manage',
  'reports.read',
  'audit.read',
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
] as const;

const rolePermissions: Record<string, string[]> = {
  SUPER_ADMIN: permissions,
  ADMIN: permissions.filter((permission) => permission !== 'settings.manage').concat('settings.manage'),
  SUPPORT_AGENT: [
    'admin.access',
    'auth.login',
    'vehicles.read_public',
    'users.verify',
    'support.manage',
    'disputes.create',
    'audit.read',
  ],
  AUCTION_MANAGER: [
    'admin.access',
    'auth.login',
    'vehicles.read_public',
    'vehicles.approve',
    'auctions.manage',
    'auctions.pause_resume',
    'audit.read',
  ],
  FINANCE_MANAGER: ['admin.access', 'auth.login', 'payments.read', 'payments.refund', 'reports.read', 'audit.read'],
  CONTENT_MANAGER: ['admin.access', 'auth.login', 'content.manage', 'ads.manage', 'reviews.manage'],
  DEALER_OWNER: [
    'auth.login',
    'vehicles.read_public',
    'vehicles.create_own',
    'vehicles.submit_review',
    'dealers.manage_own',
    'subscriptions.manage_own',
    'payments.create',
    'wallet.read_own',
    'ads.buy',
  ],
  DEALER_STAFF: [
    'auth.login',
    'vehicles.read_public',
    'vehicles.create_own',
    'vehicles.submit_review',
    'payments.create',
  ],
  TECHNICIAN: [
    'auth.login',
    'vehicles.read_public',
    'inspections.perform',
    'wallet.read_own',
  ],
  CUSTOMER: [
    'auth.login',
    'vehicles.read_public',
    'vehicles.create_own',
    'vehicles.submit_review',
    'auctions.bid',
    'payments.create',
    'wallet.read_own',
    'inspections.request',
    'disputes.create',
  ],
  SUSPENDED: ['auth.login', 'vehicles.read_public'],
};

async function main() {
  for (const [code, name] of planCapabilities) {
    await prisma.planCapability.upsert({ where: { code }, update: { name }, create: { code, name } });
  }
  await prisma.fee.upsert({
    where: { code: 'auction.listing' },
    update: {},
    create: {
      code: 'auction.listing',
      name: 'رسوم إدخال سيارة للمزاد',
      amount: 50_000n,
      currency: 'LYD',
      isActive: true,
      rules: { calculation: 'Fixed', minimumMilli: null, maximumMilli: null, planIds: [], userIds: [], dealerIds: [] },
    },
  });
  const benghazi = await prisma.city.findFirst({ where: { nameAr: 'بنغازي' } });
  if (!benghazi) {
    await prisma.city.create({
      data: {
        nameAr: 'بنغازي',
        nameEn: 'Benghazi',
        regions: {
          create: [
            { nameAr: 'وسط البلاد', nameEn: 'Al-Bilad' },
            { nameAr: 'البركة', nameEn: 'Al-Berka' },
            { nameAr: 'الليثي', nameEn: 'Al-Laithi' },
            { nameAr: 'قاريونس', nameEn: 'Garyounis' },
          ],
        },
      },
    });
  }

  for (const [code, name] of roles) {
    await prisma.role.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
  }

  for (const code of permissions) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code },
    });
  }

  for (const [roleCode, permissionCodes] of Object.entries(rolePermissions)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    for (const permissionCode of permissionCodes) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code: permissionCode } });
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
