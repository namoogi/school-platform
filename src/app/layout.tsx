import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '학교 운영 플랫폼',
  description: '학교 자료를 읽고 관리자 확인을 거쳐 학사 문서를 발행합니다. (14차)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 13차 서체 자산(Noto 계열 부분 집합, OFL). public/type-assets 참고 */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/type-fonts.css" />
        {/* Pretendard (OFL) 동적 부분 집합: 페이지에 쓰인 글자 묶음만 받는다 */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/fonts/pretendard/pretendardvariable-dynamic-subset.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
