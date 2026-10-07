const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { CatalogService } = require('../dist/modules/catalog/catalog.service');
const { ListingChatService } = require('../dist/modules/listing-chat/listing-chat.service');

describe('direct listings', () => {
  it('creates a categorized draft owned by the authenticated user', async () => {
    let createData;
    const prisma = {
      city: { findFirst: async () => ({ id: 'city-1' }) },
      vehicle: {
        findUnique: async () => null,
        create: async ({ data }) => {
          createData = data;
          return { id: 'vehicle-1', ...data, quickSalePrice: data.quickSalePrice,
            city: { id: 'city-1', nameAr: 'بنغازي' }, region: null, dealer: null,
            images: [], auctions: [], createdAt: new Date(), publishedAt: null, viewCount: 0 };
        },
      },
      auditLog: { create: async () => ({}) },
    };
    const result = await new CatalogService(prisma).createOwnListing('user-1', {
      category: 'Truck', make: 'MAN', model: 'TGS', year: 2020,
      cityId: 'city-1', saleType: 'FixedPrice', condition: 'Used', priceLyd: 120000,
    });
    assert.equal(createData.ownerUserId, 'user-1');
    assert.equal(createData.category, 'Truck');
    assert.equal(createData.approvalStatus, 'Draft');
    assert.equal(result.priceLyd, 120000);
  });

  it('requires an image and moves only the owner draft to review', async () => {
    let imageCount = 0;
    let changed = 0;
    const tx = {
      vehicle: {
        findFirst: async ({ where }) => {
          assert.equal(where.ownerUserId, 'owner-1');
          return { id: 'vehicle-1', approvalStatus: 'Draft', images: Array(imageCount).fill({}) };
        },
        updateMany: async ({ data }) => { assert.equal(data.approvalStatus, 'PendingReview'); changed++; return { count: 1 }; },
      },
      auditLog: { create: async () => ({}) },
    };
    const service = new CatalogService({ $transaction: async (callback) => callback(tx) });
    await assert.rejects(service.submitOwnListing('owner-1', 'vehicle-1'), /listing.image_required/);
    assert.equal(changed, 0);
    imageCount = 1;
    const result = await service.submitOwnListing('owner-1', 'vehicle-1');
    assert.equal(result.status, 'PendingReview');
    assert.equal(changed, 1);
  });

  it('passes category, name/model and date filters to the public query', async () => {
    let options;
    const service = new CatalogService({ vehicle: { findMany: async (query) => { options = query; return []; } } });
    await service.listPublicVehicles({ category: 'Motorcycle', q: 'هوندا', model: 'CBR', sort: 'oldest', dateFrom: '2026-10-01T00:00:00.000Z' });
    assert.equal(options.where.category, 'Motorcycle');
    assert.equal(options.where.model.contains, 'CBR');
    assert.equal(options.where.AND[0].OR[0].make.contains, 'هوندا');
    assert.deepEqual(options.orderBy, { publishedAt: 'asc' });
    assert.equal(options.where.publishedAt.gte.toISOString(), '2026-10-01T00:00:00.000Z');
  });
});

describe('listing chat', () => {
  it('does not allow a seller to start a conversation with themselves', async () => {
    const service = new ListingChatService({ vehicle: { findFirst: async () => ({ ownerUserId: 'owner-1', dealer: null }) } });
    await assert.rejects(service.start('owner-1', 'vehicle-1'), { status: 403 });
  });

  it('hides a conversation from users who are not participants', async () => {
    const service = new ListingChatService({ listingConversation: { findUnique: async () => ({ buyerId: 'buyer-1', sellerId: 'seller-1' }) } });
    await assert.rejects(service.detail('other-1', 'chat-1'), { status: 404 });
  });
});
