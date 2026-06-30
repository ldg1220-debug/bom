import Dexie from 'dexie';

export const db = new Dexie('BOMBuilderDB');

db.version(1).stores({
  // id는 UUID, name/createdAt은 인덱스 (검색용)
  projects: 'id, name, createdAt',
});

db.version(2).stores({
  projects: 'id, name, createdAt',
  // id: `${projectId}::<dateKey 또는 manual-<ts>>` — 프로젝트당 일자별 세이브 포인트
  versions: 'id, projectId, dateKey, createdAt',
});

// 세이브 포인트 보관 기간 (48시간 경과 시 자동 삭제)
export const CHECKPOINT_RETENTION_MS = 48 * 60 * 60 * 1000;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toPersistable(state) {
  const { bomRows, circularWarnings, purchaseUnits, ...persistable } = state;
  return {
    ...persistable,
    purchaseUnits: [...(purchaseUnits || [])], // Set → Array for IndexedDB serialization
  };
}

/**
 * 프로젝트 저장 (신규 또는 업데이트).
 * bomRows와 circularWarnings는 유도값이므로 저장하지 않음.
 */
export async function saveProject(state) {
  const persistable = toPersistable(state);
  await db.projects.put({
    id: state.project.id,
    ...persistable,
    project: {
      ...persistable.project,
      updatedAt: new Date().toISOString(),
    },
  });
}

/** id로 프로젝트 불러오기 */
export async function loadProject(id) {
  return db.projects.get(id);
}

/** 모든 프로젝트 목록 (최신 순) */
export async function listProjects() {
  const all = await db.projects.toArray();
  return all.sort((a, b) => {
    const da = a.project?.updatedAt || a.project?.createdAt || '';
    const db2 = b.project?.updatedAt || b.project?.createdAt || '';
    return db2.localeCompare(da);
  });
}

/** 프로젝트 삭제 */
export async function deleteProject(id) {
  return db.projects.delete(id);
}

/**
 * 오늘자 세이브 포인트가 아직 없으면, 현재 저장소에 있는(=오늘 수정이 반영되기 전) 상태를
 * 세이브 포인트로 보관한다. 자동저장 직전에 호출되어야 "오늘 시작 시점" 상태를 보존할 수 있음.
 * 동시에 만료된(48시간 경과) 세이브 포인트를 정리한다.
 */
export async function ensureDailyCheckpoint(projectId) {
  const dateKey = todayKey();
  const id = `${projectId}::${dateKey}`;
  const exists = await db.versions.get(id);
  if (!exists) {
    const current = await db.projects.get(projectId);
    if (current) {
      await db.versions.put({
        id,
        projectId,
        dateKey,
        createdAt: new Date().toISOString(),
        manual: false,
        snapshot: current,
      });
    }
  }
  await pruneExpiredCheckpoints(projectId);
}

/** 복원 직전, 지금 화면에 있는 상태를 별도 백업 세이브 포인트로 남긴다 (복원도 되돌릴 수 있도록). */
export async function saveManualCheckpoint(state, label) {
  const persistable = toPersistable(state);
  const id = `${state.project.id}::manual-${Date.now()}`;
  await db.versions.put({
    id,
    projectId: state.project.id,
    dateKey: todayKey(),
    createdAt: new Date().toISOString(),
    manual: true,
    label: label || '복원 전 백업',
    snapshot: {
      id: state.project.id,
      ...persistable,
      project: { ...persistable.project, updatedAt: new Date().toISOString() },
    },
  });
}

/** 만료된(보관기간 경과) 세이브 포인트 삭제 */
export async function pruneExpiredCheckpoints(projectId) {
  const cutoff = Date.now() - CHECKPOINT_RETENTION_MS;
  const all = await db.versions.where('projectId').equals(projectId).toArray();
  const expired = all.filter((v) => new Date(v.createdAt).getTime() < cutoff);
  if (expired.length) await db.versions.bulkDelete(expired.map((v) => v.id));
}

/** 프로젝트의 세이브 포인트 목록 (최신 순) */
export async function listCheckpoints(projectId) {
  const all = await db.versions.where('projectId').equals(projectId).toArray();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
