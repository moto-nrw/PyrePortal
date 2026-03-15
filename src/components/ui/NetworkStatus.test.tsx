import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import NetworkStatus, { type NetworkStatusData } from './NetworkStatus';

const onlineStatus: NetworkStatusData = {
  isOnline: true,
  responseTime: 50,
  lastChecked: Date.now(),
  quality: 'online',
};

const poorStatus: NetworkStatusData = {
  isOnline: true,
  responseTime: 2000,
  lastChecked: Date.now(),
  quality: 'poor',
};

const offlineStatus: NetworkStatusData = {
  isOnline: false,
  responseTime: 0,
  lastChecked: Date.now(),
  quality: 'offline',
};

describe('NetworkStatus', () => {
  it('returns null when quality is online', () => {
    const { container } = render(<NetworkStatus status={onlineStatus} />);
    expect(container.querySelector('div[title]')).toBeNull();
  });

  it('renders when quality is poor', () => {
    render(<NetworkStatus status={poorStatus} />);
    expect(screen.getByTitle(/Poor Connection/)).toBeInTheDocument();
  });

  it('renders when quality is offline', () => {
    render(<NetworkStatus status={offlineStatus} />);
    expect(screen.getByTitle(/Offline/)).toBeInTheDocument();
  });

  it('includes response time in title', () => {
    render(<NetworkStatus status={poorStatus} />);
    expect(screen.getByTitle(/2000ms/)).toBeInTheDocument();
  });

  it('renders style element for animations', () => {
    const { container } = render(<NetworkStatus status={offlineStatus} />);
    expect(container.querySelector('style')).toBeInTheDocument();
  });
});
