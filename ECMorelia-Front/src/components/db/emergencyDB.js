import Dexie from 'dexie';

export const db = new Dexie('EmergenCityDB');

db.version(1).stores({
  hojas_prehospitalarias: '&emergencyId, hospitalId, ambulanceId, version, isFinal, updatedAt'
});

export async function upsertReport(report) {
  if (!report) return null;
  const emergencyId = report.callId || report.emergencyId;
  if (!emergencyId) return null;
  return db.transaction('rw', db.hojas_prehospitalarias, async () => {
    const existing = await db.hojas_prehospitalarias.get(emergencyId);
    if (existing?.isFinal) return existing;
    if (existing && (Number(report.version) || 0) <= (Number(existing.version) || 0)) return existing;
    const entry = {
      ...report,
      emergencyId,
      callId: emergencyId,
      updatedAt: report.updatedAt || new Date().toISOString()
    };
    await db.hojas_prehospitalarias.put(entry);
    return entry;
  });
}

export async function upsertManyReports(list) {
  if (!Array.isArray(list)) return;
  for (const item of list) await upsertReport(item);
}

export async function clearEmergencyDB() {
  try { await db.hojas_prehospitalarias.clear(); } catch (_) {}
}

export async function requestPersistence() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}