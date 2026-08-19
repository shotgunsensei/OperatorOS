import ModuleHost from './ModuleHost';

interface ModuleFallbackPageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    host?: string;
  }>;
}

export default async function ModuleFallbackPage({
  params,
  searchParams,
}: ModuleFallbackPageProps) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : undefined;
  return <ModuleHost slug={slug} requestedHost={query?.host} />;
}
