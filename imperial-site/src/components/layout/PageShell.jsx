export function PageShell({ title, actions, children, size = "default", className = "" }) {
  return (
    <div className={`page-shell page-shell--${size} ${className}`.trim()}>
      <div className="page-shell__header">
        <h1 className="page-shell__title">{title}</h1>
        {actions ? <div className="page-shell__actions">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function PageToolbar({ children }) {
  return <div className="page-toolbar">{children}</div>;
}

export function PagePanel({ title, children, className = "" }) {
  return (
    <section className={`page-panel ${className}`.trim()}>
      {title ? <h2 className="page-panel__title">{title}</h2> : null}
      {children}
    </section>
  );
}
