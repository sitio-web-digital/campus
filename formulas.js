// Fórmulas de campos calculados de la carga diaria.
// Una fórmula es una expresión aritmética con variables entre llaves, números, + - * / y paréntesis.
// Se guarda con ids de campo ({5} + {7} * 2) para sobrevivir a renombres; el admin la escribe y la ve con
// etiquetas ({Seguimientos} + {Presupuestos enviados}). No usa eval: tokenizador + parser propio.

function tokenizar(expr) {
  const out = [];
  let i = 0;
  const s = String(expr || '');
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '{') {
      const j = s.indexOf('}', i);
      if (j < 0) throw new Error('Falta cerrar una llave "}"');
      const nombre = s.slice(i + 1, j).trim();
      if (!nombre) throw new Error('Hay una variable vacía "{}"');
      out.push({ t: 'var', v: nombre, pos: i });
      i = j + 1; continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = s.slice(i).match(/^\d*\.?\d+|^\d+\.?\d*/);
      if (!m || isNaN(Number(m[0]))) throw new Error(`Número inválido cerca de "${s.slice(i, i + 6)}"`);
      out.push({ t: 'num', v: Number(m[0]), pos: i });
      i += m[0].length; continue;
    }
    if ('+-*/'.includes(ch)) { out.push({ t: 'op', v: ch, pos: i }); i++; continue; }
    if (ch === '(' || ch === ')') { out.push({ t: ch, pos: i }); i++; continue; }
    throw new Error(`Carácter no permitido: "${ch}"`);
  }
  return out;
}

// Parser recursivo → árbol { t:'num'|'var'|'bin'|'neg', ... }
function parsear(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  function expr() {
    let n = term();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) { const op = next().v; n = { t: 'bin', op, a: n, b: term() }; }
    return n;
  }
  function term() {
    let n = factor();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) { const op = next().v; n = { t: 'bin', op, a: n, b: factor() }; }
    return n;
  }
  function factor() {
    const tk = next();
    if (!tk) throw new Error('La fórmula termina de golpe: falta un valor');
    if (tk.t === 'num') return tk;
    if (tk.t === 'var') return tk;
    if (tk.t === 'op' && tk.v === '-') return { t: 'neg', a: factor() };
    if (tk.t === '(') {
      const n = expr();
      const c = next();
      if (!c || c.t !== ')') throw new Error('Falta cerrar un paréntesis ")"');
      return n;
    }
    if (tk.t === ')') throw new Error('Hay un paréntesis ")" de más');
    throw new Error(`Falta un valor antes de "${tk.v}"`);
  }
  if (!tokens.length) throw new Error('La fórmula está vacía');
  const ast = expr();
  if (p < tokens.length) { const tk = tokens[p]; throw new Error(tk.t === ')' ? 'Hay un paréntesis ")" de más' : `Sobra "${tk.v != null ? tk.v : tk.t}" al final`); }
  return ast;
}

function compilar(expr) {
  const ast = parsear(tokenizar(expr));
  const vars = [];
  (function walk(n) {
    if (!n) return;
    if (n.t === 'var') { if (!vars.includes(n.v)) vars.push(n.v); }
    walk(n.a); walk(n.b);
  })(ast);
  return { ast, vars };
}

function evaluar(ast, resolver) {
  switch (ast.t) {
    case 'num': return ast.v;
    case 'var': return Number(resolver(ast.v)) || 0;
    case 'neg': return -evaluar(ast.a, resolver);
    case 'bin': {
      const a = evaluar(ast.a, resolver), b = evaluar(ast.b, resolver);
      if (ast.op === '+') return a + b;
      if (ast.op === '-') return a - b;
      if (ast.op === '*') return a * b;
      return b === 0 ? 0 : a / b; // división por cero → 0 (un día sin datos no rompe la tabla)
    }
    default: return 0;
  }
}

// Fórmula guardada (string JSON en panel_campos.formula) → expresión con ids. Tolera el formato 2.27.0 (suma de ids).
function exprGuardada(formula) {
  if (!formula) return null;
  try {
    const f = JSON.parse(formula);
    if (f && typeof f.expr === 'string') return f.expr;
    if (f && Array.isArray(f.campos)) return f.campos.map((id) => `{${id}}`).join(' + ');
  } catch {}
  return null;
}

// Etiquetas ↔ ids. Las etiquetas se comparan sin distinguir mayúsculas ni espacios extra.
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

function labelsAIds(exprConLabels, campos) {
  const { vars } = compilar(exprConLabels); // valida sintaxis; lanza Error con mensaje en español
  const mapa = new Map(campos.map((c) => [norm(c.label), c.id]));
  let out = String(exprConLabels);
  for (const v of vars) {
    const id = mapa.get(norm(v));
    if (id == null) throw new Error(`No existe el campo "${v}"`);
    out = out.split('{' + v + '}').join('{' + id + '}');
  }
  return out;
}

function idsALabels(exprConIds, campos) {
  const porId = new Map(campos.map((c) => [String(c.id), c.label]));
  return String(exprConIds || '').replace(/\{([^}]*)\}/g, (m, id) => `{${porId.get(String(id).trim()) || '?'}}`);
}

function idsEn(exprConIds) {
  try { return compilar(exprConIds).vars.map((v) => parseInt(v, 10)).filter((n) => Number.isFinite(n)); } catch { return []; }
}

// ¿Asignar `expr` al campo `campoId` generaría un ciclo (se referencia a sí mismo directa o indirectamente)?
function generaCiclo(campoId, expr, campos) {
  const porId = new Map(campos.map((c) => [c.id, c]));
  const visto = new Set();
  const stack = [...idsEn(expr)];
  while (stack.length) {
    const id = stack.pop();
    if (id === campoId) return true;
    if (visto.has(id)) continue;
    visto.add(id);
    const c = porId.get(id);
    const e = c && exprGuardada(c.formula);
    if (e) stack.push(...idsEn(e));
  }
  return false;
}

// Resuelve los campos calculados sobre los valores de un día (objeto { c<id>: n }). Devuelve el mismo objeto.
// Los calculados pueden usar otros calculados; un ciclo o una referencia rota vale 0.
function resolverCalculados(campos, v) {
  const porId = new Map(campos.map((c) => [c.id, c]));
  const memo = new Map();
  const val = (id, pila) => {
    if (memo.has(id)) return memo.get(id);
    const c = porId.get(id);
    if (!c) return 0;
    if (!c.formula) return Number(v['c' + id]) || 0;
    if (pila.has(id)) return 0;
    pila.add(id);
    let r = 0;
    try { const e = exprGuardada(c.formula); if (e) r = evaluar(compilar(e).ast, (vid) => val(parseInt(vid, 10), pila)); } catch { r = 0; }
    pila.delete(id);
    if (!Number.isFinite(r)) r = 0;
    r = Math.round(r * 100) / 100;
    memo.set(id, r);
    return r;
  };
  for (const c of campos) if (c.formula) v['c' + c.id] = val(c.id, new Set());
  return v;
}

module.exports = { tokenizar, parsear, compilar, evaluar, exprGuardada, labelsAIds, idsALabels, idsEn, generaCiclo, resolverCalculados };
