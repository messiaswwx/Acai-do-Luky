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

// Headers de Segurança HTTP (Proteção contra clickjacking, MIME sniffing e XSS)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Limite de payload para impedir ataques de DoS por sobrecarga de memória
app.use(express.json({ limit: '50kb' }));

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
    minOrderValue: 12.00,
    adminPin: "1234",
    twoFactorEnabled: true,
    twoFactorBackupCode: "998877"
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
  orders: [],
  trustedDevices: []
};

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.settings) {
        if (parsed.settings.twoFactorEnabled === undefined) parsed.settings.twoFactorEnabled = true;
        if (!parsed.settings.twoFactorBackupCode) parsed.settings.twoFactorBackupCode = "998877";
      }
      if (!Array.isArray(parsed.trustedDevices)) {
        parsed.trustedDevices = [];
      }
      return parsed;
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

// Controle de tentativas de login, bloqueio temporário (Lockout) e 2FA
const loginAttempts = new Map(); // identifier -> { count: number, lockUntil: number }
const twoFactorChallenges = new Map(); // challengeToken -> { code: string, createdAt: number, expiresAt: number, attempts: number }

function getClientIdentifier(req) {
  return req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'client-default';
}

function checkBruteForce(identifier) {
  const now = Date.now();
  const attempt = loginAttempts.get(identifier);
  if (!attempt) return { allowed: true };
  if (attempt.lockUntil && attempt.lockUntil > now) {
    const remainingSec = Math.ceil((attempt.lockUntil - now) / 1000);
    return { allowed: false, remainingSec };
  }
  if (attempt.lockUntil && attempt.lockUntil <= now) {
    // Fim do bloqueio temporário
    loginAttempts.delete(identifier);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailedAttempt(identifier) {
  const now = Date.now();
  const attempt = loginAttempts.get(identifier) || { count: 0, lockUntil: 0 };
  attempt.count += 1;

  // Tempo progressivo de bloqueio por tentativas erradas
  let lockoutSec = 0;
  if (attempt.count === 3) {
    lockoutSec = 30; // 3 tentativas: bloqueio de 30s
  } else if (attempt.count === 4) {
    lockoutSec = 60; // 4 tentativas: bloqueio de 60s
  } else if (attempt.count >= 5) {
    lockoutSec = 120; // 5+ tentativas: bloqueio de 120s
  }

  if (lockoutSec > 0) {
    attempt.lockUntil = now + lockoutSec * 1000;
  }

  loginAttempts.set(identifier, attempt);

  const attemptsUntilLock = attempt.count < 3 ? (3 - attempt.count) : 0;

  return {
    locked: lockoutSec > 0,
    remainingSec: lockoutSec,
    attemptsLeft: attemptsUntilLock,
    totalFailures: attempt.count
  };
}

function clearFailedAttempts(identifier) {
  loginAttempts.delete(identifier);
}

// -------------------------------------------------------------
// ENDPOINTS DE AUTENTICAÇÃO E VERIFICAÇÃO EM DUAS ETAPAS (2FA)
// -------------------------------------------------------------

// ETAPA 1: Validação do PIN de Acesso + Verificação de Dispositivo Confiável
app.post('/api/auth/login', (req, res) => {
  const clientId = getClientIdentifier(req);
  const { pin, deviceToken } = req.body || {};

  // Validação básica de entrada
  if (!pin || typeof pin !== 'string' || pin.trim().length < 4) {
    return res.status(400).json({ 
      error: 'O PIN de acesso deve conter no mínimo 4 dígitos numéricos.' 
    });
  }

  // Verifica se o IP está bloqueado temporariamente por erro
  const brute = checkBruteForce(clientId);
  if (!brute.allowed) {
    return res.status(429).json({
      error: `Acesso temporariamente bloqueado por tentativas incorretas. Aguarde ${brute.remainingSec}s para tentar novamente.`,
      lockoutSeconds: brute.remainingSec
    });
  }

  const expectedPin = (db.settings && db.settings.adminPin) ? String(db.settings.adminPin).trim() : '1234';

  if (pin.trim() !== expectedPin) {
    const failInfo = recordFailedAttempt(clientId);
    if (failInfo.locked) {
      return res.status(429).json({
        error: `Tentativas excedidas! Por segurança, o login foi bloqueado por ${failInfo.remainingSec} segundos.`,
        lockoutSeconds: failInfo.remainingSec,
        attemptsLeft: 0
      });
    }
    return res.status(401).json({
      error: `PIN incorreto. Você tem mais ${failInfo.attemptsLeft} tentativa(s) antes do bloqueio de segurança.`,
      attemptsLeft: failInfo.attemptsLeft
    });
  }

  // PIN correto!
  const is2faActive = db.settings?.twoFactorEnabled !== false;

  // Verifica se o 2FA está ativo
  if (is2faActive) {
    // Verifica se este dispositivo já foi autorizado anteriormente via 2FA
    const isDeviceTrusted = Array.isArray(db.trustedDevices) && 
      Boolean(deviceToken) && 
      db.trustedDevices.some(d => d.token === deviceToken);

    if (isDeviceTrusted) {
      // Dispositivo já autorizado com 2FA! Dispensa o código 2FA e autoriza o acesso direto com o PIN
      const deviceIndex = db.trustedDevices.findIndex(d => d.token === deviceToken);
      if (deviceIndex !== -1) {
        db.trustedDevices[deviceIndex].lastUsedAt = new Date().toISOString();
        db.trustedDevices[deviceIndex].ip = clientId;
        saveDatabase(db);
      }
      clearFailedAttempts(clientId);
      return res.json({
        success: true,
        require2FA: false,
        deviceTrusted: true,
        deviceToken
      });
    }

    // Dispositivo NÃO autorizado ainda: gera código 2FA de 6 dígitos para autorizar o aparelho
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const challengeToken = `ch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Salva o desafio por 5 minutos
    twoFactorChallenges.set(challengeToken, {
      code,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0
    });

    console.log(`\n=================================================`);
    console.log(`🔐 [2FA AÇAÍ DO LUKY] CÓDIGO DE AUTORIZAÇÃO DE DISPOSITIVO: ${code}`);
    console.log(`📱 Destinatário WhatsApp: ${db.settings?.whatsapp || 'Não informado'}`);
    console.log(`=================================================\n`);

    const rawPhone = db.settings?.whatsapp || '5511999999999';

    return res.json({
      require2FA: true,
      challengeToken,
      phone: rawPhone,
      demoCode: code
    });
  }

  // Se o 2FA estiver desligado nas configurações, autoriza direto
  clearFailedAttempts(clientId);
  res.json({
    success: true,
    require2FA: false,
    deviceTrusted: false
  });
});

// ETAPA 2: Validação do Código 2FA e Autorização Permanente do Dispositivo
app.post('/api/auth/verify-2fa', (req, res) => {
  const clientId = getClientIdentifier(req);
  const { challengeToken, code, deviceName } = req.body || {};

  const brute = checkBruteForce(clientId);
  if (!brute.allowed) {
    return res.status(429).json({
      error: `Acesso bloqueado temporariamente. Aguarde ${brute.remainingSec}s.`,
      lockoutSeconds: brute.remainingSec
    });
  }

  if (!challengeToken || !twoFactorChallenges.has(challengeToken)) {
    return res.status(400).json({ 
      error: 'Sessão de verificação 2FA expirada ou inválida. Solicite um novo código.' 
    });
  }

  const challenge = twoFactorChallenges.get(challengeToken);

  if (Date.now() > challenge.expiresAt) {
    twoFactorChallenges.delete(challengeToken);
    return res.status(400).json({ 
      error: 'O código de 6 dígitos expirou. Por favor, clique em Reenviar Código.' 
    });
  }

  const inputCode = String(code || '').trim();
  const backupMasterCode = String(db.settings?.twoFactorBackupCode || '998877').trim();

  // Valida com o código gerado OU com a Chave Mestra de Backup configurada
  if (inputCode === challenge.code || inputCode === backupMasterCode) {
    twoFactorChallenges.delete(challengeToken);
    clearFailedAttempts(clientId);

    // Registra este dispositivo como confiável permanentemente
    const newDeviceToken = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    if (!Array.isArray(db.trustedDevices)) db.trustedDevices = [];

    db.trustedDevices.push({
      token: newDeviceToken,
      name: deviceName || 'Navegador Autorizado',
      ip: clientId,
      authorizedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString()
    });
    saveDatabase(db);

    return res.json({ 
      success: true,
      deviceToken: newDeviceToken,
      deviceTrusted: true
    });
  }

  // Código 2FA incorreto
  challenge.attempts += 1;
  const failInfo = recordFailedAttempt(clientId);

  if (failInfo.locked) {
    twoFactorChallenges.delete(challengeToken);
    return res.status(429).json({
      error: `Tentativas excedidas! Acesso bloqueado por ${failInfo.remainingSec} segundos.`,
      lockoutSeconds: failInfo.remainingSec
    });
  }

  return res.status(401).json({
    error: `Código 2FA incorreto. Tente novamente ou use sua Chave Mestra. (${failInfo.attemptsLeft} tentativas restantes)`,
    attemptsLeft: failInfo.attemptsLeft
  });
});

// Desautorizar dispositivo atual
app.post('/api/auth/revoke-device', (req, res) => {
  const { deviceToken } = req.body || {};
  if (deviceToken && Array.isArray(db.trustedDevices)) {
    db.trustedDevices = db.trustedDevices.filter(d => d.token !== deviceToken);
    saveDatabase(db);
  }
  res.json({ success: true });
});

// Desautorizar todos os dispositivos (forçar 2FA em todos)
app.post('/api/auth/revoke-all-devices', (req, res) => {
  db.trustedDevices = [];
  saveDatabase(db);
  res.json({ success: true });
});

// Reenvio do Código 2FA
app.post('/api/auth/resend-2fa', (req, res) => {
  const clientId = getClientIdentifier(req);
  const { challengeToken } = req.body || {};

  const brute = checkBruteForce(clientId);
  if (!brute.allowed) {
    return res.status(429).json({
      error: `Aguarde ${brute.remainingSec}s antes de reenviar um novo código.`,
      lockoutSeconds: brute.remainingSec
    });
  }

  if (!challengeToken || !twoFactorChallenges.has(challengeToken)) {
    return res.status(400).json({ error: 'Desafio 2FA não encontrado. Volte para o início.' });
  }

  const newCode = Math.floor(100000 + Math.random() * 900000).toString();
  const challenge = twoFactorChallenges.get(challengeToken);
  challenge.code = newCode;
  challenge.expiresAt = Date.now() + 5 * 60 * 1000;
  challenge.attempts = 0;

  console.log(`\n=================================================`);
  console.log(`🔄 [2FA REENVIADO] NOVO CÓDIGO DE VERIFICAÇÃO: ${newCode}`);
  console.log(`=================================================\n`);

  res.json({
    success: true,
    demoCode: newCode
  });
});

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
  const { status, notes } = req.body;
  const orderIndex = db.orders.findIndex(o => o.id === req.params.id);

  if (orderIndex === -1) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  db.orders[orderIndex].status = status;
  if (notes !== undefined) {
    db.orders[orderIndex].notes = notes;
    const match = notes.match(/\[(?:RECUSADO|CANCELADO):\s*([^\]]+)\]/i);
    if (match) {
      db.orders[orderIndex].cancellationReason = match[1].trim();
    }
  }
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
