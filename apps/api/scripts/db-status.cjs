const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const [roles, permissions, rolePermissionLinks] = await Promise.all([
    prisma.role.count(),
    prisma.permission.count(),
    prisma.rolePermission.count(),
  ]);

  console.log(
    JSON.stringify({ connected: true, roles, permissions, rolePermissionLinks }, null, 2),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
