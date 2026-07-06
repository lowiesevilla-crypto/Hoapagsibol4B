# HOAHub Database Architecture (v1.1)

## Existing Core Tables

- Tenant
- User
- Homeowner
- Employee
- Attendance
- Payroll
- Billing
- Payment
- Collection
- Announcement
- Event
- Document
- Vehicle
- Contractor

---

# New Platform Tables

## SubscriptionPlan

Purpose:
Defines available commercial plans.

Fields:

- id
- name
- description
- billingCycle
- setupFee
- monthlyFee
- annualFee
- maxUsers
- maxHomeowners
- maxStorageGB
- enabledModules
- active
- createdAt
- updatedAt

---

## TenantSubscription

Purpose:
Current subscription assigned to a tenant.

Fields:

- id
- tenantId
- subscriptionPlanId
- status
- startDate
- endDate
- nextRenewal
- gracePeriodEnd
- trialStart
- trialEnd
- paymentStatus
- autoSuspend
- notes
- createdAt
- updatedAt

---

## SubscriptionInvoice

Purpose:
Invoices issued to tenants.

Fields:

- id
- tenantSubscriptionId
- invoiceNumber
- invoiceDate
- dueDate
- amount
- status
- remarks
- createdAt

---

## SubscriptionPayment

Purpose:
Payments received from tenants.

Fields:

- id
- invoiceId
- paymentDate
- amount
- paymentMethod
- referenceNumber
- receivedBy
- remarks
- createdAt

---

## PlatformAuditLog

Purpose:
Tracks platform-wide administrative activity.

Fields:

- id
- userId
- tenantId
- action
- entity
- entityId
- oldValue
- newValue
- ipAddress
- userAgent
- createdAt

---

# Relationships

Tenant

↓

TenantSubscription

↓

SubscriptionPlan

↓

SubscriptionInvoice

↓

SubscriptionPayment

PlatformAuditLog
references:
- User
- Tenant

---

# Future Tables (Version 2.0)

- FeatureFlag
- Notification
- EmailQueue
- AIConversation
- AIKnowledgeBase
- PlatformMetric
- BackupHistory
- RestoreHistory