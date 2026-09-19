const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

export function WhatsappFab() {
  if (!WHATSAPP_NUMBER) return null;

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    "Olá! Vim pelo site da Compass Brindes e gostaria de um orçamento."
  )}`;

  return (
    <a className="whatsapp-fab" href={url} target="_blank" rel="noreferrer">
      Fale no WhatsApp
    </a>
  );
}
