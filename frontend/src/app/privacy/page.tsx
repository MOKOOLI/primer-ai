export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 md:p-10 text-slate-800 space-y-6" dir="auto">
      <a className="text-blue-700 underline" href="/">← Primer AI</a>
      <h1 className="text-3xl font-bold">Privacy and data use / حریم خصوصی و استفاده از داده</h1>
      <p>Primer AI processes molecular-biology inputs to return the requested result. Do not submit confidential, identifiable, or unpublished sequences unless you have approval to do so.</p>
      <h2 className="text-xl font-bold">What the app receives / داده‌هایی که برنامه دریافت می‌کند</h2>
      <ul className="list-disc ps-6 space-y-1">
        <li>Sequence, primer, and qPCR values entered for a calculation are sent to the Primer AI server to perform that calculation.</li>
        <li>Account email, saved primers, experimental feedback, and classroom membership/submissions are stored in the app database when those features are used.</li>
        <li>Unsaved primer/qPCR analysis input is not written to the app's account tables by these routes. Hosting or infrastructure logs may have separate retention rules.</li>
      </ul>
      <h2 className="text-xl font-bold">External providers / سرویس‌های بیرونی</h2>
      <ul className="list-disc ps-6 space-y-1">
        <li>Gene search sends a gene symbol and organism to NCBI; literature search sends a gene/topic query to Europe PMC. Protein accession lookups contact UniProt and AlphaFold DB.</li>
        <li>Primer BLAST sends primer sequences and the selected organism to NCBI only after the consent checkbox is selected.</li>
        <li>Protein sequence prediction sends the entered sequence to ESMFold only after explicit consent.</li>
        <li>AI chat sends the question to Anthropic after consent. Sharing current gene/design/qPCR context is a separate, optional choice. Residue explanations also send retrieved source context after consent.</li>
        <li>External providers process data under their own terms and retention policies. Review their policies before sending sensitive or unpublished material.</li>
      </ul>
      <h2 className="text-xl font-bold">Retention and controls / نگه‌داری و کنترل داده</h2>
      <ul className="list-disc ps-6 space-y-1">
        <li>Saved primers, feedback, classroom assignments and submissions remain in the app database until deleted with the account or by the relevant feature. Deleting a teacher account also deletes classes they own and their submissions.</li>
        <li>BLAST job records and results are scheduled for deletion after 7 days; if the service is stopped, cleanup runs when it next starts. qPCR inputs and results are returned for the active request and are not persisted in the app database by the analysis endpoint.</li>
        <li>Provider-consent audit records are kept for 12 months. Signed-in users can include their recorded consent events in the data export; records tied to an account are removed when that account is deleted.</li>
        <li>Use Account Security & Recovery to request a JSON export or delete the account. Do not opt in to an external service when you do not want the corresponding data sent.</li>
        <li>Email verification/password recovery need SMTP configuration. Without it, new accounts are not required to verify email and email recovery cannot be delivered.</li>
      </ul>
      <p className="text-sm text-slate-500">This page describes the application behavior implemented in this code. Hosting, email-provider, and third-party provider policies may add separate data handling.</p>
    </main>
  );
}
