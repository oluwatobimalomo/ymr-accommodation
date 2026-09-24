export default function AdminLoading() {
  return (
    <div className="admin-loading stack" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading administration page…</span>
      <div className="admin-loading-heading"><i /><i /><i /></div>
      <div className="admin-loading-metrics">{[0, 1, 2, 3].map((item) => <i key={item} />)}</div>
      <div className="admin-loading-panel"><i /><i /><i /><i /><i /></div>
    </div>
  );
}
