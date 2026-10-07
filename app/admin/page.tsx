'use client';
import { useEffect, useState } from 'react';
import Mail, { MailData } from '@/components/Mail';
import { api } from '@/lib/client';
type Row = Record<string, unknown>;
type Field = { key: string; label: string; type?: string; options?: string[] };
const eventFields: Field[] = [
  { key: 'title', label: '대회명' },
  { key: 'description', label: '설명', type: 'textarea' },
  { key: 'startsAt', label: '참가 시작 (한국시간)', type: 'datetime-local' },
  { key: 'endsAt', label: '참가 종료 (한국시간)', type: 'datetime-local' },
  { key: 'durationSeconds', label: '개인 제한시간 (초)', type: 'number' },
  { key: 'correctPoints', label: '정답 점수', type: 'number' },
  { key: 'wrongPoints', label: '오답 점수', type: 'number' },
  { key: 'easyRatio', label: 'EASY 비율 (%)', type: 'number' },
  { key: 'normalRatio', label: 'NORMAL 비율 (%)', type: 'number' },
  { key: 'hardRatio', label: 'HARD 비율 (%)', type: 'number' },
  { key: 'legitimateRatio', label: '정상메일 비율 (%)', type: 'number' },
  { key: 'maxAttempts', label: '최대 참가횟수', type: 'number' },
  { key: 'retentionDays', label: '종료 후 보유기간 (일)', type: 'number' },
  { key: 'departments', label: '부서 목록 (한 줄에 하나)', type: 'lines' },
  { key: 'allowCustomDepartment', label: '부서 직접 입력 허용', type: 'checkbox' },
  { key: 'active', label: '활성화', type: 'checkbox' },
  { key: 'explanationsPublished', label: '종료 후 정답·해설 공개', type: 'checkbox' },
];
const questionFields: Field[] = [
  { key: 'type', label: '문제유형' },
  { key: 'difficulty', label: '난이도', options: ['EASY', 'NORMAL', 'HARD'] },
  { key: 'subject', label: '메일 제목' },
  { key: 'senderName', label: '발신자 표시명' },
  { key: 'senderEmail', label: '실제 발신자 이메일' },
  { key: 'recipient', label: '수신자 표시' },
  { key: 'sentTime', label: '발송시간 표시' },
  { key: 'body', label: '이메일 본문 (일반 텍스트)', type: 'textarea' },
  {
    key: 'links',
    label: '링크 목록 JSON: [{"label":"문서 확인","url":"https://…"}]',
    type: 'json',
  },
  { key: 'attachments', label: '가상 첨부파일명 (한 줄에 하나)', type: 'lines' },
  { key: 'image', label: '훈련 이미지 경로 (업로드 시 자동 입력)' },
  { key: 'expectedAnswer', label: '정답', options: ['NORMAL', 'PHISHING'] },
  { key: 'explanation', label: '해설', type: 'textarea' },
  { key: 'risks', label: '주요 판단요소 (한 줄에 하나)', type: 'lines' },
  { key: 'active', label: '활성화', type: 'checkbox' },
];
const blankEvent = () => ({
  title: '새 피싱메일 판별 퀴즈대회',
  description: '',
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 86400000).toISOString(),
  durationSeconds: 300,
  correctPoints: 2,
  wrongPoints: -2,
  easyRatio: 30,
  normalRatio: 40,
  hardRatio: 30,
  legitimateRatio: 40,
  maxAttempts: 1,
  retentionDays: 30,
  departments: [],
  allowCustomDepartment: true,
  active: true,
  explanationsPublished: false,
});
const blankQuestion = () => ({
  type: '내부업무',
  difficulty: 'NORMAL',
  subject: '',
  senderName: '',
  senderEmail: '',
  recipient: '임직원',
  sentTime: '오늘 09:00',
  body: '',
  links: [],
  attachments: [],
  image: null,
  expectedAnswer: 'NORMAL',
  explanation: '',
  risks: [],
  active: true,
});
const menus = [
  'Dashboard',
  '대회관리',
  '참가자관리',
  '문제은행',
  '결과조회',
  '순위',
  '관리자로그',
  '시스템설정',
];
export default function AdminPage() {
  const [me, setMe] = useState<{ username: string; role: string }>(),
    [checking, setChecking] = useState(true),
    [tab, setTab] = useState('Dashboard'),
    [events, setEvents] = useState<Row[]>([]),
    [eventId, setEventId] = useState(''),
    [rows, setRows] = useState<Row[]>([]),
    [stats, setStats] = useState<Row>({}),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<Row | null>(null),
    [preview, setPreview] = useState<MailData>(),
    [search, setSearch] = useState(''),
    [sort, setSort] = useState('rank');
  const canWrite = me?.role !== 'VIEWER',
    canPrivacy = me?.role === 'SUPERADMIN';
  async function loadEvents() {
    const es = await api<Row[]>('admin/events');
    setEvents(es);
    setEventId((v) => v || String(es[0]?.id || ''));
    return es;
  }
  useEffect(() => {
    api<{ username: string; role: string }>('admin/me')
      .then(setMe)
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (me) loadEvents().catch((e) => setError(e.message));
  }, [me]);
  async function refresh() {
    if (!me) return;
    setError('');
    try {
      if (tab === '대회관리') setRows(await api<Row[]>('admin/events'));
      else if (tab === '문제은행') setRows(await api<Row[]>('admin/questions'));
      else if (tab === '관리자로그') setRows(await api<Row[]>('admin/audit'));
      else if (tab === '시스템설정') setStats(await api<Row>('admin/settings'));
      else if (eventId) {
        if (tab === 'Dashboard') setStats(await api<Row>(`admin/events/${eventId}/dashboard`));
        else
          setRows(
            await api<Row[]>(
              `admin/events/${eventId}/${tab === '참가자관리' ? 'participants' : 'results'}${search ? '?search=' + encodeURIComponent(search) : ''}`,
            ),
          );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setEdit(null);
    setPreview(undefined);
    setRows([]);
    setSearch('');
    void refresh();
  }, [tab, eventId, me]);
  useEffect(() => {
    if (tab !== 'Dashboard' || !me || !eventId) return;
    const t = setInterval(() => void refresh(), 15000);
    return () => clearInterval(t);
  }, [tab, me, eventId]);
  async function action(fn: () => Promise<unknown>, success = '처리되었습니다.') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      setMessage(success);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await action(async () => {
      setMe(
        await api('admin/login', 'POST', {
          username: fd.get('username'),
          password: fd.get('password'),
        }),
      );
    }, '로그인했습니다.');
  }
  async function save(data: Row) {
    const kind = tab === '대회관리' ? 'events' : 'questions';
    await action(async () => {
      await api(
        'admin/' + kind + (edit?.id ? '/' + edit.id : ''),
        edit?.id ? 'PATCH' : 'POST',
        data,
      );
      setEdit(null);
      if (kind === 'events') await loadEvents();
    }, '저장되었습니다.');
  }
  const filtered = rows
    .filter(
      (r) =>
        Object.entries(r).some(
          ([k, v]) =>
            [
              'name',
              'department',
              'phone',
              'title',
              'subject',
              'type',
              'difficulty',
              'actor',
              'action',
            ].includes(k) && String(v).toLowerCase().includes(search.toLowerCase()),
        ) || ['참가자관리', '결과조회', '순위'].includes(tab),
    )
    .sort((a, b) => {
      if (
        [
          'rank',
          'score',
          'accuracy',
          'correctCount',
          'wrongCount',
          'answeredCount',
          'startedAt',
        ].includes(sort)
      ) {
        const av = a[sort],
          bv = b[sort];
        return sort === 'rank'
          ? Number(av) - Number(bv)
          : sort === 'startedAt'
            ? String(bv).localeCompare(String(av))
            : Number(bv) - Number(av);
      }
      return 0;
    });
  return (
    <div className="admin-app">
      {me && (
        <aside className="admin-sidebar">
          <a className="brand" href="/">
            <span className="brand-icon">M↗</span>
            <span>
              메일 인사이트<small>ADMINISTRATION</small>
            </span>
          </a>
          <nav>
            {menus.map((m, i) => (
              <button key={m} className={tab === m ? 'selected' : ''} onClick={() => setTab(m)}>
                <span>{['◫', '◷', '◉', '▤', '▥', '↗', '≡', '⚙'][i]}</span>
                {m}
              </button>
            ))}
          </nav>
          <div className="admin-profile">
            <b>{me.username}</b>
            <small>{me.role}</small>
            <button
              onClick={() =>
                action(async () => {
                  await api('admin/logout', 'POST', {});
                  setMe(undefined);
                })
              }
            >
              로그아웃
            </button>
          </div>
        </aside>
      )}
      <main className={me ? 'admin-main' : 'admin-login'}>
        {checking ? (
          <p>인증 확인 중…</p>
        ) : !me ? (
          <section className="form-shell">
            <a className="brand" href="/">
              MAIL INSIGHT
            </a>
            <span className="eyebrow">ADMIN ACCESS</span>
            <h1>관리자 로그인</h1>
            <p className="muted">대회 운영과 문제은행을 관리합니다.</p>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <form onSubmit={login}>
              <label>
                아이디
                <input name="username" autoComplete="username" required />
              </label>
              <label>
                비밀번호
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              <button className="primary full" disabled={busy}>
                로그인 →
              </button>
            </form>
          </section>
        ) : (
          <>
            <header className="admin-heading">
              <div>
                <span className="eyebrow">COMPETITION OPERATIONS</span>
                <h1>{tab}</h1>
              </div>
              {!['문제은행', '관리자로그', '시스템설정'].includes(tab) && (
                <select
                  aria-label="관리할 대회"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                >
                  <option value="">대회 선택</option>
                  {events.map((e) => (
                    <option key={String(e.id)} value={String(e.id)}>
                      {String(e.title)}
                    </option>
                  ))}
                </select>
              )}
              <button className="secondary" onClick={() => void refresh()}>
                새로고침
              </button>
            </header>
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            {message && (
              <div className="notice success" role="status">
                {message}
              </div>
            )}
            {tab === 'Dashboard' && (
              <>
                <p className="muted">대회 참여 현황 · 15초마다 갱신 · 평균은 완료 응시 기준</p>
                <div className="dashboard-stats">
                  {[
                    ['registered', '참가 등록자'],
                    ['started', '응시 시작자'],
                    ['active', '현재 응시 중'],
                    ['finished', '응시 완료자'],
                    ['averageAnswered', '평균 응답'],
                    ['averageCorrect', '평균 정답'],
                    ['averageWrong', '평균 오답'],
                    ['averageAccuracy', '평균 정확도 (%)'],
                    ['averageScore', '평균 점수'],
                  ].map(([k, l]) => (
                    <div key={k}>
                      <span>{l}</span>
                      <b>{String(stats[k] ?? 0)}</b>
                    </div>
                  ))}
                </div>
                <section className="admin-info">
                  <h2>운영 체크포인트</h2>
                  <p>
                    대회 시작 전 운영시간과 문제 활성 상태를 확인하세요. 응시에는 문제와 채점 기준이
                    고정됩니다. 개인정보 보유기간 정리 작업은 별도의 정기 실행이 필요합니다.
                  </p>
                  <p>0.8초 미만의 응답은 이상징후로 기록되며 자동 탈락하지 않습니다.</p>
                </section>
              </>
            )}
            {['대회관리', '문제은행'].includes(tab) && (
              <>
                <div className="admin-controls">
                  <input
                    placeholder="제목·유형·난이도 검색"
                    aria-label="검색"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {canWrite && (
                    <button
                      className="primary"
                      onClick={() => setEdit(tab === '대회관리' ? blankEvent() : blankQuestion())}
                    >
                      + {tab === '대회관리' ? '대회 만들기' : '문제 추가'}
                    </button>
                  )}
                </div>
                {edit && (
                  <Editor
                    key={String(edit.id || 'new')}
                    fields={tab === '대회관리' ? eventFields : questionFields}
                    value={edit}
                    busy={busy}
                    onSave={save}
                    onClose={() => setEdit(null)}
                    onPreview={
                      tab === '문제은행' ? (q) => setPreview(q as unknown as MailData) : undefined
                    }
                  />
                )}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{tab === '대회관리' ? '대회' : '문제'}</th>
                        <th>분류 / 기간</th>
                        <th>상태</th>
                        <th>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={String(r.id)}>
                          <td>
                            <b>{String(r.title || r.subject)}</b>
                            <small>{String(r.id)}</small>
                          </td>
                          <td>
                            {tab === '대회관리'
                              ? `${new Date(String(r.startsAt)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} ~ ${new Date(String(r.endsAt)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`
                              : `${r.type} · ${r.difficulty} · ${r.expectedAnswer === 'NORMAL' ? '정상' : '피싱'}`}
                          </td>
                          <td>
                            <span className={'badge ' + (r.active ? 'active' : '')}>
                              {r.active ? '활성' : '비활성'}
                            </span>
                          </td>
                          <td className="row-actions">
                            {tab === '문제은행' && (
                              <button onClick={() => setPreview(r as unknown as MailData)}>
                                미리보기
                              </button>
                            )}
                            {canWrite && (
                              <>
                                <button onClick={() => setEdit(r)}>수정</button>
                                {tab === '문제은행' && (
                                  <button
                                    disabled={busy}
                                    onClick={() =>
                                      action(() => api(`admin/questions/${r.id}/copy`, 'POST', {}))
                                    }
                                  >
                                    복사
                                  </button>
                                )}
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    action(() =>
                                      api(
                                        `admin/${tab === '대회관리' ? 'events' : 'questions'}/${r.id}`,
                                        'PATCH',
                                        { ...r, active: !r.active },
                                      ),
                                    )
                                  }
                                >
                                  {r.active ? '비활성화' : '활성화'}
                                </button>
                                {(tab === '문제은행' || canPrivacy) && (
                                  <button
                                    className="danger-text"
                                    disabled={busy}
                                    onClick={() => {
                                      if (
                                        confirm(
                                          tab === '대회관리'
                                            ? '대회와 모든 참가자 데이터를 삭제할까요?'
                                            : '문제를 삭제할까요? 진행 중 응시의 문제는 유지됩니다.',
                                        )
                                      )
                                        void action(async () => {
                                          await api(
                                            `admin/${tab === '대회관리' ? 'events' : 'questions'}/${r.id}`,
                                            'DELETE',
                                          );
                                          if (tab === '대회관리') {
                                            setEventId('');
                                            await loadEvents();
                                          }
                                        });
                                    }}
                                  >
                                    삭제
                                  </button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && <p className="empty">표시할 데이터가 없습니다.</p>}
                </div>
              </>
            )}
            {['참가자관리', '결과조회', '순위'].includes(tab) && (
              <>
                <div className="admin-controls">
                  <input
                    aria-label="참가자 검색"
                    placeholder="이름·부서·휴대전화번호 검색"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <button className="secondary" onClick={() => void refresh()}>
                    검색
                  </button>
                  {tab !== '참가자관리' && (
                    <select
                      value={sort}
                      aria-label="정렬"
                      onChange={(e) => setSort(e.target.value)}
                    >
                      {[
                        ['rank', '최종순위'],
                        ['score', '점수'],
                        ['accuracy', '정확도'],
                        ['correctCount', '정답수'],
                        ['wrongCount', '오답수'],
                        ['answeredCount', '응답문제 수'],
                        ['startedAt', '참가시간'],
                      ].map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                  {canPrivacy && eventId && (
                    <>
                      <a className="button secondary" href={`/api/admin/events/${eventId}/export`}>
                        CSV 다운로드
                      </a>
                      <button
                        className="danger-button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              '이 대회의 모든 참가자 개인정보와 응시기록을 삭제할까요? 복구할 수 없습니다.',
                            )
                          )
                            void action(() => api(`admin/events/${eventId}/purge`, 'POST', {}));
                        }}
                      >
                        전체 참가자 삭제
                      </button>
                    </>
                  )}
                </div>
                <p className="subtle">
                  휴대전화번호는 마스킹됩니다. 순위는 참가자별 최고 기록 기준이며, 완전히 같은
                  기록은 응시 ID로 일관되게 정렬합니다.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {(tab === '참가자관리'
                          ? ['부서', '이름', '휴대전화번호', '상태', '등록시각', '관리']
                          : [
                              '순위',
                              '부서',
                              '이름',
                              '휴대전화번호',
                              '응답',
                              '정답',
                              '오답',
                              '정확도',
                              '점수',
                              '이상응답',
                              '관리',
                            ]
                        ).map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={String(r.id || r.attemptId)}>
                          {tab === '참가자관리' ? (
                            <>
                              <td>{String(r.department)}</td>
                              <td>{String(r.name)}</td>
                              <td>{String(r.phone)}</td>
                              <td>{String(r.state)}</td>
                              <td>
                                {new Date(String(r.createdAt)).toLocaleString('ko-KR', {
                                  timeZone: 'Asia/Seoul',
                                })}
                              </td>
                            </>
                          ) : (
                            <>
                              {[
                                'rank',
                                'department',
                                'name',
                                'phone',
                                'answeredCount',
                                'correctCount',
                                'wrongCount',
                                'accuracy',
                                'score',
                                'suspiciousCount',
                              ].map((k) => (
                                <td key={k}>
                                  {String(r[k])}
                                  {k === 'accuracy' ? '%' : ''}
                                </td>
                              ))}
                            </>
                          )}
                          <td className="row-actions">
                            {canWrite && (
                              <button
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    confirm(
                                      '응시기록을 초기화하고 재응시를 허용할까요? 기존 점수는 삭제됩니다.',
                                    )
                                  )
                                    void action(() =>
                                      api(
                                        `admin/participants/${r.id || r.participantId}/reset`,
                                        'POST',
                                        {},
                                      ),
                                    );
                                }}
                              >
                                응시 초기화
                              </button>
                            )}
                            {canPrivacy && (
                              <button
                                className="danger-text"
                                disabled={busy}
                                onClick={() => {
                                  if (confirm('이 참가자의 개인정보와 기록을 삭제할까요?'))
                                    void action(() =>
                                      api(
                                        `admin/participants/${r.id || r.participantId}`,
                                        'DELETE',
                                      ),
                                    );
                                }}
                              >
                                개인정보 삭제
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && <p className="empty">표시할 데이터가 없습니다.</p>}
                </div>
              </>
            )}
            {tab === '관리자로그' && (
              <>
                <p className="subtle">최근 500건 · 개인정보 원문은 로그에 기록하지 않습니다.</p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {['관리자', '작업', '대상', 'IP', '성공 여부', '수행시각'].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={String(r.id)}>
                          {['actor', 'action', 'target', 'ip'].map((k) => (
                            <td key={k}>{String(r[k])}</td>
                          ))}
                          <td>{r.success ? '성공' : '실패'}</td>
                          <td>
                            {new Date(String(r.createdAt)).toLocaleString('ko-KR', {
                              timeZone: 'Asia/Seoul',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {tab === '시스템설정' && (
              <section className="admin-info">
                <h2>접근 및 보안 설정</h2>
                <p>
                  역할: {me.role} · 관리자 세션: 30분 · IP 제한:{' '}
                  {stats.ipRestrictionEnabled ? '사용' : '미사용'}
                </p>
                <p>
                  IP 제한과 프록시 신뢰 설정은 서버 환경변수로 관리합니다. 관리자 계정은 서버의 계정
                  생성 명령으로 관리합니다.
                </p>
                {canPrivacy && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      void action(async () => {
                        await api('admin/settings', 'PATCH', {
                          currentPassword: fd.get('currentPassword'),
                          newPassword: fd.get('newPassword'),
                        });
                        setMe(undefined);
                      }, '비밀번호를 변경했습니다. 다시 로그인해주세요.');
                    }}
                  >
                    <label>
                      현재 비밀번호
                      <input type="password" name="currentPassword" required />
                    </label>
                    <label>
                      새 비밀번호 (12자 이상, 영문·숫자·특수문자)
                      <input type="password" name="newPassword" required minLength={12} />
                    </label>
                    <button className="primary" disabled={busy}>
                      비밀번호 변경
                    </button>
                  </form>
                )}
              </section>
            )}
            {preview && (
              <div className="modal" role="dialog" aria-modal="true" aria-label="문제 미리보기">
                <div className="modal-content">
                  <button className="secondary" onClick={() => setPreview(undefined)}>
                    미리보기 닫기 ✕
                  </button>
                  <Mail question={preview} />
                  <p className="subtle">
                    관리자 미리보기 · 실제 참가자와 같은 메일 표시 방식입니다.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
function Editor({
  fields,
  value,
  busy,
  onSave,
  onClose,
  onPreview,
}: {
  fields: Field[];
  value: Row;
  busy: boolean;
  onSave: (r: Row) => Promise<void>;
  onClose: () => void;
  onPreview?: (r: Row) => void;
}) {
  const [draft, setDraft] = useState<Row>(() => {
      const d = { ...value };
      for (const f of fields) {
        if (f.type === 'json') d[f.key] = JSON.stringify(d[f.key] || [], null, 2);
        if (f.type === 'lines') d[f.key] = ((d[f.key] as string[]) || []).join('\n');
        if (f.type === 'datetime-local')
          d[f.key] = new Date(Date.parse(String(d[f.key])) + 9 * 3600000)
            .toISOString()
            .slice(0, 16);
      }
      return d;
    }),
    [error, setError] = useState('');
  function data() {
    const d = { ...draft };
    for (const f of fields) {
      if (f.type === 'json') d[f.key] = JSON.parse(String(d[f.key]));
      if (f.type === 'lines')
        d[f.key] = String(d[f.key])
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean);
      if (f.type === 'number') d[f.key] = Number(d[f.key]);
      if (f.type === 'datetime-local')
        d[f.key] = new Date(String(d[f.key]) + ':00+09:00').toISOString();
      if (f.key === 'image' && !d.image) d.image = null;
    }
    return d;
  }
  return (
    <section className="editor">
      <div className="editor-title">
        <h2>{value.id ? '수정' : '새로 만들기'}</h2>
        <button className="secondary" onClick={onClose}>
          닫기
        </button>
      </div>
      {error && <p className="notice error">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            void onSave(data());
            setError('');
          } catch {
            setError('JSON 형식이나 날짜 입력을 확인해주세요.');
          }
        }}
      >
        <div className="editor-grid">
          {fields.map((f) => (
            <label
              key={f.key}
              className={['textarea', 'json', 'lines'].includes(f.type || '') ? 'wide' : ''}
            >
              {f.label}
              {f.options ? (
                <select
                  value={String(draft[f.key] || '')}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                >
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : ['textarea', 'json', 'lines'].includes(f.type || '') ? (
                <textarea
                  rows={f.type === 'textarea' ? 5 : 3}
                  value={String(draft[f.key] || '')}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              ) : f.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={!!draft[f.key]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.checked })}
                />
              ) : (
                <input
                  type={f.type || 'text'}
                  value={String(draft[f.key] ?? '')}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>
        {onPreview && (
          <label>
            이미지 업로드 (2MB 이하 PNG/JPEG/WebP)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const fd = new FormData();
                  fd.set('file', file);
                  const r = await fetch('/api/admin/upload', { method: 'POST', body: fd });
                  const d = await r.json();
                  if (!r.ok) throw new Error(d.message);
                  setDraft({ ...draft, image: d.image });
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          </label>
        )}
        <div className="editor-actions">
          <button className="primary" disabled={busy}>
            저장
          </button>
          {onPreview && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                try {
                  onPreview(data());
                  setError('');
                } catch {
                  setError('링크 JSON 형식을 확인해주세요.');
                }
              }}
            >
              참가자 화면 미리보기
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
