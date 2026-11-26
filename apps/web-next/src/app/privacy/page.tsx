import { LegalShell } from '@/shared/components/legal-shell'
import type { LegalSection } from '@/shared/components/legal-shell'
import { Alert } from '@/shared/components/ui/alert'

export const dynamic = 'force-static'

export const metadata = {
  title: 'Privacy Policy - MuseCanvas',
  description: 'MuseCanvas privacy policy and data protection notice',
}

const privacySections: LegalSection[] = [
  { id: 'notice', title: 'Scope & Regional Restrictions' },
  { id: 'section-1', title: '1. Information We Collect' },
  { id: 'section-2', title: '2. How We Use Information' },
  { id: 'section-3', title: '3. Third-Party Sharing & Data Training' },
  { id: 'section-4', title: '4. Data Storage & Security' },
  { id: 'section-5', title: '5. Data Retention' },
  { id: 'section-6', title: '6. Your Rights' },
  { id: 'section-7', title: '7. Cookies & Similar Technologies' },
  { id: 'section-8', title: '8. Minors' },
  { id: 'section-9', title: '9. Changes to This Policy' },
  { id: 'section-10', title: '10. Contact Us' },
]

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updatedAt="2026-06-25" current="privacy" sections={privacySections}>
      <div id="notice" className="scroll-mt-20">
        <Alert tone="warning">
          <h2>Scope &amp; Regional Restrictions</h2>
          <p>
            <strong>This service is not available to users in mainland China.</strong> We do not provide this service to users located in mainland China, nor do we accept registrations, access, or use from mainland China.
          </p>
          <p>
            If you are located in mainland China, please do not access or use this service, or provide us with any personal information. The other provisions of this policy are premised on the scope set out in this section and do not apply to users who fall outside the intended audience of the Service.
          </p>
        </Alert>
      </div>

      <section id="section-1" className="scroll-mt-20">
        <h2>1. Information We Collect</h2>
        <p>To provide and improve the Service, we may collect the following information:</p>
        <ul>
          <li>Account information: email address, invitation code, and third-party login authorization information;</li>
          <li>Usage data: the prompts and generation parameters you enter, the images generated, and task records;</li>
          <li>Log information: IP address, access times, device and browser information, and other technical logs.</li>
        </ul>
      </section>

      <section id="section-2" className="scroll-mt-20">
        <h2>2. How We Use Information</h2>
        <p>We use the above information to:</p>
        <ul>
          <li>provide image generation, account management, and task record features;</li>
          <li>protect account and system security, troubleshoot issues, and prevent abuse;</li>
          <li>analyze and improve the Service&apos;s features and performance.</li>
        </ul>
      </section>

      <section id="section-3" className="scroll-mt-20">
        <h2>3. Third-Party Sharing &amp; Data Training</h2>
        <p>
          The image generation capabilities of the Service are provided by third-party model and service providers we work with, <strong>including but not limited to OpenAI, Volcano Engine, and others</strong>. To fulfil your generation request, we share your prompts and related data with the above third parties for processing.
        </p>
        <p>
          <strong>The above third parties may use the data they receive for their own service operations and model training.</strong> The collection, use, and protection of data by those third parties is governed by the relevant third party&apos;s privacy policy, and we cannot fully control how they process it.
        </p>
        <p>You understand and agree to the sharing and processing arrangement described above. If you do not accept it, please do not use the relevant features. For more information, please refer to each third party&apos;s privacy policy.</p>
      </section>

      <section id="section-4" className="scroll-mt-20">
        <h2>4. Data Storage &amp; Security</h2>
        <p>
          We take reasonable technical and administrative measures to protect the security of your information. However, transmission over the internet is not absolutely secure, and we cannot guarantee that information will not be accessed, disclosed, or altered without authorization. You should take care to protect your account credentials while using the Service.
        </p>
      </section>

      <section id="section-5" className="scroll-mt-20">
        <h2>5. Data Retention</h2>
        <p>
          We retain your information only for as long as necessary to achieve the purposes stated in this policy, after which it will be deleted or anonymized, except where otherwise required by law.
        </p>
      </section>

      <section id="section-6" className="scroll-mt-20">
        <h2>6. Your Rights</h2>
        <p>
          To the extent permitted by applicable law, you may exercise rights such as access, correction, and deletion with respect to your personal information. If you wish to exercise these rights or have any questions, please contact us through the official channels published by the Service.
        </p>
      </section>

      <section id="section-7" className="scroll-mt-20">
        <h2>7. Cookies &amp; Similar Technologies</h2>
        <p>
          We may use cookies and similar technologies to maintain your login state, remember your preferences, and improve your experience. You can manage cookies through your browser settings, although some features may be affected.
        </p>
      </section>

      <section id="section-8" className="scroll-mt-20">
        <h2>8. Minors</h2>
        <p>
          This service is intended for adults. If you are a minor, please read this policy with a guardian and use the Service only after obtaining their consent. We do not knowingly collect personal information from minors.
        </p>
      </section>

      <section id="section-9" className="scroll-mt-20">
        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Updates take effect once published on this page with the updated date noted. For material changes, we will notify you in an appropriate manner.
        </p>
      </section>

      <section id="section-10" className="scroll-mt-20">
        <h2>10. Contact Us</h2>
        <p>If you have any questions about this policy or about how personal information is handled, please contact us through the official channels published by the Service.</p>
      </section>
    </LegalShell>
  )
}
