import ModuleHost from './ModuleHost';

interface ModuleFallbackPageProps {
  params: {
    slug: string;
  };
  searchParams?: {
    host?: string;
  };
}

export default function ModuleFallbackPage({
  params,
  searchParams,
}: ModuleFallbackPageProps) {
  return <ModuleHost slug={params.slug} requestedHost={searchParams?.host} />;
}
