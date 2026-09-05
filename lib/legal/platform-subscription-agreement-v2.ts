import {
  HOA_HUB_AGREEMENT_BODY as HOA_HUB_AGREEMENT_BODY_V1,
  HOA_HUB_AGREEMENT_TEMPLATE_CODE as HOA_HUB_AGREEMENT_TEMPLATE_CODE_V1,
  HOA_HUB_AGREEMENT_TITLE as HOA_HUB_AGREEMENT_TITLE_V1,
} from "@/lib/legal/platform-subscription-agreement-v1";

export const HOA_HUB_AGREEMENT_TEMPLATE_CODE = HOA_HUB_AGREEMENT_TEMPLATE_CODE_V1;
export const HOA_HUB_AGREEMENT_VERSION = 2;
export const HOA_HUB_AGREEMENT_VERSION_LABEL = "1.1";
export const HOA_HUB_AGREEMENT_TITLE = HOA_HUB_AGREEMENT_TITLE_V1;

const COMMERCIAL_ORDER_V1 = `Subscription Start: {{SUBSCRIPTION_START}}
Initial Term: {{INITIAL_TERM_MONTHS}} months
Initial Term End: {{TERM_END_DATE}}`;

const COMMERCIAL_ORDER_V11 = `Subscription Start: {{SUBSCRIPTION_START}}
Initial Term: {{INITIAL_TERM_MONTHS}} months
Initial Term End: {{TERM_END_DATE}}
Free Trial Days: {{FREE_TRIAL_DAYS}} calendar day(s)
Free Trial Through: {{FREE_TRIAL_END_DATE}}
COMMERCIAL ORDER — ONE-TIME FEE
One-Time Setup Fee: {{ONE_TIME_SETUP_FEE}}
One-Time Setup Fee Billing: Charged once for the initial subscription unless expressly waived or replaced by a mutually agreed written/electronically executed commercial term.
HOAHub Convenience Fee: {{CONVENIENCE_FEE_PER_TRANSACTION}} per successfully processed transaction`;

const SECTION_FOUR = "4. TERM, RENEWAL, AND PLAN CHANGES";
const COMMERCIAL_TERMS = `HOAHUB AGREEMENT-SPECIFIC COMMERCIAL TERMS
3.5 HOAHub Convenience Fee. Unless the Commercial Order or a separate mutually accepted written/electronic commercial agreement states a different rate, the standard HOAHub convenience fee is PHP 2.00 (₱2.00) per successfully processed transaction. A tenant-specific rate may be increased, reduced, waived, or otherwise changed only by mutual written or electronically executed agreement between HOAHub and Customer. The rate stated in the issued Commercial Order controls for this Agreement. Third-party payment-processor charges, bank charges, and applicable taxes remain separate unless expressly stated as included.

3.6 Free Trial. If the Commercial Order states Free Trial Days greater than zero, recurring Subscription Fees are waived for that stated trial period beginning on the Subscription Start date and ending on the Free Trial Through date. A free trial does not by itself waive a one-time setup fee, HOAHub convenience fee, third-party processor charge, bank charge, or tax unless the Parties expressly agree otherwise in writing or through an electronically executed commercial term.

3.7 One-Time Setup Fee. If a One-Time Setup Fee is stated in the Commercial Order, Customer shall pay that non-recurring onboarding/activation fee once in accordance with the applicable invoice or agreed billing treatment. The fee is taken from the Subscription Plan at agreement issue and may be waived or changed only through an authorized mutually agreed commercial term.`;

const TERM_V1 = "4.1 This Agreement begins on the Effective Date and continues for the Initial Term shown in the Commercial Order, unless earlier terminated in accordance with this Agreement.";
const TERM_V11 = "4.1 This Agreement begins on the Subscription Start date and continues through the Initial Term End date stated in the Commercial Order, unless earlier terminated in accordance with this Agreement. The exact Start Date and End Date stated in the issued Commercial Order control over any generalized month count for that issued Agreement.";

export const HOA_HUB_AGREEMENT_BODY = HOA_HUB_AGREEMENT_BODY_V1
  .replace(COMMERCIAL_ORDER_V1, COMMERCIAL_ORDER_V11)
  .replace(`\n\n${SECTION_FOUR}`, `\n\n${COMMERCIAL_TERMS}\n\n${SECTION_FOUR}`)
  .replace(TERM_V1, TERM_V11);
