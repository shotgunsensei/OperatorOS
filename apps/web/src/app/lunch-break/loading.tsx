export default function LunchBreakLoading() {
  return (
    <div
      role="status"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#101512',
        color: '#d5f984',
        fontSize: 16,
      }}
    >
      Opening the break room…
    </div>
  );
}
