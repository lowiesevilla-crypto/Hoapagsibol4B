import {
  PayMongoHomeownerFormClient,
  type PayMongoDocumentFeePayment,
  type PayMongoOpenBill,
} from "@/components/paymongo-homeowner-form-client";
import { PayMongoPaymentStatusSync } from "@/components/paymongo-payment-status-sync";
import { requireHomeownerProfile } from "@/lib/portal";
import { getHomeownerPaymentConfig } from "@/lib/services/homeowner-payment-config";

export async function PayMongoHomeownerForm({
  openBills,
  documentPayment,
}: {
  openBills: PayMongoOpenBill[];
  documentPayment?: PayMongoDocumentFeePayment | null;
}) {
  const profile = await requireHomeownerProfile();
  const config = await getHomeownerPaymentConfig(profile.tenantId);
  return <div className="space-y-4">
    <PayMongoPaymentStatusSync />
    <PayMongoHomeownerFormClient
      openBills={openBills}
      documentPayment={documentPayment}
      platformFeeAmountPesos={config.platformFeeEnabled ? config.platformFeeAmountPesos : 0}
    />
  </div>;
}
