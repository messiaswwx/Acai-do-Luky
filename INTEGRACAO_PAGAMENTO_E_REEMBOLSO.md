# Planejamento: Integração de Pagamento com Reembolso Automático (Pix)

Documento de referência para implementação futura da API de pagamento com estorno/reembolso automático em caso de cancelamento.

---

## 1. Objetivo
Permitir que o cliente pague seu pedido via **Pix dinâmico** dentro do próprio aplicativo (QR Code e Copia & Cola) e, caso o pedido seja cancelado (pelo cliente ou pelo lojista), o dinheiro seja **reembolsado instantaneamente** para a conta bancária do cliente via Devolução Pix do Banco Central.

---

## 2. Gateway Recomendado: Mercado Pago (ou Asaas)

### Por que o Mercado Pago?
* **Sem mensalidade fixa:** Cobrança apenas por transação aprovada (~0,99% a 1,99% no Pix).
* **Devolução Instantânea:** Suporte oficial à API de devolução Pix do BACEN (`POST /v1/payments/{id}/refunds`). O dinheiro volta para a conta do cliente em 3 a 10 segundos.
* **Documentação robusta:** SDKs oficiais para Node.js e REST API simples.
* **Facilidade de cadastro:** Pode ser conta Pessoa Física ou CNPJ/MEI.

*(Alternativa equivalente: **Asaas**, que também possui API de cobrança e estorno Pix muito amigável para delivery).*

---

## 3. Fluxo de Funcionamento

```
[ Cliente ]                        [ Backend / Supabase ]                   [ Mercado Pago ]
     |                                        |                                     |
     | 1. Finaliza pedido (Pix)              |                                     |
     |--------------------------------------->| 2. POST /v1/payments                |
     |                                        |------------------------------------>|
     | 3. Retorna QR Code e Chave Copia/Cola  |<-----------------------------------|
     |<---------------------------------------|                                     |
     |                                        |                                     |
     | 4. Cliente paga no app do seu banco    |                                     |
     |----------------------------------------------------------------------------->|
     |                                        | 5. Webhook: payment.updated         |
     |                                        |<------------------------------------|
     | 6. Atualiza status para 'CONFIRMADO'   |                                     |
     |    (Painel toca alerta sonoro)         |                                     |
```

### Em Caso de Cancelamento (Reembolso Instantâneo):

```
[ Lojista ou Cliente ]            [ Backend / Supabase ]                   [ Mercado Pago ]
          |                                  |                                     |
          | 1. Clica em "Cancelar / Recusar" |                                     |
          |--------------------------------->| 2. POST /v1/payments/{id}/refunds   |
          |                                  |------------------------------------>|
          |                                  | 3. Devolução Pix BACEN confirmada   |
          |                                  |<------------------------------------|
          | 4. Status = 'CANCELADO_ESTORNADO'|                                     |
          |<---------------------------------|                                     |
          |                                                                        |
          |======> DINHEIRO RETORNA NA CONTA BANCÁRIA DO CLIENTE EM SEGUNDOS <======|
```

---

## 4. Regras de Negócio e Segurança (Para evitar prejuízo)

1. **Janela de Cancelamento do Cliente:**
   * O cliente só pode cancelar com estorno automático enquanto o pedido estiver com status **"PENDENTE"** ou **"AGUARDANDO CONFIRMAÇÃO"** (tempo limite recomendado: até 5 minutos após o pagamento).
   * Se o lojista já alterou o status para **"EM PREPARO"** ou **"SAIU PARA ENTREGA"**, o botão de cancelamento automático do cliente é bloqueado com a mensagem:
     > *"Seu açaí já está sendo preparado! Para cancelamentos neste estágio, entre em contato direto pelo WhatsApp."*
   * Isso evita que a loja perca insumos (frutas cortadas, açaí no copo) com cancelamentos indevidos.

2. **Cancelamento pelo Lojista (Kayky):**
   * Se a loja precisar recusar o pedido (falta de produto, fim de expediente ou endereço fora de rota), o lojista clica em "Recusar Pedido" no painel `/admin` e o sistema já dispara o estorno automaticamente sem precisar fazer Pix manual.

3. **Segurança das Chaves:**
   * O `ACCESS_TOKEN` do Mercado Pago fica armazenado estritamente nas variáveis de ambiente seguras do backend (`.env`), nunca no código do frontend (`client`).

---

## 5. Roteiro de Implementação (Passo a Passo Técnico)

Quando for iniciar a implementação, siga os passos abaixo:

### Passo 1: Credenciais
1. Acessar o portal de desenvolvedores do Mercado Pago (ou Asaas).
2. Criar uma aplicação e copiar:
   * `MP_ACCESS_TOKEN` (Chave de produção ou de testes/sandbox).
   * `MP_PUBLIC_KEY` (Chave pública para o frontend).

### Passo 2: Endpoints no Backend (`server/index.js` ou Supabase Edge Functions)
1. `POST /api/payments/create-pix`: Recebe os dados do pedido, chama o Mercado Pago com `payment_method_id: 'pix'` e retorna o `qr_code` e `qr_code_base64`.
2. `POST /api/payments/webhook`: Rota que o Mercado Pago chama quando o pagamento for concluído para atualizar o pedido no banco para `pago: true`.
3. `POST /api/payments/refund`: Rota protegida que recebe o `order_id`, valida permissão e chama a rota de estorno do Mercado Pago (`/v1/payments/{payment_id}/refunds`).

### Passo 3: Frontend (Cliente & Painel Admin)
1. **No Checkout do Cliente:**
   * Modal que exibe o QR Code dinâmico gerado e botão "Copiar Código Pix".
   * Polling ou WebSocket aguardando a confirmação do pagamento para avançar automaticamente a tela.
2. **No Painel Admin (`AdminPanel.tsx`):**
   * Identificação visual de pedidos pagos via Pix automático.
   * Ao clicar no botão "Recusar Pedido" ou "Cancelar", exibir confirmação: *"Deseja cancelar o pedido e estornar R$ XX,XX automaticamente via Pix?"*.

---

*Arquivo criado e salvo em: `INTEGRACAO_PAGAMENTO_E_REEMBOLSO.md` para consulta contínua.*
