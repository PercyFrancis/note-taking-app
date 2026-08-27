import { getPdfLimits } from "@/lib/pdf";

export async function GET() {
  return Response.json(getPdfLimits());
}
