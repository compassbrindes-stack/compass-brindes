import type { SupplierConnector } from "@/lib/types";
import { compassappConnector } from "@/lib/suppliers/compassapp";

// XBZ, Asia Import e Spot Gifts ficam desativados até termos as credenciais
// reais da API de cada fornecedor — hoje eles só devolveriam produtos de
// exemplo (com preço fictício e sem foto real), então não entram na lista.
// Para reativar no futuro: importar o conector e adicioná-lo aqui de novo.
export const connectors: SupplierConnector[] = [compassappConnector];
