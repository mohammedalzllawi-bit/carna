const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  legacyDealerCapabilities,
  readDealerPlanFeatures,
} = require('../dist/modules/dealers/dealer-plan-capabilities');
const { DealersService } = require('../dist/modules/dealers/dealers.service');

describe('dealer plan capabilities', () => {
  it('keeps legacy plans usable without granting live-auction creation', () => {
    const features = readDealerPlanFeatures({ reports: true });

    assert.deepEqual(features.permissions, legacyDealerCapabilities);
    assert.equal(features.permissions.includes('CAN_CREATE_LISTING'), true);
    assert.equal(features.permissions.includes('CAN_LIVE_AUCTION'), false);
    assert.equal(features.audience, 'Dealer');
  });

  it('uses only configured, known and unique permission codes', () => {
    const features = readDealerPlanFeatures({
      description: '  Professional plan  ',
      audience: 'Both',
      auctionVehicleLimit: 12,
      permissions: ['CAN_CREATE_AUCTION', 'UNKNOWN', 'CAN_CREATE_AUCTION', 'CAN_USE_WALLET'],
    });

    assert.deepEqual(features.permissions, ['CAN_CREATE_AUCTION', 'CAN_USE_WALLET']);
    assert.equal(features.description, 'Professional plan');
    assert.equal(features.audience, 'Both');
    assert.equal(features.auctionVehicleLimit, 12);
  });
});

describe('dealer capability overrides', () => {
  it('allows a user override to add a capability outside the plan', async () => {
    const prisma = {
      planCapability: { findUnique: async () => ({ code: 'CAN_CREATE_AUCTION', isActive: true }) },
      capabilityOverride: { findMany: async () => [{ subjectType: 'User', effect: 'Allow' }] },
    };
    const service = new DealersService(prisma, {}, {}, {});
    await service.requirePlanCapability('user-1', 'dealer-1', { permissions: [] }, 'CAN_CREATE_AUCTION');
  });

  it('applies the dealer deny override after a user allow override', async () => {
    const prisma = {
      planCapability: { findUnique: async () => ({ code: 'CAN_CREATE_AUCTION', isActive: true }) },
      capabilityOverride: { findMany: async () => [
        { subjectType: 'User', effect: 'Allow' },
        { subjectType: 'Dealer', effect: 'Deny' },
      ] },
    };
    const service = new DealersService(prisma, {}, {}, {});
    await assert.rejects(
      service.requirePlanCapability('user-1', 'dealer-1', { permissions: ['CAN_CREATE_AUCTION'] }, 'CAN_CREATE_AUCTION'),
      /dealer.plan_permission_required/,
    );
  });

  it('does not allow any override to bypass a global capability shutdown', async () => {
    const prisma = {
      planCapability: { findUnique: async () => ({ code: 'CAN_CREATE_AUCTION', isActive: false }) },
      capabilityOverride: { findMany: async () => [{ subjectType: 'Dealer', effect: 'Allow' }] },
    };
    const service = new DealersService(prisma, {}, {}, {});
    await assert.rejects(
      service.requirePlanCapability('user-1', 'dealer-1', { permissions: ['CAN_CREATE_AUCTION'] }, 'CAN_CREATE_AUCTION'),
      /dealer.capability_globally_disabled/,
    );
  });
});
