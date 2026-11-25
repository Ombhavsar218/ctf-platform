import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Square, SquareTerminal, Trash2 } from 'lucide-react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

import { challengeService } from '../../services/challengeService';
import { TERMINAL_LIMITS, TerminalConnection } from '../../services/terminalService';

const PHASE_LABELS = {
  idle: 'Starting',
  connecting: 'Connecting',
  opening: 'Starting shell',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
  error: 'Failed',
};

const clamp = (value, min, max) => {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
};

/** Real Docker-shell terminal backed by the authenticated Stage 1D gateway. */
export default function InteractiveTerminal({
  challengeId,
  instance,
  onClose,
  onInstanceUnavailable,
}) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const connectionRef = useRef(null);
  const phaseRef = useRef('idle');
  const lastResizeRef = useRef({ rows: 0, cols: 0 });
  const resizeTimerRef = useRef(null);
  const fitTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const unavailableHandledRef = useRef(false);

  const [phase, setPhaseState] = useState('idle');
  const [error, setError] = useState('');
  const [dimensions, setDimensions] = useState('');

  const setPhase = useCallback((next) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhaseState(next);
  }, []);

  const fitTerminal = useCallback(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    try {
      fit.fit();
      const rows = clamp(term.rows, TERMINAL_LIMITS.rowsMin, TERMINAL_LIMITS.rowsMax);
      const cols = clamp(term.cols, TERMINAL_LIMITS.colsMin, TERMINAL_LIMITS.colsMax);
      if (rows !== null && cols !== null && (rows !== term.rows || cols !== term.cols)) {
        term.resize(cols, rows);
      }
    } catch {
      // The container may be temporarily hidden; the next resize will refit.
    }
  }, []);

  const scheduleResize = useCallback((rows, cols, immediate = false) => {
    if (phaseRef.current !== 'connected') return;
    const safeRows = clamp(rows, TERMINAL_LIMITS.rowsMin, TERMINAL_LIMITS.rowsMax);
    const safeCols = clamp(cols, TERMINAL_LIMITS.colsMin, TERMINAL_LIMITS.colsMax);
    if (safeRows === null || safeCols === null) return;
    if (lastResizeRef.current.rows === safeRows && lastResizeRef.current.cols === safeCols) return;

    window.clearTimeout(resizeTimerRef.current);
    const dispatch = () => {
      if (connectionRef.current?.sendResize(safeRows, safeCols)) {
        lastResizeRef.current = { rows: safeRows, cols: safeCols };
      }
    };
    if (immediate) {
      dispatch();
    } else {
      // Debounce to respect the backend resize rate limit.
      resizeTimerRef.current = window.setTimeout(dispatch, 250);
    }
  }, []);

  // Create and dispose exactly one xterm instance for this mounted panel.
  useEffect(() => {
    mountedRef.current = true;
    const host = hostRef.current;
    if (!host) return undefined;

    const term = new Xterm({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 2000,
      convertEol: true,
      theme: {
        background: '#060410',
        foreground: '#f4f4f5',
        cursor: '#7464dc',
        cursorAccent: '#060410',
        selectionBackground: 'rgba(116, 100, 220, 0.35)',
        black: '#060410',
        red: '#ef6b7a',
        green: '#8ed6a8',
        yellow: '#eab36a',
        blue: '#7464dc',
        magenta: '#b388eb',
        cyan: '#7764e0',
        white: '#f4f4f5',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;
    term.writeln('Flaghunt challenge shell');
    term.writeln('Connecting to the authenticated terminal gateway...');
    term.focus();

    const dataDisposable = term.onData((data) => {
      if (phaseRef.current !== 'connected') return;
      connectionRef.current?.sendInput(data);
    });
    const resizeDisposable = term.onResize(({ rows, cols }) => {
      scheduleResize(rows, cols);
    });

    const handleWindowResize = () => {
      window.clearTimeout(fitTimerRef.current);
      fitTimerRef.current = window.setTimeout(fitTerminal, 100);
    };
    window.addEventListener('resize', handleWindowResize);

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(handleWindowResize);
    observer?.observe(host);
    fitTerminal();

    return () => {
      mountedRef.current = false;
      window.clearTimeout(resizeTimerRef.current);
      window.clearTimeout(fitTimerRef.current);
      window.removeEventListener('resize', handleWindowResize);
      observer?.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      connectionRef.current?.close();
      connectionRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [fitTerminal, scheduleResize]);

  // Open one authenticated connection for the active instance only.
  useEffect(() => {
    const instanceId = instance?.id;
    const instanceStatus = instance?.status;
    let cancelled = false;

    const open = async () => {
      setPhase('connecting');
      setError('');
      setDimensions('');
      unavailableHandledRef.current = false;

      const markUnavailable = () => {
        if (cancelled || unavailableHandledRef.current) return;
        unavailableHandledRef.current = true;
        onInstanceUnavailable?.();
      };

      if (!instanceId || instanceStatus !== 'running'
        || (challengeId != null && String(instance?.challengeId) !== String(challengeId))) {
        setError('Start an active challenge instance before opening the terminal.');
        setPhase('error');
        return;
      }

      try {
        const fresh = await challengeService.getInstance(challengeId);
        if (cancelled) return;
        if (!fresh || fresh.status !== 'running') {
          setError('The challenge instance is no longer active. Start it again to open a terminal.');
          setPhase('error');
          return;
        }
        if (connectionRef.current) return;

        const connection = new TerminalConnection({
          onOpen: () => {
            if (cancelled) return;
            setPhase('opening');
            termRef.current?.writeln('Shell is starting...');
          },
          onStatus: (status) => {
            if (cancelled) return;
            if (status.state === 'connected') {
              setPhase('connected');
              setDimensions(`${status.rows}×${status.cols}`);
              window.setTimeout(() => {
                if (cancelled || phaseRef.current !== 'connected') return;
                fitTerminal();
                const term = termRef.current;
                if (term) scheduleResize(term.rows, term.cols, true);
              }, 0);
            }
          },
          onOutput: (text) => {
            if (!cancelled) termRef.current?.write(text);
          },
          onError: (message) => {
            if (cancelled) return;
            setError(message);
            setPhase('error');
          },
          onReconnecting: ({ attempt, maxAttempts }) => {
            if (cancelled) return;
            setPhase('reconnecting');
            setError(`Connection lost. Reconnecting (${attempt}/${maxAttempts})...`);
            termRef.current?.writeln('Connection lost. Reconnecting...');
            // The replacement shell must receive the current dimensions.
            lastResizeRef.current = { rows: 0, cols: 0 };
          },
          onReconnected: () => {
            if (cancelled) return;
            setError('');
            termRef.current?.writeln(
              'Connection restored with a new shell. Previous shell process state was lost.',
            );
          },
          onUnavailable: markUnavailable,
          onClose: (info) => {
            if (cancelled) return;
            setPhase('disconnected');
            if (info.code === 4003 || /revoked|unavailable|expired/i.test(String(info.reason || ''))) {
              markUnavailable();
            } else if (info.exhausted) {
              setError(info.message || 'Could not reconnect to the terminal.');
            } else if (info.code && info.code !== 1000 && info.code !== 4000) {
              setError(info.message || 'Terminal connection failed.');
            } else if (info.code === 4000) {
              setError(info.message || 'The shell session ended.');
            }
          },
        });

        connectionRef.current = connection;
        await connection.open();
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError?.message || 'Could not open the terminal.');
          setPhase('error');
        }
      }
    };

    open();
    return () => {
      cancelled = true;
      connectionRef.current?.close();
      connectionRef.current = null;
    };
  }, [challengeId, instance?.id, instance?.status, instance?.challengeId, fitTerminal, scheduleResize, onInstanceUnavailable]);

  const handleClose = () => {
    connectionRef.current?.close();
    connectionRef.current = null;
    setPhase('disconnected');
    onClose?.();
  };

  const handleClear = () => {
    termRef.current?.clear();
  };

  return (
    <div className="interactive-terminal" role="region" aria-label="Challenge terminal">
      <div className="interactive-terminal-header">
        <div className="interactive-terminal-title">
          <SquareTerminal size={15} aria-hidden="true" />
          <span>Challenge Shell</span>
        </div>
        <div className="interactive-terminal-controls">
          <span className={`interactive-terminal-phase phase-${phase}`}>
            <span className="interactive-terminal-dot" aria-hidden="true" />
            {PHASE_LABELS[phase] || phase}
          </span>
          {dimensions && <span className="interactive-terminal-dimensions">{dimensions}</span>}
          <button
            type="button"
            className="interactive-terminal-btn"
            onClick={handleClear}
            title="Clear terminal"
            aria-label="Clear terminal"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="interactive-terminal-btn"
            onClick={handleClose}
            title="Close terminal"
            aria-label="Close terminal"
          >
            <Square size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && (
        <div className="interactive-terminal-error" role="alert">{error}</div>
      )}

      <div className="interactive-terminal-scroll">
        <div
          className="interactive-terminal-viewport"
          ref={hostRef}
          tabIndex={0}
          aria-label="Interactive shell output and input"
        />
      </div>
      <div className="interactive-terminal-hint">
        Keyboard input, selection, copy and paste are handled by the terminal.
      </div>
    </div>
  );
}
