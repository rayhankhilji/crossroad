import { MotionConfig } from 'framer-motion';

import { completeness } from './engine/twin';
import { useApp, type Screen } from './state/store';
import { WhyProvider } from './ui/primitives';
import { Ask } from './ui/screens/Ask';
import { Assumptions } from './ui/screens/Assumptions';
import { Imports } from './ui/screens/Imports';
import { Landing } from './ui/screens/Landing';
import { Onboarding } from './ui/screens/Onboarding';
import { Results } from './ui/screens/Results';
import { TwinView } from './ui/screens/TwinView';
import './ui/app.css';

const NAV: { id: Screen; label: string }[] = [
  { id: 'twin', label: 'Twin' },
  { id: 'imports', label: 'Import' },
  { id: 'ask', label: 'Ask' },
  { id: 'results', label: 'Futures' },
  { id: 'assumptions', label: 'Assumptions' },
];

export default function App() {
  const screen = useApp((s) => s.screen);
  const go = useApp((s) => s.go);
  const twin = useApp((s) => s.twin);
  const running = useApp((s) => s.running);

  const filled = completeness(twin);

  return (
    // `reducedMotion="user"` makes every framer-motion animation in the app
    // honour the OS setting, which the CSS media query alone cannot do.
    // Transforms and opacity snap to their final values instead of animating,
    // so nothing is ever hidden behind a transition that will not play.
    <MotionConfig reducedMotion="user">
      <WhyProvider>
        <div className="app">
        {screen !== 'landing' && (
          <header className="topbar">
            <button className="topbar__brand" onClick={() => go('landing')}>
              <Mark />
              <span className="topbar__wordmark">Crossroad</span>
            </button>

            <nav className="topbar__nav">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  className={`topbar__link${screen === item.id ? ' is-active' : ''}`}
                  onClick={() => go(item.id)}
                >
                  {item.label}
                  {item.id === 'results' && running && <span className="topbar__pulse" />}
                </button>
              ))}
            </nav>

            <div className="topbar__meta">
              <button
                className="topbar__completeness"
                onClick={() => go('onboarding')}
                title="How much of the twin is filled in"
              >
                <span className="topbar__ring" style={{ ['--filled' as string]: `${filled * 360}deg` }} />
                <span className="num">{Math.round(filled * 100)}%</span>
              </button>
              <span className="topbar__local" title="Nothing in this app is sent anywhere. There is no server.">
                local only
              </span>
            </div>
          </header>
        )}

        {/*
          Screens are keyed and fade in with plain CSS rather than through an
          AnimatePresence crossfade. The crossfade needs the outgoing screen's
          exit animation to report completion before the incoming one mounts,
          and when that callback does not fire — which it intermittently did
          not, with a large subtree unmounting — the app is left rendering an
          invisible previous screen and nothing else. A transition worth a
          fifth of a second is not worth that failure mode.
        */}
        <main className="app__main">
          <div key={screen} className="screen">
            {screen === 'landing' && <Landing />}
            {screen === 'onboarding' && <Onboarding />}
            {screen === 'twin' && <TwinView />}
            {screen === 'imports' && <Imports />}
            {screen === 'ask' && <Ask />}
            {screen === 'results' && <Results />}
            {screen === 'assumptions' && <Assumptions />}
          </div>
        </main>
        </div>
      </WhyProvider>
    </MotionConfig>
  );
}

/**
 * The mark: a single path arriving at a fork and splitting into weighted
 * branches. Thicker branch, higher probability — the same encoding the
 * decision tree uses, so the logo teaches the chart.
 */
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 28 28" aria-hidden>
      <path d="M4 14 H11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11 14 C15 14 15 6 20 6 H24" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M11 14 H24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M11 14 C15 14 15 22 20 22 H24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.75" />
    </svg>
  );
}
