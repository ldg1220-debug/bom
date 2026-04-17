import Dexie from 'dexie';

export const db = new Dexie('BOMBuilderDB');

db.version(1).stores({
  // id는 UUID, name/createdAt은 인덱스 (검색용)
  projects: 'id, name, createdAt',
});

/**
 * 프로젝트 저장 (신규 또는 업데이트).
 * bomRows와 circularWarnings는 유도값이므로 저장하지 않음.
 */
export async function saveProject(state) {
  const { bomRows, circularWarnings, ...persistable } = state;
  await db.projects.put({
    id: state.project.id,       // Dexie 키 경로: 최상위 id 필수
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
