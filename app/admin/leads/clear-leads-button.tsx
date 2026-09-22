"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClearLeadsButton({ accessKey }: { accessKey: string }) {
  const router = useRouter();
  const [limpando, setLimpando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleClick() {
    const confirmado = window.confirm(
      "Tem certeza que deseja apagar TODOS os cadastros de quem baixou o catálogo? Essa ação não pode ser desfeita."
    );
    if (!confirmado) return;

    setLimpando(true);
    setErro(null);

    try {
      const res = await fetch(`/api/catalogo-leads?key=${encodeURIComponent(accessKey)}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        setErro(data.error ?? "Não foi possível limpar a lista.");
        return;
      }

      router.refresh();
    } catch {
      setErro("Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.");
    } finally {
      setLimpando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button className="btn btn-outline" onClick={handleClick} disabled={limpando}>
        {limpando ? "Limpando..." : "Limpar lista"}
      </button>
      {erro && <p className="form-error">{erro}</p>}
    </div>
  );
}
