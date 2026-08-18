import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import ExcelJS from 'exceljs';
import { SecurityManager } from '../lib/security.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await loadEnv(path.join(ROOT, '.env'));
const DATA_DIR = path.resolve(process.env.KELLER_DATA_DIR || path.join(ROOT, 'data'));
const STATE_FILE = path.join(DATA_DIR, 'app-state.json');
const security = new SecurityManager({
  dataDirectory: DATA_DIR,
  sessionSecret: process.env.AUTH_SESSION_SECRET,
  encryptionKey: process.env.AUTH_ENCRYPTION_KEY,
  secureCookies: false
});
await security.init();

const emptyState = () => ({
  version: 1,
  terms: [{ id: 'term-principal', name: 'Advogado Monitorado', registration: 'OAB/UF 000000', active: true, primary: true }],
  sources: [], intimations: [], tasks: [], processes: [], agenda: [], contacts: [], audit: [],
  configuration: {}, settings: { demoMode: false, calendarConfigured: true, collectorConfigured: false, dismissedBanner: false }
});

const mode = process.argv[2];
const state = await readState();
ensureShape(state);

if (mode === '--status') {
  console.log(JSON.stringify({
    contacts: state.contacts.length,
    processes: state.processes.length,
    tasks: state.tasks.length,
    agenda: state.agenda.length,
    configuration: Object.fromEntries(Object.entries(state.configuration).map(([key, entry]) => [key, Array.isArray(entry) ? entry.length : 0]))
  }));
} else if (mode === '--config-stdin') {
  const line = await readOneLine();
  const configuration = JSON.parse(line);
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw new Error('Configuração inválida.');
  const count = Object.values(configuration).reduce((sum, entry) => sum + (Array.isArray(entry) ? entry.length : 0), 0);
  if (count > 5_000) throw new Error('Configuração excede o limite seguro.');
  state.configuration = configuration;
  for (const term of configuration.monitoredTerms || []) {
    const registration = asText(term.registration);
    upsert(state.terms, { id: makeId('term', registration || term.name), active: true, ...term }, 'registration');
  }
  for (const product of configuration.sourceProducts || []) {
    upsert(state.sources, {
      id: makeId('advbox-source', product.name), name: product.name, short: asText(product.name).slice(0, 3).toUpperCase(), method: product.channel || 'DJEN',
      status: product.status, lastCheck: null, detail: product.status === 'ok' ? 'Painel eletrônico monitorado na ADVBOX' : 'Reconexão A1 ou credenciais necessária na origem'
    });
  }
  state.audit.unshift(audit('Configurações ADVBOX importadas', `${count} itens de configuração consolidados.`, 'Importador local'));
  await saveState(state);
  console.log(JSON.stringify({ ok: true, configurationItems: count }));
} else {
  const files = process.argv.slice(2).map(entry => path.resolve(entry));
  if (files.length !== 3 || files.some(file => !existsSync(file))) throw new Error('Informe os três arquivos XLSX exportados pela ADVBOX.');
  state.contacts = state.contacts.filter(item => item.source !== 'Relatório ADVBOX');
  state.processes = state.processes.filter(item => item.source !== 'Relatório ADVBOX');
  state.tasks = state.tasks.filter(item => item.source !== 'Relatório ADVBOX');
  state.agenda = state.agenda.filter(item => item.source !== 'ADVBOX' || !String(item.externalId || '').startsWith('agenda:advbox-activity-'));
  const counters = { contacts: 0, processes: 0, tasks: 0, agenda: 0 };
  for (const file of files) {
    const rows = await readWorkbook(file);
    const headers = new Set(Object.keys(rows[0] || {}));
    if (headers.has('CPF/CNPJ') && headers.has('Nome')) importContacts(rows, state, counters);
    else if (headers.has('Número do processo') && headers.has('Nome do cliente')) importProcesses(rows, state, counters);
    else if (headers.has('Compromisso') && headers.has('Prioridade')) importActivities(rows, state, counters);
    else throw new Error(`Relatório não reconhecido: ${path.basename(file)}`);
  }
  state.settings.demoMode = false;
  state.audit.unshift(audit('Relatórios ADVBOX importados', `${counters.contacts} contatos, ${counters.processes} processos e ${counters.tasks} atividades consolidados.`, 'Importador local'));
  await saveState(state);
  console.log(JSON.stringify({ ok: true, ...counters }));
}

async function loadEnv(file) {
  if (!existsSync(file)) throw new Error('Arquivo .env não encontrado. Inicie o servidor uma vez para gerar os segredos locais.');
  const source = await readFile(file, 'utf8');
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const split = line.indexOf('='); if (split < 1) continue;
    const key = line.slice(0, split).trim(); let entry = line.slice(split + 1).trim();
    if ((entry.startsWith('"') && entry.endsWith('"')) || (entry.startsWith("'") && entry.endsWith("'"))) entry = entry.slice(1, -1);
    if (!(key in process.env)) process.env[key] = entry;
  }
}

async function readState() {
  try {
    const envelope = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    return JSON.parse(security.decrypt(envelope.encrypted));
  } catch (error) {
    if (existsSync(STATE_FILE)) throw new Error('O estado criptografado existente não pôde ser aberto; a importação foi cancelada para evitar perda de dados.', { cause: error });
    return emptyState();
  }
}

function ensureShape(value) {
  for (const key of ['terms', 'sources', 'intimations', 'tasks', 'processes', 'agenda', 'contacts', 'audit']) if (!Array.isArray(value[key])) value[key] = [];
  value.configuration ||= {};
  value.settings = { ...emptyState().settings, ...(value.settings || {}) };
  if (!value.terms.some(term => term.registration === 'OAB/UF 000000')) value.terms.unshift(emptyState().terms[0]);
}

async function saveState(value) {
  await mkdir(DATA_DIR, { recursive: true });
  const envelope = { version: 1, algorithm: 'aes-256-gcm', revision: randomBytes(18).toString('base64url'), encrypted: security.encrypt(JSON.stringify(value)), updatedAt: new Date().toISOString() };
  await writeFile(STATE_FILE, JSON.stringify(envelope, null, 2), { encoding: 'utf8', mode: 0o600 });
}

async function readOneLine() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of rl) { rl.close(); return line; }
  throw new Error('Nenhuma configuração recebida.');
}

async function readWorkbook(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets[0];
  const headers = sheet.getRow(1).values.slice(1).map(asText);
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = {};
    headers.forEach((header, index) => { item[header] = cellValue(row.getCell(index + 1).value); });
    if (Object.values(item).some(entry => entry !== '')) rows.push(item);
  });
  return rows;
}

function cellValue(input) {
  if (input == null) return '';
  if (input instanceof Date) return input.toISOString();
  if (typeof input === 'object') {
    if ('result' in input) return cellValue(input.result);
    if ('text' in input) return asText(input.text);
    if (Array.isArray(input.richText)) return input.richText.map(part => part.text || '').join('');
  }
  return typeof input === 'number' ? input : asText(input);
}
function asText(input) { return String(input ?? '').trim(); }
function iso(input) {
  if (!input) return '';
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
  const match = asText(input).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}
function makeId(prefix, seed) { return `${prefix}-${createHash('sha256').update(asText(seed)).digest('hex').slice(0, 18)}`; }
function upsert(list, item, key = 'externalId') {
  const found = list.findIndex(existing => existing[key] === item[key]);
  if (found >= 0) list[found] = { ...list[found], ...item }; else list.unshift(item);
}
function audit(action, detail, actor) { return { id: makeId('audit', `${Date.now()}:${action}`), at: new Date().toISOString(), action, detail, actor }; }

function importContacts(rows, target, counters) {
  for (const row of rows) {
    const seed = row['CPF/CNPJ'] || `${row.Nome}:${row['E-mail']}:${row.Celular}`;
    const record = {
      id: makeId('contact', seed), externalId: makeId('advbox-contact', seed), name: asText(row.Nome), document: asText(row['CPF/CNPJ']), rg: asText(row.RG),
      birthDate: iso(row['Data de nascimento']), maritalStatus: asText(row['Estado Civil']), pisPasep: asText(row['PIS/PASEP']), ctps: asText(row.CTPS), cid: asText(row.CID), profession: asText(row['Profissão']), gender: asText(row.Sexo),
      mobile: asText(row.Celular), phone: asText(row.Telefone), email: asText(row['E-mail']), country: asText(row['País']), state: asText(row.Estado), city: asText(row.Cidade), address: asText(row['Endereço']), district: asText(row.Bairro), zip: asText(row.CEP), motherName: asText(row['Nome da mãe']), origin: asText(row.Origem), notes: asText(row['Anotações Gerais']), registeredAt: iso(row['Data de cadastro']), source: 'Relatório ADVBOX'
    };
    upsert(target.contacts, record); counters.contacts++;
  }
}

function importProcesses(rows, target, counters) {
  for (const row of rows) {
    const number = asText(row['Número do processo']); const seed = number || `${row['Nome do cliente']}:${row['Pasta/Caso']}:${row['Número do protocolo']}`;
    const record = {
      id: makeId('process', seed), externalId: makeId('advbox-process', seed), number, client: asText(row['Nome do cliente']), opposingParty: asText(row['Parte contrária']), actionGroup: asText(row['Grupo de ação']), actionType: asText(row['Tipo de ação']), judicialPhase: asText(row['Fase judicial']), stage: asText(row.Etapa), protocol: asText(row['Número do protocolo']), originalProcess: asText(row['Processo originário']), caseFolder: asText(row['Pasta/Caso']), year: asText(row.Ano), filingDate: iso(row['Data do requerimento']), segment: asText(row.Segmento), county: asText(row.Comarca), courtUnit: asText(row.Vara), court: asText(row.Tribunal), closedAt: iso(row['Data do fechamento']), finalJudgmentAt: iso(row['Data do trânsito em julgado']), archivedAt: iso(row['Data do arquivamento']), result: asText(row['Resultado do processo']), claimValue: row['Expectativa/Valor da causa (R$)'] || '', feesValue: row['Valor dos honorários (R$)'] || '', feesPercent: row['Honorários (%)'] || '', contingency: asText(row.Contingenciamento), responsible: asText(row['Responsável']), lastMovement: asText(row['Último andamento']) || 'Importado do relatório ADVBOX', lastMovementAt: iso(row['Data de cadastro']), notes: asText(row['Anotações Gerais']), registeredAt: iso(row['Data de cadastro']), secrecy: false, monitoring: 'active', source: 'Relatório ADVBOX'
    };
    upsert(target.processes, record, number ? 'number' : 'externalId'); counters.processes++;
  }
}

function importActivities(rows, target, counters) {
  for (const [rowIndex, row] of rows.entries()) {
    const seed = `${rowIndex + 2}:${row.Data}:${row.Hora}:${row.Compromisso}:${row['Processo (CNJ)']}:${row.Destinatário}`;
    const externalId = makeId('advbox-activity', seed); const completedAt = iso(row['Data Conclusão']);
    const task = {
      id: makeId('task', seed), externalId, title: asText(row.Compromisso) || 'Atividade ADVBOX', description: asText(row['Observações']), status: completedAt ? 'concluida' : 'triagem', source: 'Relatório ADVBOX', priority: normalizePriority(row.Prioridade), responsible: asText(row.Destinatário) || 'Equipe', responsibles: asText(row.Destinatário).split(/[,;]/).map(item => item.trim()).filter(Boolean), client: asText(row.Partes), process: asText(row['Processo (CNJ)']), protocol: asText(row.Protocolo), actionType: asText(row['Tipo de ação']), sender: asText(row.Remetente), date: iso(row.Data), time: parseTime(row.Hora), endDate: iso(row['Término']), endTime: parseTime(row['Hora Término']), deadline: iso(row.Data), fatalDeadline: iso(row['Prazo fatal']), points: Number(row['Pontuação']) || 0, location: asText(row.Local), completedAt, createdAt: new Date().toISOString(), history: [{ at: new Date().toISOString(), action: 'Importada da ADVBOX', actor: 'Importador local' }]
    };
    upsert(target.tasks, task); counters.tasks++;
    if (task.date) {
      upsert(target.agenda, { id: makeId('agenda', seed), externalId: `agenda:${externalId}`, title: task.title, date: task.date, time: task.time, source: 'ADVBOX', client: task.client, process: task.process, description: task.description });
      counters.agenda++;
    }
  }
}
function parseTime(input) { const match = asText(input).match(/(\d{1,2}):(\d{2})/); return match ? `${match[1].padStart(2, '0')}:${match[2]}` : ''; }
function normalizePriority(input) { const entry = asText(input).toLowerCase(); return /urgent|alta/.test(entry) ? 'urgente' : /importante|m[eé]dia/.test(entry) ? 'importante' : 'normal'; }
