import type { SupplierConnector } from "@/lib/types";
import { xbzConnector } from "@/lib/suppliers/xbz";
import { asiaConnector } from "@/lib/suppliers/asia";
import { spotConnector } from "@/lib/suppliers/spot";

export const connectors: SupplierConnector[] = [xbzConnector, asiaConnector, spotConnector];
