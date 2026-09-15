import Script from "next/script";

import type { MeasurementConfig } from "@/lib/seo/analytics";

export function MeasurementScripts({ config }: { config: MeasurementConfig }) {
  if (config.gtmId) {
    return (
      <Script
        id="dealatlas-gtm"
        strategy="afterInteractive"
      >{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':Date.now(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${config.gtmId}');`}</Script>
    );
  }

  if (!config.gaMeasurementId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${config.gaMeasurementId}`}
        strategy="afterInteractive"
      />
      <Script id="dealatlas-ga4" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${config.gaMeasurementId}',{anonymize_ip:true,send_page_view:true});`}
      </Script>
    </>
  );
}
