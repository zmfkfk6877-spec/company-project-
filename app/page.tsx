'use client';
import { useEffect, useRef, useState } from 'react';
import Mail, { MailData } from '@/components/Mail';
import { api } from '@/lib/client';
type Event = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  durationSeconds: number;
  correctPoints: number;
  wrongPoints: number;
  maxAttempts: number;
  retentionDays: number;
  departments: string[];
  allowCustomDepartment: boolean;
};
type Progress = {
  state: 'READY' | 'ACTIVE' | 'FINISHED';
  expiresAt?: string;
  serverNow: string;
  answeredCount?: number;
  question?: MailData;
};
type Result = {
  participantCount: number;
  rank: number;
  rankStatus: string;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number;
  score: number;
  reviewAvailable: boolean;
  canRetry: boolean;
  eventId: string;
};
type Review = {
  question: MailData;
  selectedAnswer: string;
  expectedAnswer: string;
  explanation: string;
  risks: string[];
};
const date = (v: string) =>
  new Date(v).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
export default function Home() {
  const [events, setEvents] = useState<Event[]>([]),
    [event, setEvent] = useState<Event>(),
    [screen, setScreen] = useState('home'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<Progress>(),
    [remaining, setRemaining] = useState(0),
    [result, setResult] = useState<Result>(),
    [review, setReview] = useState<Review[]>([]),
    [phone, setPhone] = useState(''),
    [countdown, setCountdown] = useState(3),
    [loaded, setLoaded] = useState(false);
  const deadline = useRef(0),
    loadingResult = useRef(false),
    mounted = useRef(true),
    submitting = useRef(false);
  async function loadResult() {
    if (loadingResult.current) return;
    loadingResult.current = true;
    try {
      const r = await api<Result>('result');
      setResult(r);
      setScreen('result');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loadingResult.current = false;
    }
  }
  function apply(p: Progress) {
    setProgress(p);
    if (p.state === 'ACTIVE') {
      deadline.current =
        performance.now() + Math.max(0, Date.parse(p.expiresAt!) - Date.parse(p.serverNow));
      setRemaining(Math.ceil((deadline.current - performance.now()) / 1000));
      setScreen('quiz');
    } else if (p.state === 'FINISHED') {
      void loadResult();
    } else setScreen('ready');
  }
  useEffect(() => {
    mounted.current = true;
    api<Event[]>('events')
      .then((es) => {
        setEvents(es);
        setEvent(es[0]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
    api<Progress>('attempt')
      .then((p) => {
        if (p.state !== 'READY') apply(p);
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (screen !== 'quiz') return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setScreen('timeover');
        void api<Progress>('attempt')
          .then((p) => {
            if (p.state === 'FINISHED') void loadResult();
            else apply(p);
          })
          .catch((e) => {
            setError(e.message);
            setScreen('quiz');
          });
      }
    }, 200);
    const restore = () => {
      if (document.visibilityState === 'visible')
        api<Progress>('attempt')
          .then(apply)
          .catch((e) => setError(e.message));
    };
    document.addEventListener('visibilitychange', restore);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', restore);
    };
  }, [screen]);
  useEffect(() => {
    if (screen !== 'countdown') return;
    let n = 3;
    setCountdown(n);
    const t = setInterval(() => {
      n--;
      setCountdown(n);
      if (n === 0) {
        clearInterval(t);
        api<Progress>('attempt/start', 'POST', {})
          .then(apply)
          .catch((e) => {
            setError(e.message);
            setScreen('ready');
          });
      }
    }, 1000);
    return () => clearInterval(t);
  }, [screen]);
  async function register(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api('register', 'POST', {
        eventId: event!.id,
        name: fd.get('name'),
        department: fd.getAll('department').at(-1),
        phone,
        consent: fd.get('consent') === 'on',
      });
      apply(await api<Progress>('attempt'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function answer(selectedAnswer: string) {
    if (submitting.current || remaining === 0) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      apply(
        await api<Progress>('attempt/answer', 'POST', {
          assignmentId: progress!.question!.assignmentId,
          selectedAnswer,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const closed = event
    ? Date.now() < Date.parse(event.startsAt)
      ? '아직 대회가 시작되지 않았습니다.'
      : Date.now() >= Date.parse(event.endsAt)
        ? '대회가 종료되었습니다.'
        : ''
    : '';
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-icon">
            M<span>↗</span>
          </span>
          <span>
            메일 인사이트<small>PHISHING QUIZ CHALLENGE</small>
          </span>
        </a>
        <span className="header-caption">2026 정보보호 참여 이벤트</span>
        <a className="admin-link" href="/admin">
          관리자 ↗
        </a>
      </header>
      <main className={'page ' + (screen === 'home' ? 'home-page' : '')}>
        {error && (
          <div className="notice error" role="alert">
            {error}
            {(screen === 'timeover' || screen === 'result') && (
              <button onClick={() => void loadResult()}>다시 확인</button>
            )}
          </div>
        )}
        {screen === 'home' && (
          <>
            <div className="hero-grid">
              <section className="hero">
                <span className="eyebrow">
                  <i /> THINK BEFORE YOU CLICK
                </span>
                <h1>
                  평범해 보이는 메일.
                  <br />
                  당신의 판단은
                  <br />
                  <em>얼마나 정확한가요?</em>
                </h1>
                <p>
                  5분 동안 실제 업무 메일 속 의심 신호를 찾아보세요.
                  <br />
                  빠른 판단과 정확한 관찰이 당신의 순위를 결정합니다.
                </p>
                <div className="event-label">{event?.title || '2026 피싱메일 판별 퀴즈대회'}</div>
                {events.length > 1 && (
                  <label>
                    참여 대회
                    <select
                      value={event?.id}
                      onChange={(e) => setEvent(events.find((x) => x.id === e.target.value))}
                    >
                      {events.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  className="primary hero-cta"
                  disabled={!event || !!closed || !loaded}
                  onClick={() => setScreen('register')}
                >
                  대회 참가하기 <span>→</span>
                </button>
                <p className="subtle">
                  {closed ||
                    (!loaded
                      ? '대회 정보를 불러오는 중입니다.'
                      : !event
                        ? '현재 운영 중인 대회가 없습니다.'
                        : `${date(event.startsAt)} — ${date(event.endsAt)} (한국시간)`)}
                </p>
              </section>
              <aside className="hero-visual" aria-label="메일 관찰 안내">
                <div className="visual-label">
                  <span>YOUR MISSION</span>
                  <b>관찰하고, 판단하세요.</b>
                </div>
                <div className="illustration-mail">
                  <div className="illustration-top">
                    <span className="avatar">업</span>
                    <div>
                      <b>업무지원팀</b>
                      <small>받은 메일 · 09:41</small>
                    </div>
                    <span>···</span>
                  </div>
                  <h3>공유된 문서를 확인해주세요</h3>
                  <div className="fake-line long" />
                  <div className="fake-line" />
                  <div className="fake-line medium" />
                  <div className="fake-button">문서 확인하기 ↗</div>
                  <div className="address-callout">
                    <span>주소를 확인해보세요</span>
                    <code>portal.company.example</code>
                  </div>
                </div>
                <div className="visual-footer">
                  <span>01 발신자</span>
                  <span>02 링크 주소</span>
                  <span>03 첨부파일</span>
                </div>
                <span className="visual-circle">?</span>
              </aside>
            </div>
            <section className="rules-strip">
              <div>
                <b>
                  {Math.round((event?.durationSeconds || 300) / 60)}
                  <small>분</small>
                </b>
                <span>집중하는 시간</span>
              </div>
              <div>
                <b>
                  +{event?.correctPoints || 2}
                  <small>점</small>
                </b>
                <span>정확한 판단</span>
              </div>
              <div>
                <b>
                  {event?.wrongPoints ?? -2}
                  <small>점</small>
                </b>
                <span>오답은 감점</span>
              </div>
              <div>
                <b>
                  {event?.maxAttempts || 1}
                  <small>회</small>
                </b>
                <span>대회 참여 기회</span>
              </div>
            </section>
            <div className="bottom-note">
              <span>작은 차이를 발견하는 눈이, 가장 강력한 보안입니다.</span>
              <span>속도 × 정확성</span>
            </div>
          </>
        )}
        {screen === 'register' && (
          <section className="form-shell">
            <span className="eyebrow">01 / 참가자 등록</span>
            <h1>도전을 시작하기 전에</h1>
            <p className="muted">대회 참가 확인에 필요한 정보를 입력해주세요.</p>
            <form onSubmit={register}>
              <label>
                부서명
                {event?.departments.length ? (
                  <select aria-label="부서명" name="department" required defaultValue="">
                    <option value="" disabled>
                      부서를 선택해주세요
                    </option>
                    {event.departments.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                    {event.allowCustomDepartment && <option value="__custom">직접 입력</option>}
                  </select>
                ) : (
                  <input name="department" required maxLength={100} placeholder="예: 정보보안팀" />
                )}
              </label>
              {event?.departments.length && event.allowCustomDepartment ? (
                <CustomDepartment />
              ) : null}
              <label>
                이름
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={60}
                  placeholder="이름을 입력해주세요"
                />
              </label>
              <label>
                휴대전화번호
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 11);
                    setPhone(v.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3'));
                  }}
                  placeholder="010-1234-5678"
                />
              </label>
              <div className="privacy">
                <b>개인정보 수집·이용 안내</b>
                <p>
                  수집항목: 부서명, 성명, 휴대전화번호
                  <br />
                  이용목적: 참가자 식별, 중복참여 방지 및 경품 지급
                  <br />
                  보유기간: 대회 종료일로부터 {event?.retentionDays}일<br />
                  동의를 거부할 수 있으며, 거부 시 대회 참여가 제한됩니다.
                </p>
                <label className="check">
                  <input type="checkbox" name="consent" required />
                  수집·이용 안내를 확인하고 동의합니다.
                </label>
              </div>
              <button className="primary full" disabled={busy}>
                {busy ? '확인 중…' : '대회 안내 확인 →'}
              </button>
              <button type="button" className="text-button" onClick={() => setScreen('home')}>
                메인으로 돌아가기
              </button>
            </form>
          </section>
        )}
        {screen === 'ready' && (
          <section className="ready-screen">
            <span className="eyebrow">02 / 대회 안내</span>
            <h1>준비되셨습니까?</h1>
            <p className="muted">발신자와 링크를 꼼꼼히 살펴보고, 빠르게 판단하세요.</p>
            <ul className="ready-rules">
              <li>제한시간은 {event?.durationSeconds || 300}초입니다.</li>
              <li>
                정답은 +{event?.correctPoints || 2}점, 오답은 {event?.wrongPoints ?? -2}점입니다.
              </li>
              <li>문제를 건너뛸 수 없습니다.</li>
              <li>시작 후 시간을 초기화하거나 다시 시작할 수 없습니다.</li>
              <li>제한시간이나 대회 운영시간이 끝나면 자동 종료됩니다.</li>
              <li>문제은행의 모든 문제에 응답하면 일찍 종료됩니다.</li>
            </ul>
            <button
              className="primary start-button"
              onClick={() => {
                setError('');
                setScreen('countdown');
              }}
            >
              START <span>→</span>
            </button>
            <p className="subtle">발신자·링크는 마우스, 클릭, 키보드로 확인할 수 있습니다.</p>
          </section>
        )}
        {screen === 'countdown' && (
          <div className="countdown" role="status" aria-live="assertive">
            <span>집중할 시간입니다</span>
            <b key={countdown}>{countdown || 'START!'}</b>
          </div>
        )}
        {screen === 'quiz' && progress?.question && (
          <section className="quiz-shell">
            <div className="quiz-status">
              <div>
                <span className="eyebrow">CHALLENGE IN PROGRESS</span>
                <p>발신자와 실제 링크 주소를 확인해보세요.</p>
              </div>
              <div
                className={
                  'timer ' + (remaining <= 60 ? 'warning ' : '') + (remaining <= 10 ? 'urgent' : '')
                }
                role="timer"
                aria-label="남은 시간"
              >
                <small>남은 시간</small>
                <strong>
                  {String(Math.floor(remaining / 60)).padStart(2, '0')}:
                  {String(remaining % 60).padStart(2, '0')}
                </strong>
              </div>
              <div className="answer-count">
                <strong>{progress.answeredCount}</strong>
                <span>응답한 문제</span>
              </div>
            </div>
            <Mail question={progress.question} />
            <div className="choices">
              <button
                disabled={busy || remaining === 0}
                onClick={() => void answer('NORMAL')}
                className="choice-normal"
              >
                <span>✓</span> 정상 메일
              </button>
              <button
                disabled={busy || remaining === 0}
                onClick={() => void answer('PHISHING')}
                className="choice-phishing"
              >
                <span>!</span> 피싱 메일
              </button>
            </div>
            <p className="subtle center">
              선택하면 즉시 다음 문제로 이동합니다. 정답과 점수는 종료 후 공개됩니다.
            </p>
          </section>
        )}
        {screen === 'timeover' && (
          <section className="countdown">
            <span>응시가 종료되었습니다.</span>
            <b>TIME OVER</b>
            <p>서버에서 결과를 확인하고 있습니다.</p>
          </section>
        )}
        {screen === 'result' && result && (
          <section className="result-shell">
            <span className="eyebrow">CHALLENGE COMPLETE</span>
            <h1>관찰의 시간이 끝났습니다.</h1>
            <p>
              총 <b>{result.answeredCount}문제</b>에 응답했습니다.
            </p>
            <div className="score-panel">
              <span>최종 점수</span>
              <strong>
                {result.score}
                <small>점</small>
              </strong>
            </div>
            <div className="result-stats">
              <div>
                <b>{result.correctCount}</b>
                <span>정답</span>
              </div>
              <div>
                <b>{result.wrongCount}</b>
                <span>오답</span>
              </div>
              <div>
                <b>{result.accuracy.toFixed(1)}%</b>
                <span>정확도</span>
              </div>
            </div>
            <div className="rank-panel">
              <span>
                {result.rankStatus === 'FINAL' ? '최종' : '현재까지'}{' '}
                <b>{result.participantCount}명</b> 참여
              </span>
              <strong>
                나의 {result.rankStatus === 'FINAL' ? '최종' : '현재'} 순위 <b>{result.rank}위</b>
              </strong>
              <small>
                {result.rankStatus === 'FINAL'
                  ? '대회가 종료되어 확정된 순위입니다.'
                  : '대회 진행 중으로 순위는 변동될 수 있습니다.'}
              </small>
            </div>
            <button className="secondary" onClick={() => void loadResult()}>
              순위 새로고침
            </button>
            {result.canRetry && (
              <button
                className="primary"
                onClick={() =>
                  api<Event[]>('events')
                    .then((es) => {
                      setEvent(es.find((e) => e.id === result.eventId));
                      setReview([]);
                      setScreen('ready');
                    })
                    .catch((e) => setError(e.message))
                }
              >
                다음 참여 기회 시작
              </button>
            )}
            {result.reviewAvailable && (
              <button
                className="primary"
                onClick={() =>
                  api<Review[]>('review')
                    .then(setReview)
                    .catch((e) => setError(e.message))
                }
              >
                나의 문제 해설 보기
              </button>
            )}
            <p className="subtle">수고하셨습니다. 업무 메일에서도 클릭 전 한 번 더 확인하세요.</p>
            {review.map((x, i) => (
              <section className="review" key={i}>
                <h2>문제 {i + 1}</h2>
                <Mail question={x.question} />
                <p>
                  나의 답변: {x.selectedAnswer === 'NORMAL' ? '정상' : '피싱'} · 실제 정답:{' '}
                  {x.expectedAnswer === 'NORMAL' ? '정상' : '피싱'}
                </p>
                <b>판단 포인트</b>
                <p>{x.explanation}</p>
                <ul>
                  {x.risks.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        )}
      </main>
      <footer className="site-footer">
        <span>MAIL INSIGHT © 2026</span>
        <span>안전한 메일 습관을 위한 5분의 도전</span>
      </footer>
    </>
  );
}
function CustomDepartment() {
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    const select = document.querySelector<HTMLSelectElement>('select[name="department"]');
    const listener = () => {
      setCustom(select?.value === '__custom');
    };
    select?.addEventListener('change', listener);
    return () => select?.removeEventListener('change', listener);
  }, []);
  return custom ? (
    <label>
      부서 직접 입력
      <input name="department" required maxLength={100} />
    </label>
  ) : null;
}
