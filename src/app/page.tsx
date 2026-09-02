import { EnquiryFlow } from "@/components/enquiry/EnquiryFlow";
import { LanguageProvider } from "@/components/enquiry/i18n";

/*
 * Customer entry point — this is the URL the exhibition QR code points at.
 * The admin dashboard will live under /admin (built in a later step).
 */
export default function Home() {
  return (
    <LanguageProvider>
      <EnquiryFlow />
    </LanguageProvider>
  );
}
