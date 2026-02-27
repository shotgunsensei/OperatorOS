export default function Home() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 'calc(100vh - 48px)',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Welcome to VeridianCDE</h1>
      <p style={{ color: '#666', margin: 0 }}>AI-native Cloud Development Environment</p>
    </div>
  );
}
