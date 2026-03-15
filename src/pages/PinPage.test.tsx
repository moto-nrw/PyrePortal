import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import PinPage from './PinPage';

describe('PinPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
  });

  it('shows the PIN entry title', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
    expect(screen.getByText('PIN-Eingabe')).toBeInTheDocument();
  });

  it('shows the subtitle instruction', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Bitte geben Sie Ihren 4-stelligen PIN ein')).toBeInTheDocument();
  });

  it('renders numpad buttons 0-9', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
    for (let i = 0; i <= 9; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument();
    }
  });

  it('renders the clear button', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
    expect(screen.getByText('C')).toBeInTheDocument();
  });
});
