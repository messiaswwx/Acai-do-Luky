# 🍇 Açaí do Kayky - Sistema Próprio de Delivery & Gestão

Sistema completo e moderno criado sob medida para a microempresa de açaí do Kayky, permitindo **independência total de aplicativos de marketplace (como iFood)**, eliminando comissões abusivas e retendo 100% da base de clientes.

---

## 🚀 Como Executar o Projeto

No terminal, na pasta raiz do projeto (`c:\Users\Gabriel\Documents\Projeto do kayky`):

```bash
# Iniciar tanto o Servidor quanto o Painel/Cardápio com um único comando:
npm run dev
```

O sistema abrirá automaticamente:
- 📱 **Cardápio Digital & Painel**: [http://localhost:5173](http://localhost:5173)
- ⚙️ **API & WebSockets**: [http://localhost:4000](http://localhost:4000)

*(Na barra superior do app você pode alternar livremente entre a **Visão do Cliente** e o **Painel do Kayky** para testar tudo em tempo real!)*

---

## ✨ Funcionalidades Principais

### 1. 📱 Cardápio do Cliente (Mobile-First)
- **Montador de Açaí Passo a Passo**:
  - Escolha do formato/tamanho: Copo 300ml, 500ml, 700ml ou Barca de 1L.
  - Seleção da Base: Açaí tradicional, Batido com Banana, Cupuaçu ou Meio a Meio.
  - Acompanhamentos Grátis com limitador automático (ex: até 3 ou 4 itens).
  - Adicionais Especiais (Nutella, Morango, KitKat, Leite Ninho extra, Whey Protein).
  - Caldas e Coberturas (Leite condensado, chocolate, morango, mel).
  - Campo de observações especiais.
- **Sacola de Compras Inteligente**: Adição, remoção, alteração de quantidades e subtotal em tempo real.
- **Checkout Descomplicado**:
  - Opção de **Entrega** (com endereço completo e taxa) ou **Retirada no Balcão**.
  - Nome e WhatsApp do cliente.
  - Formas de Pagamento:
    - **Pix**: Exibe chave da loja e botão de cópia rápida em 1 clique.
    - **Cartão na entrega**: Opção de Débito ou Crédito para levar a maquininha.
    - **Dinheiro**: Opção de troco com cálculo exato.
- **Acompanhamento em Tempo Real**:
  - Linha do tempo visual do pedido (*Recebido ➔ Em Preparo ➔ Saiu p/ Entrega ➔ Concluído*).
  - Botão integrado para enviar o resumo ou tirar dúvidas no WhatsApp da loja com mensagem 100% formatada.

### 2. 👨‍🍳 Painel de Gestão do Kayky (KDS / Cozinha)
- **Campainha Sonora de Alerta**: Toca um alerta sonoro agradável imediatamente ao entrar qualquer novo pedido (Web Audio API nativo).
- **Gestão de Pedidos em Tempo Real**:
  - Filtros por status: *Novos, Em Preparo, A Caminho / Pronto, Concluídos*.
  - Avanço de status com 1 clique (*Aceitar Pedido*, *Despachar*, *Finalizar*).
  - Botão de contato direto no WhatsApp do cliente com 1 toque.
- **Impressão de Comandas Térmicas**:
  - Layout otimizado para impressoras térmicas padrão (58mm e 80mm Bluetooth/USB).
  - Imprime comanda de cozinha e motoboy com todos os detalhes do copo, endereço e observações.
- **Controle de Cardápio & Estoque**:
  - Pausar ou ativar qualquer ingrediente ou tamanho em tempo real se o estoque acabar.
- **Métricas do Dia**:
  - Faturamento acumulado, total de pedidos, pedidos pendentes e em preparo.
- **Configurações da Loja**:
  - Chave Pix e tipo de chave.
  - Telefone do WhatsApp.
  - Taxa de entrega e tempo estimado.
  - Botão para Abrir ou Fechar a loja.

---

## 💡 Estratégias para Transição do iFood para o Canal Próprio

1. **Adesivo no Copo do iFood**:
   - Em todo pedido enviado pelo iFood, cole um adesivo/panfleto com um QR Code direto para o cardápio do Kayky com um incentivo:
   *“Gostou? No nosso app próprio seu açaí sai mais barato e com entrega mais rápida! Peça direto pelo link ou WhatsApp.”*
2. **Preço mais Atrativo**:
   - No iFood, aumente os preços para cobrir a taxa de 12%-27%. No cardápio próprio, mantenha o preço justo. O cliente vai preferir pedir direto com ele.
3. **Fidelização com a Base de Clientes**:
   - Todos os telefones e nomes dos clientes ficam salvos, permitindo mandar mensagens nas sextas/finais de semana com promoções.

---

## 📦 Estrutura de Pastas

```
Projeto do kayky/
├── client/                 # Frontend React + Vite + Tailwind CSS v4
│   ├── src/
│   │   ├── components/     # MonteAcaiModal, CartDrawer, CheckoutModal, AdminPanel, PrintReceipt, etc.
│   │   ├── types/          # Tipagens TypeScript completas
│   │   ├── utils/          # Alerta sonoro (Web Audio) e geradores de mensagem de WhatsApp
│   │   ├── App.tsx         # Interface principal e chaveador de visualização
│   │   └── index.css       # Estilos Tailwind v4
│   └── package.json
├── server/                 # Backend Node.js + Express + Socket.IO
│   ├── data/               # Banco de dados JSON com persistência automática
│   ├── index.js            # Rotas da API e eventos WebSockets em tempo real
│   └── package.json
├── dev.js                  # Script para inicializar front e back simultaneamente
└── package.json
```
