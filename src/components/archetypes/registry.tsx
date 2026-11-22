import type { ComponentType } from 'react';
import Campus from './Campus';
import Command from './Command';
import Launchpad from './Launchpad';
import Analytics from './Analytics';
import Workspace from './Workspace';
import PublicService from './PublicService';
import Grid from './Grid';
import Triage from './Triage';

/** 원형 slug → 전체 화면 시안. 각 시안은 자기 CSS 모듈과 서체만 쓴다(다른 화면에 새지 않음). */
export const ARCHETYPE_VIEWS: Record<string, ComponentType> = {
  campus: Campus,
  command: Command,
  launchpad: Launchpad,
  analytics: Analytics,
  workspace: Workspace,
  public: PublicService,
  grid: Grid,
  triage: Triage,
};
