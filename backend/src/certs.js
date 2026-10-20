// HTTPS en la red local. SuperShop crea su propia autoridad certificadora (una por
// instalación, válida 10 años) y con ella firma el certificado del servidor para
// "localhost", el nombre del equipo y sus IPs de la red local. El certificado del
// servidor se renueva solo si cambia la IP o está por vencer; la autoridad no cambia,
// así que los dispositivos que ya la instalaron siguen confiando.
//
// Archivos: DATA_DIR/certs/{ca.crt, ca.key, server.crt, server.key}
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import forge from 'node-forge';
import { DATA_DIR } from './db.js';
import { lanIPv4 } from './network.js';

const { pki } = forge;

const CERT_DIR = path.join(DATA_DIR, 'certs');
const FILES = {
  caCert: path.join(CERT_DIR, 'ca.crt'),
  caKey: path.join(CERT_DIR, 'ca.key'),
  cert: path.join(CERT_DIR, 'server.crt'),
  key: path.join(CERT_DIR, 'server.key'),
};

const CA_YEARS = 10;
// Apple y los navegadores rechazan certificados de servidor de más de 398 días.
const SERVER_DAYS = 397;
const RENEW_BEFORE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function newKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey: pki.privateKeyFromPem(privateKey), publicKey: pki.publicKeyFromPem(publicKey) };
}

function serialNumber() {
  // Positivo (primer byte < 0x80) y aleatorio.
  return '01' + crypto.randomBytes(15).toString('hex');
}

function writePrivate(file, pem) {
  fs.writeFileSync(file, pem, { mode: 0o600 });
}

function loadOrCreateCA() {
  if (fs.existsSync(FILES.caCert) && fs.existsSync(FILES.caKey)) {
    try {
      return {
        cert: pki.certificateFromPem(fs.readFileSync(FILES.caCert, 'utf8')),
        key: pki.privateKeyFromPem(fs.readFileSync(FILES.caKey, 'utf8')),
      };
    } catch {
      /* archivos dañados: se crea una autoridad nueva */
    }
  }
  const keys = newKeyPair();
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serialNumber();
  cert.validity.notBefore = new Date(Date.now() - DAY_MS);
  cert.validity.notAfter = new Date(Date.now() + CA_YEARS * 365 * DAY_MS);
  const attrs = [
    { name: 'commonName', value: `SuperShop ${os.hostname()}` },
    { name: 'organizationName', value: 'SuperShop (red local)' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, pathLenConstraint: 0, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  fs.writeFileSync(FILES.caCert, pki.certificateToPem(cert));
  writePrivate(FILES.caKey, pki.privateKeyToPem(keys.privateKey));
  return { cert, key: keys.privateKey };
}

function wantedNames() {
  const host = os.hostname();
  return {
    dns: [...new Set(['localhost', host, `${host}.local`].map((n) => n.toLowerCase()))],
    ips: [...new Set(['127.0.0.1', ...lanIPv4().map((a) => a.address)])],
  };
}

function currentServerCertIsValid(ca) {
  if (!fs.existsSync(FILES.cert) || !fs.existsSync(FILES.key)) return false;
  try {
    const cert = pki.certificateFromPem(fs.readFileSync(FILES.cert, 'utf8'));
    if (!ca.cert.verify(cert)) return false;
    if (cert.validity.notAfter.getTime() - Date.now() < RENEW_BEFORE_DAYS * DAY_MS) return false;
    const san = cert.getExtension('subjectAltName');
    const have = new Set((san?.altNames || []).map((n) => (n.ip || n.value || '').toLowerCase()));
    const { dns, ips } = wantedNames();
    return [...dns, ...ips].every((n) => have.has(n));
  } catch {
    return false;
  }
}

function createServerCert(ca) {
  const keys = newKeyPair();
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serialNumber();
  cert.validity.notBefore = new Date(Date.now() - DAY_MS);
  cert.validity.notAfter = new Date(Date.now() + SERVER_DAYS * DAY_MS);
  const { dns, ips } = wantedNames();
  cert.setSubject([{ name: 'commonName', value: os.hostname() }]);
  cert.setIssuer(ca.cert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: [...dns.map((value) => ({ type: 2, value })), ...ips.map((ip) => ({ type: 7, ip }))],
    },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: ca.cert.generateSubjectKeyIdentifier().getBytes() },
  ]);
  cert.sign(ca.key, forge.md.sha256.create());
  fs.writeFileSync(FILES.cert, pki.certificateToPem(cert));
  writePrivate(FILES.key, pki.privateKeyToPem(keys.privateKey));
}

/**
 * Devuelve la llave y el certificado del servidor, creándolos o renovándolos si hace falta.
 * `changed` indica que se generó un certificado nuevo (para recargarlo en el servidor HTTPS).
 */
export function ensureCertificates() {
  if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });
  const ca = loadOrCreateCA();
  let changed = false;
  if (!currentServerCertIsValid(ca)) {
    createServerCert(ca);
    changed = true;
  }
  return {
    key: fs.readFileSync(FILES.key, 'utf8'),
    cert: fs.readFileSync(FILES.cert, 'utf8'),
    changed,
  };
}

/** Estado del servidor HTTPS local (lo actualiza index.js al arrancar). */
export const localHttps = { enabled: false, port: null };

/** Certificado público de la autoridad (lo que se instala en los dispositivos). */
export function caCertificatePem() {
  return fs.existsSync(FILES.caCert) ? fs.readFileSync(FILES.caCert, 'utf8') : null;
}
