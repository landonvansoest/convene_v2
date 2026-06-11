import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getPublishedFaqs } from "@/lib/faqs/get-published-faqs";

export async function AboutFaqsSection() {
  const faqs = await getPublishedFaqs();

  return (
    <div className="bg-white py-8">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mb-8 text-left">
          <h2 className="text-4xl font-bold text-[#003049]">FAQs</h2>
        </div>

        {faqs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            FAQs are being updated. Please check back soon or contact us with your question.
          </p>
        ) : (
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq) => (
              <AccordionItem
                key={faq.faq_id}
                value={faq.faq_id}
                className="overflow-hidden rounded-lg border border-[#003049]/20"
              >
                <AccordionTrigger className="bg-[#003049] px-6 text-left font-semibold text-white hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="bg-white px-6 pb-5 pt-4 text-[#003049] whitespace-pre-wrap">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}
