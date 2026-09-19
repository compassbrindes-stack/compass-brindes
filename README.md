# Compass Brindes — Catálogo integrado

Site em Next.js para a Compass Brindes Corporativos, com catálogo unificado a
partir de três fornecedores (**XBZ**, **Asia Import** e **Spot Gifts**), lista
de orçamento com envio direto pelo WhatsApp, e um feed de produtos para o
Catálogo do Facebook/Instagram.

## O que já funciona

- Catálogo (`/produtos`), página de produto e filtro por categoria.
- Lista de orçamento (`/orcamento`) guardada no navegador do visitante, com
  botão para enviar tudo pelo WhatsApp.
- Um conector por fornecedor (`lib/suppliers/xbz.ts`, `asia.ts`, `spot.ts`),
  todos com a **mesma estrutura**: se as credenciais não estiverem
  configuradas, o site usa produtos de exemplo (`data/sample-*.json`) para
  que o layout já possa ser validado.
- Rota de sincronização (`/api/sync`) e feed para Meta (`/feed/meta`).

## O que falta para ficar 100% real

Nenhuma das três APIs foi confirmada publicamente — os sites são todos
fechados a login de revendedor. Para ligar de verdade:

1. Pedir para cada fornecedor (XBZ, Asia Import, Spot) a documentação da API
   de revenda: endereço, formato dos dados e como autenticar.
2. Colocar essas informações nas variáveis de ambiente (`.env.example` tem a
   lista completa) — no Vercel, em **Settings → Environment Variables**.
3. Ajustar o mapeamento dentro de cada `lib/suppliers/<fornecedor>.ts` (tem um
   `TODO` marcando exatamente onde) para o formato real que a API devolver.
4. Depois de conectado de verdade, vale colocar um banco de dados (Vercel
   Postgres, por exemplo) para guardar o catálogo em vez de buscar tudo a cada
   sincronização — tem um `TODO` no arquivo `app/api/sync/route.ts` marcando
   onde isso entraria.

## Horário comercial

As APIs dos fornecedores só podem ser chamadas em horário comercial
(**segunda a sexta, 08h–18h, horário de Brasília**):

- O agendamento automático (`vercel.json`) já roda só nesse período
  (`0 11-21 * * 1-5` em UTC, que corresponde a 08h–18h em Brasília — o Brasil
  não usa mais horário de verão desde 2019).
- A rota `/api/sync` confere o horário de novo antes de chamar qualquer
  fornecedor, mesmo se for disparada manualmente fora do agendamento. Fora do
  horário comercial, ela responde `{ "skipped": true, ... }` sem tocar nas
  APIs.
- Isso vale só para as chamadas às APIs dos fornecedores. O site em si (loja,
  orçamento, feed) continua no ar 24 horas — ele mostra o catálogo já
  sincronizado, ou os produtos de exemplo enquanto não há credenciais.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha o que já tiver
npm run dev
```

Sem nenhuma credencial de fornecedor configurada, o site sobe normalmente
usando os produtos de exemplo.

## Deploy no Vercel

1. Suba este projeto para um repositório no GitHub.
2. Importe o repositório no [vercel.com](https://vercel.com) (novo projeto).
3. Em **Settings → Environment Variables**, copie as chaves do
   `.env.example` e preencha com os valores reais (pelo menos
   `NEXT_PUBLIC_WHATSAPP_NUMBER`).
4. O agendamento em `vercel.json` é ativado automaticamente no primeiro
   deploy (cron jobs do Vercel exigem um plano pago para rodar a cada hora —
   confira o limite do seu plano).

## Facebook e Instagram (Catálogo da Meta)

1. Crie um catálogo no **Gerenciador de Comércio** (business.facebook.com).
2. Cadastre `https://<seu-domínio>/feed/meta` como fonte de dados (feed
   programado, atualização diária ou por hora).
3. **Atenção:** a Meta exige um preço numérico por item. Produtos sem
   `priceFrom` definido ficam de fora do feed até terem um valor de
   referência — hoje isso depende de cada fornecedor informar preço, já que o
   modelo atual é "tudo sob consulta".
4. Com o catálogo criado, ele pode ser conectado à loja do Instagram e à
   página do Facebook, permitindo marcar produtos nos posts e no Shopping.

## Estrutura do projeto

```
app/
  page.tsx                 → Home
  produtos/page.tsx         → Catálogo com filtro por categoria
  produtos/[slug]/page.tsx  → Página de produto
  orcamento/page.tsx        → Lista de orçamento (client-side)
  api/sync/route.ts         → Sincroniza com os fornecedores (protegida)
  feed/meta/route.ts        → Feed CSV para o Catálogo da Meta
lib/
  types.ts                  → Formato único de produto
  business-hours.ts         → Checagem de horário comercial
  products.ts                → Agrega os conectores em um catálogo só
  suppliers/
    xbz.ts, asia.ts, spot.ts → Um conector por fornecedor (com modo exemplo)
data/
  sample-xbz.json, sample-asia.json, sample-spot.json → Produtos de exemplo
```
