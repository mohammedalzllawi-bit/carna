const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const argon2 = require('argon2');
const { TechniciansService } = require('../dist/modules/technicians/technicians.service');

function technicianFixture(overrides = {}) {
  return {
    id: 'technician-1',
    userId: 'user-1',
    name: 'فني كهرباء سيارات',
    phone: '+218912345678',
    photoUrl: null,
    specialty: 'كهربائي سيارات',
    yearsExperience: 8,
    cityId: 'city-1',
    serviceRegions: ['بنغازي'],
    basePrice: 120500n,
    availabilityStatus: 'available',
    approvalStatus: 'PendingReview',
    ratingAverage: 0,
    ratingCount: 0,
    completedInspections: 0,
    city: { id: 'city-1', nameAr: 'بنغازي' },
    user: { id: 'user-1', phone: '+218912345678', status: 'PendingVerification' },
    services: [
      {
        id: 'service-1',
        name: 'فحص كهرباء شامل',
        price: 75500n,
        durationMinutes: 60,
      },
    ],
    ...overrides,
  };
}

describe('TechniciansService', () => {
  it('creates a technician account with an Argon2 password and exact LYD storage', async () => {
    let userData;
    let technicianData;
    const prisma = {
      city: { findFirst: async () => ({ id: 'city-1' }) },
      user: { findUnique: async () => null },
      role: { findUnique: async () => ({ id: 'technician-role' }) },
      $transaction: async (callback) =>
        callback({
          user: {
            create: async ({ data }) => {
              userData = data;
              return { id: 'user-1' };
            },
          },
          technician: {
            create: async ({ data }) => {
              technicianData = data;
              return technicianFixture();
            },
          },
          auditLog: { create: async ({ data }) => data },
        }),
    };
    const service = new TechniciansService(prisma);

    const result = await service.create({
      name: ' فني كهرباء سيارات ',
      phone: '0912345678',
      temporaryPassword: 'StrongPass123',
      specialty: 'كهربائي سيارات',
      yearsExperience: 8,
      cityId: 'city-1',
      serviceRegions: ['بنغازي'],
      basePriceLyd: 120.5,
      services: [{ name: 'فحص كهرباء شامل', priceLyd: 75.5, durationMinutes: 60 }],
    });

    assert.equal(userData.phone, '+218912345678');
    assert.equal(await argon2.verify(userData.passwordHash, 'StrongPass123'), true);
    assert.deepEqual(userData.roles, { create: { roleId: 'technician-role' } });
    assert.equal(technicianData.basePrice, 120500n);
    assert.equal(technicianData.services.create[0].price, 75500n);
    assert.equal(result.basePriceLyd, 120.5);
    assert.equal(result.phone, '+218912345678');
  });

  it('does not expose the technician phone on the public list', async () => {
    const prisma = {
      technician: { findMany: async () => [technicianFixture({ approvalStatus: 'Published' })] },
    };
    const service = new TechniciansService(prisma);

    const [result] = await service.listPublic({});

    assert.equal(result.name, 'فني كهرباء سيارات');
    assert.equal(Object.hasOwn(result, 'phone'), false);
    assert.equal(result.services[0].priceLyd, 75.5);
  });

  it('requires a completed inspection before a customer can review a technician', async () => {
    const prisma = {
      technician: { findUnique: async () => ({ id: 'technician-1', userId: 'technician-user', approvalStatus: 'Published' }) },
      inspectionRequest: { findFirst: async () => null },
    };
    const service = new TechniciansService(prisma);

    await assert.rejects(
      service.review('technician-1', 'customer-1', { rating: 5, comment: 'خدمة ممتازة' }),
      /review\.completed_inspection_required/,
    );
  });

  it('stores a verified technician review and recalculates the visible rating', async () => {
    let reviewData;
    let technicianUpdate;
    const prisma = {
      technician: { findUnique: async () => ({ id: 'technician-1', userId: 'technician-user', approvalStatus: 'Published' }) },
      inspectionRequest: { findFirst: async () => ({ id: 'inspection-1', vehicleId: 'vehicle-1' }) },
      $transaction: async (callback) => callback({
        review: {
          findFirst: async () => null,
          create: async ({ data }) => { reviewData = data; return { id: 'review-1', rating: data.rating, comment: data.comment, createdAt: new Date() }; },
          aggregate: async () => ({ _avg: { rating: 4 }, _count: { rating: 1 } }),
        },
        technician: { update: async (input) => { technicianUpdate = input; return input; } },
        auditLog: { create: async ({ data }) => data },
      }),
    };
    const service = new TechniciansService(prisma);

    const result = await service.review('technician-1', 'customer-1', { rating: 4, comment: ' فحص واضح ' });

    assert.equal(reviewData.reviewerId, 'customer-1');
    assert.equal(reviewData.vehicleId, 'vehicle-1');
    assert.equal(reviewData.comment, 'فحص واضح');
    assert.deepEqual(technicianUpdate.data, { ratingAverage: 4, ratingCount: 1 });
    assert.equal(result.rating, 4);
  });
});
