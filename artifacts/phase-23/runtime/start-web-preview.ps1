$env:PATH = 'C:\Users\J20\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
$env:NODE_ENV = 'development'
$env:INTERNAL_API_URL = 'http://127.0.0.1:5001'
$env:NEXT_PUBLIC_API_URL = 'http://127.0.0.1:5001'
Set-Location 'C:\Dev\OperatorOS'
pnpm --dir apps/web dev
