export const metadata = {
  title: "Política de Privacidade — Compass Brindes Corporativos",
};

export default function PoliticaDePrivacidadePage() {
  return (
    <div className="container section" style={{ maxWidth: 800 }}>
      <h2>Política de Privacidade</h2>
      <p className="section-lede" style={{ marginBottom: 24 }}>
        Última atualização: {new Date().toLocaleDateString("pt-BR")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, color: "var(--color-text)" }}>
        <section>
          <h3>1. Quem somos</h3>
          <p>
            A Compass Brindes Corporativos é uma empresa especializada em brindes personalizados
            para empresas. Este site é utilizado para apresentar nosso catálogo de produtos e
            facilitar o contato para orçamentos.
          </p>
        </section>

        <section>
          <h3>2. Quais dados coletamos</h3>
          <p>
            Coletamos apenas os dados necessários para processar seu orçamento ou pedido, como
            nome, CPF ou CNPJ, telefone, endereço de entrega (CEP, endereço, número e
            complemento) e os itens selecionados. Esses dados são fornecidos diretamente por você
            ao preencher os formulários do site.
          </p>
        </section>

        <section>
          <h3>3. Como usamos seus dados</h3>
          <p>
            Utilizamos as informações fornecidas exclusivamente para:
          </p>
          <ul>
            <li>Processar e identificar seu pedido ou orçamento;</li>
            <li>Entrar em contato para confirmar detalhes, prazos e valores;</li>
            <li>Consultar o histórico de pedidos vinculado ao seu CPF/CNPJ, quando solicitado.</li>
          </ul>
        </section>

        <section>
          <h3>4. Compartilhamento de dados</h3>
          <p>
            Não vendemos nem compartilhamos seus dados pessoais com terceiros para fins de
            marketing. Seus dados podem ser compartilhados apenas com fornecedores parceiros
            estritamente quando necessário para a produção e entrega do seu pedido.
          </p>
        </section>

        <section>
          <h3>5. Armazenamento e segurança</h3>
          <p>
            Seus dados são armazenados em ambiente seguro e utilizados apenas pelo tempo
            necessário para cumprir a finalidade para a qual foram coletados, respeitando a Lei
            Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
          </p>
        </section>

        <section>
          <h3>6. Seus direitos</h3>
          <p>
            Você pode, a qualquer momento, solicitar a confirmação, correção ou exclusão dos seus
            dados pessoais, entrando em contato conosco pelo WhatsApp informado no rodapé do
            site.
          </p>
        </section>

        <section>
          <h3>7. Contato</h3>
          <p>
            Em caso de dúvidas sobre esta Política de Privacidade, entre em contato pelo WhatsApp
            (49) 93618-0446.
          </p>
        </section>
      </div>
    </div>
  );
}
