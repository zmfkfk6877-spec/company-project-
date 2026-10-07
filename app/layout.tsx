import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '메일 인사이트 | 피싱메일 판별 퀴즈대회',
  description: '5분 동안 속도와 정확성으로 도전하는 피싱메일 판별 퀴즈대회',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
