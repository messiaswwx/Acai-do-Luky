import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🍇 ====================================================');
console.log('🍇  INICIANDO SISTEMA DE DELIVERY - AÇAÍ DO KAYKY');
console.log('🍇 ====================================================\n');

// Inicia Servidor Backend
const serverProcess = spawn('node', ['--watch', 'index.js'], {
  cwd: path.join(__dirname, 'server'),
  stdio: 'inherit',
  shell: true
});

// Inicia Cliente Vite
const clientProcess = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, 'client'),
  stdio: 'inherit',
  shell: true
});

const cleanup = () => {
  console.log('\n🛑 Encerrando sistema...');
  serverProcess.kill();
  clientProcess.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
