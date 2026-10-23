// Reusable inline AS spinner — replaces all Loader2 spinners throughout the app
// Just the linked letter outlines, accent color, smooth flash animation

interface Props {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function ASSpinner({ label, size = 'md' }: Props) {
  const fontSize = size === 'sm' ? '0.7rem' : size === 'lg' ? '1.2rem' : '0.9rem';

  return (
    <div className="as-spinner">
      <span className="as-letters" style={{ fontSize }}>AS</span>
      {label && <span className="as-label">{label}</span>}
    </div>
  );
}
