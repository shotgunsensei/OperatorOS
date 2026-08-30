export type HelpGuideKind = 'platform' | 'main-module' | 'companion-application';

export interface HelpPageGuide {
  id: string;
  title: string;
  path: string;
  href: string;
  summary: string;
  features: readonly string[];
  workflow: readonly string[];
  access?: string;
  notes?: readonly string[];
}

export interface HelpGuide {
  id: string;
  name: string;
  kind: HelpGuideKind;
  description: string;
  availability: string;
  accent: string;
  startHref: string;
  pages: readonly HelpPageGuide[];
}

