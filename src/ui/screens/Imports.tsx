/**
 * The import screen.
 *
 * Its most important design decision is that unavailable sources are shown
 * with the reason they are unavailable, rather than being quietly omitted or —
 * worse — rendered as a button that pretends to do something. If a connector
 * cannot exist without a backend, saying so is more useful than hiding it.
 */

import { motion } from 'framer-motion';
import { useRef, useState } from 'react';

import {
  IMPORTERS,
  importAppleHealth,
  importBankCsv,
  importCalendar,
  importGitHub,
  importLinkedIn,
  type ImporterSpec,
  type ImportOutcome,
} from '../../engine/importers';
import type { ImportSourceId } from '../../engine/types';
import { useApp } from '../../state/store';
import { Button, Panel, Tag, TextInput } from '../primitives';
import './imports.css';

export function Imports() {
  const twin = useApp((s) => s.twin);
  const updateTwin = useApp((s) => s.updateTwin);
  const go = useApp((s) => s.go);

  const [pending, setPending] = useState<{ source: ImportSourceId; outcome: ImportOutcome } | null>(null);
  const [busy, setBusy] = useState<ImportSourceId | null>(null);
  const [error, setError] = useState<{ source: ImportSourceId; message: string } | null>(null);

  const commit = () => {
    if (!pending) return;
    const { outcome } = pending;
    updateTwin((t) => {
      outcome.apply(t);
      t.imports = [outcome.record, ...t.imports.filter((r) => r.source !== outcome.record.source)];
    });
    setPending(null);
  };

  const runImport = async (source: ImportSourceId, work: () => Promise<ImportOutcome>) => {
    setBusy(source);
    setError(null);
    setPending(null);
    try {
      const outcome = await work();
      setPending({ source, outcome });
    } catch (e) {
      setError({ source, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="imports">
      <header className="imports__header">
        <div className="eyebrow">Only with explicit consent</div>
        <h1 className="display imports__title">Import what you already have</h1>
        <div className="imports__lede prose">
          <p>
            The richer the twin, the less the model has to fall back on population averages. But there is a hard
            constraint worth stating plainly: Crossroad has no server, and OAuth needs one — a client secret, a
            redirect endpoint, a token exchange. So there is no “connect your bank” button here, because building one
            would mean sending your financial data somewhere, which is the exact thing this app promises not to do.
          </p>
          <p>
            What works instead is the export file. Every service worth importing from is legally obliged to let you
            download your own data, and those files parse perfectly well in a browser tab. Each one is read with the
            File API, reduced to a handful of numbers, and discarded. Nothing is uploaded, because there is nowhere to
            upload it to.
          </p>
        </div>
      </header>

      <div className="imports__grid">
        {IMPORTERS.map((spec, i) => (
          <motion.div
            key={spec.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
          >
            <ImporterCard
              spec={spec}
              busy={busy === spec.id}
              error={error?.source === spec.id ? error.message : null}
              imported={twin.imports.find((r) => r.source === spec.id)}
              onFile={(file) => {
                const handlers: Partial<Record<ImportSourceId, (f: File) => Promise<ImportOutcome>>> = {
                  'apple-health': importAppleHealth,
                  'bank-csv': importBankCsv,
                  'google-calendar': importCalendar,
                  linkedin: importLinkedIn,
                };
                const handler = handlers[spec.id];
                if (handler) void runImport(spec.id, () => handler(file));
              }}
              onLive={(username) => void runImport(spec.id, () => importGitHub(username))}
            />
          </motion.div>
        ))}
      </div>

      {pending && (
        <motion.div
          className="imports__review"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <Panel eyebrow="Review before it is applied" title={pending.outcome.record.summary}>
            <ul className="imports__changes">
              {pending.outcome.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
            <p className="imports__review-note">
              Nothing has been written to your twin yet. Every one of these values stays editable by hand afterwards —
              an import is a starting point, not an authority.
            </p>
            <div className="imports__review-actions">
              <Button variant="ghost" onClick={() => setPending(null)}>
                Discard
              </Button>
              <Button variant="primary" onClick={commit}>
                Apply to my twin
              </Button>
            </div>
          </Panel>
        </motion.div>
      )}

      {twin.imports.length > 0 && (
        <Panel eyebrow="Audit trail" title="What has been imported">
          <ul className="imports__log">
            {twin.imports.map((record) => (
              <li key={record.id}>
                <div className="imports__log-head">
                  <strong>{IMPORTERS.find((s) => s.id === record.source)?.label ?? record.source}</strong>
                  <span className="num">{new Date(record.importedAt).toLocaleDateString('en-GB')}</span>
                </div>
                <div className="imports__log-summary">{record.summary}</div>
                <div className="imports__log-fields">
                  {record.fieldsTouched.map((field) => (
                    <Tag key={field}>{field}</Tag>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <footer className="imports__footer">
        <Button onClick={() => go('twin')}>See the twin</Button>
        <Button variant="ghost" onClick={() => go('onboarding')}>
          Fill the rest in by hand
        </Button>
      </footer>
    </div>
  );
}

function ImporterCard({
  spec,
  busy,
  error,
  imported,
  onFile,
  onLive,
}: {
  spec: ImporterSpec;
  busy: boolean;
  error: string | null;
  imported?: { importedAt: string; summary: string };
  onFile: (file: File) => void;
  onLive: (username: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState('');

  const unavailable = spec.availability.kind === 'unavailable';

  return (
    <article className={`importer${unavailable ? ' is-unavailable' : ''}${imported ? ' is-done' : ''}`}>
      <header className="importer__head">
        <h3 className="importer__title">{spec.label}</h3>
        {imported && <Tag tone="good">imported</Tag>}
        {unavailable && <Tag>not possible</Tag>}
      </header>

      <p className="importer__purpose">{spec.purpose}</p>

      {spec.availability.kind === 'unavailable' ? (
        <p className="importer__reason">{spec.availability.reason}</p>
      ) : (
        <>
          <p className="importer__instructions">{spec.availability.instructions}</p>

          {spec.availability.kind === 'live' ? (
            <div className="importer__live">
              <TextInput value={username} onChange={setUsername} placeholder="github username" />
              <Button size="sm" onClick={() => onLive(username)} disabled={busy || !username.trim()}>
                {busy ? 'Fetching…' : 'Fetch'}
              </Button>
            </div>
          ) : (
            <div className="importer__file">
              <input
                ref={fileRef}
                type="file"
                accept={spec.availability.accept}
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFile(file);
                  e.target.value = '';
                }}
              />
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? 'Reading…' : `Choose ${spec.availability.accept} file`}
              </Button>
            </div>
          )}
        </>
      )}

      {error && <p className="importer__error">{error}</p>}
      {imported && !error && <p className="importer__done">{imported.summary}</p>}
    </article>
  );
}
