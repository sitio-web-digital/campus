// Alta de vendedores (14/8/2026). Idempotente: si el email ya existe, lo saltea.
// Ejecutar en el server: docker compose exec panel node crear-vendedores.js
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const PASSWORD = 'campus123';
const PERMISOS = JSON.stringify(['cfd', 'gondolas', 'estanterias', 'cobranza']);
const nuevos = [
  ['Mateo Gabriel', 'mateogabriel7468@gmail.com'],
  ['Ana Delicia Fernández', 'anadeliciafernandez1@gmail.com'],
  ['Celina Nuñez Carabajal', 'celinanunezcarabajal25@gmail.com'],
  ['Jeremías Bulacio', 'jeremiasbulacio@gmail.com'],
  ['Romina López', 'rominalpz14@gmail.com'],
  ['Leandro Ulrich', 'leandroulrich9@gmail.com'],
];

const hash = bcrypt.hashSync(PASSWORD, 10);
const ins = db.prepare("INSERT INTO users (name, email, password_hash, role, permisos) VALUES (?, ?, ?, 'vendedor', ?)");
for (const [name, email] of nuevos) {
  const existe = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existe) { console.log('YA EXISTE (sin cambios):', email); continue; }
  ins.run(name, email.toLowerCase(), hash, PERMISOS);
  console.log('CREADO:', name, '<' + email + '>');
}
console.log('Listo. Clave inicial para todos:', PASSWORD, '— que la cambien en Perfil.');
