/**
 * Interface primitives.
 *
 * Small, unopinionated, and styled entirely from the design tokens so the
 * whole app moves together when one of them changes.
 */

import { AnimatePresence, motion } from 'framer-motion';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import './primitives.css';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  type = 'button',
  full,
  icon,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'default' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  type?: 'button' | 'submit';
  full?: boolean;
  icon?: ReactNode;
  title?: string;
}) {
  return (
    <button
      type={type}
      title={title}
      className={cx('btn', `btn--${variant}`, `btn--${size}`, full && 'btn--full')}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span className="btn__icon">{icon}</span>}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

export function Field({
  label,
  help,
  children,
  hint,
}: {
  label: string;
  help?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label">{label}</label>
        {hint && <span className="field__hint num">{hint}</span>}
      </div>
      {children}
      {help && <p className="field__help">{help}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  marks,
  accent,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  /** Optional labels at the two ends, to say what the scale means. */
  marks?: [string, string];
  accent?: string;
}) {
  const fraction = max === min ? 0 : (value - min) / (max - min);
  return (
    <div className="slider">
      <div className="slider__row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="slider__input"
          style={
            {
              '--fill': `${fraction * 100}%`,
              '--accent': accent ?? 'var(--brand-bright)',
            } as CSSProperties
          }
        />
        <output className="slider__value num">{format ? format(value) : value}</output>
      </div>
      {marks && (
        <div className="slider__marks">
          <span>{marks[0]}</span>
          <span>{marks[1]}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Number input
// ---------------------------------------------------------------------------

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
}) {
  // Kept as a string while focused so a half-typed number is not clamped away
  // under the user's cursor.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);

  const commit = (raw: string) => {
    const parsed = Number(raw.replace(/[^0-9.\-]/g, ''));
    if (Number.isFinite(parsed)) {
      let next = parsed;
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);
      onChange(next);
    }
    setDraft(null);
  };

  return (
    <div className="numinput">
      {prefix && <span className="numinput__affix">{prefix}</span>}
      <input
        className="numinput__input num"
        inputMode="decimal"
        value={shown}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {suffix && <span className="numinput__affix numinput__affix--end">{suffix}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text input
// ---------------------------------------------------------------------------

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      className="textinput"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="select">
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg className="select__chevron" viewBox="0 0 12 12" aria-hidden>
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <div className={cx('segmented', `segmented--${size}`)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={cx('segmented__item', o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          {o.value === value && (
            <motion.span layoutId={`seg-${id}`} className="segmented__pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />
          )}
          <span className="segmented__label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={cx('toggle', checked && 'is-on')}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__track">
        <motion.span className="toggle__knob" layout transition={{ type: 'spring', stiffness: 700, damping: 40 }} />
      </span>
      {label && <span className="toggle__label">{label}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Panel / Card
// ---------------------------------------------------------------------------

export function Panel({
  children,
  title,
  eyebrow,
  action,
  padded = true,
  className,
}: {
  children: ReactNode;
  title?: ReactNode;
  eyebrow?: string;
  action?: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section className={cx('panel', !padded && 'panel--flush', className)}>
      {(title || eyebrow || action) && (
        <header className="panel__head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h3 className="panel__title">{title}</h3>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

export function Tag({
  children,
  tone = 'neutral',
  dot,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'info';
  dot?: string;
}) {
  return (
    <span className={cx('tag', `tag--${tone}`)}>
      {dot && <span className="tag__dot" style={{ background: dot }} />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Why — the explanation popover used everywhere a number appears
// ---------------------------------------------------------------------------

const WhyContext = createContext<{ openId: string | null; setOpenId: (id: string | null) => void }>({
  openId: null,
  setOpenId: () => {},
});

export function WhyProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return <WhyContext.Provider value={{ openId, setOpenId }}>{children}</WhyContext.Provider>;
}

/**
 * The affordance that carries the whole promise of the product: any number can
 * be interrogated. Renders as a small marker beside a value; opening it shows
 * the reasoning and the sources behind it.
 */
export function Why({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  const { openId, setOpenId } = useContext(WhyContext);
  const open = openId === id;
  const ref = useRef<HTMLSpanElement>(null);

  const close = useCallback(() => setOpenId(null), [setOpenId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <span className="why" ref={ref}>
      <button
        className={cx('why__marker', open && 'is-open')}
        onClick={() => setOpenId(open ? null : id)}
        aria-expanded={open}
        aria-label={`Why: ${title}`}
      >
        why
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="why__panel"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="why__title">{title}</div>
            <div className="why__body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stat
// ---------------------------------------------------------------------------

export function Stat({
  label,
  value,
  sub,
  tone,
  why,
  size = 'md',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'good' | 'bad' | 'neutral';
  why?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <div className={cx('stat', `stat--${size}`)}>
      <div className="stat__label">
        {label}
        {why}
      </div>
      <div className={cx('stat__value', 'num', tone && `stat__value--${tone}`)}>{value}</div>
      {sub && <div className="stat__sub">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress">
      <div className="progress__track">
        <motion.div
          className="progress__fill"
          animate={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {label && <div className="progress__label">{label}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {children && <div className="empty__body prose">{children}</div>}
    </div>
  );
}

export { cx };
