// MongoDB distinguishes an absent optional field from an explicit null.
export const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
export const notRevoked = { OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }] };
export const notRead = { OR: [{ readAt: null }, { readAt: { isSet: false } }] };
