# HOAHub Subscription & License Management Design

## Business Model

HOAHub uses a hybrid SaaS model:

- One-time setup fee
- Monthly subscription option
- Annual subscription option
- Trial accounts
- Manual payment tracking for Version 1.1
- Automated payment integration in future versions

## Subscription Plans

### Trial
- Free
- Limited duration
- Limited users
- Limited homeowners
- Used for demos and onboarding

### Standard
- For small HOAs
- Monthly or annual billing
- Configurable limits

### Professional
- For medium HOAs
- Monthly or annual billing
- Higher limits and more modules

### Enterprise
- For large HOAs
- Custom pricing
- Custom limits
- Full module access

## Tenant Subscription Fields

Each tenant subscription should track:

- Plan
- Status
- Billing cycle
- Setup fee
- Monthly fee
- Annual fee
- Trial start date
- Trial end date
- Subscription start date
- Current period start
- Current period end
- Next renewal date
- Grace period end date
- Payment status
- Last payment date
- License key
- Maximum users
- Maximum homeowners
- Storage limit
- Auto suspend enabled
- Notes

## Subscription Statuses

- TRIAL
- ACTIVE
- PAST_DUE
- GRACE_PERIOD
- SUSPENDED
- CANCELLED
- EXPIRED

## Billing Cycles

- MONTHLY
- ANNUAL
- LIFETIME
- MANUAL

## Version 1.1 Scope

Included:
- Subscription fields on tenant record or subscription table
- Platform admin visibility
- Manual subscription editing
- Trial and expiration tracking
- Status display
- Tenant suspension support

Not included yet:
- Automatic payment collection
- Payment gateway integration
- Automated invoice generation
- Full accounting integration

## Future Scope

- Automated billing
- Online payment
- Invoice generation
- Email renewal reminders
- Automatic suspension
- Plan upgrade/downgrade
- Usage limits enforcement