/**
 * LPCash — Firebase Sync Layer
 * Sincroniza las 5 claves de localStorage con Firestore.
 * Estrategia: last-write-wins por clave, con campo `_updatedAt` como desempate.
 *
 * Uso en cada página:
 *   <script src="firebase-sync.js"></script>
 *   Al cargar: await LPSync.pull()   → trae Firestore → localStorage si es más nuevo
 *   Al guardar: LPSync.push(key, data) → escribe localStorage + Firestore en paralelo
 */

import { initializeApp }     from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyAB7JtnIUPpenmeSvmbXB3coLMcrv59Gsc",
  authDomain:        "lpcash-2a547.firebaseapp.com",
  projectId:         "lpcash-2a547",
  storageBucket:     "lpcash-2a547.firebasestorage.app",
  messagingSenderId: "283983626636",
  appId:             "1:283983626636:web:775a3d0df7e89f9b4696a9",
  measurementId:     "G-B36DEVZ6TS"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// Las 5 claves que sincronizamos
export const SYNC_KEYS = [
  'lp_movs_v3',
  'lp_imports_v3',
  'lp_rules_v3',
  'lp_deuda_v1',
  'lp_ingresos_v1'
];

// Defaults por si no hay nada
const DEFAULTS = {
  lp_movs_v3:     '{}',
  lp_imports_v3:  '[]',
  lp_rules_v3:    '[]',
  lp_deuda_v1:    '[]',
  lp_ingresos_v1: '{}'
};

const COL = 'lpcash_data';  // Colección Firestore
const DOC = 'main';         // Documento único (mono-usuario)

/**
 * Lee la marca de tiempo local guardada junto a los datos.
 */
function getLocalTs(key) {
  try {
    const raw = localStorage.getItem(`${key}__ts`);
    return raw ? parseInt(raw, 10) : 0;
  } catch { return 0; }
}

/**
 * Guarda datos en localStorage junto con su timestamp.
 */
function saveLocal(key, value, ts) {
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  localStorage.setItem(`${key}__ts`, String(ts));
}

/**
 * pull() — trae todos los datos de Firestore y actualiza localStorage
 * solo si Firestore tiene datos más recientes.
 * Llama a esto al inicio de cada página (window.onload o similar).
 */
async function pull() {
  try {
    const snap = await getDoc(doc(db, COL, DOC));
    if (!snap.exists()) return; // Primera vez: no hay nada en Firestore
    const remote = snap.data();
    for (const key of SYNC_KEYS) {
      const remoteTs  = remote[`${key}__ts`] || 0;
      const localTs   = getLocalTs(key);
      if (remoteTs > localTs) {
        const remoteVal = remote[key];
        // Firestore almacena el JSON como string
        saveLocal(key, remoteVal, remoteTs);
        console.log(`[LPSync] pull ✓ ${key} (remoto ${remoteTs} > local ${localTs})`);
      }
    }
  } catch (e) {
    console.warn('[LPSync] pull falló (¿sin conexión?):', e.message);
  }
}

/**
 * push(key, data) — guarda en localStorage y lanza escritura a Firestore.
 * Es no bloqueante: no hay que await si no interesa esperar la confirmación.
 *
 * @param {string} key   — clave localStorage (p.ej. 'lp_movs_v3')
 * @param {*}      data  — objeto/array a guardar (se serializa a JSON)
 */
async function push(key, data) {
  const ts  = Date.now();
  const str = typeof data === 'string' ? data : JSON.stringify(data);

  // 1. Escribe local inmediatamente (igual que antes)
  saveLocal(key, str, ts);

  // 2. Escribe a Firestore en paralelo (fire-and-forget)
  try {
    await setDoc(doc(db, COL, DOC), {
      [key]:           str,
      [`${key}__ts`]:  ts
    }, { merge: true });
    console.log(`[LPSync] push ✓ ${key}`);
  } catch (e) {
    console.warn(`[LPSync] push falló para ${key} (¿sin conexión?):`, e.message);
    // Los datos ya están en localStorage; se reintentará en el próximo pull
  }
}

/**
 * pushAll() — sube todo el localStorage a Firestore de una vez.
 * Útil para la migración inicial desde un dispositivo ya con datos.
 */
async function pushAll() {
  const payload = {};
  const ts = Date.now();
  for (const key of SYNC_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) {
      payload[key]           = raw;
      payload[`${key}__ts`]  = ts;
      localStorage.setItem(`${key}__ts`, String(ts));
    }
  }
  try {
    await setDoc(doc(db, COL, DOC), payload, { merge: true });
    console.log('[LPSync] pushAll ✓ — todos los datos subidos a Firestore');
    return true;
  } catch (e) {
    console.warn('[LPSync] pushAll falló:', e.message);
    return false;
  }
}

export const LPSync = { pull, push, pushAll, SYNC_KEYS };
window.LPSync = LPSync; // También disponible globalmente por si se usa sin import
