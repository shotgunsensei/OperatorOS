'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useMemo } from 'react';
import { Activity, BarChart3, Brain, FileText, Grid2X2, GraduationCap, Layers3, Library, LifeBuoy, Settings, Sparkles, UserRound } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ModuleApplicationShell, type ModuleRouteManifestGroup, type ModuleThemeTokens } from '@/components/module-application-shell';
import { useTenant } from '@/components/TenantProvider';
import { useModuleAccessLevel } from '@/components/ModuleAccessContext';
import { getActiveTenantId } from '@/lib/auth';
import { buildOperatorOSHelpUrl, DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';

const Workspace = dynamic(() => import('./StudyForgeShell'), { loading: () => <div role="status" aria-busy="true"><Activity size={18}/> Opening your learning workspace…</div> });
const theme: ModuleThemeTokens = { id:'studyforge-indigo-learning',colorScheme:'dark',density:'comfortable',colors:{background:'#070a13',panel:'#10162a',panelRaised:'#171f38',text:'#f8f7ff',muted:'#b9bfd2',border:'#3e4a69',primary:'#c4b5fd',secondary:'#7c3aed',accent:'#60a5fa',danger:'#fb7185',success:'#6ee7b7',focus:'#fbbf24'},radius:{small:'8px',medium:'13px',large:'19px'},typography:{body:'"Inter Variable",ui-sans-serif,system-ui,sans-serif',heading:'"Inter Variable",ui-sans-serif,system-ui,sans-serif',accent:'ui-monospace,"Cascadia Code",monospace'},imagery:{overlay:'radial-gradient(circle at 86% 0,rgba(124,58,237,.2),transparent 34rem),radial-gradient(circle at 4% 16%,rgba(37,99,235,.12),transparent 28rem)'}};
const nav: readonly ModuleRouteManifestGroup[]=[{id:'learn',label:'Learning workspace',items:[
  {id:'overview',canonicalPath:'/',label:'Dashboard',icon:GraduationCap,activeMatch:{kind:'exact'}},{id:'sources',canonicalPath:'/sources',label:'Sources & notes',icon:FileText,activeMatch:{kind:'prefix'}},{id:'sets',canonicalPath:'/sets',label:'Study sets',icon:Layers3,activeMatch:{kind:'prefix'}},{id:'flashcards',canonicalPath:'/flashcards',label:'Flashcards',icon:Library,activeMatch:{kind:'prefix'}},{id:'quizzes',canonicalPath:'/quizzes',label:'Quizzes',icon:Brain,activeMatch:{kind:'prefix'}},{id:'sessions',canonicalPath:'/sessions',label:'Sessions',icon:GraduationCap,activeMatch:{kind:'prefix'}},
]},{id:'insight',label:'Insight and control',items:[{id:'studio',canonicalPath:'/studio',label:'AI Studio',icon:Sparkles,activeMatch:{kind:'prefix'}},{id:'progress',canonicalPath:'/progress',label:'Progress & exports',icon:BarChart3,activeMatch:{kind:'prefix'}},{id:'settings',canonicalPath:'/settings',label:'Settings',icon:Settings,activeMatch:{kind:'prefix'}}]}];
const copy:Record<string,{eyebrow:string;title:string;subtitle:string}>={
  overview:{eyebrow:'Know what to study next',title:'StudyForge AI dashboard',subtitle:'Continue active study sets, prepare for upcoming exams, and focus on the material that needs more work.'},
  sources:{eyebrow:'Build from material you trust',title:'Sources and notes',subtitle:'Keep private notes and approved documents connected to the study sets they support.'},
  sets:{eyebrow:'Turn notes into a complete study system',title:'Study sets',subtitle:'Create and organize sets with review material, flashcards, quizzes, and a practical study plan.'},
  flashcards:{eyebrow:'Practice what is hardest to remember',title:'Flashcards',subtitle:'Review cards and let each result shape when the material comes back.'},
  quizzes:{eyebrow:'Check what you really know',title:'Quizzes and tests',subtitle:'Review, publish, take, and grade quizzes with saved results you can revisit.'},
  sessions:{eyebrow:'Make progress in the time you have',title:'Sessions and plans',subtitle:'Follow study plans, run focused sessions, track exam countdowns, and mark work complete.'},
  studio:{eyebrow:'Create from your own material',title:'AI Studio',subtitle:'Turn approved notes and documents into editable drafts, then review them before use.'},
  progress:{eyebrow:'See improvement and weak spots',title:'Progress and exports',subtitle:'Review scores, recall, study time, activity, and downloadable progress records.'},
  settings:{eyebrow:'Know what your access includes',title:'Access and usage',subtitle:'Review monthly AI use, quiz attempts, study-set capacity, and the OperatorOS account that manages application access.'},
};
function area(path?:string){const root=(path||'/').split(/[?#]/u,1)[0].replace(/^\/modules\/studyforge-ai\/?/u,'').split('/').filter(Boolean)[0]||'overview';if(['app','dashboard'].includes(root))return'overview';if(['sources','notes','subjects','courses'].includes(root))return'sources';if(['sets','folders'].includes(root))return'sets';if(['flashcards','decks','cards'].includes(root))return'flashcards';if(root==='quizzes')return'quizzes';if(['sessions','plans','exams'].includes(root))return'sessions';if(root==='studio')return'studio';if(['progress','analytics','exports'].includes(root))return'progress';if(['settings','account','admin','pricing'].includes(root))return'settings';return'overview'}
export default function StudyForgeRouteShell({
  routePath,
}: {
  baseUrl?: string;
  routePath?: string;
}) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const moduleAccessLevel = useModuleAccessLevel();
  const tenantId = activeTenant?.id ?? user?.currentTenantId ?? getActiveTenantId();
  const platformAdmin = user?.platformRole === 'super_admin';
  const canWriteModule = platformAdmin || (activeRole !== 'viewer' && (moduleAccessLevel
    ? moduleAccessLevel === 'user' || moduleAccessLevel === 'manager'
    : Boolean(activeRole)));
  const roleLabel = platformAdmin
    ? 'Platform administrator'
    : !canWriteModule
      ? 'Read-only access'
      : moduleAccessLevel === 'manager'
        ? 'Learning manager'
        : 'Learner';
  const current = area(routePath || pathname);
  const source = pathname.startsWith('/app/') || pathname.startsWith('/modules/');
  const hrefFor = useCallback(
    (path: string) => source ? `/modules/studyforge-ai${path === '/' ? '/dashboard' : path}` : path,
    [source],
  );
  const navigation = useMemo(
    () => nav.map(group => ({
      ...group,
      items: group.items.map(item => ({ ...item, canonicalPath: hrefFor(item.canonicalPath) })),
    })),
    [hrefFor],
  );

  return (
    <ModuleApplicationShell
      moduleId="studyforge-ai"
      moduleName="StudyForge AI"
      theme={theme}
      currentPath={hrefFor(current === 'overview' ? '/' : `/${current}`)}
      navigation={navigation}
      brand={<Link href={hrefFor('/')} style={{ color: '#f8f7ff', textDecoration: 'none', fontWeight: 900 }}>StudyForge <span style={{ color: '#c4b5fd' }}>AI</span></Link>}
      organization={{ label: 'Organization', value: activeTenant?.name ?? (tenantId ? 'Selected organization' : 'No organization selected') }}
      accessContext={{ label: 'Access', value: roleLabel }}
      utilityActions={[
        { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, icon: Grid2X2 },
        { label: 'Profile', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl, icon: UserRound },
        { label: 'Help', href: buildOperatorOSHelpUrl({ module: 'studyforge-ai', page: current === 'overview' ? '/' : `/${current}` }), icon: LifeBuoy },
      ]}
      page={copy[current]}
      state={authLoading || tenantLoading ? 'loading' : !tenantId ? 'empty' : 'ready'}
      stateMessage={!tenantId ? 'Choose an organization before opening StudyForge AI.' : undefined}
      mobileNavigation="drawer"
      testId="studyforge-module-shell"
      pageHeaderTestId="studyforge-module-header"
    >
      {tenantId && (
        <Workspace
          key={`${tenantId}-${current}-${routePath ?? ''}`}
          routePath={routePath || `/${current}`}
          embedded
          view={current}
          hrefFor={hrefFor}
          canWrite={canWriteModule}
        />
      )}
    </ModuleApplicationShell>
  );
}
