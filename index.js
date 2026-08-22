// HETEC Sign – Cloud Functions
//
// Das ist die EINZIGE Server-Code-Komponente im gesamten Projekt.
// Alles andere (Session anlegen, claimen, abschließen, Bereinigung nach
// Drucken/E-Mail) läuft direkt vom Client über die Firestore/Storage-Rules.
//
// Diese Funktion ist ein reines Sicherheitsnetz: falls eine Sitzung abgebrochen
// wird (Tab geschlossen, Tablet-Akku leer, Netzwerkfehler bei der Client-
// Löschung), sorgt sie dafür, dass spätestens nach Ablauf von expiresAt
// wirklich nichts liegen bleibt – unabhängig vom Client-Verhalten.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

initializeApp();

exports.cleanupExpiredSessions = onSchedule(
  { schedule: 'every 10 minutes', region: 'europe-west1' },
  async () => {
    const db = getFirestore();
    const bucket = getStorage().bucket();
    const now = Date.now();

    const snap = await db.collection('sessions').where('expiresAt', '<=', now).get();
    if (snap.empty) return;

    const jobs = [];
    snap.forEach((docSnap) => {
      const id = docSnap.id;
      jobs.push(bucket.file(`sessions/${id}/original.enc`).delete().catch(() => {}));
      jobs.push(bucket.file(`sessions/${id}/result.enc`).delete().catch(() => {}));
      jobs.push(docSnap.ref.delete());
    });

    await Promise.all(jobs);
    console.log(`HETEC Sign Cleanup: ${snap.size} abgelaufene Sitzung(en) entfernt.`);
  }
);
