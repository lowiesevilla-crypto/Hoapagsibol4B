import { processHomeownerPayMongoWebhook } from "@/lib/services/homeowner-paymongo";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await processHomeownerPayMongoWebhook(rawBody, request.headers.get("paymongo-signature"));
  return Response.json(result, { status: "status" in result ? result.status : 200 });
}
