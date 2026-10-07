# Admin profiles, wallet controls, and verified reviews

## Admin detail routes

- `GET /v1/admin/users/:id` returns account activity, orders, payments, bids, wins, inspections, disputes, and linked dealer or technician profile.
- `GET /v1/admin/dealers/:id` returns the owner, subscriptions, staff, inventory, auction sales, payments, and reviews.
- `GET /v1/admin/technicians/:id` returns the technician account, services, inspections, completed-service value, and reviews.
- `GET /v1/admin/wallet/users/:userId` returns balances, recharge count and value, total debits, admin adjustments, and the latest immutable ledger entries.

## Wallet adjustments

`POST /v1/admin/wallet/users/:userId/adjustments` accepts a positive LYD amount, `Credit` or `Debit`, a mandatory reason, and a UUID idempotency key.

The endpoint never edits a balance or an existing ledger entry. It posts an `AdminAdjustment` entry transactionally, updates the versioned wallet account, records before/after balances in `AuditLog`, and notifies the user. Debit adjustments fail when the balance is insufficient. The authenticated administrator needs `payments.read` and `payments.refund`.

## Verified reviews

- Dealer reviews remain available only after the reviewer has a completed `Sold` auction purchase from that dealer.
- Technician reviews are available only after the reviewer has a `Completed` inspection assigned to that technician.
- A reviewer can update their existing review, but cannot create unlimited reviews for the same provider.
- Hiding a review preserves the record and moderation reason, recalculates the public rating, and writes an audit event.

Public technician detail and review routes:

- `GET /v1/technicians/:id`
- `POST /v1/technicians/:id/reviews`

The Flutter application exposes verified dealer and technician directories, detail pages, existing reviews, and the same verified review actions. Guest sessions remain read-only.
