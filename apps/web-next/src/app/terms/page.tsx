import { LegalShell } from '@/shared/components/legal-shell'
import type { LegalSection } from '@/shared/components/legal-shell'
import { Alert } from '@/shared/components/ui/alert'

export const dynamic = 'force-static'

export const metadata = {
  title: 'Terms of Service - MuseCanvas',
  description: 'MuseCanvas Terms of Service and service terms',
}

const termsSections: LegalSection[] = [
  { id: 'notice', title: 'Scope & Regional Restrictions' },
  { id: 'section-1', title: '1. Service Description' },
  { id: 'section-2', title: '2. Accounts & Registration' },
  { id: 'section-3', title: '3. User Input' },
  { id: 'section-4', title: '4. Third-Party Services & Data Sharing' },
  { id: 'section-5', title: '5. Use of Generated Content' },
  { id: 'section-6', title: '6. User Conduct' },
  { id: 'section-7', title: '7. Intellectual Property' },
  { id: 'section-8', title: '8. Service Changes & Termination' },
  { id: 'section-9', title: '9. Disclaimer' },
  { id: 'section-10', title: '10. Miscellaneous' },
]

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updatedAt="2026-06-25" current="terms" sections={termsSections}>
      <div id="notice" className="scroll-mt-20">
        <Alert tone="warning">
          <h2>Scope &amp; Regional Restrictions</h2>
          <p>
            <strong>This service is not available to users in mainland China.</strong> We do not provide this service to users located in mainland China, nor do we accept registrations, access, or use from mainland China.
          </p>
          <p>
            If you are located in mainland China, please do not register for, log in to, access, or use this service. If your location changes to mainland China while you are using the service, or if we reasonably determine that you are a mainland China user, we may refuse to provide the service, restrict access, or terminate your account.
          </p>
        </Alert>
      </div>

      <section id="section-1" className="scroll-mt-20">
        <h2>1. Service Description</h2>
        <p>
          MuseCanvas (hereinafter referred to as “the Service”) is an AI-powered image generation platform. Through the Service, you may submit prompts, parameters, and other content to invoke the models and supporting capabilities we have connected, in order to generate images and related output.
        </p>
        <p>
          The Service may include account registration and login, image generation, result display, history records, account settings, and other features we launch from time to time. The availability, scope, processing time, output quality, and pricing of each feature are as stated on the relevant pages at the time and as actually provided.
        </p>
        <p>
          By registering, logging in, accessing, or using the Service, you confirm that you have read, understood, and agree to be bound by these Terms, as well as the page rules, announcements, and policy documents related to the Service.
        </p>
      </section>

      <section id="section-2" className="scroll-mt-20">
        <h2>2. Accounts &amp; Registration</h2>
        <p>
          The Service may operate under either open registration or invitation-only registration, as stated on the registration page and in the system&apos;s current configuration. Under open registration, new users may complete registration directly by following the on-page flow. Under invitation-only registration, new users must, in addition to completing the registration flow, provide a valid invitation code; an invitation code may be subject to limits on the number of uses, an expiry period, or single-use restrictions.
        </p>
        <p>You may register or log in through the following methods:</p>
        <ul>
          <li>Email: submit a valid email address, complete the verification-code check, and follow the on-page instructions to complete registration or login;</li>
          <li>OAuth: log in with a third-party account we support at the time, and authorize us to obtain the information necessary to identify you.</li>
        </ul>
        <p>
          If you use the Service for the first time via OAuth while the system is in invitation-only registration mode, you must still provide a valid invitation code as prompted on the page before your account can be created. Whichever method you use, you must ensure that the information you provide is true, accurate, complete, and kept up to date.
        </p>
        <p>
          You are responsible for safeguarding your email address, verification codes, third-party account authorization status, and other account credentials, and for all activities that occur under your account. If you discover that your account has been compromised, your credentials have been leaked, or there has been unauthorized access, you should notify us immediately and take the necessary steps. We may, for security, compliance, or risk-control reasons, require additional verification, restrict login, refuse registration, or suspend an account.
        </p>
      </section>

      <section id="section-3" className="scroll-mt-20">
        <h2>3. User Input</h2>
        <p>
          The prompts, parameters, uploaded materials, text descriptions, and other content you submit to the Service are collectively referred to as “User Input.” You hold the lawful rights to User Input or have obtained sufficient authorization for it, and you bear full responsibility for its authenticity, legality, accuracy, and suitability.
        </p>
        <p>
          You warrant that User Input does not violate applicable laws and regulations, does not infringe any third party&apos;s intellectual property rights, personality rights, privacy rights, trade secrets, or other lawful rights and interests, and does not contain content that could expose us or any third party to legal liability, compliance risk, or security risk.
        </p>
        <p>
          To provide, maintain, troubleshoot, audit, and improve the Service, you agree that we may store, process, transmit, and display User Input to the extent necessary. Except where required by law, where you have separately authorized it, or where these Terms provide otherwise, we will not claim ownership of User Input itself.
        </p>
      </section>

      <section id="section-4" className="scroll-mt-20">
        <h2>4. Third-Party Services &amp; Data Sharing</h2>
        <p>
          The image generation capabilities of the Service are provided by third-party model and service providers we work with, <strong>including but not limited to OpenAI, Volcano Engine, and others</strong>. To fulfil your generation request:
        </p>
        <ul>
          <li>your User Input and related data will be transmitted to the above third parties for processing;</li>
          <li>the above third parties may, to the extent permitted by their own terms of service and privacy policies, <strong>use the data they receive to improve their own services or train models</strong>;</li>
          <li>the collection, use, and processing of data by those third parties is governed by the relevant third party&apos;s privacy policy and terms of service, which we cannot fully control.</li>
        </ul>
        <p>You understand and agree to the data-sharing arrangement described above. If you do not accept it, please do not use the Service. For details on how personal information is handled, see the Privacy Policy.</p>
      </section>

      <section id="section-5" className="scroll-mt-20">
        <h2>5. Use of Generated Content</h2>
        <p>
          Images and other output generated by the Service based on User Input and model processing are collectively referred to as “Generated Content.” You may use Generated Content provided you comply with applicable laws and regulations, these Terms, third-party rights, and the usage rules of the model providers.
        </p>
        <p>
          You understand and agree that Generated Content is produced by AI technology and may be inaccurate, incomplete, inconsistent, unavailable, different from what you expected, repetitive, or similar to pre-existing third-party expression. You are responsible for deciding for yourself whether Generated Content is suitable for publication, commercial use, training, distribution, filing, or any other specific purpose, and you bear the resulting risks and responsibilities.
        </p>
        <p>
          If Generated Content involves a person&apos;s likeness, a trademark, a work&apos;s style, protected elements, or any other content that could give rise to a dispute, you should carry out your own rights check, factual verification, and compliance assessment before using it. Without sufficient authorization, you must not present Generated Content as fact, as an official position, as someone else&apos;s original work, or as endorsed by any rights holder.
        </p>
      </section>

      <section id="section-6" className="scroll-mt-20">
        <h2>6. User Conduct</h2>
        <p>When using the Service, you must not:</p>
        <ul>
          <li>upload or enter content that is unlawful, harmful, infringing, defamatory, harassing, or invasive of another person&apos;s privacy;</li>
          <li>impersonate another person or falsify identity information;</li>
          <li>use automated means, scripts, bulk requests, or other methods to bypass quotas, rate limits, access controls, or risk-control measures;</li>
          <li>reverse engineer, scrape, copy, resell, rent, sublicense, or otherwise exploit the Service, its interfaces, model output, or related data without authorization;</li>
          <li>interfere with or disrupt the normal operation of the Service, or attempt to access the system without authorization;</li>
          <li>use the Service for unlawful purposes, or in any way that violates these Terms, page rules, third-party terms, or public order and good morals.</li>
        </ul>
        <p>
          If we reasonably determine that your conduct may violate the above requirements, affect the security and stability of the Service, harm other users or third parties, or expose us to compliance risk, we may take measures including removing content, restricting features, suspending tasks, banning accounts, revoking invitation codes, or other necessary actions.
        </p>
      </section>

      <section id="section-7" className="scroll-mt-20">
        <h2>7. Intellectual Property</h2>
        <p>
          The intellectual property rights in the Service&apos;s software, interface, logos, copy, layout, technical implementation, and other related content belong to us or to the respective rights holders. Unless you have obtained written authorization, you must not copy, modify, distribute, publicly display, reverse engineer, or otherwise use the foregoing content.
        </p>
        <p>
          The intellectual property rights in User Input belong to you or to the respective rights holders. To provide the Service, you grant us a non-exclusive, sublicensable licence, limited to what is necessary to provide the Service, so that we and the relevant third-party service providers may process User Input and return the generated results.
        </p>
        <p>
          The ownership, protectability, exclusivity, and status of Generated Content as a protectable subject matter under copyright law or other laws are subject to applicable law, judicial practice, and third-party rules. Unless the law expressly provides otherwise, we make no commitment or warranty regarding the ownership, registrability, enforceability, or non-infringement of Generated Content.
        </p>
      </section>

      <section id="section-8" className="scroll-mt-20">
        <h2>8. Service Changes &amp; Termination</h2>
        <p>
          We may, based on business arrangements, compliance requirements, security and risk control, changes in third-party capabilities, operational strategy, or other reasonable grounds, change, upgrade, restrict, suspend, or terminate all or part of the Service at any time, including adjusting the registration mode, available models, processing rules, account permissions, or page content.
        </p>
        <p>
          If the Service must be interrupted or taken offline due to legal requirements, regulatory instructions, a third party ceasing support, system failure, or other circumstances beyond our control, we may take emergency measures within a reasonable scope without notifying each user individually. For general updates to the Terms, we will notify you through a page announcement, an updated timestamp, or another appropriate means; the updated Terms take effect from the date of publication.
        </p>
        <p>If you do not agree to the updated Terms, you should stop using the Service. If you continue to access or use the Service, you will be deemed to have accepted the updated Terms.</p>
      </section>

      <section id="section-9" className="scroll-mt-20">
        <h2>9. Disclaimer</h2>
        <p>
          The Service is provided on an “as is” and “as available” basis. To the maximum extent permitted by law, we make no express or implied warranty regarding the continuity, stability, accuracy, timeliness, security, fitness for a particular purpose, error-free nature, uninterrupted nature, or quality of generated results of the Service.
        </p>
        <p>
          You understand and agree that AI services are probabilistic and uncertain, and that Generated Content does not necessarily represent facts, professional advice, or our views. For any creative work, publication, transaction, distribution, compliance filing, medical, legal, financial, or other decision you make based on the Service, you must exercise your own judgment and bear responsibility.
        </p>
        <p>
          To the extent permitted by applicable law, we are not liable for consequences arising from your use of, or inability to use, the Service, interruptions to third-party services, network failures, data loss, defects in Generated Content, rights disputes, or other indirect, incidental, special, or punitive losses; except in circumstances where we cannot be exempted from liability by law.
        </p>
      </section>

      <section id="section-10" className="scroll-mt-20">
        <h2>10. Miscellaneous</h2>
        <p>
          The formation, validity, interpretation, performance, and dispute resolution of these Terms are governed by the laws of the People&apos;s Republic of China, excluding its conflict-of-laws rules. Any dispute arising from these Terms or the Service shall first be resolved through friendly consultation between the parties; if consultation fails, the dispute shall be submitted to the People&apos;s Court with jurisdiction in the place where we are located.
        </p>
        <p>
          If any provision of these Terms is held invalid or unenforceable, the validity of the remaining provisions shall not be affected. Our failure or delay in exercising any right under these Terms does not constitute a waiver of that right.
        </p>
        <p>If you have any questions about these Terms or the Service, please contact us through the official channels published by the Service.</p>
      </section>
    </LegalShell>
  )
}
