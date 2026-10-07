'use client';
import { useState } from 'react';
export type MailData = {
  assignmentId?: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  recipient: string;
  sentTime: string;
  body: string;
  links: { label: string; url: string }[];
  attachments: string[];
  image?: string | null;
};
function Inspect({ label, value }: { label: string; value: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inspect">
      <button
        type="button"
        className="inspect-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
        <span aria-hidden="true"> ↗</span>
      </button>
      <span className={'inspect-detail ' + (open ? 'is-open' : '')}>{value}</span>
    </span>
  );
}
export default function Mail({ question: q }: { question: MailData }) {
  return (
    <article className="mail-window">
      <div className="mail-toolbar">
        <span aria-hidden="true">✉</span>
        <span>받은 메일</span>
        <span className="toolbar-note">판별 훈련 · 외부 연결 없음</span>
      </div>
      <div className="mail-content">
        <h2>{q.subject}</h2>
        <dl className="mail-meta">
          <dt>보낸 사람</dt>
          <dd>
            <Inspect label={q.senderName} value={q.senderEmail} />
          </dd>
          <dt>받는 사람</dt>
          <dd>{q.recipient}</dd>
          <dt>보낸 시간</dt>
          <dd>{q.sentTime}</dd>
        </dl>
        <div className="mail-body">{q.body}</div>
        {q.image && <img className="mail-image" src={q.image} alt="메일에 포함된 훈련 이미지" />}
        <div className="mail-links">
          {q.links.map((l, i) => (
            <div key={i}>
              <Inspect label={l.label} value={l.url} />
            </div>
          ))}
        </div>
        {q.attachments.length > 0 && (
          <div className="attachments">
            {q.attachments.map((a, i) => (
              <span key={i} tabIndex={0} title="가상 첨부파일 · 다운로드되지 않습니다.">
                ▤ {a}
                <small>가상 첨부파일</small>
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
