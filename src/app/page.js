import fs from 'node:fs';
import path from 'node:path';
import Script from 'next/script';

const legacyMarkup = fs.readFileSync(
  path.join(process.cwd(), 'public', 'legacy-body.html'),
  'utf8'
);

const runtimeConfig = {
  GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL || '',
};

const runtimeConfigScript = `window.__UNI_PORTAL_CONFIG__ = ${JSON.stringify(runtimeConfig)};`;

export default function HomePage() {
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