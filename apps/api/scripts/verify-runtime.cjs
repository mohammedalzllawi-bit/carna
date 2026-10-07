const { createRequire } = require('node:module');
const { resolve } = require('node:path');

const requireApi = createRequire(resolve(__dirname, '../package.json'));
const requiredEnums = ['ApprovalStatus', 'VehicleCategory', 'VehicleCondition', 'VehicleSaleType'];

function verifyRuntime(load = requireApi) {
  const client = load('@prisma/client');
  const datamodel = client.Prisma?.dmmf?.datamodel;
  const repair = 'Run npm run api:build and keep the build-stage node_modules in the runtime image.';
  if (typeof client.PrismaClient !== 'function' || !datamodel?.models?.length || !datamodel.enums?.length) {
    throw new Error(`Prisma Client is not generated for the application schema. ${repair}`);
  }
  for (const name of requiredEnums) {
    if (!datamodel.enums.some((entry) => entry.name === name)) {
      throw new Error(`Prisma Client schema is missing ${name}. ${repair}`);
    }
  }
  for (const entry of datamodel.enums) {
    const values = client[entry.name];
    if (!values || entry.values.some((value) => values[value.name] !== value.name)) {
      throw new Error(`Prisma Client runtime enum ${entry.name} is missing or invalid. ${repair}`);
    }
  }
  load('reflect-metadata');
  load('./dist/modules/catalog/dto/catalog.dto.js');
}

if (require.main === module) {
  try {
    verifyRuntime();
    console.log('API runtime verified: generated Prisma enums and compiled catalog DTOs are available.');
  } catch (error) {
    console.error(`API runtime check failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyRuntime };
