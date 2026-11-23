'use client';
import { useState } from 'react';
import {
  Bell, BookOpen, CalendarDays, ChevronDown, CircleCheck, ClipboardList, FileText, FolderOpen,
  House, Inbox, Search, Settings, Users, type LucideIcon,
} from 'lucide-react';
import { ACTIVITY, COURSES, EVENTS, QUESTIONS, SCHOOL, TASKS, type Course, type Task } from './data';
import s from './campus.module.css';

const RAIL: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'home', label: '홈', icon: House },
  { key: 'courses', label: '수업', icon: BookOpen },
  { key: 'sources', label: '자료', icon: FolderOpen },
  { key: 'questions', label: '질문', icon: Inbox },
  { key: 'docs', label: '문서', icon: FileText },
  { key: 'calendar', label: '일정', icon: CalendarDays },
  { key: 'members', label: '구성원', icon: Users },
];

/** 오늘(11월 23일)을 기준으로 할 일을 마감순 묶음으로 나눈다. */
const TODAY_DAY = 23;
function dueGroup(t: Task): '오늘' | '이번 주' | '다음 주 이후' | '완료' {
  if (t.done) return '완료';
  if (t.due === '오늘') return '오늘';
  const m = /(\d+)월 (\d+)일/.exec(t.due);
  const day = m ? Number(m[2]) : 99;
  return day - TODAY_DAY <= 6 ? '이번 주' : '다음 주 이후';
}
const GROUPS = ['오늘', '이번 주', '다음 주 이후', '완료'] as const;

const waiting = QUESTIONS.filter((q) => q.status === '대기').length;

/** 원형 1. 학사 업무형 — 아이콘 레일 + 학기 선택 + 수업 카드 격자 + 오른쪽 할 일 열. */
export default function Campus() {
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(TASKS.map((t) => [t.id, t.done])));
  const openCount = TASKS.filter((t) => !done[t.id]).length;

  return (
    <div className={s.root}>
      <nav className={s.rail} aria-label="전역 메뉴">
        <span className={s.mark} aria-hidden="true">{SCHOOL.short.slice(0, 1)}</span>
        <ul>
          {RAIL.map((r) => (
            <li key={r.key}>
              <a href="#" className={s.railItem} aria-current={r.key === 'home' ? 'page' : undefined}>
                <r.icon size={22} aria-hidden="true" />
                <span>{r.label}</span>
              </a>
            </li>
          ))}
        </ul>
        <a href="#" className={`${s.railItem} ${s.railBottom}`}>
          <Settings size={22} aria-hidden="true" />
          <span>설정</span>
        </a>
      </nav>

      <header className={s.top}>
        <button type="button" className={s.picker} aria-haspopup="listbox">
          {/* 접근 이름은 보이는 글자(학교 + 이름)로 만든다 (WCAG 2.5.3) */}
          <span className={s.pickerLabel}>학교</span>
          <b>{SCHOOL.name}</b><span className="sr-only"> 선택</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        <label className={s.term}>
          <span className={s.pickerLabel}>학기</span>
          <select defaultValue={SCHOOL.term} aria-label="학기 선택">
            <option>{SCHOOL.term}</option>
            <option>2026학년도 1학기</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
        <label className={s.search}>
          <Search size={16} aria-hidden="true" />
          <input placeholder="수업·자료·문서 검색" aria-label="전체 검색" />
        </label>
        <button type="button" className={s.iconBtn}>
          <Bell size={20} aria-hidden="true" />
          <span className="sr-only">알림 </span>
          <span className={s.dot}>{waiting}<span className="sr-only">건</span></span>
        </button>
        <span className={s.me}>
          <span className={s.avatar} aria-hidden="true">{SCHOOL.user.initial}</span>
          <span className={s.meText}><b>{SCHOOL.user.name}</b><small>{SCHOOL.user.role}</small></span>
        </span>
      </header>

      <div className={s.body}>
        <main className={s.main}>
          <div className={s.greet}>
            <p className={s.date}>{SCHOOL.today} · {SCHOOL.term} {SCHOOL.week}</p>
            <h1>안녕하세요, {SCHOOL.user.name} 님</h1>
            <p className={s.lead}>
              오늘 마감인 할 일 {TASKS.filter((t) => t.due === '오늘' && !done[t.id]).length}건, 확인을 기다리는 질문 {waiting}건이 있습니다.
            </p>
          </div>

          <section aria-labelledby="campus-courses">
            <div className={s.sectionHead}>
              <h2 id="campus-courses">이번 학기 수업</h2>
              <span className={s.sectionMeta}>{COURSES.length}개 · 마감 판 확정 {COURSES.filter((c) => c.status === '마감 판 확정').length}개</span>
            </div>
            <ul className={s.cards}>
              {COURSES.map((c, i) => <CourseCard key={c.id} c={c} hue={i} />)}
            </ul>
          </section>
        </main>

        <aside className={s.side} aria-label="할 일과 일정">
          <section className={s.panel} aria-labelledby="campus-todo">
            <div className={s.panelHead}>
              <h2 id="campus-todo">할 일</h2>
              <span className={s.sectionMeta}>남은 일 {openCount}건</span>
            </div>
            {GROUPS.map((g) => {
              const items = TASKS.filter((t) => dueGroup({ ...t, done: done[t.id] }) === g);
              if (items.length === 0) return null;
              return (
                <div key={g} className={s.group}>
                  <h3>{g}</h3>
                  <ul className={s.tasks}>
                    {items.map((t) => (
                      <li key={t.id}>
                        <label className={s.task} data-done={done[t.id] ? 'true' : undefined}>
                          <input type="checkbox" checked={done[t.id]} onChange={(e) => setDone((d) => ({ ...d, [t.id]: e.target.checked }))} />
                          <span className={s.taskText}>
                            <span className={s.taskTitle}>{t.title}</span>
                            <span className={s.taskDue}>{done[t.id] ? '완료함' : `마감 ${t.due}`} · {t.link === 'seats' ? '좌석' : t.link}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>

          <section className={s.panel} aria-labelledby="campus-events">
            <div className={s.panelHead}><h2 id="campus-events">다가오는 일정</h2></div>
            <ul className={s.events}>
              {EVENTS.map((e) => {
                const [mm, dd] = e.date.split('.');
                return (
                  <li key={e.date + e.title}>
                    <span className={s.cal} aria-hidden="true"><small>{Number(mm)}월</small><b>{Number(dd)}</b></span>
                    <span className={s.eventText}>
                      <span className={s.eventTitle}>{e.title}</span>
                      <span className={s.eventMeta}>{Number(mm)}월 {Number(dd)}일 ({e.day}) · <span className={s.eventKind} data-kind={e.kind}>{e.kind}</span></span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={s.panel} aria-labelledby="campus-activity">
            <div className={s.panelHead}><h2 id="campus-activity">최근 활동</h2></div>
            <ul className={s.activity}>
              {ACTIVITY.map((a) => (
                <li key={a.what}>
                  <span className={s.actAvatar} aria-hidden="true">{a.who.slice(0, 1)}</span>
                  <span><b>{a.who}</b> {a.what}<small>{a.when}</small></span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function CourseCard({ c, hue }: { c: Course; hue: number }) {
  const full = c.students >= c.capacity;
  return (
    <li className={s.card}>
      <div className={s.band} data-hue={hue % 6} aria-hidden="true">
        <span>{c.block}</span>
      </div>
      <div className={s.cardBody}>
        <div className={s.cardTop}>
          <span className={s.status} data-tone={c.tone}>
            {c.status === '마감 판 확정' && <CircleCheck size={14} aria-hidden="true" />}
            {c.status}
          </span>
          <span className={s.courseId}>{c.id}</span>
        </div>
        <h3 className={s.cardTitle}><a href="#">{c.display}</a></h3>
        <p className={s.realName}>실제 과목명 <b>{c.name}</b></p>
        <dl className={s.facts}>
          <div><dt>담당</dt><dd>{c.teacher}</dd></div>
          <div><dt>구분</dt><dd>{c.level === '고' ? '고등' : '중등'} {c.type}{c.credits > 0 ? ` · ${c.credits}학점` : ''}</dd></div>
          <div>
            <dt>수강</dt>
            <dd>{c.students} / {c.capacity}명{full && <span className={s.full}> · 정원 마감</span>}</dd>
          </div>
        </dl>
        <div className={s.progress}>
          <span className={s.progressLabel}><span>진도</span><b>{c.progress}%</b></span>
          <span className={s.track} role="progressbar" aria-valuenow={c.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.display} 진도`}>
            <span style={{ width: `${c.progress}%` }} />
          </span>
        </div>
      </div>
      <div className={s.cardFoot}>
        <a href="#" aria-label={`${c.display} 명단`}><Users size={18} aria-hidden="true" />명단</a>
        <a href="#" aria-label={`${c.display} 성적`}><ClipboardList size={18} aria-hidden="true" />성적</a>
        <a href="#" aria-label={`${c.display} 문서`}><FileText size={18} aria-hidden="true" />문서</a>
      </div>
    </li>
  );
}
