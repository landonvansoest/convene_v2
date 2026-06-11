import { getPublishedFaqs } from "@/lib/faqs/get-published-faqs";

export const dynamic = "force-dynamic";

/** Public list of published FAQs (About page and any other consumer). */
export async function GET() {
  const faqs = await getPublishedFaqs();
  return Response.json({ faqs });
}
