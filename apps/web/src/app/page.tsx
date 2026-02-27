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
        background: '#0a0a0a',
        color: '#e0e0e0',
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>OperatorOS</h1>
      <p style={{ color: '#888', margin: 0, fontSize: 14 }}>
        AI-native Cloud Development Environment
      </p>
      <p style={{ color: '#555', margin: 0, fontSize: 12 }}>Powered by Shotgun Ninjas</p>
    </div>
  );
}
