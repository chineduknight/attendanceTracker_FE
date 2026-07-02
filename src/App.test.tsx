import React from 'react';
import { render, act } from '@testing-library/react';
import App from './App';

test('renders the app without crashing', async () => {
  // App lazy-loads routes via Suspense, so let pending work resolve.
  await act(async () => {
    render(<App />);
  });
  expect(document.body).toBeInTheDocument();
});
