const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { CatalogService } = require('../dist/modules/catalog/catalog.service');

describe('CatalogService.createVehicle', () => {
  it('stores LYD precisely, creates a draft, and writes an audit event', async () => {
    let createData;
    let auditData;
    const createdAt = new Date('2026-09-27T12:00:00.000Z');
    const prisma = {
      city: {
        findFirst: async () => ({ id: 'city-benghazi', nameAr: 'بنغازي', isActive: true }),
      },
      vehicle: {
        create: async ({ data }) => {
          createData = data;
          return {
            id: 'vehicle-1',
            ...data,
            regionId: null,
            dealerId: null,
            ownerUserId: null,
            city: { id: 'city-benghazi', nameAr: 'بنغازي' },
            region: null,
            dealer: null,
            images: [],
            auctions: [],
            viewCount: 0,
            createdAt,
            publishedAt: null,
          };
        },
      },
      auditLog: {
        create: async ({ data }) => {
          auditData = data;
          return data;
        },
      },
    };
    const service = new CatalogService(prisma);

    const vehicle = await service.createVehicle({
      lotNumber: 'BNG-2026-100001',
      make: 'تويوتا',
      model: 'كامري',
      year: 2021,
      cityId: 'city-benghazi',
      saleType: 'FixedPrice',
      condition: 'Used',
      priceLyd: 85000.5,
    });

    assert.equal(createData.quickSalePrice, 85000500n);
    assert.equal(createData.approvalStatus, 'Draft');
    assert.equal(vehicle.priceLyd, 85000.5);
    assert.equal(vehicle.city.nameAr, 'بنغازي');
    assert.equal(auditData.action, 'admin.vehicle.created');
    assert.equal(auditData.entityId, 'vehicle-1');
  });
});
