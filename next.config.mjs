/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Libera as imagens dos catálogos dos fornecedores.
    // Ajuste/adicione domínios reais assim que a API de cada um for confirmada.
    remotePatterns: [
      { protocol: "https", hostname: "**.xbzbrindes.com.br" },
      { protocol: "https", hostname: "**.spotgifts.com.br" },
      { protocol: "https", hostname: "**.asiaimport.com.br" },
      { protocol: "https", hostname: "media.asiaimport.com.br" },
    ],
  },
};

export default nextConfig;
