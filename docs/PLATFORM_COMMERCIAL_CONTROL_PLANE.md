# HOAHub Platform Commercial Control Plane

## Scope

This implementation establishes the first production-grade commercial layer for `/platform/tenants` without reusing the HOA homeowner finance ledger.

### Added domains

- Subscription plan catalog and module bundles
- Tenant commercial subscriptions and billing profiles
- Platform invoices and line items
- Platform payments and tenant-scoped allocations
- Payment gateway event ledger
- Structured tenant suspension/reinstatement history
- Platform subscription and receivables dashboards
- Tenant-level Subscription & Billing workspace
- Signed public invoice payment page for payment recovery
- PayMongo Hosted Checkout V2 adapter
- PayMongo signed webhook endpoint

## Accounting boundary

`Bill`, `Payment`, `PaymentRequest`, and `PaymentAllocation` continue to represent HOA-to-homeowner finance.

`PlatformInvoice`, `PlatformPayment`, and `PlatformPaymentAllocation` represent HOAHub-to-HOA-tenant SaaS finance.

The two ledgers must never be combined.

## PayMongo configuration

Server-side environment values:

```env
PAYMONGO_SECRET_KEY="sk_test_or_live_..."
PAYMONGO_WEBHOOK_SECRET="whsk_..."
PAYMONGO_CHECKOUT_METHODS="card,gcash,paymaya,qrph"
```

Register this webhook endpoint in PayMongo:

```text
https://hoahub.tech/api/platform/billing/webhooks/paymongo
```

Subscribe to:

```text
checkout_session.payment.paid
```

The browser return URL is informational only. HOAHub updates invoices and subscription status only after a verified PayMongo webhook.

## Production activation

Do not put live PayMongo keys in Git. Add them through the production secret/environment manager after test-mode checkout and webhook verification pass.

## Next commercial increments

- Automated scheduled invoice generation and dunning
- Email invoice delivery and HOAHub-generated payment acknowledgment PDFs
- Tenant administrator authenticated subscription portal in addition to signed invoice links
- AutoPay / PayMongo Subscriptions where commercially enabled
- Plan upgrade/downgrade scheduling and proration
- Credits, discounts, refunds, and AR aging automation
- Revenue analytics (MRR/ARR/churn)
