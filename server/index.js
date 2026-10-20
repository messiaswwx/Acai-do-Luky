import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT']
  }
});

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_DATA = {
  settings: {
    storeName: "Açaí do Luky",
    isOpen: true,
    whatsapp: "5511999999999",
    pixKey: "kaykyacai@exemplo.com",
    pixKeyType: "E-mail",
    deliveryFee: 5.00,
    estimatedTime: "30 - 45 min",
    address: "Atendimento Delivery & Retirada",
    minOrderValue: 12.00
  },
  menu: {
    sizes: [
      { id: "size-300", name: "Copo 300ml", description: "Perfeito para matar aquela vontade de forma rápida e refrescante.", price: 14.00, originalPrice: 14.00, discountPercent: 0, maxFreeToppings: 3, available: true },
      { id: "size-500", name: "Copo 500ml", description: "O queridinho da galera! Equilíbrio ideal entre açaí e acompanhamentos.", price: 17.00, originalPrice: 20.00, discountPercent: 15, maxFreeToppings: 3, available: true },
      { id: "size-700", name: "Copo 700ml", description: "Tamanho caprichado para quem ama açaí de verdade.", price: 26.00, originalPrice: 26.00, discountPercent: 0, maxFreeToppings: 4, available: true },
      { id: "size-1000", name: "Barca Especial 1 Litro", description: "Serve até 3 pessoas com muita fartura, amor e recheio!", price: 45.00, originalPrice: 45.00, discountPercent: 0, maxFreeToppings: 5, available: true }
    ],
    bases: [
      { id: "base-tradicional", name: "Açaí Tradicional Cremoso", available: true },
      { id: "base-banana", name: "Açaí Batido com Banana", available: true },
      { id: "base-cupuacu", name: "Cupuaçu Puro Cremoso", available: true },
      { id: "base-misto", name: "Meio a Meio (Açaí + Cupuaçu)", available: true }
    ],
    freeToppings: [
      { id: "free-ninho", name: "Leite Ninho em Pó", available: true },
      { id: "free-granola", name: "Granola Crocante", available: true },
      { id: "free-pacoca", name: "Paçoca de Amendoim", available: true },
      { id: "free-banana", name: "Banana Fresca Fatiada", available: true },
      { id: "free-aveia", name: "Aveia em Flocos", available: true },
      { id: "free-sucrilhos", name: "Sucrilhos de Milho", available: true }
    ],
    premiumToppings: [
      { id: "prem-morango", name: "Morango Fresco Fatiado", price: 4.50, available: true },
      { id: "prem-nutella", name: "Nutella Pura Original", price: 5.00, available: true },
      { id: "prem-kitkat", name: "KitKat Picadinho", price: 3.50, available: true },
      { id: "prem-confete", name: "Confetes de Chocolate (M&M's)", price: 3.00, available: true },
      { id: "prem-doce-leite", name: "Doce de Leite Cremoso", price: 3.00, available: true },
      { id: "prem-ninho-extra", name: "Leite Ninho Extra", price: 2.50, available: true },
      { id: "prem-whey", name: "Dose de Whey Protein (30g)", price: 6.00, available: true }
    ],
    syrups: [
      { id: "syrup-condensado", name: "Leite Condensado", available: true },
      { id: "syrup-chocolate", name: "Calda de Chocolate", available: true },
      { id: "syrup-morango", name: "Calda de Morango", available: true },
      { id: "syrup-mel", name: "Mel de Abelha Puro", available: true }
    ]
  },
  orders: []
};

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Erro ao ler banco de dados, inicializando padrão:", err);
  }
  saveDatabase(DEFAULT_DATA);
  return DEFAULT_DATA;
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error("Erro ao salvar banco de dados:", err);
  }
}

let db = loadDatabase();

// Endpoints
app.get('/api/settings', (req, res) => {
  res.json(db.settings);
});

app.put('/api/settings', (req, res) => {
  db.settings = { ...db.settings, ...req.body };
  saveDatabase(db);
  io.emit('settings_updated', db.settings);
  res.json(db.settings);
});

app.get('/api/menu', (req, res) => {
  res.json(db.menu);
});

app.put('/api/menu', (req, res) => {
  db.menu = req.body;
  saveDatabase(db);
  io.emit('menu_updated', db.menu);
  res.json(db.menu);
});

app.get('/api/orders', (req, res) => {
  res.json(db.orders);
});

app.get('/api/orders/:id', (req, res) => {
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado" });
  res.json(order);
});

app.post('/api/orders', (req, res) => {
  const newOrder = {
    id: `PED-${Date.now().toString().slice(-6)}`,
    createdAt: new Date().toISOString(),
    status: 'NOVO', // NOVO, PREPARANDO, A_CAMINHO, CONCLUIDO, CANCELADO
    ...req.body
  };

  db.orders.unshift(newOrder);
  saveDatabase(db);

  // Emite evento em tempo real para a cozinha/painel do Kayky
  io.emit('new_order', newOrder);

  res.status(201).json(newOrder);
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const orderIndex = db.orders.findIndex(o => o.id === req.params.id);

  if (orderIndex === -1) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  db.orders[orderIndex].status = status;
  db.orders[orderIndex].updatedAt = new Date().toISOString();
  saveDatabase(db);

  const updatedOrder = db.orders[orderIndex];
  io.emit('order_status_updated', updatedOrder);
  io.to(`order_${updatedOrder.id}`).emit('my_order_update', updatedOrder);

  res.json(updatedOrder);
});

// Socket.IO
io.on('connection', (socket) => {
  socket.on('track_order', (orderId) => {
    socket.join(`order_${orderId}`);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🍦 Servidor Açaí do Kayky rodando em http://localhost:${PORT}`);
});
