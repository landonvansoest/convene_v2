import { createAdminClient } from "@/lib/supabase/admin";

export type PublishedFaq = {
  faq_id: string;
  question: string;
  answer: string;
  display_order: number;
};

/** Published FAQs for public surfaces (About page accordion), ordered for display. */
export async function getPublishedFaqs(): Promise<PublishedFaq[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("faqs")
    .select("faq_id, question, answer, display_order")
    .eq("is_published", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[faqs] getPublishedFaqs failed:", error.message);
    return [];
  }

  return (data ?? []) as PublishedFaq[];
}
