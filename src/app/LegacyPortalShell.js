import fs from 'node:fs';
import path from 'node:path';
import Script from 'next/script';

const legacyMarkup = fs.readFileSync(
  path.join(process.cwd(), 'public', 'legacy-body.html'),
  'utf8'
);

export default function LegacyPortalShell({ initialPage = 'dashboard' }) {
  const runtimeConfig = {
    GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL || '',
    INITIAL_PAGE: initialPage,
  };

  const runtimeConfigScript = `window.__UNI_PORTAL_CONFIG__ = ${JSON.stringify(runtimeConfig)};`;

  return (
    <>
      <main dangerouslySetInnerHTML={{ __html: legacyMarkup }} />
      <Script id="uniportal-runtime-config" strategy="beforeInteractive">
        {runtimeConfigScript}
      </Script>
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}