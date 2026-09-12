import { translate } from "../i18n/i18n";

function RecoveryIllustration() {
  return (
    <div aria-hidden="true" className="admin-recovery__illustration">
      <svg fill="none" viewBox="0 0 64 64">
        <rect height="38" rx="8" width="46" x="9" y="13" />
        <path d="M10 23h44" />
        <path d="M22 18h.01M28 18h.01" strokeLinecap="round" strokeWidth="3" />
        <path d="M28 37h15m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function AdminRouteErrorPage({
  // eslint-disable-next-line react/prop-types
  language,
  // eslint-disable-next-line react/prop-types
  presentation,
  // eslint-disable-next-line react/prop-types
  reopenHref,
}) {
  return (
    <main
      className="admin-recovery"
      data-shopify-document-error
      lang={language}
      role="alert"
    >
      <section aria-labelledby="admin-recovery-title" className="admin-recovery__card">
        <div className="admin-recovery__brand" aria-label="CLEVER">
          <span aria-hidden="true" className="admin-recovery__brand-mark">C</span>
          <span>CLEVER</span>
        </div>
        <div className="admin-recovery__content">
          <RecoveryIllustration />
          <div className="admin-recovery__copy">
            <h1 id="admin-recovery-title">
              {/* eslint-disable-next-line react/prop-types */}
              {translate(language, presentation.titleKey)}
            </h1>
            {/* eslint-disable-next-line react/prop-types */}
            <p>{translate(language, presentation.messageKey)}</p>
          </div>
          <a className="admin-recovery__action" href={reopenHref} target="_top">
            <span>{translate(language, "recovery.action")}</span>
            <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
              <path d="M5 10h10m0 0-4-4m4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </section>
    </main>
  );
}
