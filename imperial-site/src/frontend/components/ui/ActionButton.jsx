export default function ActionButton({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}) {
  return (
    <button
      className={`action-button action-button--${variant} action-button--${size} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
