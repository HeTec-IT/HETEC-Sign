// HETEC Sign Connector – Hintergrund-Script (Manifest V3 Service Worker)
//
// Zwei unabhängige Erkennungswege, weil Telekom/o2-Systeme PDFs mal als
// echten Download, mal inline direkt im Tab öffnen (siehe Fall unten):
//
// WEG A - Inline-Tab (der Normalfall bei Telekom):
//   PDF wird direkt im Tab angezeigt (URL endet oft auf .pdf, oder Server
//   schickt Content-Type: application/pdf ohne "als Anhang herunterladen").
//   Wird per webRequest erkannt, sobald die Haupt-Navigation abgeschlossen ist.
//   Der PDF-Tab wird danach selbst zu HETEC Sign umgebaut (keine neuen Tabs).
//
// WEG B - Echter Download:
//   Falls doch ein Download ausgelöst wird (z.B. durch die Edge-Einstellung
//   "PDF-Dateien immer herunterladen" bei anderen Systemen). Wird über die
//   downloads-API erkannt, öffnet HETEC Sign in einem (neuen oder
//   vorhandenen) Tab.
//
// Beide Wege holen die PDF-Bytes über fetch() erneut ab (nutzt die
// bestehende Anmeldesitzung/Cookies) und übergeben sie an dieselbe
// __hetecSignIngestFile-Brücke in der PWA - HETEC Sign entscheidet selbst,
// ob es sich um einen Vertrag handelt.

const PWA_URL = 'https://hetec-it.github.io/HETEC-Sign/pc-app.html';
const recentlyHandled = new Map(); // url -> Zeitstempel, verhindert Doppelverarbeitung

function alreadyHandled(url) {
  const now = Date.now();
  for (const [u, t] of recentlyHandled) {
    if (now - t > 15000) recentlyHandled.delete(u);
  }
  if (recentlyHandled.has(url)) return true;
  recentlyHandled.set(url, now);
  return false;
}

// ---------- Weg A: Inline-PDF-Tab ----------
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.type !== 'main_frame' || details.tabId < 0) return;
    const headers = details.responseHeaders || [];
    const ct = headers.find((h) => h.name.toLowerCase() === 'content-type');
    const isPdf =
      (ct && ct.value && ct.value.toLowerCase().indexOf('application/pdf') !== -1) ||
      /\.pdf(\?|#|$)/i.test(details.url);
    if (!isPdf) return;
    if (alreadyHandled(details.url)) return;
    handlePdf(details.url, details.tabId);
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// ---------- Weg B: echter Download ----------
chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state || delta.state.current !== 'complete') return;
  try {
    const items = await chrome.downloads.search({ id: delta.id });
    const item = items && items[0];
    if (!item) return;
    const isPdf = item.mime === 'application/pdf' || /\.pdf$/i.test(item.filename || '');
    if (!isPdf) return;
    if (alreadyHandled(item.url)) return;
    handlePdf(item.url, null, item.filename);
  } catch (e) {
    console.error('HETEC Sign Connector Fehler (Download):', e);
  }
});

// ---------- Gemeinsame Logik ----------
async function handlePdf(url, sourceTabId, knownFilename) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Abruf fehlgeschlagen: ' + resp.status);
    const buffer = await resp.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const filename = knownFilename ? knownFilename.split(/[\\/]/).pop() : guessFilename(url);

    const tabId = await getTargetTab(sourceTabId);

    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (b64, fname) => {
        if (window.__hetecSignIngestFile) window.__hetecSignIngestFile(b64, fname);
      },
      args: [base64, filename],
    });

    notify('PDF an HETEC Sign übergeben', filename);
  } catch (e) {
    console.error('HETEC Sign Connector Fehler:', e);
    notify('HETEC Sign Connector: Fehler', String(e && e.message ? e.message : e));
  }
}

// Baut - wenn möglich - den Quelltab (z.B. den PDF-Tab) direkt zu HETEC Sign
// um, statt einen zusätzlichen Tab zu öffnen. Nur wenn kein Quelltab bekannt
// ist (Download-Weg ohne Tab-Bezug), wird ein vorhandener HETEC-Sign-Tab
// gesucht oder neu geöffnet.
async function getTargetTab(sourceTabId) {
  if (sourceTabId != null) {
    try {
      const tab = await chrome.tabs.get(sourceTabId);
      if (tab.url && tab.url.indexOf(PWA_URL) === 0) return sourceTabId;
      await chrome.tabs.update(sourceTabId, { url: PWA_URL, active: true });
      await waitForTabComplete(sourceTabId);
      return sourceTabId;
    } catch (e) {
      // Quelltab existiert nicht mehr o.ä. - auf Suche/Neu-öffnen ausweichen
    }
  }
  const [existing] = await chrome.tabs.query({ url: PWA_URL + '*' });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    return existing.id;
  }
  const created = await chrome.tabs.create({ url: PWA_URL, active: true });
  await waitForTabComplete(created.id);
  return created.id;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    // Sicherheitsnetz, falls das Event mal ausbleibt
    setTimeout(resolve, 8000);
  });
}

function guessFilename(urlStr) {
  try {
    const u = new URL(urlStr);
    const nameParam = u.searchParams.get('NAME') || u.searchParams.get('name');
    if (nameParam) {
      const decoded = decodeURIComponent(nameParam);
      const parts = decoded.split('_');
      const last = parts[parts.length - 1];
      if (last) return last;
    }
    const lastSeg = u.pathname.split('/').pop();
    if (lastSeg && /\.pdf$/i.test(lastSeg)) return lastSeg;
  } catch (e) {}
  return 'vertrag.pdf';
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon-128.png',
      title,
      message: message || '',
    });
  } catch (e) {}
}
